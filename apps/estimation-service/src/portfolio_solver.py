# apps/simulation-service/src/portfolio_solver.py
import numpy as np
from typing import List, Dict, Any
from dataclasses import dataclass

@dataclass
class ProjectCandidate:
    id: str
    name: str
    expected_value: float    # business value score 0-100
    estimated_cost: float    # USD
    estimated_days: int
    risk_score: float        # 0-1, higher = riskier
    required_skills: List[str]
    team_ids: List[str]

@dataclass
class PortfolioAllocation:
    selected_project_ids: List[str]
    total_value: float
    total_cost: float
    total_days: int
    portfolio_risk: float
    utilisation_pct: float
    excluded_projects: List[Dict[str, str]]
    optimisation_rationale: str

def solve_portfolio(
    projects: List[ProjectCandidate],
    budget_usd: float,
    available_team_days: int,
    risk_tolerance: float = 0.6,  # 0 = risk-averse, 1 = risk-seeking
) -> PortfolioAllocation:
    """
    Greedy knapsack portfolio optimiser.
    Maximises risk-adjusted value subject to budget + capacity constraints.
    """
    if not projects:
        return PortfolioAllocation(
            selected_project_ids=[], total_value=0, total_cost=0,
            total_days=0, portfolio_risk=0, utilisation_pct=0,
            excluded_projects=[], optimisation_rationale="No projects provided",
        )

    # Risk-adjusted value = expected_value * (1 - risk_score * (1 - risk_tolerance))
    scored = sorted(
        projects,
        key=lambda p: _risk_adjusted_value(p, risk_tolerance) / max(p.estimated_cost, 1),
        reverse=True,
    )

    selected: List[ProjectCandidate] = []
    excluded: List[Dict[str, str]]   = []
    used_budget = 0.0
    used_days   = 0

    for p in scored:
        fits_budget   = (used_budget + p.estimated_cost) <= budget_usd
        fits_capacity = (used_days + p.estimated_days) <= available_team_days

        if fits_budget and fits_capacity:
            selected.append(p)
            used_budget += p.estimated_cost
            used_days   += p.estimated_days
        else:
            reason = []
            if not fits_budget:   reason.append("budget exceeded")
            if not fits_capacity: reason.append("capacity exceeded")
            excluded.append({"id": p.id, "name": p.name, "reason": ", ".join(reason)})

    if not selected:
        return PortfolioAllocation(
            selected_project_ids=[], total_value=0, total_cost=0,
            total_days=0, portfolio_risk=0, utilisation_pct=0,
            excluded_projects=[e for e in excluded],
            optimisation_rationale="No projects fit within budget and capacity constraints",
        )

    total_value = sum(_risk_adjusted_value(p, risk_tolerance) for p in selected)
    total_cost  = sum(p.estimated_cost for p in selected)
    total_days  = sum(p.estimated_days for p in selected)

    # Portfolio risk: weighted average
    weights       = [p.estimated_cost / max(total_cost, 1) for p in selected]
    portfolio_risk = float(np.dot([p.risk_score for p in selected], weights))

    utilisation = (used_days / max(available_team_days, 1)) * 100

    rationale = (
        f"Selected {len(selected)} project(s) maximising risk-adjusted value "
        f"(tolerance={risk_tolerance:.0%}). "
        f"Portfolio risk: {portfolio_risk:.2f}. "
        f"Budget utilisation: {(used_budget/budget_usd*100):.0f}%. "
        f"Capacity utilisation: {utilisation:.0f}%."
    )

    return PortfolioAllocation(
        selected_project_ids=[p.id for p in selected],
        total_value=round(total_value, 2),
        total_cost=round(total_cost, 2),
        total_days=total_days,
        portfolio_risk=round(portfolio_risk, 3),
        utilisation_pct=round(utilisation, 1),
        excluded_projects=excluded,
        optimisation_rationale=rationale,
    )

def _risk_adjusted_value(p: ProjectCandidate, tolerance: float) -> float:
    return p.expected_value * (1 - p.risk_score * (1 - tolerance))