# apps/estimation-service/src/db.py
"""
Async PostgreSQL data access layer for the simulation engine.
Provides project/sprint/task context fetched directly from the DB,
replacing the hardcoded dict stubs in what_if_engine and stress_tester.
"""
import os
import asyncpg
from typing import Optional, Dict, Any, List

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://admin:password123@localhost:5432/estimation_db",
)

_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            DATABASE_URL,
            min_size=2,
            max_size=10,
            command_timeout=10,
        )
    return _pool


async def close_pool():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


# ── Project context ────────────────────────────────────────────────────────────

async def fetch_project_context(project_id: str) -> Dict[str, Any]:
    """
    Fetches all data the simulation engine needs about a project:
    - remaining story points (BACKLOG + IN_PROGRESS tasks)
    - team size (active TeamMember count)
    - current sprint velocity (avg completed pts over last 3 sprints)
    - daily rate (from org settings or env default)
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Remaining points
        remaining = await conn.fetchval(
            """
            SELECT COALESCE(SUM(t."storyPoints"), 0)
            FROM   "Task" t
            WHERE  t."projectId" = $1
            AND    t.status IN ('BACKLOG', 'IN_PROGRESS', 'IN_REVIEW')
            """,
            project_id,
        )

        # Team size via project → team → members
        team_size = await conn.fetchval(
            """
            SELECT COUNT(tm.id)
            FROM   "Project" p
            JOIN   "Team" te ON te.id = p."teamId"
            JOIN   "TeamMember" tm ON tm."teamId" = te.id
            WHERE  p.id = $1
            """,
            project_id,
        ) or 1

        # Velocity: average completed points across last 3 completed sprints
        velocity_rows = await conn.fetch(
            """
            SELECT COALESCE(SUM(t."storyPoints"), 0) AS pts
            FROM   "Sprint" s
            JOIN   "SprintTask" st ON st."sprintId" = s.id
            JOIN   "Task" t ON t.id = st."taskId"
            WHERE  s."projectId" = $1
            AND    s.status = 'COMPLETED'
            AND    t.status = 'DONE'
            GROUP  BY s.id
            ORDER  BY s."endDate" DESC
            LIMIT  3
            """,
            project_id,
        )
        velocities = [r["pts"] for r in velocity_rows]
        current_velocity = (
            sum(velocities) / len(velocities) if velocities else float(team_size) * 8.0
        )

        # Daily rate: fall back to env default if org settings table absent
        daily_rate = float(os.getenv("DEFAULT_DAILY_RATE_USD", "600"))

        return {
            "remaining_points": float(remaining),
            "team_size": int(team_size),
            "current_velocity": float(current_velocity),
            "daily_rate_usd": daily_rate,
        }


async def fetch_sprint_velocity_history(project_id: str, limit: int = 10) -> List[Dict[str, Any]]:
    """Sprint-by-sprint velocity history for stress test baseline."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                s.id,
                s.name,
                s."startDate",
                s."endDate",
                COALESCE(SUM(t."storyPoints") FILTER (WHERE t.status = 'DONE'), 0) AS completed_points,
                COALESCE(SUM(t."storyPoints"), 0) AS planned_points
            FROM   "Sprint" s
            JOIN   "SprintTask" st ON st."sprintId" = s.id
            JOIN   "Task" t ON t.id = st."taskId"
            WHERE  s."projectId" = $1
            AND    s.status = 'COMPLETED'
            GROUP  BY s.id, s.name, s."startDate", s."endDate"
            ORDER  BY s."endDate" DESC
            LIMIT  $2
            """,
            project_id,
            limit,
        )
        return [dict(r) for r in rows]


# ── Simulation persistence ─────────────────────────────────────────────────────

async def persist_simulation_result(
    simulation_id: str,
    project_id: str,
    simulation_type: str,
    input_payload: Dict[str, Any],
    result_payload: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Upserts a SimulationResult row. Table DDL (add to Prisma migration):

    CREATE TABLE IF NOT EXISTS "SimulationResult" (
        id               TEXT PRIMARY KEY,
        "projectId"      TEXT NOT NULL,
        "simulationType" TEXT NOT NULL,
        "inputPayload"   JSONB NOT NULL,
        "resultPayload"  JSONB NOT NULL,
        "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    """
    pool = await get_pool()
    import json as _json
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO "SimulationResult"
                (id, "projectId", "simulationType", "inputPayload", "resultPayload", "createdAt")
            VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, now())
            ON CONFLICT (id) DO UPDATE
                SET "resultPayload" = EXCLUDED."resultPayload"
            RETURNING *
            """,
            simulation_id,
            project_id,
            simulation_type,
            _json.dumps(input_payload),
            _json.dumps(result_payload),
        )
        return dict(row)


async def fetch_simulation_result(simulation_id: str) -> Optional[Dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            'SELECT * FROM "SimulationResult" WHERE id = $1',
            simulation_id,
        )
        return dict(row) if row else None