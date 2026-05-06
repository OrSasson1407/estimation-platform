// apps/analytics-service/src/analytics-service.service.ts  ← NEW
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createLogger } from '@estimation/logger';
import { createClient } from '@clickhouse/client';

const logger = createLogger('analytics-service');

@Injectable()
export class AnalyticsService implements OnModuleInit, OnModuleDestroy {
  private ch = createClient({
    host: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
    database: 'default',
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
  });

  async onModuleInit() {
    await this.ensureTablesExist();
    logger.info('Analytics ClickHouse tables ready');
  }

  async onModuleDestroy() {
    await this.ch.close();
  }

  // ── Table bootstrap (idempotent) ─────────────────────────────────────────────

  private async ensureTablesExist() {
    // Estimation history — append-only OLAP table
    await this.ch.exec({
      query: `
        CREATE TABLE IF NOT EXISTS estimation_events (
          event_id       String,
          task_id        String,
          project_id     String,
          org_id         String,
          expected_hours Float64,
          confidence     Float64,
          model_version  String,
          recorded_at    DateTime DEFAULT now()
        ) ENGINE = MergeTree()
        ORDER BY (project_id, recorded_at)
      `,
    });

    // Sprint velocity history
    await this.ch.exec({
      query: `
        CREATE TABLE IF NOT EXISTS sprint_velocity (
          sprint_id        String,
          project_id       String,
          org_id           String,
          completed_points Float64,
          planned_points   Float64,
          velocity_score   Float64,
          recorded_at      DateTime DEFAULT now()
        ) ENGINE = MergeTree()
        ORDER BY (project_id, recorded_at)
      `,
    });

    // Risk alert history
    await this.ch.exec({
      query: `
        CREATE TABLE IF NOT EXISTS risk_events (
          risk_id     String,
          project_id  String,
          org_id      String,
          severity    String,
          category    String,
          recorded_at DateTime DEFAULT now()
        ) ENGINE = MergeTree()
        ORDER BY (project_id, recorded_at)
      `,
    });
  }

  // ── Ingest methods (called by Kafka consumer) ────────────────────────────────

  async recordEstimationEvent(data: {
    eventId: string;
    taskId: string;
    projectId: string;
    orgId: string;
    expectedHours: number;
    confidenceScore: number;
    modelVersion: string;
  }) {
    await this.ch.insert({
      table: 'estimation_events',
      values: [
        {
          event_id: data.eventId,
          task_id: data.taskId,
          project_id: data.projectId,
          org_id: data.orgId,
          expected_hours: data.expectedHours,
          confidence: data.confidenceScore,
          model_version: data.modelVersion,
        },
      ],
      format: 'JSONEachRow',
    });
  }

  async recordSprintVelocity(data: {
    sprintId: string;
    projectId: string;
    orgId: string;
    completedPoints: number;
    plannedPoints: number;
    velocityScore: number;
  }) {
    await this.ch.insert({
      table: 'sprint_velocity',
      values: [
        {
          sprint_id: data.sprintId,
          project_id: data.projectId,
          org_id: data.orgId,
          completed_points: data.completedPoints,
          planned_points: data.plannedPoints,
          velocity_score: data.velocityScore,
        },
      ],
      format: 'JSONEachRow',
    });
  }

  async recordRiskEvent(data: {
    riskId: string;
    projectId: string;
    orgId: string;
    severity: string;
    category: string;
  }) {
    await this.ch.insert({
      table: 'risk_events',
      values: [
        {
          risk_id: data.riskId,
          project_id: data.projectId,
          org_id: data.orgId,
          severity: data.severity,
          category: data.category,
        },
      ],
      format: 'JSONEachRow',
    });
  }

  // ── Dashboard query methods ──────────────────────────────────────────────────

  async getProjectEstimationStats(projectId: string, days = 30) {
    const result = await this.ch.query({
      query: `
        SELECT
          toStartOfWeek(recorded_at)  AS week,
          count()                     AS total_estimates,
          avg(expected_hours)         AS avg_hours,
          avg(confidence)             AS avg_confidence,
          min(confidence)             AS min_confidence
        FROM estimation_events
        WHERE project_id = {projectId: String}
          AND recorded_at >= now() - INTERVAL {days: UInt32} DAY
        GROUP BY week
        ORDER BY week ASC
      `,
      query_params: { projectId, days },
      format: 'JSONEachRow',
    });

    return result.json();
  }

  async getVelocityTrend(projectId: string) {
    const result = await this.ch.query({
      query: `
        SELECT
          sprint_id,
          completed_points,
          planned_points,
          velocity_score,
          recorded_at
        FROM sprint_velocity
        WHERE project_id = {projectId: String}
        ORDER BY recorded_at ASC
        LIMIT 20
      `,
      query_params: { projectId },
      format: 'JSONEachRow',
    });

    return result.json();
  }

  async getRiskSummary(projectId: string, days = 30) {
    const result = await this.ch.query({
      query: `
        SELECT
          severity,
          category,
          count() AS total
        FROM risk_events
        WHERE project_id = {projectId: String}
          AND recorded_at >= now() - INTERVAL {days: UInt32} DAY
        GROUP BY severity, category
        ORDER BY total DESC
      `,
      query_params: { projectId, days },
      format: 'JSONEachRow',
    });

    return result.json();
  }

  async getPlatformOverview(orgId: string) {
    const [estimations, velocity, risks] = await Promise.all([
      this.ch.query({
        query: `
          SELECT count() AS total, avg(confidence) AS avg_confidence
          FROM estimation_events
          WHERE org_id = {orgId: String}
            AND recorded_at >= now() - INTERVAL 30 DAY
        `,
        query_params: { orgId },
        format: 'JSONEachRow',
      }),
      this.ch.query({
        query: `
          SELECT avg(velocity_score) AS avg_velocity
          FROM sprint_velocity
          WHERE org_id = {orgId: String}
            AND recorded_at >= now() - INTERVAL 90 DAY
        `,
        query_params: { orgId },
        format: 'JSONEachRow',
      }),
      this.ch.query({
        query: `
          SELECT count() AS active_risks
          FROM risk_events
          WHERE org_id = {orgId: String}
            AND recorded_at >= now() - INTERVAL 7 DAY
        `,
        query_params: { orgId },
        format: 'JSONEachRow',
      }),
    ]);

    return {
      estimations: await estimations.json(),
      velocity: await velocity.json(),
      risks: await risks.json(),
    };
  }
}
