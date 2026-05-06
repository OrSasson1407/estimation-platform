# apps/simulation-service/src/main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import uvicorn, uuid, os
from datetime import datetime

from what_if_engine   import run_what_if, SimulationChange as WIChange
from stress_tester    import run_stress_test
from portfolio_solver import solve_portfolio, ProjectCandidate

app = FastAPI(title="Simulation Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_methods=["*"], allow_headers=["*"],
)

# ── Pydantic models ───────────────────────────────────────────────────────────
class SimChange(BaseModel):
    type: str
    payload: Dict[str, Any]

class WhatIfRequest(BaseModel):
    projectId: str
    changes: List[SimChange]
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

# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.post("/api/v1/simulations/what-if")
async def run_what_if_simulation(req: WhatIfRequest):
    sim_id = str(uuid.uuid4())
    changes = [WIChange(type=c.type, payload=c.payload) for c in req.changes]
    result  = run_what_if(req.projectId, sim_id, changes, req.context or {})
    return {
        "simulationId":     result.simulation_id,
        "projectId":        result.project_id,
        "baselineDays":     result.baseline_days,
        "projectedDays":    result.projected_days,
        "timelineDelta":    f"{result.timeline_delta_days:+.1f} days ({result.timeline_delta_pct:+.1f}%)",
        "costDelta":        f"${result.cost_delta_usd:+,.0f}",
        "riskDelta":        result.risk_delta,
        "bottleneckWarnings": result.bottleneck_warnings,
        "confidence":       result.confidence,
        "changeImpacts":    result.change_impacts,
        "generatedAt":      datetime.utcnow().isoformat(),
    }

@app.post("/api/v1/simulations/stress-test")
async def run_stress_test_endpoint(req: StressTestRequest):
    results = run_stress_test(req.scenarioIds, req.context or {})
    return [
        {
            "scenarioId":            r.scenario_id,
            "scenarioName":          r.scenario_name,
            "description":           r.description,
            "survivalProbability":   r.survival_probability,
            "projectedDelayDays":    r.projected_delay_days,
            "criticalPathImpact":    r.critical_path_impact,
            "affectedRiskCategories": r.affected_risk_categories,
            "mitigationSuggestions": r.mitigation_suggestions,
            "confidenceInterval":    r.confidence_interval,
        }
        for r in results
    ]

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
    # In production: fetch from Redis/PostgreSQL by simulationId
    raise HTTPException(status_code=404, detail=f"Simulation {id} not persisted yet — wire to Redis cache")

@app.get("/health")
async def health():
    return {"status": "ok", "service": "simulation-service"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8001)))