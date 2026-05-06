# apps/estimation-service/src/main.py
from fastapi import FastAPI, HTTPException, Path, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uvicorn
import os
import numpy as np
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import BayesianRidge
from sklearn.preprocessing import StandardScaler
import joblib

app = FastAPI(title="Estimation Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Feature columns per spec ──────────────────────────────────────────────────
FEATURE_COLS = [
    "complexity_score",       # 0-100, NLP-derived
    "tech_debt_score",        # 0-100, SonarQube
    "developer_accuracy",     # rolling 90-day accuracy
    "domain_familiarity",     # 0-1 cosine similarity to past tasks
    "team_synergy_score",     # 0-1 pairwise historical performance
    "dependency_count",       # blocking dependency count
    "similar_task_avg_hours", # mean of top-5 historical similar tasks
    "sprint_load_factor",     # team capacity utilisation 0-1
]

# ── Stacked ensemble (loaded from disk in production, trained inline for dev) ─
def build_dev_models():
    """Build and return untrained model pipeline for local development."""
    gbm   = GradientBoostingRegressor(n_estimators=100, max_depth=4, random_state=42)
    rf    = RandomForestRegressor(n_estimators=100, min_samples_leaf=3, random_state=42)
    bayes = BayesianRidge()
    scaler = StandardScaler()
    return gbm, rf, bayes, scaler

MODEL_PATH = os.getenv("MODEL_PATH", "model.joblib")

try:
    bundle = joblib.load(MODEL_PATH)
    gbm, rf, bayes, scaler = bundle["gbm"], bundle["rf"], bundle["bayes"], bundle["scaler"]
    print(f"✅ Loaded trained models from {MODEL_PATH}")
except Exception:
    print("⚠️  No trained model found — using untrained dev models. Run ML pipeline first.")
    gbm, rf, bayes, scaler = build_dev_models()

# ── Pydantic models ───────────────────────────────────────────────────────────
class EstimationRequest(BaseModel):
    taskId: str
    teamId: str
    sprintId: Optional[str] = None
    features: Optional[Dict[str, float]] = None  # override feature values for testing

class FeatureVector(BaseModel):
    complexity_score: float = Field(default=50.0, ge=0, le=100)
    tech_debt_score: float = Field(default=20.0, ge=0, le=100)
    developer_accuracy: float = Field(default=0.8, ge=0, le=1)
    domain_familiarity: float = Field(default=0.5, ge=0, le=1)
    team_synergy_score: float = Field(default=0.75, ge=0, le=1)
    dependency_count: int = Field(default=1, ge=0)
    similar_task_avg_hours: float = Field(default=8.0, ge=0)
    sprint_load_factor: float = Field(default=0.7, ge=0, le=1)

class EstimationResult(BaseModel):
    taskId: str
    optimisticHours: float
    expectedHours: float
    pessimisticHours: float
    confidenceScore: float
    modelVersion: str
    factorWeights: Dict[str, float]
    explanation: str
    similarTaskIds: List[str]

# ── Inference helpers ─────────────────────────────────────────────────────────
def extract_features(req: EstimationRequest) -> np.ndarray:
    """Build feature vector — uses req.features override or sensible defaults."""
    fv = FeatureVector(**(req.features or {}))
    return np.array([[
        fv.complexity_score,
        fv.tech_debt_score,
        fv.developer_accuracy,
        fv.domain_familiarity,
        fv.team_synergy_score,
        fv.dependency_count,
        fv.similar_task_avg_hours,
        fv.sprint_load_factor,
    ]])

def predict_ensemble(X: np.ndarray) -> Dict[str, float]:
    """Run stacked ensemble: GBM + RF + BayesianRidge, average predictions."""
    try:
        Xs = scaler.transform(X)
    except Exception:
        Xs = X  # scaler not fitted yet in dev mode

    preds = []
    for model in [gbm, rf, bayes]:
        try:
            preds.append(float(model.predict(Xs)[0]))
        except Exception:
            # Model not fitted — use feature-based heuristic
            complexity = float(X[0][0])
            preds.append(max(2.0, complexity / 5.0))

    expected = float(np.mean(preds))
    std      = float(np.std(preds)) if len(preds) > 1 else expected * 0.2

    return {
        "expected": round(expected, 2),
        "optimistic": round(max(1.0, expected - std * 1.5), 2),
        "pessimistic": round(expected + std * 2.0, 2),
        "std": std,
    }

def compute_confidence(std: float, expected: float) -> float:
    """Confidence inversely proportional to relative uncertainty."""
    if expected <= 0:
        return 0.5
    cv = std / expected  # coefficient of variation
    return round(max(0.1, min(0.99, 1.0 - cv)), 3)

def build_factor_weights(X: np.ndarray) -> Dict[str, float]:
    return {
        "complexity":    round(float(X[0][0]) / 100 * 0.4, 3),
        "techDebt":      round(float(X[0][1]) / 100 * 0.15, 3),
        "devExperience": round(float(X[0][2]) * 0.25, 3),
        "domainFit":     round(float(X[0][3]) * 0.1, 3),
        "teamSynergy":   round(float(X[0][4]) * 0.1, 3),
    }

def build_explanation(fv: FeatureVector, result: Dict) -> str:
    parts = []
    if fv.complexity_score > 70:
        parts.append("high task complexity")
    if fv.tech_debt_score > 50:
        parts.append("significant technical debt")
    if fv.developer_accuracy < 0.7:
        parts.append("developer historical accuracy below average")
    if fv.dependency_count > 3:
        parts.append(f"{fv.dependency_count} blocking dependencies detected")
    if fv.sprint_load_factor > 0.85:
        parts.append("team near capacity")
    if not parts:
        parts.append("standard task with moderate complexity")
    return f"Estimate driven by: {', '.join(parts)}. Expected {result['expected']}h with ±{round(result['std'], 1)}h uncertainty."

# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.post("/api/v1/estimations/generate", response_model=EstimationResult)
async def generate_estimation(request: EstimationRequest):
    X = extract_features(request)
    result = predict_ensemble(X)
    fv = FeatureVector(**(request.features or {}))
    confidence = compute_confidence(result["std"], result["expected"])

    return EstimationResult(
        taskId=request.taskId,
        optimisticHours=result["optimistic"],
        expectedHours=result["expected"],
        pessimisticHours=result["pessimistic"],
        confidenceScore=confidence,
        modelVersion=os.getenv("MODEL_VERSION", "v1.0.0-dev"),
        factorWeights=build_factor_weights(X),
        explanation=build_explanation(fv, result),
        similarTaskIds=[],  # populated by pgvector search in production
    )

@app.get("/api/v1/estimations/{id}")
async def get_estimation(id: str = Path(...)):
    # In production: query PostgreSQL via asyncpg
    raise HTTPException(status_code=404, detail=f"Estimation {id} not found (wire to DB)")

@app.get("/api/v1/estimations/{id}/explanation")
async def get_explanation(id: str = Path(...)):
    return {
        "factors": [
            {"name": "complexity",    "weight": 0.40, "description": "NLP-derived task complexity score"},
            {"name": "devExperience", "weight": 0.25, "description": "Developer 90-day accuracy rolling average"},
            {"name": "techDebt",      "weight": 0.15, "description": "SonarQube sqale_index normalised score"},
            {"name": "domainFit",     "weight": 0.10, "description": "Cosine similarity to developer past tasks"},
            {"name": "teamSynergy",   "weight": 0.10, "description": "Pairwise team historical performance"},
        ],
        "naturalLanguage": "Estimate anchored on task complexity and developer historical accuracy.",
        "similarTasks": [],
    }

@app.post("/api/v1/estimations/bulk")
async def bulk_estimate(requests: List[EstimationRequest]):
    # Accepts up to 50 tasks; returns all results synchronously (async Kafka variant in prod)
    if len(requests) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 tasks per bulk request")
    return [await generate_estimation(r) for r in requests]

@app.get("/health")
async def health():
    return {"status": "ok", "service": "estimation-service"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8000)))