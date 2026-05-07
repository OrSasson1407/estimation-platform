# apps/simulation-service/src/main.py  ← PHASE 1 UPGRADE
# Wires what_if_engine and stress_tester to real project/sprint data from PostgreSQL.
# Persists SimulationResult to the DB and exposes retrieval endpoint.

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import uvicorn, uuid, os, json
from datetime import datetime

import asyncpg

from what_if_engine   import run_what_if, SimulationChange as WIChange
from stress_tester    import run_stress_test
from portfolio_solver import solve_portfolio, ProjectCandidate

app = FastAPI(title="Simulation Service", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_methods=["*"], allow_headers=["*"],
)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://admin:password123@localhost:5432/estimation")

# ── DB pool ────────────────────────────────────────────────────────────────────

_pool: asyncpg.Pool | None = None

async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    return _pool

@app.on_event("startup")
async def startup():
    await get_pool()

@app.on_event("shutdown")
async def shutdown():
    global _pool
    if _pool:
        await _pool.close()

# ── Pydantic models ───────────────────────────────────────────────────────────

class SimChange(BaseModel):
    type: str
    payload: Dict[str, Any]

class WhatIfRequest(BaseModel):
    projectId: str
    changes: List[SimChange]
    # If context is omitted, we load it from the DB
    context: Optional[Dict[str, Any]] = None

class StressTestRequest(BaseModel):
    projectId: str
    scenarioIds: List[str]
    context: Optional[Dict[str, Any]] = None

class ProjectInput(BaseModel):
    id: str
    name: str
    expected_value: float
    estimated_cost: float
    estimated_days: int
    risk_score: float
    required_skills: List[str] = []
    team_ids: List[str] = []

class PortfolioRequest(BaseModel):
    projects: List[ProjectInput]
    budget_usd: float
    available_team_days: int
    risk_tolerance: float = 0.6

# ── DB helpers ─────────────────────────────────────────────────────────────────

