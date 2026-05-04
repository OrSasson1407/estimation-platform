import { BaseEvent } from "./base.event";

// Topic: projects.task.created
export interface TaskCreatedPayload {
  taskId: string;
  title: string;
  description: string;
  complexityScore?: number;
}
export type TaskCreatedEvent = BaseEvent<TaskCreatedPayload>;

// Topic: estimation.estimate.generated
export interface EstimateGeneratedPayload {
  estimationId: string;
  taskId: string;
  optimisticHours: number;
  expectedHours: number;
  pessimisticHours: number;
  confidenceScore: number;
}
export type EstimateGeneratedEvent = BaseEvent<EstimateGeneratedPayload>;

// Topic: risks.alert.triggered
export interface RiskAlertPayload {
  riskId: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  category: "TECH_DEBT" | "BOTTLENECK" | "BURNOUT" | "SCOPE_CREEP";
  message: string;
  recommendedAction: string;
}
export type RiskAlertEvent = BaseEvent<RiskAlertPayload>;
