import { IConnector, OAuthTokens, CanonicalEvent } from './connector.interface';

export class JiraConnector implements IConnector {
  // FIX: Added '!' to tell TS this will be assigned at runtime
  private tokens!: OAuthTokens;

  async connect(credentials: OAuthTokens): Promise<void> {
    this.tokens = credentials;
    console.log('Connected to Jira');
  }

  startPolling(intervalMs: number): void {
    console.log(`Polling Jira every ${intervalMs}ms`);
  }

  async registerWebhook(callbackUrl: string): Promise<any> {
    return { status: 'registered', url: callbackUrl };
  }

  async handleWebhookPayload(raw: any): Promise<CanonicalEvent[]> {
    return [
      {
        eventId: raw.webhookEvent || 'unknown',
        eventType: 'integrations.jira.synced',
        version: '1.0',
        timestamp: new Date().toISOString(),
        orgId: 'org_placeholder',
        projectId: raw.issue?.fields?.project?.id || 'unknown',
        data: {
          issueKey: raw.issue?.key,
          summary: raw.issue?.fields?.summary,
          storyPoints: raw.issue?.fields?.customfield_10016,
        },
      },
    ];
  }

  async disconnect(): Promise<void> {
    console.log('Disconnected from Jira');
  }
}