async def load_project_context(project_id: str) -> Dict[str, Any]:
    """
    Fetch real project data from PostgreSQL to build simulation context.
    Returns: remaining_points, team_size, current_velocity, daily_rate_usd
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Remaining story points (tasks not DONE or CANCELLED)
        remaining = await conn.fetchval(
            """
            SELECT COALESCE(SUM("storyPoints"), 0)
            FROM "Task"
            WHERE "projectId" = $1
              AND "status" NOT IN ('DONE', 'CANCELLED')
              AND "storyPoints" IS NOT NULL
            """,
            project_id,
        )

        # Team size: distinct assigned developers on active tasks
        team_size = await conn.fetchval(
            """
            SELECT COUNT(DISTINCT ta."developerId")
            FROM "TaskAssignment" ta
            JOIN "Task" t ON t.id = ta."taskId"
            WHERE t."projectId" = $1
              AND t."status" NOT IN ('DONE', 'CANCELLED')
            """,
            project_id,
        )
        if not team_size:
            team_size = 4  # default

        # Current velocity: avg completed story points per sprint (last 3 sprints)
        velocity = await conn.fetchval(
            """
            SELECT COALESCE(AVG(sprint_pts), 32.0)
            FROM (
                SELECT s.id, COALESCE(SUM(t."storyPoints"), 0) AS sprint_pts
                FROM "Sprint" s
                JOIN "SprintTask" st ON st."sprintId" = s.id
                JOIN "Task" t ON t.id = st."taskId"
                WHERE s."projectId" = $1
                  AND s."status" = 'COMPLETED'
                  AND t."status" = 'DONE'
                  AND t."storyPoints" IS NOT NULL
                GROUP BY s.id
                ORDER BY s."endDate" DESC
                LIMIT 3
            ) recent
            """,
            project_id,
        )

    return {
        "remaining_points": float(remaining or 0),
        "team_size": int(team_size),
        "current_velocity": float(velocity or 32.0),
        "velocity": float(velocity or 32.0),
        "daily_rate_usd": float(os.getenv("DEFAULT_DAILY_RATE_USD", "600")),
    }

async def persist_simulation_result(
    simulation_id: str,
    project_id: str,
    sim_type: str,
    result_json: Dict[str, Any],
) -> None:
    """
    Persist simulation result to JSON column in an unstructured table.
    Uses a simple key-value store pattern until a proper SimulationResult
    model is added to the Prisma schema.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO "SimulationResult" (id, "projectId", type, result, "createdAt")
            VALUES ($1, $2, $3, $4::jsonb, NOW())
            ON CONFLICT (id) DO UPDATE SET result = EXCLUDED.result
            """,
            simulation_id,
            project_id,
            sim_type,
            json.dumps(result_json),
        )

async def fetch_simulation_result(simulation_id: str) -> Optional[Dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            'SELECT * FROM "SimulationResult" WHERE id = $1',
            simulation_id,
        )
    if not row:
        return None
    return dict(row)

# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/api/v1/simulations/what-if")
async def run_what_if_simulation(req: WhatIfRequest):
    sim_id = str(uuid.uuid4())

    # Load context from DB if not provided
    ctx = req.context
    if not ctx:
        try:
            ctx = await load_project_context(req.projectId)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to load project context: {e}")

    changes = [WIChange(type=c.type, payload=c.payload) for c in req.changes]
    result  = run_what_if(req.projectId, sim_id, changes, ctx)

    response = {
        "simulationId":       result.simulation_id,
        "projectId":          result.project_id,
        "baselineDays":       result.baseline_days,
        "projectedDays":      result.projected_days,
        "timelineDeltaDays":  result.timeline_delta_days,
        "timelineDeltaPct":   result.timeline_delta_pct,
        "costDeltaUsd":       result.cost_delta_usd,
        "riskDelta":          result.risk_delta,
        "bottleneckWarnings": result.bottleneck_warnings,
        "confidence":         result.confidence,
        "changeImpacts":      result.change_impacts,
        "context":            ctx,
        "generatedAt":        datetime.utcnow().isoformat() + "Z",
    }

    # Persist result (best-effort — don't fail the response if DB write fails)
    try:
        await persist_simulation_result(sim_id, req.projectId, "WHAT_IF", response)
    except Exception:
        pass  # Table may not exist yet — Phase 1 migration adds it

    return response

@app.post("/api/v1/simulations/stress-test")
async def run_stress_test_endpoint(req: StressTestRequest):
    sim_id = str(uuid.uuid4())

    ctx = req.context
    if not ctx:
        try:
            ctx = await load_project_context(req.projectId)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to load project context: {e}")

    results = run_stress_test(req.scenarioIds, ctx)

    response = [
        {
            "scenarioId":              r.scenario_id,
            "scenarioName":            r.scenario_name,
            "description":             r.description,
            "survivalProbability":     r.survival_probability,
            "projectedDelayDays":      r.projected_delay_days,
            "criticalPathImpact":      r.critical_path_impact,
            "affectedRiskCategories":  r.affected_risk_categories,
            "mitigationSuggestions":   r.mitigation_suggestions,
            "confidenceInterval":      r.confidence_interval,
        }
        for r in results
    ]

    try:
        await persist_simulation_result(sim_id, req.projectId, "STRESS_TEST", {"scenarios": response})
    except Exception:
        pass

    return {"simulationId": sim_id, "projectId": req.projectId, "scenarios": response}

@app.post("/api/v1/simulations/portfolio")
async def optimise_portfolio(req: PortfolioRequest):
    candidates = [
        ProjectCandidate(
            id=p.id, name=p.name, expected_value=p.expected_value,
            estimated_cost=p.estimated_cost, estimated_days=p.estimated_days,
            risk_score=p.risk_score, required_skills=p.required_skills,
            team_ids=p.team_ids,
        )
        for p in req.projects
    ]
    result = solve_portfolio(candidates, req.budget_usd, req.available_team_days, req.risk_tolerance)
    return {
        "selectedProjectIds":    result.selected_project_ids,
        "totalValue":            result.total_value,
        "totalCost":             result.total_cost,
        "totalDays":             result.total_days,
        "portfolioRisk":         result.portfolio_risk,
        "utilisationPct":        result.utilisation_pct,
        "excludedProjects":      result.excluded_projects,
        "optimisationRationale": result.optimisation_rationale,
    }

@app.get("/api/v1/simulations/{id}/results")
async def get_simulation_results(id: str):
    try:
        row = await fetch_simulation_result(id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

    if not row:
        raise HTTPException(status_code=404, detail=f"Simulation {id} not found")

    return {
        "simulationId": row["id"],
        "projectId":    row["projectId"],
        "type":         row["type"],
        "result":       row["result"],
        "createdAt":    row["createdAt"].isoformat() + "Z" if row.get("createdAt") else None,
    }

@app.get("/health")
async def health():
    return {"status": "ok", "service": "simulation-service", "version": "2.0.0"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8001)))
