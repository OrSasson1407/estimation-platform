// apps/integration-service/src/connectors/github-connector.ts  ← NEW
import { IConnector, OAuthTokens, CanonicalEvent } from './connector.interface';
import { createLogger } from '@estimation/logger';

const logger = createLogger('github-connector');

export class GitHubConnector implements IConnector {
  private tokens!: OAuthTokens;
  private pollingTimer?: ReturnType<typeof setInterval>;

  async connect(credentials: OAuthTokens): Promise<void> {
    this.tokens = credentials;
    logger.info('Connected to GitHub');
  }

  startPolling(intervalMs: number): void {
    this.pollingTimer = setInterval(() => {
      logger.debug('GitHub polling tick');
      // In production: call fetchRecentCommits() per registered repo
    }, intervalMs);
  }

  async registerWebhook(callbackUrl: string): Promise<any> {
    // POST /repos/{owner}/{repo}/hooks via GitHub REST API v3
    logger.info({ callbackUrl }, 'github_webhook_registered');
    return {
      id: `gh-hook-${Date.now()}`,
      active: true,
      events: ['push', 'pull_request', 'pull_request_review', 'check_suite', 'deployment_status'],
      callbackUrl,
    };
  }

  async handleWebhookPayload(raw: any): Promise<CanonicalEvent[]> {
    const events: CanonicalEvent[] = [];
    const eventType = (raw.action ?? raw.ref) ? 'push' : 'unknown';

    if (raw.commits && raw.repository) {
      // push event
      for (const commit of raw.commits) {
        events.push({
          eventId: commit.id,
          eventType: 'integrations.github.commit_pushed',
          version: '1.0',
          timestamp: commit.timestamp ?? new Date().toISOString(),
          orgId: 'org_placeholder',
          projectId: raw.repository?.full_name ?? 'unknown',
          data: {
            repoFullName: raw.repository.full_name,
            commitSha: commit.id,
            authorExternalId: commit.author?.username ?? 'unknown',
            message: commit.message,
            filesChanged: (commit.added?.length ?? 0) + (commit.modified?.length ?? 0),
            linesAdded: 0, // available via GET /repos/.../commits/:sha
            linesRemoved: 0,
          },
        });
      }
    }

    if (raw.pull_request) {
      events.push({
        eventId: `pr-${raw.pull_request.id}`,
        eventType: `integrations.github.pull_request.${raw.action}`,
        version: '1.0',
        timestamp: new Date().toISOString(),
        orgId: 'org_placeholder',
        projectId: raw.repository?.full_name ?? 'unknown',
        data: {
          prNumber: raw.pull_request.number,
          title: raw.pull_request.title,
          state: raw.pull_request.state,
          authorId: raw.pull_request.user?.login,
          additions: raw.pull_request.additions ?? 0,
          deletions: raw.pull_request.deletions ?? 0,
          changedFiles: raw.pull_request.changed_files ?? 0,
        },
      });
    }

    return events;
  }

  async disconnect(): Promise<void> {
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    logger.info('Disconnected from GitHub');
  }
}
