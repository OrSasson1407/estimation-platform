// apps/risk-service/src/risk-service.ts
import { Injectable, NotFoundException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { prisma, RiskCategory } from '@estimation/database';
import { createLogger } from '@estimation/logger';
import { KAFKA_TOPICS } from '@estimation/events';
import { Kafka, Producer } from 'kafkajs';
import { AnomalyDetector } from './anomaly.detector';

const logger = createLogger('risk-service');

// ── Thresholds (all from spec) ────────────────────────────────────────────────
const CONFIDENCE_LOW_THRESHOLD = 0.6;
const COGNITIVE_LOAD_CRITICAL = 85;
const COGNITIVE_LOAD_BURNOUT = 95;
const TIME_DRIFT_WARN_PERCENT = 40;
const TIME_DRIFT_CRITICAL_PERCENT = 70;
const SCOPE_CREEP_POINTS_DELTA = 20;
const DEPENDENCY_BOTTLENECK_MIN = 4;
const VELOCITY_DROP_THRESHOLD = 0.3;

interface AlertInput {
  category: RiskCategory;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
}

@Injectable()
export class RiskService implements OnModuleInit, OnModuleDestroy {
  private producer: Producer;

  constructor(private readonly anomalyDetector: AnomalyDetector) {
    const kafka = new Kafka({
      clientId: 'risk-service',
      brokers: [(process.env.KAFKA_BROKER || 'localhost:9092')],
    });
    this.producer = kafka.producer();
  }

  async onModuleInit() {
    await this.producer.connect();
    logger.info('Kafka producer connected');
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
  }

  // ── Rule evaluators ───────────────────────────────────────────────────────

  async evaluateEstimationEvent(event: any): Promise<any[]> {
    const { projectId, data } = event;
    const alerts: any[] = [];

    // Rule 1: low confidence → unclear requirements
    if (data.confidenceScore !== undefined && data.confidenceScore < CONFIDENCE_LOW_THRESHOLD) {
      alerts.push(
        await this.createAlert(projectId, {
          category: 'UNCLEAR_REQUIREMENTS',
          severity: data.confidenceScore < 0.4 ? 'CRITICAL' : 'HIGH',
          title: 'Low Estimation Confidence',
          description: `Confidence ${(data.confidenceScore * 100).toFixed(0)}% is below ${CONFIDENCE_LOW_THRESHOLD * 100}% threshold. Task description may be ambiguous or requirements incomplete.`,
        }),
      );
    }

    // Rule 2: large pessimistic vs optimistic spread → high uncertainty
    if (data.pessimisticHours && data.optimisticHours) {
      const spread = data.pessimisticHours - data.optimisticHours;
      const ratio = spread / (data.expectedHours || 1);
      if (ratio > 1.5) {
        alerts.push(
          await this.createAlert(projectId, {
            category: 'UNCLEAR_REQUIREMENTS',
            severity: 'MEDIUM',
            title: 'High Estimation Uncertainty',
            description: `Optimistic ${data.optimisticHours}h vs pessimistic ${data.pessimisticHours}h — spread ratio ${ratio.toFixed(1)}× indicates unclear scope.`,
          }),
        );
      }
    }

    // Rule 3: anomaly detection on estimation error vs project baseline
    if (data.actualHours && data.expectedHours && projectId) {
      const anomaly = await this.anomalyDetector.detectEstimationAnomaly(
        projectId,
        data.complexityScore ?? 50,
        data.actualHours,
        data.expectedHours,
      );

      if (anomaly.isAnomaly && anomaly.severity && anomaly.direction === 'above') {
        alerts.push(
          await this.createAlert(projectId, {
            category: 'ANOMALY',
            severity: anomaly.severity,
            title: 'Estimation Anomaly Detected',
            description: `Task overran by ${anomaly.value.toFixed(0)}% — z-score ${anomaly.zScore} (mean error ${anomaly.mean.toFixed(0)}% ±${anomaly.stdDev.toFixed(0)}% for this project). Model retraining signal.`,
          }),
        );
      }
    }

    return alerts;
  }

  async evaluateTaskEvent(event: any): Promise<any[]> {
    const { projectId, data } = event;
    const alerts: any[] = [];

    // Rule 4: time drift — actual vs estimated hours
    if (data.actualHours && data.estimatedHours && data.estimatedHours > 0) {
      const driftPct = ((data.actualHours - data.estimatedHours) / data.estimatedHours) * 100;
      if (driftPct >= TIME_DRIFT_CRITICAL_PERCENT) {
        alerts.push(
          await this.createAlert(projectId, {
            category: 'ANOMALY',
            severity: 'CRITICAL',
            title: 'Severe Time Drift Detected',
            description: `Task ${data.taskId} took ${data.actualHours}h vs estimate ${data.estimatedHours}h (+${driftPct.toFixed(0)}% over). Model retraining signal triggered.`,
          }),
        );
      } else if (driftPct >= TIME_DRIFT_WARN_PERCENT) {
        alerts.push(
          await this.createAlert(projectId, {
            category: 'ANOMALY',
            severity: 'HIGH',
            title: 'Estimation Drift Warning',
            description: `Task ${data.taskId} overran estimate by ${driftPct.toFixed(0)}%. Review complexity factors and dependency assumptions.`,
          }),
        );
      }
    }

    // Rule 5: dependency bottleneck
    if (data.blockedByCount !== undefined && data.blockedByCount >= DEPENDENCY_BOTTLENECK_MIN) {
      alerts.push(
        await this.createAlert(projectId, {
          category: 'DEPENDENCY_BOTTLENECK',
          severity: data.blockedByCount >= 7 ? 'CRITICAL' : 'HIGH',
          title: 'Dependency Bottleneck',
          description: `Task ${data.taskId} is blocked by ${data.blockedByCount} dependencies. Sprint delivery is at risk.`,
        }),
      );
    }

    return alerts;
  }

  async evaluateDeveloperEvent(event: any): Promise<any> {
    const { projectId, data } = event;

    // Rule 6: cognitive overload
    if (data.cognitiveLoad >= COGNITIVE_LOAD_CRITICAL) {
      return this.createAlert(projectId, {
        category: 'DEVELOPER_OVERLOAD',
        severity: data.cognitiveLoad >= COGNITIVE_LOAD_BURNOUT ? 'CRITICAL' : 'HIGH',
        title: 'Developer Cognitive Overload',
        description: `Developer ${data.developerId} cognitive load at ${data.cognitiveLoad}%. Quality degradation and burnout risk imminent.`,
      });
    }

    // Rule 7: statistical velocity anomaly vs personal baseline
    if (data.currentVelocity !== undefined && data.developerId) {
      const anomaly = await this.anomalyDetector.detectVelocityAnomaly(
        data.developerId,
        data.currentVelocity,
      );

      if (anomaly.isAnomaly && anomaly.direction === 'below' && anomaly.severity) {
        return this.createAlert(projectId, {
          category: 'BURNOUT_RISK',
          severity: anomaly.severity,
          title: 'Statistical Velocity Anomaly',
          description: `Developer ${data.developerId} velocity ${data.currentVelocity} pts is ${Math.abs(anomaly.zScore).toFixed(1)}σ below personal baseline (μ=${anomaly.mean} ±${anomaly.stdDev}). Burnout or blocker risk.`,
        });
      }
    }

    // Rule 8: simple threshold drop (fallback when not enough history)
    if (data.currentVelocity !== undefined && data.previousVelocity > 0) {
      const drop = (data.previousVelocity - data.currentVelocity) / data.previousVelocity;
      if (drop >= VELOCITY_DROP_THRESHOLD) {
        return this.createAlert(projectId, {
          category: 'BURNOUT_RISK',
          severity: drop >= 0.5 ? 'CRITICAL' : 'HIGH',
          title: 'Velocity Drop Detected',
          description: `Developer ${data.developerId} velocity dropped ${(drop * 100).toFixed(0)}% (${data.previousVelocity} → ${data.currentVelocity} pts/sprint). Burnout risk.`,
        });
      }
    }

    return null;
  }

  async evaluateSprintEvent(event: any): Promise<any[]> {
    const { projectId, data } = event;
    const alerts: any[] = [];

    // Rule 9: scope creep during sprint
    if (data.deltaPoints && data.deltaPoints >= SCOPE_CREEP_POINTS_DELTA) {
      alerts.push(
        await this.createAlert(projectId, {
          category: 'SCOPE_CREEP',
          severity: data.deltaPoints >= 40 ? 'CRITICAL' : 'HIGH',
          title: 'Sprint Scope Creep',
          description: `${data.deltaPoints} story points added mid-sprint. Delivery commitment is at risk. Reason: ${data.reason ?? 'unspecified'}.`,
        }),
      );
    }

    // Rule 10: sprint velocity below plan
    if (data.completedPoints !== undefined && data.plannedPoints > 0) {
      const completion = data.completedPoints / data.plannedPoints;
      if (completion < 0.65) {
        alerts.push(
          await this.createAlert(projectId, {
            category: 'ANOMALY',
            severity: completion < 0.4 ? 'CRITICAL' : 'HIGH',
            title: 'Sprint Completion Below Target',
            description: `Sprint completed only ${(completion * 100).toFixed(0)}% of planned points (${data.completedPoints}/${data.plannedPoints}). Review team capacity planning.`,
          }),
        );
      }
    }

    return alerts;
  }

  // ── REST methods ──────────────────────────────────────────────────────────

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
      riskScore: this.computeRiskScore(alerts),
      alerts,
    };
  }

  async resolveAlert(alertId: string, resolvedBy?: string) {
    const alert = await prisma.riskAlert.findUnique({ where: { id: alertId } });
    if (!alert) throw new NotFoundException(`Alert ${alertId} not found`);

    const resolved = await prisma.riskAlert.update({
      where: { id: alertId },
      data: { resolved: true, resolvedAt: new Date() },
    });

    logger.info({ alertId, resolvedBy }, 'risk_alert_resolved');
    return resolved;
  }

  async getAlertHistory(projectId: string, limit = 50) {
    return prisma.riskAlert.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async runVelocityAnomalyCheck(developerId: string, currentVelocity: number) {
    return this.anomalyDetector.detectVelocityAnomaly(developerId, currentVelocity);
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private async createAlert(projectId: string, data: AlertInput) {
    const alert = await prisma.riskAlert.create({ data: { projectId, ...data } });

    await this.producer.send({
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

    logger.warn(
      { alertId: alert.id, severity: alert.severity, category: alert.category, projectId },
      'risk_alert_created',
    );
    return alert;
  }

  private computeRiskScore(alerts: any[]): number {
    if (!alerts.length) return 0;
    const weights: Record<string, number> = { CRITICAL: 25, HIGH: 10, MEDIUM: 4, LOW: 1 };
    return Math.min(
      100,
      alerts.reduce((sum, a) => sum + (weights[a.severity] ?? 0), 0),
    );
  }

  private getRecommendedAction(category: string): string {
    const actions: Record<string, string> = {
      UNCLEAR_REQUIREMENTS: 'Schedule a requirements clarification session with the product owner.',
      TECH_UNFAMILIARITY: 'Assign a knowledge-transfer or pair-programming session.',
      DEVELOPER_OVERLOAD: 'Redistribute tasks or reduce sprint scope immediately.',
      DEPENDENCY_BOTTLENECK: 'Escalate the blocking dependency to engineering management.',
      EXTERNAL_DEPENDENCY: 'Contact the third-party owner and establish a fallback plan.',
      SCOPE_CREEP: 'Freeze scope and schedule a sprint replanning session.',
      BURNOUT_RISK: 'Reduce workload and schedule a 1:1 with the developer.',
      ANOMALY: 'Investigate the anomaly and consider triggering model retraining.',
    };
    return actions[category] ?? 'Review the alert and take appropriate action.';
  }
}