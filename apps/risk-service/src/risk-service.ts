// apps/risk-service/src/risk-service.ts  ← UPDATED: Prisma + real rules engine
import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@estimation/database';
import { createLogger } from '@estimation/logger';
import { KAFKA_TOPICS } from '@estimation/events';
import { Kafka } from 'kafkajs';

const logger = createLogger('risk-service');
const kafka = new Kafka({ brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] });
const producer = kafka.producer();

// Thresholds from spec
const CONFIDENCE_LOW_THRESHOLD = 0.6;
const COGNITIVE_LOAD_CRITICAL = 85;
const TIME_DRIFT_PERCENT = 40;

@Injectable()
export class RiskService {
  async onModuleInit() {
    await producer.connect();
  }

  async onModuleDestroy() {
    await producer.disconnect();
  }

  // ── Called by Kafka consumer on task/estimation events ──────────────────────

  async evaluateTaskEvent(event: any) {
    const { projectId, data } = event;
    const alerts: any[] = [];

    // Rule 1: confidence too low → estimation unreliable
    if (data.confidenceScore !== undefined && data.confidenceScore < CONFIDENCE_LOW_THRESHOLD) {
      alerts.push(
        await this.createAlert(projectId, {
          category: 'UNCLEAR_REQUIREMENTS',
          severity: 'HIGH',
          title: 'Low Estimation Confidence',
          description: `Confidence score ${data.confidenceScore.toFixed(2)} is below threshold ${CONFIDENCE_LOW_THRESHOLD}. Review task description clarity.`,
        }),
      );
    }

    // Rule 2: task in review longer than expected
    if (data.newStatus === 'IN_REVIEW' && data.previousStatus === 'IN_PROGRESS') {
      // In production: compare time-in-progress vs estimate
      logger.debug({ projectId, taskId: data.taskId }, 'task_entered_review');
    }

    return alerts;
  }

  async evaluateDeveloperEvent(event: any) {
    const { data, projectId } = event;

    if (data.cognitiveLoad >= COGNITIVE_LOAD_CRITICAL) {
      return this.createAlert(projectId, {
        category: 'DEVELOPER_OVERLOAD',
        severity: data.cognitiveLoad >= 95 ? 'CRITICAL' : 'HIGH',
        title: 'Developer Cognitive Overload',
        description: `Developer ${data.developerId} has cognitive load at ${data.cognitiveLoad}%. Risk of quality degradation and burnout.`,
      });
    }
  }

  // ── REST-accessible methods ──────────────────────────────────────────────────

  async getProjectRisks(projectId: string) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    const alerts = await prisma.riskAlert.findMany({
      where: { projectId, resolved: false },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
    });

    const severityCounts = alerts.reduce(
      (acc, a) => {
        acc[a.severity] = (acc[a.severity] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      projectId,
      totalActiveAlerts: alerts.length,
      severityCounts,
      alerts,
    };
  }

  async resolveAlert(alertId: string) {
    const alert = await prisma.riskAlert.findUnique({ where: { id: alertId } });
    if (!alert) throw new NotFoundException(`Alert ${alertId} not found`);

    return prisma.riskAlert.update({
      where: { id: alertId },
      data: { resolved: true, resolvedAt: new Date() },
    });
  }

  // ── Internal ─────────────────────────────────────────────────────────────────

  private async createAlert(
    projectId: string,
    data: { category: any; severity: any; title: string; description: string },
  ) {
    const alert = await prisma.riskAlert.create({
      data: { projectId, ...data },
    });

    // Publish risks.alert.triggered → notification-service + collaboration-service
    await producer.send({
      topic: KAFKA_TOPICS.RISK_ALERT,
      messages: [
        {
          key: alert.id,
          value: JSON.stringify({
            eventId: crypto.randomUUID(),
            eventType: KAFKA_TOPICS.RISK_ALERT,
            version: '1.0',
            timestamp: new Date().toISOString(),
            orgId: '',
            projectId,
            data: {
              riskId: alert.id,
              projectId,
              severity: alert.severity,
              category: alert.category,
              title: alert.title,
              message: alert.description,
              recommendedAction: this.getRecommendedAction(alert.category),
            },
          }),
        },
      ],
    });

    logger.warn({ alertId: alert.id, severity: alert.severity, projectId }, 'risk_alert_created');
    return alert;
  }

  private getRecommendedAction(category: string): string {
    const actions: Record<string, string> = {
      UNCLEAR_REQUIREMENTS: 'Schedule a requirements clarification session with the product owner.',
      TECH_UNFAMILIARITY: 'Assign a knowledge-transfer session or pair-programming session.',
      DEVELOPER_OVERLOAD: 'Redistribute tasks or reduce sprint scope immediately.',
      DEPENDENCY_BOTTLENECK: 'Escalate the blocking dependency to engineering management.',
      EXTERNAL_DEPENDENCY: 'Contact the third-party owner and establish a fallback plan.',
      SCOPE_CREEP: 'Freeze scope and schedule a sprint replanning session.',
      BURNOUT_RISK: 'Reduce workload and schedule a 1:1 with the developer.',
      ANOMALY: 'Investigate the anomaly before proceeding with the sprint.',
    };
    return actions[category] ?? 'Review the alert and take appropriate action.';
  }
}
