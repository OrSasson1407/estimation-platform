export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
}

export interface CanonicalEvent {
  eventId: string;
  eventType: string;
  version: string;
  timestamp: string;
  orgId: string;
  projectId: string;
  data: Record<string, unknown>;
}

export interface IConnector {
  connect(credentials: OAuthTokens): Promise<void>;
  startPolling(intervalMs: number): void;
  registerWebhook(callbackUrl: string): Promise<any>;
  handleWebhookPayload(raw: unknown): Promise<CanonicalEvent[]>;
  disconnect(): Promise<void>;
}
