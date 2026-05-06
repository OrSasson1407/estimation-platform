7# apps/simulation-service/src/what_if_engine.py
import numpy as np
from typing import List, Dict, Any
from dataclasses import dataclass

@dataclass
class SimulationChange:
    type: str   # ADD_DEVELOPER | REMOVE_DEVELOPER | CHANGE_SCOPE | CHANGE_DEADLINE
    payload: Dict[str, Any]

@dataclass
class WhatIfResult:
    simulation_id: str
    project_id: str
    baseline_days: float
    projected_days: float
    timeline_delta_days: float
    timeline_delta_pct: float
    cost_delta_usd: float
    risk_delta: str
    bottleneck_warnings: List[str]
    confidence: float
    change_impacts: List[Dict[str, Any]]

# Default project assumptions (overridden from DB in production)
DEFAULT_VELOCITY_PTS_PER_DEV_PER_SPRINT = 8.0
DEFAULT_SPRINT_DAYS = 14
DEFAULT_DAILY_RATE_USD = 600.0

def run_what_if(
    project_id: str,
    simulation_id: str,
    changes: List[SimulationChange],
    context: Dict[str, Any],
) -> WhatIfResult:
    """
    Monte Carlo what-if simulation.
    context keys: remaining_points, team_size, current_velocity, daily_rate_usd
    """
    remaining_points = float(context.get("remaining_points", 100))
    team_size        = int(context.get("team_size", 4))
    velocity         = float(context.get("current_velocity", DEFAULT_VELOCITY_PTS_PER_DEV_PER_SPRINT * team_size))
    daily_rate       = float(context.get("daily_rate_usd", DEFAULT_DAILY_RATE_USD))

    baseline_days = _compute_duration(remaining_points, velocity)

    # Apply each change and track impact
    adjusted_points  = remaining_points
    adjusted_team    = team_size
    adjusted_velocity = velocity
    bottlenecks: List[str] = []
    change_impacts: List[Dict[str, Any]] = []

    for change in changes:
        impact = _apply_change(
            change, adjusted_points, adjusted_team, adjusted_velocity, daily_rate
        )
        adjusted_points   += impact["delta_points"]
        adjusted_team     += impact["delta_team"]
        adjusted_velocity += impact["delta_velocity"]
        if impact.get("bottleneck"):
            bottlenecks.append(impact["bottleneck"])
        change_impacts.append(impact)

    # Monte Carlo: run 1000 simulations with noise
    durations = _monte_carlo(adjusted_points, adjusted_velocity, n=1000)
    projected_days   = float(np.percentile(durations, 50))
    p80_days         = float(np.percentile(durations, 80))

    delta_days   = projected_days - baseline_days
    delta_cost   = delta_days * adjusted_team * daily_rate
    confidence   = max(0.4, min(0.95, 1.0 - (np.std(durations) / max(projected_days, 1)) * 2))

    risk_delta = _classify_risk_delta(delta_days, baseline_days)

    return WhatIfResult(
        simulation_id=simulation_id,
        project_id=project_id,
        baseline_days=round(baseline_days, 1),
        projected_days=round(projected_days, 1),
        timeline_delta_days=round(delta_days, 1),
        timeline_delta_pct=round((delta_days / max(baseline_days, 1)) * 100, 1),
        cost_delta_usd=round(delta_cost, 2),
        risk_delta=risk_delta,
        bottleneck_warnings=bottlenecks,
        confidence=round(confidence, 3),
        change_impacts=change_impacts,
    )

def _compute_duration(points: float, velocity: float) -> float:
    if velocity <= 0:
        return 999.0
    sprints = points / velocity
    return sprints * DEFAULT_SPRINT_DAYS

def _monte_carlo(points: float, velocity: float, n: int = 1000) -> np.ndarray:
    noise = np.random.normal(1.0, 0.15, n)
    velocities = np.maximum(velocity * noise, 0.1)
    return (points / velocities) * DEFAULT_SPRINT_DAYS

def _apply_change(
    change: SimulationChange,
    points: float, team: int, velocity: float, daily_rate: float
) -> Dict[str, Any]:
    t = change.type
    p = change.payload

    if t == "ADD_DEVELOPER":
        added = int(p.get("count", 1))
        ramp  = float(p.get("ramp_factor", 0.5))  # 50% productivity during ramp
        return {
            "type": t, "delta_points": 0,
            "delta_team": added,
            "delta_velocity": added * DEFAULT_VELOCITY_PTS_PER_DEV_PER_SPRINT * ramp,
            "delta_cost": added * daily_rate * 14,
            "bottleneck": f"New developer(s) ramp-up period reduces initial velocity by {int((1-ramp)*100)}%",
        }

    if t == "REMOVE_DEVELOPER":
        removed = int(p.get("count", 1))
        is_lead = bool(p.get("is_lead", False))
        return {
            "type": t, "delta_points": 0,
            "delta_team": -removed,
            "delta_velocity": -(removed * DEFAULT_VELOCITY_PTS_PER_DEV_PER_SPRINT),
            "delta_cost": 0,
            "bottleneck": "Lead developer removed — knowledge transfer risk HIGH" if is_lead else None,
        }

    if t == "CHANGE_SCOPE":
        delta = float(p.get("delta_points", 0))
        return {
            "type": t, "delta_points": delta,
            "delta_team": 0, "delta_velocity": 0,
            "delta_cost": 0,
            "bottleneck": f"Scope increased by {delta} points — review sprint capacity" if delta > 0 else None,
        }

    if t == "CHANGE_DEADLINE":
        deadline_days = float(p.get("deadline_days", 0))
        current_days  = _compute_duration(points, velocity)
        if deadline_days < current_days:
            return {
                "type": t, "delta_points": 0, "delta_team": 0,
                "delta_velocity": 0, "delta_cost": 0,
                "bottleneck": f"Deadline is {round(current_days - deadline_days, 0)}d earlier than projected completion",
            }

    return {"type": t, "delta_points": 0, "delta_team": 0, "delta_velocity": 0, "delta_cost": 0, "bottleneck": None}

def _classify_risk_delta(delta_days: float, baseline: float) -> str:
    pct = (delta_days / max(baseline, 1)) * 100
    if pct > 25:    return "CRITICAL — significant timeline overrun likely"
    if pct > 10:    return "HIGH — notable delay risk, review scope"
    if pct > 0:     return "MODERATE — minor delay, monitor closely"
    if pct < -10:   return "POSITIVE — timeline improvement detected"
    return "NEUTRAL — minimal impact on timeline"