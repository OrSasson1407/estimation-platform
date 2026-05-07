// packages/events/payloads.ts  ← PHASE 1 FIX: added DEVELOPER_PROFILE_UPDATED key
import { BaseEvent } from './base.event';

// ─── projects.task.created ────────────────────────────────────────────────────
export interface TaskCreatedPayload {
  taskId: string;
  externalId: string;
  title: string;
  description: string;
  projectId: string;
  complexityScore?: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}
export type TaskCreatedEvent = BaseEvent<TaskCreatedPayload>;

// ─── projects.task.status_changed ────────────────────────────────────────────
export interface TaskStatusChangedPayload {
  taskId: string;
  projectId: string;
  previousStatus: string;
  newStatus: string;
  changedBy: string;
}
export type TaskStatusChangedEvent = BaseEvent<TaskStatusChangedPayload>;

// ─── projects.sprint.completed ───────────────────────────────────────────────
export interface SprintCompletedPayload {
  sprintId: string;
  projectId: string;
  completedPoints: number;
  plannedPoints: number;
  velocityScore: number;
}
export type SprintCompletedEvent = BaseEvent<SprintCompletedPayload>;

// ─── projects.scope.changed ──────────────────────────────────────────────────
export interface ScopeChangedPayload {
  projectId: string;
  deltaPoints: number;
  reason: string;
  changedBy: string;
}
export type ScopeChangedEvent = BaseEvent<ScopeChangedPayload>;

// ─── estimation.estimate.generated ───────────────────────────────────────────
export interface EstimateGeneratedPayload {
  estimationId: string;
  taskId: string;
  optimisticHours: number;
  expectedHours: number;
  pessimisticHours: number;
  confidenceScore: number;
  modelVersion: string;
}
export type EstimateGeneratedEvent = BaseEvent<EstimateGeneratedPayload>;

// ─── estimation.estimate.revised ─────────────────────────────────────────────
export interface EstimateRevisedPayload {
  estimationId: string;
  taskId: string;
  previousHours: number;
  revisedHours: number;
  confidenceScore: number;
  triggerReason: 'scope_change' | 'manual_override' | 'model_retrain';
  revisedBy?: string;
}
export type EstimateRevisedEvent = BaseEvent<EstimateRevisedPayload>;

// ─── estimation.confidence.low ────────────────────────────────────────────────
export interface ConfidenceLowPayload {
  estimationId: string;
  taskId: string;
  confidenceScore: number;
  warningThreshold: number;
}
export type ConfidenceLowEvent = BaseEvent<ConfidenceLowPayload>;

// ─── developers.velocity.updated ─────────────────────────────────────────────
export interface VelocityUpdatedPayload {
  developerId: string;
  sprintId: string;
  completedPoints: number;
  accuracyScore: number;
  cognitiveLoad: number;
}
export type VelocityUpdatedEvent = BaseEvent<VelocityUpdatedPayload>;

// ─── developers.profile.updated ──────────────────────────────────────────────
export interface DeveloperProfileUpdatedPayload {
  developerId: string;
  changedFields: string[];
  burnoutRisk?: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
}
export type DeveloperProfileUpdatedEvent = BaseEvent<DeveloperProfileUpdatedPayload>;

// ─── risks.alert.triggered ───────────────────────────────────────────────────
export interface RiskAlertTriggeredPayload {
  riskId: string;
  projectId: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  category:
    | 'UNCLEAR_REQUIREMENTS'
    | 'TECH_UNFAMILIARITY'
    | 'DEVELOPER_OVERLOAD'
    | 'DEPENDENCY_BOTTLENECK'
    | 'EXTERNAL_DEPENDENCY'
    | 'SCOPE_CREEP'
    | 'BURNOUT_RISK'
    | 'ANOMALY';
  title: string;
  message: string;
  recommendedAction: string;
}
export type RiskAlertTriggeredEvent = BaseEvent<RiskAlertTriggeredPayload>;

// ─── risks.anomaly.detected ───────────────────────────────────────────────────
export interface AnomalyDetectedPayload {
  projectId: string;
  taskId?: string;
  anomalyType: 'TIME_DRIFT' | 'VELOCITY_DROP' | 'SCOPE_CREEP' | 'DEPENDENCY_BLOCK';
  deviationPercent: number;
  description: string;
}
export type AnomalyDetectedEvent = BaseEvent<AnomalyDetectedPayload>;

// ─── integrations.jira.synced ────────────────────────────────────────────────
export interface JiraSyncedPayload {
  issueKey: string;
  projectId: string;
  summary: string;
  storyPoints?: number;
  status: string;
  assigneeExternalId?: string;
}
export type JiraSyncedEvent = BaseEvent<JiraSyncedPayload>;

// ─── integrations.github.commit_pushed ────────────────────────────────────────
export interface GitHubCommitPushedPayload {
  repoFullName: string;
  commitSha: string;
  authorExternalId: string;
  message: string;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
}
export type GitHubCommitPushedEvent = BaseEvent<GitHubCommitPushedPayload>;

// ─── Kafka topic name constants ───────────────────────────────────────────────
export const KAFKA_TOPICS = {
  TASK_CREATED: 'projects.task.created',
  TASK_STATUS_CHANGED: 'projects.task.status_changed',
  SPRINT_COMPLETED: 'projects.sprint.completed',
  SCOPE_CHANGED: 'projects.scope.changed',
  ESTIMATE_GENERATED: 'estimation.estimate.generated',
  ESTIMATE_REVISED: 'estimation.estimate.revised',
  CONFIDENCE_LOW: 'estimation.confidence.low',
  VELOCITY_UPDATED: 'developers.velocity.updated',
  PROFILE_UPDATED: 'developers.profile.updated',
  // PHASE 1 FIX: explicit alias so risk.consumer.ts no longer needs the `as any` cast
  DEVELOPER_PROFILE_UPDATED: 'developers.profile.updated',
  RISK_ALERT: 'risks.alert.triggered',
  ANOMALY_DETECTED: 'risks.anomaly.detected',
  JIRA_SYNCED: 'integrations.jira.synced',
  GITHUB_COMMIT: 'integrations.github.commit_pushed',
} as const;
