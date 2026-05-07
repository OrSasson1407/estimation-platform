# apps/simulation-service/src/stress_tester.py  ← UPGRADED v2
"""
Monte Carlo Stress Testing Engine
Runs predefined adversarial scenarios against a project context
and returns survival probability + delay distributions.

Scenarios (per spec):
  KEY_DEV_LEAVES        — critical developer departs mid-sprint
  SCOPE_DOUBLES         — requirements double unexpectedly
  THIRD_PARTY_DELAYS    — external API/vendor delayed 2-4 weeks
  TECH_DEBT_HITS        — accumulated debt forces 2-week refactor sprint
  TEAM_ILLNESS          — 30% of team out for 1-2 weeks
  INFRA_OUTAGE          — production incident consumes 1 week of team capacity
  REQUIREMENTS_CHURN    — 40% of stories revised after sprint planning
  HOSTILE_AUDIT         — security/compliance audit mid-sprint
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Tuple
import random, math, statistics

# ── Monte Carlo config ────────────────────────────────────────────────────────
N_SIMULATIONS = 500  # iterations per scenario
RANDOM_SEED   = 42

# ── Data classes ──────────────────────────────────────────────────────────────
@dataclass
class StressTestResult:
    scenario_id:              str
    scenario_name:            str
    description:              str
    survival_probability:     float   # 0-1 chance project completes within +20% of baseline
    projected_delay_days:     float   # median delay in days
    p95_delay_days:           float   # 95th percentile delay
    critical_path_impact:     str     # "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
    affected_risk_categories: List[str]
    mitigation_suggestions:   List[str]
    confidence_interval:      Dict[str, float]  # {"p10": x, "p50": y, "p90": z}

# ── Scenario definitions ──────────────────────────────────────────────────────
SCENARIOS: Dict[str, Dict] = {
    "KEY_DEV_LEAVES": {
        "name":        "Key Developer Departure",
        "description": "A developer with critical code ownership leaves mid-sprint without knowledge transfer.",
        "categories":  ["DEVELOPER_OVERLOAD", "DEPENDENCY_BOTTLENECK"],
        "mitigations": [
            "Enforce code review culture to distribute knowledge.",
            "Maintain up-to-date runbooks and architecture decision records.",
            "Cross-train at least two developers on all critical modules.",
        ],
        # Stochastic parameters (mean, std_dev) for delay days
        "delay_mean":  18.0,
        "delay_std":    8.0,
        "velocity_loss": (0.15, 0.35),  # (min, max) fraction of velocity lost
    },
    "SCOPE_DOUBLES": {
        "name":        "Scope Doubles",
        "description": "Feature requirements unexpectedly double in size due to stakeholder expansion.",
        "categories":  ["SCOPE_CREEP", "UNCLEAR_REQUIREMENTS"],
        "mitigations": [
            "Implement formal scope change approval with impact analysis.",
            "Freeze scope at sprint planning; changes enter next sprint backlog.",
            "Define an explicit MVP boundary and enforce it with stakeholders.",
        ],
        "delay_mean":  40.0,
        "delay_std":   12.0,
        "velocity_loss": (0.0, 0.1),
    },
    "THIRD_PARTY_DELAYS": {
        "name":        "Third-Party / Vendor Delays",
        "description": "An external API, vendor deliverable, or integration partner is delayed 2-4 weeks.",
        "categories":  ["EXTERNAL_DEPENDENCY", "DEPENDENCY_BOTTLENECK"],
        "mitigations": [
            "Build mock/stub versions of all third-party dependencies.",
            "Establish SLA with vendors and escalation paths.",
            "Re-sequence sprint work to defer blocked items.",
        ],
        "delay_mean":  14.0,
        "delay_std":    5.0,
        "velocity_loss": (0.1, 0.25),
    },
    "TECH_DEBT_HITS": {
        "name":        "Technical Debt Crisis",
        "description": "Accumulated technical debt forces an emergency refactoring sprint before progress can continue.",
        "categories":  ["ANOMALY", "UNCLEAR_REQUIREMENTS"],
        "mitigations": [
            "Allocate 20% of sprint capacity to debt reduction continuously.",
            "Track SonarQube sqale_index trend; alert when growing >5% weekly.",
            "Schedule a dedicated tech debt sprint every quarter.",
        ],
        "delay_mean":  12.0,
        "delay_std":    4.0,
        "velocity_loss": (0.2, 0.4),
    },
    "TEAM_ILLNESS": {
        "name":        "Team Illness (30% Capacity Loss)",
        "description": "30% of the team is unavailable for 1-2 weeks due to illness.",
        "categories":  ["DEVELOPER_OVERLOAD"],
        "mitigations": [
            "Ensure no single developer is the sole owner of any critical path item.",
            "Maintain a 15% sprint buffer for unplanned capacity loss.",
            "Document runbooks for all on-call and deployment procedures.",
        ],
        "delay_mean":   7.0,
        "delay_std":    3.0,
        "velocity_loss": (0.25, 0.35),
    },
    "INFRA_OUTAGE": {
        "name":        "Production Infrastructure Outage",
        "description": "A production incident consumes the equivalent of one week of team engineering capacity.",
        "categories":  ["ANOMALY"],
        "mitigations": [
            "Implement chaos engineering to pre-discover failure modes.",
            "Maintain a dedicated on-call rotation separate from sprint team.",
            "Automate incident response runbooks to reduce MTTR.",
        ],
        "delay_mean":   5.0,
        "delay_std":    2.5,
        "velocity_loss": (0.15, 0.30),
    },
    "REQUIREMENTS_CHURN": {
        "name":        "Requirements Churn (40% Revision)",
        "description": "40% of sprint stories are revised or invalidated after sprint planning due to changing product direction.",
        "categories":  ["UNCLEAR_REQUIREMENTS", "SCOPE_CREEP"],
        "mitigations": [
            "Establish a definition-of-ready checklist before stories enter sprint.",
            "Require product owner sign-off 3 business days before sprint start.",
            "Lock sprint scope at planning; all changes go to next sprint.",
        ],
        "delay_mean":  20.0,
        "delay_std":    7.0,
        "velocity_loss": (0.35, 0.50),
    },
    "HOSTILE_AUDIT": {
        "name":        "Security / Compliance Audit",
        "description": "An unplanned security or compliance audit interrupts mid-sprint, consuming 1 week of senior engineer time.",
        "categories":  ["EXTERNAL_DEPENDENCY"],
        "mitigations": [
            "Run quarterly internal security audits to stay audit-ready.",
            "Maintain living compliance documentation (SOC2, ISO 27001).",
            "Designate a compliance champion per team to handle audit requests.",
        ],
        "delay_mean":   6.0,
        "delay_std":    2.0,
        "velocity_loss": (0.10, 0.25),
    },
}

# ── Monte Carlo runner ────────────────────────────────────────────────────────
def _run_monte_carlo(
    scenario: Dict,
    baseline_days: float,
    team_size: int,
    rng: random.Random,
) -> List[float]:
    """
    Run N_SIMULATIONS iterations, returning a list of delay_days per run.
    Each run samples from the scenario's stochastic parameters.
    """
    delays = []
    v_min, v_max = scenario["velocity_loss"]

    for _ in range(N_SIMULATIONS):
        # Sample delay from normal distribution, clipped at 0
        raw_delay    = rng.gauss(scenario["delay_mean"], scenario["delay_std"])
        delay        = max(0.0, raw_delay)

        # Additional velocity-loss compound effect
        vel_loss     = rng.uniform(v_min, v_max)
        compound_ext = baseline_days * vel_loss * rng.uniform(0.5, 1.0)
        total_delay  = delay + compound_ext

        # Team size amplifier: larger teams have more coordination overhead under stress
        team_factor  = 1.0 + max(0, (team_size - 5)) * 0.02
        delays.append(total_delay * team_factor)

    return delays

def _survival_probability(delays: List[float], baseline_days: float, threshold: float = 0.20) -> float:
    """Fraction of simulations where total delay ≤ threshold × baseline."""
    max_acceptable = baseline_days * threshold
    surviving      = sum(1 for d in delays if d <= max_acceptable)
    return round(surviving / len(delays), 3)

def _critical_path_impact(median_delay: float, baseline_days: float) -> str:
    ratio = median_delay / max(1, baseline_days)
    if ratio < 0.10: return "LOW"
    if ratio < 0.25: return "MEDIUM"
    if ratio < 0.50: return "HIGH"
    return "CRITICAL"

# ── Main entry point ──────────────────────────────────────────────────────────
def run_stress_test(
    scenario_ids: List[str],
    ctx: Dict[str, Any],
) -> List[StressTestResult]:
    """
    Run stress-test simulations for the requested scenario IDs.
    Returns one StressTestResult per scenario.
    Unknown scenario IDs are silently skipped.
    """
    baseline_days = float(ctx.get("baseline_days", 60))
    team_size     = int(ctx.get("team_size", 5))
    rng           = random.Random(RANDOM_SEED)

    results = []
    for sid in scenario_ids:
        scenario = SCENARIOS.get(sid.upper())
        if not scenario:
            continue

        delays      = _run_monte_carlo(scenario, baseline_days, team_size, rng)
        sorted_d    = sorted(delays)
        n           = len(sorted_d)

        p10 = sorted_d[int(n * 0.10)]
        p50 = sorted_d[int(n * 0.50)]
        p90 = sorted_d[int(n * 0.90)]
        p95 = sorted_d[int(n * 0.95)]

        survival = _survival_probability(delays, baseline_days)
        median   = round(statistics.median(delays), 1)

        results.append(StressTestResult(
            scenario_id              = sid,
            scenario_name            = scenario["name"],
            description              = scenario["description"],
            survival_probability     = survival,
            projected_delay_days     = median,
            p95_delay_days           = round(p95, 1),
            critical_path_impact     = _critical_path_impact(median, baseline_days),
            affected_risk_categories = scenario["categories"],
            mitigation_suggestions   = scenario["mitigations"],
            confidence_interval      = {
                "p10": round(p10, 1),
                "p50": round(p50, 1),
                "p90": round(p90, 1),
            },
        ))

    return results

# ── Expose scenario catalogue ─────────────────────────────────────────────────
def list_scenarios() -> List[Dict]:
    return [
        {"id": k, "name": v["name"], "description": v["description"],
         "categories": v["categories"]}
        for k, v in SCENARIOS.items()
    ]