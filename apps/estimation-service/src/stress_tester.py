# apps/simulation-service/src/stress_tester.py
import numpy as np
from typing import List, Dict, Any
from dataclasses import dataclass

SCENARIOS: Dict[str, Dict[str, Any]] = {
    "lose_lead_dev": {
        "name": "Lead Developer Departure",
        "description": "The lead developer leaves mid-project",
        "velocity_multiplier": 0.45,
        "scope_delta": 0,
        "risk_categories": ["DEPENDENCY_BOTTLENECK", "BURNOUT_RISK"],
    },
    "scope_creep_30": {
        "name": "30% Scope Increase",
        "description": "Product scope expands by 30% during sprint 3",
        "velocity_multiplier": 1.0,
        "scope_delta": 0.30,
        "risk_categories": ["SCOPE_CREEP", "DEVELOPER_OVERLOAD"],
    },
    "key_infra_outage": {
        "name": "Critical Infrastructure Outage",
        "description": "Primary database unavailable for 3 days",
        "velocity_multiplier": 0.0,
        "lost_days": 3,
        "scope_delta": 0,
        "risk_categories": ["EXTERNAL_DEPENDENCY"],
    },
    "team_burnout": {
        "name": "Team Burnout Event",
        "description": "70% of team operates at 60% capacity for 2 sprints",
        "velocity_multiplier": 0.60,
        "affected_sprints": 2,
        "scope_delta": 0,
        "risk_categories": ["BURNOUT_RISK", "DEVELOPER_OVERLOAD"],
    },
    "external_api_delay": {
        "name": "Third-party API Integration Delay",
        "description": "Critical external API unavailable for 1 sprint",
        "velocity_multiplier": 0.75,
        "blocked_sprints": 1,
        "scope_delta": 0,
        "risk_categories": ["EXTERNAL_DEPENDENCY", "DEPENDENCY_BOTTLENECK"],
    },
}

@dataclass
class StressTestReport:
    scenario_id: str
    scenario_name: str
    description: str
    survival_probability: float
    projected_delay_days: float
    critical_path_impact: str
    affected_risk_categories: List[str]
    mitigation_suggestions: List[str]
    confidence_interval: Dict[str, float]

def run_stress_test(
    scenario_ids: List[str],
    context: Dict[str, Any],
) -> List[StressTestReport]:
    reports = []
    for sid in scenario_ids:
        scenario = SCENARIOS.get(sid)
        if not scenario:
            continue
        reports.append(_evaluate_scenario(sid, scenario, context))
    return reports

def _evaluate_scenario(
    scenario_id: str,
    scenario: Dict[str, Any],
    context: Dict[str, Any],
) -> StressTestReport:
    remaining_points = float(context.get("remaining_points", 100))
    velocity         = float(context.get("velocity", 32))
    sprint_days      = 14

    vm       = float(scenario.get("velocity_multiplier", 1.0))
    scope_d  = float(scenario.get("scope_delta", 0))
    lost_d   = float(scenario.get("lost_days", 0))

    adjusted_velocity = velocity * vm
    adjusted_points   = remaining_points * (1 + scope_d)

    # Monte Carlo simulation under stress
    n = 2000
    v_noise    = np.random.normal(adjusted_velocity, adjusted_velocity * 0.12, n)
    v_noise    = np.maximum(v_noise, 0.1)
    durations  = (adjusted_points / v_noise) * sprint_days + lost_d

    p50 = float(np.percentile(durations, 50))
    p80 = float(np.percentile(durations, 80))
    p95 = float(np.percentile(durations, 95))

    baseline_duration = (remaining_points / velocity) * sprint_days
    delay             = p50 - baseline_duration

    # Survival = P(project completes within 20% buffer of baseline)
    buffer_days    = baseline_duration * 1.20
    survival_prob  = float(np.mean(durations <= buffer_days))

    critical_impact = (
        "CRITICAL" if survival_prob < 0.5 else
        "HIGH"     if survival_prob < 0.7 else
        "MODERATE" if survival_prob < 0.85 else
        "LOW"
    )

    return StressTestReport(
        scenario_id=scenario_id,
        scenario_name=scenario["name"],
        description=scenario["description"],
        survival_probability=round(survival_prob, 3),
        projected_delay_days=round(delay, 1),
        critical_path_impact=critical_impact,
        affected_risk_categories=scenario.get("risk_categories", []),
        mitigation_suggestions=_get_mitigations(scenario_id),
        confidence_interval={"p50": round(p50, 1), "p80": round(p80, 1), "p95": round(p95, 1)},
    )

def _get_mitigations(scenario_id: str) -> List[str]:
    m = {
        "lose_lead_dev": [
            "Implement pair programming and cross-training immediately",
            "Document all tribal knowledge in the next sprint",
            "Identify and onboard a backup lead candidate",
        ],
        "scope_creep_30": [
            "Freeze scope and escalate to product management",
            "Move new requirements to next release milestone",
            "Re-estimate affected tasks with updated story points",
        ],
        "key_infra_outage": [
            "Configure automated failover to secondary region",
            "Maintain offline development mode for all critical services",
            "Test DR runbook this sprint",
        ],
        "team_burnout": [
            "Reduce sprint velocity targets by 25% for recovery period",
            "Cancel all non-critical meetings for 2 weeks",
            "Conduct 1:1s and redistribute highest-complexity tasks",
        ],
        "external_api_delay": [
            "Build mock server for the external API immediately",
            "Negotiate SLA with third-party provider",
            "De-couple dependent tasks and advance independent work",
        ],
    }
    return m.get(scenario_id, ["Review the scenario and plan accordingly"])