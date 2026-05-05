from fastapi import FastAPI, HTTPException, Path
from pydantic import BaseModel
from typing import List, Optional, Dict
import uvicorn

app = FastAPI(title="Estimation Service", version="1.0.0")

class EstimationRequest(BaseModel):
    taskId: str
    teamId: str
    sprintId: Optional[str] = None

class EstimationResult(BaseModel):
    optimisticHours: float
    expectedHours: float
    pessimisticHours: float
    confidenceScore: float
    modelVersion: str
    explanation: str

@app.post("/api/v1/estimations/generate", response_model=EstimationResult)
async def generate_estimation(request: EstimationRequest):
    # This will trigger the stacked ensemble: GBM, RF, and Bayesian Ridge
    # For now, returning formatted mock data per spec
    return {
        "optimisticHours": 12.0,
        "expectedHours": 16.5,
        "pessimisticHours": 24.0,
        "confidenceScore": 0.85,
        "modelVersion": "v1.0.0",
        "explanation": "Estimate based on high complexity signals and developer historical accuracy."
    }

@app.get("/api/v1/estimations/{id}/explanation")
async def get_explanation(id: str = Path(...)):
    return {
        "factors": [
            {"name": "complexity", "weight": 0.4},
            {"name": "devExperience", "weight": 0.25}
        ],
        "naturalLanguage": "The task involves legacy refactoring which increased the expected duration.",
        "similarTasks": ["task_old_101", "task_old_202"]
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)