# apps/simulation-service/src/what_if_engine.py  ← UPGRADED v2
"""
What-If Simulation Engine
Computes timeline, cost, and risk deltas for hypothetical project changes.

Supported change types (per spec):
  ADD_DEVELOPER     — adds capacity to the team
  REMOVE_DEVELOPER  — removes a developer, redistributes load
  CHANGE_SCOPE      — adds/removes story points
  CHANGE_DEADLINE   — shifts target end date
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any
import math, uuid

# ── Constants ─────────────────────────────────────────────────────────────────
HOURS_PER_DEV_DAY         = 6.0   # effective productive hours per day
STORY_POINTS_PER_DEV_DAY  = 1.2   # average points delivered per dev per day
COST_PER_DEV_DAY_USD      = 800.0 # blended daily rate
OVERHEAD_FACTOR           = 1.15  # 15% coordination overhead per extra developer
ONBOARDING_DAYS           = 5     # ramp-up cost when adding a developer
CONFIDENCE_BASE           = 0.85

# Supported change-type keys
ADD_DEVELOPER    = "ADD_DEVELOPER"
REMOVE_DEVELOPER = "REMOVE_DEVELOPER"
CHANGE_SCOPE     = "CHANGE_SCOPE"
CHANGE_DEADLINE  = "CHANGE_DEADLINE"

# ── Data classes ──────────────────────────────────────────────────────────────
@dataclass
class SimulationChange:
    type:    str
    payload: Dict[str, Any]

@dataclass
class ChangeImpact:
    changeType:      str
    summary:         str
    timelineDelta:   float  # days, signed
    costDelta:       float  # USD, signed
    riskDelta:       float  # -1 to +1, signed

@dataclass
class WhatIfResult:
    simulation_id:      str
    project_id:         str
    baseline_days:      float
    projected_days:     float
    timeline_delta_days: float
    timeline_delta_pct: float
    cost_delta_usd:     float
    risk_delta:         float
    confidence:         float
    bottleneck_warnings: List[str]
    change_impacts:     List[Dict]

# ── Project context defaults (overridden by ctx dict from caller) ─────────────
DEFAULT_CTX = {
    "team_size":      5,
    "total_points":   80,
    "velocity_ppts":  10,   # team story points per sprint (2-week sprint)
    "sprint_days":    10,
    "budget_usd":     200_000,
    "risk_score":     0.3,  # 0-1
}

def _merge_ctx(ctx: Dict[str, Any]) -> Dict[str, Any]:
    return {**DEFAULT_CTX, **ctx}

# ── Baseline computation ──────────────────────────────────────────────────────
def _baseline_days(ctx: Dict) -> float:
    """Remaining project duration from context."""
    sprints_needed = ctx["total_points"] / ctx["velocity_ppts"]
    return round(sprints_needed * ctx["sprint_days"], 1)

def _baseline_cost(ctx: Dict) -> float:
    days = _baseline_days(ctx)
    return round(days * ctx["team_size"] * COST_PER_DEV_DAY_USD, 2)

# ── Change handlers ───────────────────────────────────────────────────────────
def _apply_add_developer(
    ctx: Dict, payload: Dict
) -> tuple[float, float, float, str, List[str]]:
    """
    Adding a developer increases velocity but has diminishing returns
    (Brooks's Law: overhead grows as n*(n-1)/2 communication links).
    Returns: (timeline_delta_days, cost_delta_usd, risk_delta, summary, warnings)
    """
    count       = int(payload.get("count", 1))
    skill_match = float(payload.get("skill_match", 0.7))  # 0-1

    current_size     = ctx["team_size"]
    new_size         = current_size + count
    overhead_penalty = 1 + (new_size - current_size) * 0.05  # 5% overhead per extra person

    # Effective velocity gain, discounted by skill match and Brooks's Law
    velocity_gain   = count * STORY_POINTS_PER_DEV_DAY * ctx["sprint_days"] * skill_match / overhead_penalty
    new_velocity    = ctx["velocity_ppts"] + velocity_gain

    old_days        = _baseline_days(ctx)
    new_sprints     = ctx["total_points"] / new_velocity
    new_days        = new_sprints * ctx["sprint_days"] + ONBOARDING_DAYS
    timeline_delta  = round(new_days - old_days, 1)

    # Cost: new headcount for remaining duration + onboarding
    remaining_days  = max(0, old_days + timeline_delta)
    cost_delta      = round(
        count * remaining_days * COST_PER_DEV_DAY_USD + count * ONBOARDING_DAYS * COST_PER_DEV_DAY_USD,
        2,
    )

    # Risk: generally decreases (more capacity) unless team already large
    risk_delta = -0.05 * count * skill_match if new_size <= 8 else +0.03 * count

    warnings = []
    if new_size > 8:
        warnings.append(f"Team size {new_size} exceeds optimal threshold (8). "
                        "Brooks's Law: coordination overhead will increase significantly.")
    if skill_match < 0.5:
        warnings.append("Low skill match (<50%) — onboarding cost likely underestimated.")

    summary = (
        f"Adding {count} developer(s) (skill match {skill_match*100:.0f}%) "
        f"reduces timeline by {abs(timeline_delta):.1f}d but adds "
        f"${cost_delta:,.0f} and {ONBOARDING_DAYS}d ramp-up."
    )
    return timeline_delta, cost_delta, round(risk_delta, 3), summary, warnings


def _apply_remove_developer(
    ctx: Dict, payload: Dict
) -> tuple[float, float, float, str, List[str]]:
    """
    Removing a developer reduces velocity. If the dev is a code owner,
    risk increases significantly.
    """
    count        = int(payload.get("count", 1))
    is_code_owner = bool(payload.get("is_code_owner", False))
    current_size  = ctx["team_size"]

    if count >= current_size:
        count = current_size - 1  # can't remove everyone

    velocity_loss  = count * STORY_POINTS_PER_DEV_DAY * ctx["sprint_days"]
    new_velocity   = max(1.0, ctx["velocity_ppts"] - velocity_loss)
    old_days       = _baseline_days(ctx)
    new_sprints    = ctx["total_points"] / new_velocity
    new_days       = new_sprints * ctx["sprint_days"]
    timeline_delta = round(new_days - old_days, 1)

    # Cost savings
    remaining_days = old_days  # we save over original duration
    cost_delta     = round(-count * remaining_days * COST_PER_DEV_DAY_USD, 2)

    risk_delta  = 0.08 * count
    if is_code_owner:
        risk_delta += 0.15  # knowledge concentration risk

    warnings = []
    if is_code_owner:
        warnings.append("Removing a code owner creates a single-point-of-failure risk. "
                        "Ensure knowledge transfer before departure.")
    if new_velocity < ctx["velocity_ppts"] * 0.6:
        warnings.append("Velocity drops below 60% of baseline — sprint commitments will likely be missed.")

    summary = (
        f"Removing {count} developer(s) extends timeline by {timeline_delta:.1f}d "
        f"but saves ${abs(cost_delta):,.0f}."
    )
    return timeline_delta, cost_delta, round(risk_delta, 3), summary, warnings


def _apply_change_scope(
    ctx: Dict, payload: Dict
) -> tuple[float, float, float, str, List[str]]:
    """
    Adding or removing story points from remaining scope.
    delta_points: positive = scope addition (creep), negative = descope
    """
    delta_points = float(payload.get("delta_points", 0))
    reason       = payload.get("reason", "unspecified")

    new_points     = max(0, ctx["total_points"] + delta_points)
    old_days       = _baseline_days(ctx)
    new_sprints    = new_points / ctx["velocity_ppts"]
    new_days       = new_sprints * ctx["sprint_days"]
    timeline_delta = round(new_days - old_days, 1)
    cost_delta     = round(timeline_delta * ctx["team_size"] * COST_PER_DEV_DAY_USD, 2)

    risk_delta = 0.0
    if delta_points > 0:
        # Scope creep increases risk proportionally
        risk_delta = min(0.3, delta_points / ctx["total_points"] * 0.5)

    warnings = []
    if delta_points > ctx["total_points"] * 0.2:
        warnings.append(
            f"Scope increase of {delta_points:.0f} pts is >20% of baseline — "
            "strong indicator of requirement churn. Consider sprint replanning."
        )
    if delta_points < 0:
        warnings.append(f"Descoping {abs(delta_points):.0f} pts. Ensure stakeholders have acknowledged de-prioritised features.")

    summary = (
        f"Scope {'increase' if delta_points > 0 else 'reduction'} of "
        f"{abs(delta_points):.0f} pts ({reason}): "
        f"{timeline_delta:+.1f}d, ${cost_delta:+,.0f}."
    )
    return timeline_delta, cost_delta, round(risk_delta, 3), summary, warnings


def _apply_change_deadline(
    ctx: Dict, payload: Dict
) -> tuple[float, float, float, str, List[str]]:
    """
    Shifting the target deadline affects risk (crunch) and may require hiring.
    delta_days: negative = earlier deadline (crunch), positive = extension
    """
    delta_days   = float(payload.get("delta_days", 0))
    baseline     = _baseline_days(ctx)
    new_deadline = baseline + delta_days
    cost_delta   = 0.0
    risk_delta   = 0.0

    warnings = []
    if delta_days < 0:
        # Crunch: need to either reduce scope or add devs
        crunch_ratio = abs(delta_days) / baseline
        risk_delta   = min(0.4, crunch_ratio * 0.6)
        if crunch_ratio > 0.2:
            cost_delta = abs(delta_days) * ctx["team_size"] * COST_PER_DEV_DAY_USD * 0.3  # overtime premium
            warnings.append(
                f"Deadline moved {abs(delta_days):.0f}d earlier — team will likely need overtime "
                f"or scope must be cut by ~{crunch_ratio*100:.0f}%."
            )
        if crunch_ratio > 0.4:
            warnings.append("Deadline compression >40% is a strong burnout risk indicator.")
    else:
        risk_delta = -0.05  # extension reduces delivery pressure

    summary = (
        f"Deadline {'brought forward' if delta_days < 0 else 'extended'} by "
        f"{abs(delta_days):.0f}d. Risk delta: {risk_delta:+.2f}."
    )
    return delta_days, cost_delta, round(risk_delta, 3), summary, warnings


# ── Main entry point ──────────────────────────────────────────────────────────
def run_what_if(
    project_id: str,
    simulation_id: str,
    changes: List[SimulationChange],
    ctx: Dict[str, Any],
) -> WhatIfResult:
    """
    Apply all changes sequentially, accumulating deltas.
    Each change sees the mutated context from previous changes.
    """
    ctx             = _merge_ctx(ctx)
    baseline_days   = _baseline_days(ctx)
    baseline_cost   = _baseline_cost(ctx)

    total_timeline  = 0.0
    total_cost      = 0.0
    total_risk      = 0.0
    all_warnings    = []
    change_impacts  = []

    for change in changes:
        ctype = change.type.upper()

        if ctype == ADD_DEVELOPER:
            td, cd, rd, summary, warns = _apply_add_developer(ctx, change.payload)
        elif ctype == REMOVE_DEVELOPER:
            td, cd, rd, summary, warns = _apply_remove_developer(ctx, change.payload)
        elif ctype == CHANGE_SCOPE:
            td, cd, rd, summary, warns = _apply_change_scope(ctx, change.payload)
        elif ctype == CHANGE_DEADLINE:
            td, cd, rd, summary, warns = _apply_change_deadline(ctx, change.payload)
        else:
            td, cd, rd, summary, warns = 0.0, 0.0, 0.0, f"Unknown change type: {ctype}", []

        total_timeline += td
        total_cost     += cd
        total_risk     += rd
        all_warnings.extend(warns)

        change_impacts.append(ChangeImpact(
            changeType=ctype, summary=summary,
            timelineDelta=td, costDelta=cd, riskDelta=rd,
        ).__dict__)

        # Mutate context for next change
        if ctype == ADD_DEVELOPER:
            ctx["team_size"]    += change.payload.get("count", 1)
        elif ctype == REMOVE_DEVELOPER:
            ctx["team_size"]     = max(1, ctx["team_size"] - change.payload.get("count", 1))
        elif ctype == CHANGE_SCOPE:
            ctx["total_points"]  = max(0, ctx["total_points"] + change.payload.get("delta_points", 0))

    projected_days = round(baseline_days + total_timeline, 1)
    timeline_pct   = round((total_timeline / baseline_days) * 100, 1) if baseline_days > 0 else 0.0

    # Confidence degrades with more simultaneous changes and high risk delta
    confidence = round(
        max(0.3, CONFIDENCE_BASE - len(changes) * 0.03 - abs(total_risk) * 0.1),
        3,
    )

    return WhatIfResult(
        simulation_id       = simulation_id,
        project_id          = project_id,
        baseline_days       = baseline_days,
        projected_days      = projected_days,
        timeline_delta_days = round(total_timeline, 1),
        timeline_delta_pct  = timeline_pct,
        cost_delta_usd      = round(total_cost, 2),
        risk_delta          = round(min(1.0, max(-1.0, total_risk)), 3),
        confidence          = confidence,
        bottleneck_warnings = list(dict.fromkeys(all_warnings)),  # deduplicated
        change_impacts      = change_impacts,
    )