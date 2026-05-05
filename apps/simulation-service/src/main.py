from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import uvicorn
import uuid
from datetime import datetime

app = FastAPI(title="Simulation Service", version="1.0.0")

class SimulationChange(BaseModel):
    type: str  # 'ADD_DEVELOPER' | 'REMOVE_DEVELOPER' | 'CHANGE_SCOPE' | 'CHANGE_DEADLINE'
    payload: Dict[str, Any]

class WhatIfRequest(BaseModel):
    projectId: str
    changes: List[SimulationChange]

class StressTestRequest(BaseModel):
    projectId: str
    scenarioIds: List[str]

@app.post("/api/v1/simulations/what-if")
async def run_what_if_simulation(request: WhatIfRequest):
    # Mock Monte Carlo simulation logic based on project/developer delta
    return {
        "simulationId": str(uuid.uuid4()),
        "projectId": request.projectId,
        "timelineDelta": "+14 days",
        "costDelta": "+$12,500",
        "riskDelta": "Increased single-point-of-failure risk on backend",
        "generatedAt": datetime.utcnow().isoformat()
    }

@app.post("/api/v1/simulations/stress-test")
async def run_stress_test(request: StressTestRequest):
    # Mock stress test reports[cite: 2]
    results = []
    for scenario in request.scenarioIds:
        results.append({
            "scenarioId": scenario,
            "survivalProbability": 0.65 if scenario == "lose_lead_dev" else 0.88,
            "criticalPathImpact": "High",
            "mitigationSuggestions": ["Cross-train developer A on component B"]
        })
    return results

@app.get("/api/v1/simulations/{id}/results")
async def get_simulation_results(id: str):
    return {
        "simulationId": id,
        "status": "COMPLETED",
        "data": {
            "timelineDelta": "-5 days",
            "costDelta": "+$4,000",
            "riskDelta": "Reduced bottleneck risk"
        }
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)