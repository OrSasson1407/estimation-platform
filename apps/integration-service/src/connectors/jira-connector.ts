// apps/integration-service/src/connectors/jira-connector.ts  ← UPDATED: HMAC + full fields
import { IConnector, OAuthTokens, CanonicalEvent } from './connector.interface';
import { createLogger } from '@estimation/logger';
import * as crypto from 'crypto';

const logger = createLogger('jira-connector');

export class JiraConnector implements IConnector {
  private tokens!: OAuthTokens;

  async connect(credentials: OAuthTokens): Promise<void> {
    this.tokens = credentials;
    logger.info('Connected to Jira');
  }

  startPolling(intervalMs: number): void {
    setInterval(() => {
      logger.debug('Jira polling tick');
      // In production: GET /rest/api/3/search?jql=updated>="-15m"
    }, intervalMs);
  }

  async registerWebhook(callbackUrl: string): Promise<any> {
    return {
      status: 'registered',
      url: callbackUrl,
      events: [
        'jira:issue_created',
        'jira:issue_updated',
        'jira:sprint_started',
        'jira:sprint_completed',
        'jira:issue_assigned',
      ],
    };
  }

  verifySignature(rawBody: string, signature: string, secret: string): boolean {
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  async handleWebhookPayload(raw: any): Promise<CanonicalEvent[]> {
    const issue = raw.issue;
    if (!issue) return [];

    return [
      {
        eventId: `jira-${issue.id}-${Date.now()}`,
        eventType: 'integrations.jira.synced',
        version: '1.0',
        timestamp: new Date().toISOString(),
        orgId: 'org_placeholder',
        projectId: issue.fields?.project?.id ?? 'unknown',
        data: {
          issueKey: issue.key,
          summary: issue.fields?.summary,
          description: issue.fields?.description ?? '',
          status: issue.fields?.status?.name,
          priority: issue.fields?.priority?.name,
          storyPoints: issue.fields?.customfield_10016 ?? null,
          assigneeExternalId: issue.fields?.assignee?.accountId ?? null,
          sprintId: issue.fields?.sprint?.id ?? null,
          parentKey: issue.fields?.parent?.key ?? null,
          originalEstimate: issue.fields?.timetracking?.originalEstimate ?? null,
          timeSpent: issue.fields?.timetracking?.timeSpent ?? null,
          resolutionDate: issue.fields?.resolutiondate ?? null,
        },
      },
    ];
  }

  async disconnect(): Promise<void> {
    logger.info('Disconnected from Jira');
  }
}
