// Base envelope for all Kafka events
export interface BaseEvent<T> {
  eventId: string; // UUID v4
  eventType: string; // e.g., 'estimation.estimate.generated'
  version: string; // Schema version (e.g., '1.0')
  timestamp: string; // ISO 8601
  orgId: string; // Tenant isolation key
  projectId: string;
  userId?: string; // Actor that triggered the event
  data: T; // The specific event payload
  metadata?: {
    correlationId: string; // Used for distributed tracing (Jaeger)
    causationId: string; // ID of the event that triggered this one
  };
}
