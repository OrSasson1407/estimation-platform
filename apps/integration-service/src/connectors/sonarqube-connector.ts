// apps/integration-service/src/connectors/sonarqube-connector.ts  ← PHASE 1 NEW FILE
import { IConnector, OAuthTokens, CanonicalEvent } from './connector.interface';
import * as crypto from 'crypto';

/**
 * SonarQube connector.
 * Handles incoming webhooks: extracts cognitive complexity + sqale_index (tech debt).
 * Emits canonical events that the analytics/estimation pipeline can consume.
 */
export class SonarQubeConnector implements IConnector {
  private baseUrl!: string;
  private token!: string;

  async connect(credentials: OAuthTokens): Promise<void> {
    this.token = credentials.accessToken;
    this.baseUrl = process.env.SONAR_URL ?? 'http://localhost:9000';
  }

  startPolling(_intervalMs: number): void {
    // SonarQube is webhook-driven; polling via REST API is optional
  }

  async registerWebhook(callbackUrl: string): Promise<any> {
    const url = `${this.baseUrl}/api/webhooks/create`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        name: 'estimation-platform',
        url: callbackUrl,
        secret: process.env.SONAR_WEBHOOK_SECRET ?? '',
      }).toString(),
    });
    return res.json();
  }

  async handleWebhookPayload(raw: unknown): Promise<CanonicalEvent[]> {
    const payload = raw as any;
    if (!payload || !payload.project) return [];

    const events: CanonicalEvent[] = [];
    const now = new Date().toISOString();

    // Extract measures from the quality gate result
    const measures: Record<string, number> = {};
    const qualityGate = payload.qualityGate;

    if (qualityGate?.conditions) {
      for (const condition of qualityGate.conditions) {
        if (condition.metric === 'cognitive_complexity') {
          measures.cognitive_complexity = parseFloat(condition.value ?? '0');
        }
        if (condition.metric === 'sqale_index') {
          measures.sqale_index_minutes = parseFloat(condition.value ?? '0');
        }
        if (condition.metric === 'code_smells') {
          measures.code_smells = parseFloat(condition.value ?? '0');
        }
        if (condition.metric === 'bugs') {
          measures.bugs = parseFloat(condition.value ?? '0');
        }
        if (condition.metric === 'vulnerabilities') {
          measures.vulnerabilities = parseFloat(condition.value ?? '0');
        }
      }
    }

    // Compute tech debt score (0–100): sqale_index in minutes / 480 min workday * 100, capped at 100
    const techDebtScore = Math.min(100, ((measures.sqale_index_minutes ?? 0) / 480) * 100);

    events.push({
      eventId: crypto.randomUUID(),
      eventType: 'integrations.sonarqube.analysis_completed',
      version: '1.0',
      timestamp: now,
      orgId: payload.project?.key?.split(':')[0] ?? '',
      projectId: payload.project?.key ?? '',
      data: {
        projectKey: payload.project?.key,
        projectName: payload.project?.name,
        analysisKey: payload.analysedAt ?? now,
        qualityGateStatus: qualityGate?.status ?? 'NONE',
        cognitiveComplexity: measures.cognitive_complexity ?? 0,
        sqaleIndexMinutes: measures.sqale_index_minutes ?? 0,
        techDebtScore: Math.round(techDebtScore * 10) / 10,
        codeSmells: measures.code_smells ?? 0,
        bugs: measures.bugs ?? 0,
        vulnerabilities: measures.vulnerabilities ?? 0,
      },
    });

    return events;
  }

  async disconnect(): Promise<void> {
    // Stateless HTTP connector — no persistent connection
  }

  verifySignature(body: string, signature: string, secret: string): boolean {
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  }
}

