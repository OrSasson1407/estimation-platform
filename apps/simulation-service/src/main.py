# apps/estimation-service/src/main.py  ← UPGRADED v3 — simulation endpoints added
from fastapi import FastAPI, HTTPException, Path, Header
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import Histogram, Counter, generate_latest, CONTENT_TYPE_LATEST
from starlette.responses import Response
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uvicorn, os, time, uuid, json
import datetime as dt
import numpy as np
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import BayesianRidge
from sklearn.preprocessing import StandardScaler
import joblib

from db import fetch_simulation_result, close_pool
from what_if_engine import run_what_if, SimulationChange
from stress_tester import run_stress_test, SCENARIOS

# ── Structured logging ────────────────────────────────────────────────────────
def log(level: str, event: str, **kwargs):
    import json as _j
    print(_j.dumps({"level": level, "event": event, "service": "estimation-service", **kwargs}))

# ── Prometheus metrics ────────────────────────────────────────────────────────
ESTIMATION_DURATION = Histogram(
    "estimation_generate_duration_seconds",
    "Time to generate a single-task estimate",
    labelnames=["model_version", "confidence_tier"],
    buckets=[0.05, 0.1, 0.2, 0.5, 1, 2, 5],
)
ESTIMATION_COUNTER = Counter(
    "estimations_generated_total", "Total estimation requests",
    labelnames=["model_version"],
)
OVERRIDE_COUNTER   = Counter("estimations_overridden_total", "Manual overrides applied")
CONFIDENCE_HISTOGRAM = Histogram(
    "estimation_confidence_score", "Distribution of confidence scores",
    buckets=[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
)
SIMULATION_COUNTER = Counter(
    "simulations_run_total", "Total simulation runs",
    labelnames=["simulation_type"],
)

# ── Feature columns per spec ──────────────────────────────────────────────────
FEATURE_COLS = [
    "complexity_score", "tech_debt_score", "developer_accuracy",
    "domain_familiarity", "team_synergy_score", "dependency_count",
    "similar_task_avg_hours", "sprint_load_factor",
]

# ── In-memory estimation store (Phase 2: wire to asyncpg) ────────────────────
_estimation_store: Dict[str, Dict] = {}
_audit_log: List[Dict] = []

# ── Stacked ensemble ──────────────────────────────────────────────────────────
def build_dev_models():
    return (
        GradientBoostingRegressor(n_estimators=100, max_depth=4, random_state=42),
        RandomForestRegressor(n_estimators=100, min_samples_leaf=3, random_state=42),
        BayesianRidge(),
        StandardScaler(),
    )

MODEL_PATH    = os.getenv("MODEL_PATH", "model.joblib")
MODEL_VERSION = os.getenv("MODEL_VERSION", "v3.0.0-dev")

try:
    bundle = joblib.load(MODEL_PATH)
    gbm, rf, bayes, scaler = bundle["gbm"], bundle["rf"], bundle["bayes"], bundle["scaler"]
    log("info", "model_loaded", path=MODEL_PATH, version=MODEL_VERSION)
except Exception:
    log("warn", "model_not_found", fallback="dev_models")
    gbm, rf, bayes, scaler = build_dev_models()

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(title="Estimation Service", version="3.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_methods=["*"], allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown():
    await close_pool()

# ── Pydantic models ───────────────────────────────────────────────────────────
class EstimationRequest(BaseModel):
    taskId: str
    teamId: str
    sprintId: Optional[str] = None
    features: Optional[Dict[str, float]] = None

class FeatureVector(BaseModel):
    complexity_score: float       = Field(default=50.0, ge=0, le=100)
    tech_debt_score: float        = Field(default=20.0, ge=0, le=100)
    developer_accuracy: float     = Field(default=0.8,  ge=0, le=1)
    domain_familiarity: float     = Field(default=0.5,  ge=0, le=1)
    team_synergy_score: float     = Field(default=0.75, ge=0, le=1)
    dependency_count: int         = Field(default=1,    ge=0)
    similar_task_avg_hours: float = Field(default=8.0,  ge=0)
    sprint_load_factor: float     = Field(default=0.7,  ge=0, le=1)

class EstimationResult(BaseModel):
    id: str
    taskId: str
    optimisticHours: float
    expectedHours: float
    pessimisticHours: float
    confidenceScore: float
    modelVersion: str
    factorWeights: Dict[str, float]
    explanation: str
    similarTaskIds: List[str]
    status: str = "ACTIVE"

class OverrideRequest(BaseModel):
    hours: float = Field(gt=0)
    reason: str  = Field(min_length=5)

class BulkEstimationRequest(BaseModel):
    taskIds: List[str]
    teamId: str
    sprintId: Optional[str] = None

# ── Simulation Pydantic models ────────────────────────────────────────────────
class SimulationChangeModel(BaseModel):
    type: str
    payload: Dict[str, Any] = Field(default_factory=dict)

class WhatIfRequest(BaseModel):
    projectId: str
    changes: List[SimulationChangeModel]

class StressTestRequest(BaseModel):
    projectId: str
    scenarioIds: List[str]

# ── Inference helpers ─────────────────────────────────────────────────────────
def extract_features(req: EstimationRequest):
    fv = FeatureVector(**(req.features or {}))
    X  = np.array([[
        fv.complexity_score, fv.tech_debt_score, fv.developer_accuracy,
        fv.domain_familiarity, fv.team_synergy_score, fv.dependency_count,
        fv.similar_task_avg_hours, fv.sprint_load_factor,
    ]])
    return X, fv

def predict_ensemble(X: np.ndarray) -> Dict[str, float]:
    try:
        Xs = scaler.transform(X)
    except Exception:
        Xs = X
    preds = []
    for model in [gbm, rf, bayes]:
        try:
            preds.append(float(model.predict(Xs)[0]))
        except Exception:
            preds.append(max(2.0, float(X[0][0]) / 5.0))
    expected = float(np.mean(preds))
    std      = float(np.std(preds)) if len(preds) > 1 else expected * 0.2
    return {
        "expected":    round(max(0.5, expected), 2),
        "optimistic":  round(max(0.5, expected - std * 1.5), 2),
        "pessimistic": round(expected + std * 2.0, 2),
        "std":         std,
    }

def compute_confidence(std: float, expected: float) -> float:
    if expected <= 0: return 0.5
    cv = std / expected
    return round(max(0.1, min(0.99, 1.0 - cv)), 3)

def confidence_tier(score: float) -> str:
    if score >= 0.8: return "HIGH"
    if score >= 0.6: return "MEDIUM"
    return "LOW"

def build_factor_weights(X: np.ndarray) -> Dict[str, float]:
    return {
        "complexity":    round(float(X[0][0]) / 100 * 0.4,  3),
        "techDebt":      round(float(X[0][1]) / 100 * 0.15, 3),
        "devExperience": round(float(X[0][2]) * 0.25,        3),
        "domainFit":     round(float(X[0][3]) * 0.10,        3),
        "teamSynergy":   round(float(X[0][4]) * 0.10,        3),
    }

def build_explanation(fv: FeatureVector, result: Dict) -> str:
    parts = []
    if fv.complexity_score > 70:     parts.append("high task complexity")
    if fv.tech_debt_score > 50:      parts.append("significant technical debt")
    if fv.developer_accuracy < 0.7:  parts.append("below-average developer accuracy")
    if fv.dependency_count > 3:      parts.append(f"{fv.dependency_count} blocking dependencies")
    if fv.sprint_load_factor > 0.85: parts.append("team near capacity")
    if fv.domain_familiarity < 0.3:  parts.append("low domain familiarity")
    if not parts:                     parts.append("standard task with moderate complexity")
    unc = round(result["std"], 1)
    return (
        f"Estimate driven by: {', '.join(parts)}. "
        f"Expected {result['expected']}h with ±{unc}h uncertainty "
        f"(optimistic {result['optimistic']}h → pessimistic {result['pessimistic']}h)."
    )

def mock_similar_task_ids(fv: FeatureVector) -> List[str]:
    """Dev stub — Phase 3 replaces with pgvector cosine similarity query."""
    base = abs(int(fv.complexity_score * 100 + fv.tech_debt_score * 10))
    n    = min(5, max(1, int(fv.domain_familiarity * 5) + 1))
    return [f"task_{(base + i) % 9999:04d}" for i in range(n)]

# ── Estimation endpoints ──────────────────────────────────────────────────────

@app.post("/api/v1/estimations/generate", response_model=EstimationResult, status_code=201)
async def generate_estimation(request: EstimationRequest):
    t0 = time.perf_counter()
    X, fv      = extract_features(request)
    result     = predict_ensemble(X)
    confidence = compute_confidence(result["std"], result["expected"])
    tier       = confidence_tier(confidence)
    est_id     = f"est_{uuid.uuid4().hex[:12]}"

    estimation = EstimationResult(
        id=est_id, taskId=request.taskId,
        optimisticHours=result["optimistic"], expectedHours=result["expected"],
        pessimisticHours=result["pessimistic"], confidenceScore=confidence,
        modelVersion=MODEL_VERSION, factorWeights=build_factor_weights(X),
        explanation=build_explanation(fv, result), similarTaskIds=mock_similar_task_ids(fv),
    )
    _estimation_store[est_id] = estimation.model_dump()

    elapsed = time.perf_counter() - t0
    ESTIMATION_DURATION.labels(model_version=MODEL_VERSION, confidence_tier=tier).observe(elapsed)
    ESTIMATION_COUNTER.labels(model_version=MODEL_VERSION).inc()
    CONFIDENCE_HISTOGRAM.observe(confidence)

    log("info", "estimate_generated",
        estimationId=est_id, taskId=request.taskId,
        expectedHours=result["expected"], confidenceScore=confidence,
        durationMs=round(elapsed * 1000, 2))
    return estimation


@app.get("/api/v1/estimations/{id}", response_model=EstimationResult)
async def get_estimation(id: str = Path(...)):
    est = _estimation_store.get(id)
    if not est:
        raise HTTPException(status_code=404, detail=f"Estimation {id} not found")
    return est


@app.get("/api/v1/estimations/{id}/explanation")
async def get_explanation(id: str = Path(...)):
    est = _estimation_store.get(id)
    if not est:
        raise HTTPException(status_code=404, detail=f"Estimation {id} not found")
    return {
        "estimationId": id,
        "factors": [
            {"name": "complexity",    "weight": 0.40, "value": est["factorWeights"].get("complexity"),
             "description": "NLP-derived task complexity score (0-100)"},
            {"name": "devExperience", "weight": 0.25, "value": est["factorWeights"].get("devExperience"),
             "description": "Developer 90-day rolling accuracy average"},
            {"name": "techDebt",      "weight": 0.15, "value": est["factorWeights"].get("techDebt"),
             "description": "SonarQube sqale_index normalised (0-100)"},
            {"name": "domainFit",     "weight": 0.10, "value": est["factorWeights"].get("domainFit"),
             "description": "Cosine similarity to developer past tasks"},
            {"name": "teamSynergy",   "weight": 0.10, "value": est["factorWeights"].get("teamSynergy"),
             "description": "Pairwise team historical performance"},
        ],
        "naturalLanguage": est["explanation"],
        "similarTasks":    [{"id": tid} for tid in est["similarTaskIds"]],
        "confidenceScore": est["confidenceScore"],
        "modelVersion":    est["modelVersion"],
    }


@app.patch("/api/v1/estimations/{id}/override", response_model=EstimationResult)
async def override_estimation(
    override: OverrideRequest,
    id: str = Path(...),
    x_user_id: Optional[str]   = Header(None),
    x_user_role: Optional[str] = Header(None),
):
    if x_user_role not in ("ENGINEERING_MANAGER", "TEAM_LEAD"):
        raise HTTPException(status_code=403, detail="Only ENGINEERING_MANAGER or TEAM_LEAD may override")
    est = _estimation_store.get(id)
    if not est:
        raise HTTPException(status_code=404, detail=f"Estimation {id} not found")
    if est["status"] != "ACTIVE":
        raise HTTPException(status_code=409, detail=f"Estimation {id} is already {est['status']}")

    prev_hours   = est["expectedHours"]
    est["status"] = "MANUALLY_OVERRIDDEN"

    new_id  = f"est_{uuid.uuid4().hex[:12]}"
    new_est = {**est,
        "id": new_id, "expectedHours": override.hours,
        "optimisticHours":  round(override.hours * 0.85, 2),
        "pessimisticHours": round(override.hours * 1.20, 2),
        "status": "ACTIVE",
        "explanation": f"Override: {prev_hours}h → {override.hours}h. Reason: {override.reason}",
        "revisedBy": x_user_id or "unknown",
    }
    _estimation_store[new_id] = new_est

    _audit_log.append({
        "auditId": str(uuid.uuid4()), "action": "ESTIMATION_OVERRIDE",
        "actor": x_user_id or "unknown", "role": x_user_role,
        "estimationId": id, "newEstimationId": new_id,
        "previousHours": prev_hours, "revisedHours": override.hours,
        "reason": override.reason,
        "timestamp": dt.datetime.utcnow().isoformat() + "Z",
    })
    OVERRIDE_COUNTER.inc()
    log("warn", "estimation_overridden",
        estimationId=id, newEstimationId=new_id,
        previousHours=prev_hours, revisedHours=override.hours,
        actor=x_user_id, reason=override.reason)
    return new_est


@app.post("/api/v1/estimations/bulk")
async def bulk_estimate(payload: BulkEstimationRequest):
    if len(payload.taskIds) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 tasks per bulk request")
    results = []
    for task_id in payload.taskIds:
        req = EstimationRequest(taskId=task_id, teamId=payload.teamId, sprintId=payload.sprintId)
        results.append(await generate_estimation(req))
    return results


@app.get("/api/v1/estimations/audit-log")
async def get_audit_log(limit: int = 50, x_user_role: Optional[str] = Header(None)):
    if x_user_role not in ("ENGINEERING_MANAGER", "EXECUTIVE"):
        raise HTTPException(status_code=403, detail="Audit log requires ENGINEERING_MANAGER role")
    return {"entries": _audit_log[-limit:], "total": len(_audit_log)}

# ── Simulation endpoints ──────────────────────────────────────────────────────

@app.post("/api/v1/simulations/what-if", status_code=201)
async def what_if_simulation(request: WhatIfRequest):
    """
    Runs a Monte Carlo what-if simulation against live project data.
    Persists the result to SimulationResult table.
    """
    t0 = time.perf_counter()
    changes = [SimulationChange(type=c.type, payload=c.payload) for c in request.changes]

    try:
        result = await run_what_if(project_id=request.projectId, changes=changes)
    except Exception as e:
        log("error", "what_if_failed", projectId=request.projectId, err=str(e))
        raise HTTPException(status_code=500, detail=f"Simulation failed: {e}")

    SIMULATION_COUNTER.labels(simulation_type="WHAT_IF").inc()
    log("info", "what_if_completed",
        simulationId=result.simulation_id,
        projectId=request.projectId,
        deltadays=result.timeline_delta_days,
        durationMs=round((time.perf_counter() - t0) * 1000, 2))

    from dataclasses import asdict
    return asdict(result)


@app.post("/api/v1/simulations/stress-test", status_code=201)
async def stress_test_simulation(request: StressTestRequest):
    """
    Runs predefined adversarial scenarios using real sprint velocity history.
    Returns survival probability + confidence intervals per scenario.
    """
    unknown = [s for s in request.scenarioIds if s not in SCENARIOS]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown scenario IDs: {unknown}")

    t0 = time.perf_counter()
    try:
        reports = await run_stress_test(
            project_id=request.projectId,
            scenario_ids=request.scenarioIds,
        )
    except Exception as e:
        log("error", "stress_test_failed", projectId=request.projectId, err=str(e))
        raise HTTPException(status_code=500, detail=f"Stress test failed: {e}")

    SIMULATION_COUNTER.labels(simulation_type="STRESS_TEST").inc()
    log("info", "stress_test_completed",
        projectId=request.projectId,
        scenarios=len(reports),
        durationMs=round((time.perf_counter() - t0) * 1000, 2))

    from dataclasses import asdict
    return {"projectId": request.projectId, "reports": [asdict(r) for r in reports]}


@app.get("/api/v1/simulations/{simulation_id}/results")
async def get_simulation_results(simulation_id: str = Path(...)):
    """Retrieves a previously persisted simulation result by ID."""
    result = await fetch_simulation_result(simulation_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Simulation {simulation_id} not found")
    return result


@app.get("/api/v1/simulations/scenarios")
async def list_scenarios():
    """Lists all available stress-test scenario definitions."""
    return {
        "scenarios": [
            {"id": k, "name": v["name"], "description": v["description"],
             "riskCategories": v["risk_categories"]}
            for k, v in SCENARIOS.items()
        ]
    }

# ── Observability ─────────────────────────────────────────────────────────────

@app.get("/metrics")
async def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "estimation-service",
        "version": "3.0.0",
        "modelVersion": MODEL_VERSION,
        "estimationsStored": len(_estimation_store),
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8000)))