// apps/risk-service/src/anomaly.detector.ts
import { Injectable } from '@nestjs/common';
import { prisma } from '@estimation/database';
import { createLogger } from '@estimation/logger';

const logger = createLogger('anomaly-detector');

export interface AnomalyResult {
  isAnomaly: boolean;
  zScore: number;
  mean: number;
  stdDev: number;
  value: number;
  direction: 'above' | 'below' | 'normal';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
}

// Z-score thresholds per severity
const Z_MEDIUM = 1.5;
const Z_HIGH = 2.0;
const Z_CRITICAL = 3.0;

// Minimum samples needed before anomaly detection is meaningful
const MIN_SAMPLES = 5;

@Injectable()
export class AnomalyDetector {
  /**
   * Detects whether a developer's current sprint velocity is anomalous
   * compared to their historical baseline (last N sprints).
   */
  async detectVelocityAnomaly(
    developerId: string,
    currentVelocity: number,
    lookbackSprints = 10,
  ): Promise<AnomalyResult> {
    // Pull completed sprint tasks for this developer
    const assignments = await prisma.taskAssignment.findMany({
      where: {
        developerId,
        task: { status: 'DONE' },
      },
      include: {
        task: {
          include: {
            sprintTasks: {
              include: {
                sprint: {
                  select: { id: true, status: true, endDate: true },
                },
              },
            },
          },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });

    // Group completed story points by sprint
    const sprintVelocities = new Map<string, number>();
    for (const assignment of assignments) {
      for (const st of assignment.task.sprintTasks) {
        if (st.sprint.status === 'COMPLETED') {
          const key = st.sprint.id;
          sprintVelocities.set(key, (sprintVelocities.get(key) ?? 0) + (assignment.task.storyPoints ?? 0));
        }
      }
    }

    const historical = Array.from(sprintVelocities.values()).slice(0, lookbackSprints);

    if (historical.length < MIN_SAMPLES) {
      logger.debug({ developerId, samples: historical.length }, 'anomaly_detection_insufficient_data');
      return {
        isAnomaly: false,
        zScore: 0,
        mean: currentVelocity,
        stdDev: 0,
        value: currentVelocity,
        direction: 'normal',
        severity: null,
      };
    }

    const { mean, stdDev } = this.computeStats(historical);
    const zScore = stdDev > 0 ? (currentVelocity - mean) / stdDev : 0;
    const absZ = Math.abs(zScore);

    let severity: AnomalyResult['severity'] = null;
    if (absZ >= Z_CRITICAL) severity = 'CRITICAL';
    else if (absZ >= Z_HIGH) severity = 'HIGH';
    else if (absZ >= Z_MEDIUM) severity = 'MEDIUM';

    const result: AnomalyResult = {
      isAnomaly: absZ >= Z_MEDIUM,
      zScore: parseFloat(zScore.toFixed(3)),
      mean: parseFloat(mean.toFixed(2)),
      stdDev: parseFloat(stdDev.toFixed(2)),
      value: currentVelocity,
      direction: zScore > 0 ? 'above' : zScore < 0 ? 'below' : 'normal',
      severity,
    };

    if (result.isAnomaly) {
      logger.warn(
        { developerId, zScore: result.zScore, mean: result.mean, severity },
        'velocity_anomaly_detected',
      );
    }

    return result;
  }

  /**
   * Detects whether a task's actual hours deviate anomalously from
   * the historical distribution of similar-complexity tasks.
   */
  async detectEstimationAnomaly(
    projectId: string,
    taskComplexity: number,
    actualHours: number,
    estimatedHours: number,
  ): Promise<AnomalyResult> {
    // Pull historical estimation errors for this project
    const estimations = await prisma.estimation.findMany({
      where: {
        task: { projectId },
        status: 'ACTIVE',
        actualHours: { not: null },
      },
      select: { expectedHours: true, actualHours: true },
      orderBy: { generatedAt: 'desc' },
      take: 50,
    });

    const errors = estimations
      .filter((e) => e.actualHours !== null)
      .map((e) => ((e.actualHours! - e.expectedHours) / e.expectedHours) * 100);

    if (errors.length < MIN_SAMPLES) {
      return {
        isAnomaly: false,
        zScore: 0,
        mean: 0,
        stdDev: 0,
        value: actualHours,
        direction: 'normal',
        severity: null,
      };
    }

    const { mean, stdDev } = this.computeStats(errors);
    const currentError = estimatedHours > 0
      ? ((actualHours - estimatedHours) / estimatedHours) * 100
      : 0;

    const zScore = stdDev > 0 ? (currentError - mean) / stdDev : 0;
    const absZ = Math.abs(zScore);

    let severity: AnomalyResult['severity'] = null;
    if (absZ >= Z_CRITICAL) severity = 'CRITICAL';
    else if (absZ >= Z_HIGH) severity = 'HIGH';
    else if (absZ >= Z_MEDIUM) severity = 'MEDIUM';

    return {
      isAnomaly: absZ >= Z_MEDIUM,
      zScore: parseFloat(zScore.toFixed(3)),
      mean: parseFloat(mean.toFixed(2)),
      stdDev: parseFloat(stdDev.toFixed(2)),
      value: currentError,
      direction: zScore > 0 ? 'above' : zScore < 0 ? 'below' : 'normal',
      severity,
    };
  }

  /**
   * Computes population mean and sample standard deviation.
   */
  private computeStats(values: number[]): { mean: number; stdDev: number } {
    const n = values.length;
    const mean = values.reduce((s, v) => s + v, 0) / n;
    const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (n - 1);
    return { mean, stdDev: Math.sqrt(variance) };
  }
}