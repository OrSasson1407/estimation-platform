// apps/notification-service/src/notification-service.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@estimation/database';
import { createLogger } from '@estimation/logger';
import * as nodemailer from 'nodemailer';
import * as Handlebars from 'handlebars';

const logger = createLogger('notification-service');

export type NotificationChannel = 'IN_APP' | 'SLACK' | 'EMAIL';
export type NotificationEventType =
  | 'RISK_ALERT'
  | 'ESTIMATION_READY'
  | 'ESTIMATION_LOW_CONFIDENCE'
  | 'SPRINT_COMPLETED'
  | 'ANOMALY_DETECTED';

export interface NotificationPayload {
  orgId: string;
  projectId: string;
  recipientIds: string[];
  channels: NotificationChannel[];
  eventType: NotificationEventType;
  title: string;
  body: string;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  metadata?: Record<string, unknown>;
}

// ── Handlebars templates ───────────────────────────────────────────────────────

const EMAIL_TEMPLATES: Record<NotificationEventType, string> = {
  RISK_ALERT: `
    <div style="font-family:sans-serif;max-width:600px;margin:auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <div style="background:{{#if isCritical}}#dc2626{{else}}#f59e0b{{/if}};padding:16px 24px">
        <h2 style="color:#fff;margin:0">⚠️ {{title}}</h2>
      </div>
      <div style="padding:24px">
        <p style="color:#374151;font-size:15px">{{body}}</p>
        {{#if recommendedAction}}
        <div style="background:#f3f4f6;border-left:4px solid #6366f1;padding:12px 16px;margin-top:16px;border-radius:0 6px 6px 0">
          <strong>Recommended Action:</strong>
          <p style="margin:4px 0 0">{{recommendedAction}}</p>
        </div>
        {{/if}}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
        <small style="color:#9ca3af">Project: {{projectId}} · AI Estimation Platform</small>
      </div>
    </div>`,

  ESTIMATION_READY: `
    <div style="font-family:sans-serif;max-width:600px;margin:auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <div style="background:#2563eb;padding:16px 24px">
        <h2 style="color:#fff;margin:0">📊 {{title}}</h2>
      </div>
      <div style="padding:24px">
        <p style="color:#374151">{{body}}</p>
        {{#if estimationId}}
        <a href="{{appUrl}}/projects/{{projectId}}/tasks/{{taskId}}"
           style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;margin-top:12px">
          View Estimation →
        </a>
        {{/if}}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
        <small style="color:#9ca3af">Project: {{projectId}} · AI Estimation Platform</small>
      </div>
    </div>`,

  ESTIMATION_LOW_CONFIDENCE: `
    <div style="font-family:sans-serif;max-width:600px;margin:auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <div style="background:#f59e0b;padding:16px 24px">
        <h2 style="color:#fff;margin:0">⚠️ {{title}}</h2>
      </div>
      <div style="padding:24px">
        <p style="color:#374151">{{body}}</p>
        <p style="color:#6b7280;font-size:13px">Review the task description and add more context to improve accuracy.</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
        <small style="color:#9ca3af">Project: {{projectId}} · AI Estimation Platform</small>
      </div>
    </div>`,

  SPRINT_COMPLETED: `
    <div style="font-family:sans-serif;max-width:600px;margin:auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <div style="background:#059669;padding:16px 24px">
        <h2 style="color:#fff;margin:0">🏁 {{title}}</h2>
      </div>
      <div style="padding:24px">
        <p style="color:#374151">{{body}}</p>
        {{#if velocityScore}}
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:16px;margin-top:16px">
          <strong style="color:#065f46">Velocity Score: {{velocityPct}}%</strong><br/>
          <span style="color:#374151;font-size:13px">{{completedPoints}} of {{plannedPoints}} story points completed</span>
        </div>
        {{/if}}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
        <small style="color:#9ca3af">Project: {{projectId}} · AI Estimation Platform</small>
      </div>
    </div>`,

  ANOMALY_DETECTED: `
    <div style="font-family:sans-serif;max-width:600px;margin:auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <div style="background:#7c3aed;padding:16px 24px">
        <h2 style="color:#fff;margin:0">🔍 {{title}}</h2>
      </div>
      <div style="padding:24px">
        <p style="color:#374151">{{body}}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
        <small style="color:#9ca3af">Project: {{projectId}} · AI Estimation Platform</small>
      </div>
    </div>`,
};

// Pre-compile all templates once at module load
const compiledTemplates = Object.fromEntries(
  Object.entries(EMAIL_TEMPLATES).map(([k, v]) => [k, Handlebars.compile(v)]),
) as Record<NotificationEventType, HandlebarsTemplateDelegate>;

// ── Service ────────────────────────────────────────────────────────────────────

@Injectable()
export class NotificationService {
  private mailer: nodemailer.Transporter;

  constructor() {
    this.mailer = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }

  // ── User preference store ──────────────────────────────────────────────────

  /**
   * Stores which channels a user wants for each event type.
   * In production this would be a DB table; here we use a lightweight
   * in-memory store with Prisma as the source of truth for user metadata.
   */
  private prefStore = new Map<string, Partial<Record<NotificationEventType, NotificationChannel[]>>>();

  async setUserPreferences(
    userId: string,
    eventType: NotificationEventType,
    channels: NotificationChannel[],
  ) {
    const existing = this.prefStore.get(userId) ?? {};
    this.prefStore.set(userId, { ...existing, [eventType]: channels });
    logger.info({ userId, eventType, channels }, 'notification_preference_updated');
    return { userId, eventType, channels };
  }

  async getUserPreferences(userId: string) {
    return this.prefStore.get(userId) ?? {};
  }

  /**
   * Returns the effective channels for a user+eventType combo.
   * Falls back to the payload's default channels if no preference stored.
   */
  private resolveChannels(
    userId: string,
    eventType: NotificationEventType,
    defaultChannels: NotificationChannel[],
  ): NotificationChannel[] {
    const prefs = this.prefStore.get(userId);
    return prefs?.[eventType] ?? defaultChannels;
  }

  // ── Main dispatch ──────────────────────────────────────────────────────────

  async dispatch(payload: NotificationPayload) {
    const results = await Promise.allSettled(
      payload.channels.map((ch) => this.sendToChannel(ch, payload)),
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed) {
      logger.warn({ failed, total: payload.channels.length, title: payload.title }, 'notification_partial_failure');
    } else {
      logger.info({ channels: payload.channels, title: payload.title }, 'notification_dispatched');
    }

    return { dispatched: payload.channels.length, failed };
  }

  /**
   * Dispatches respecting per-user channel preferences.
   * Each recipient may receive on different channels.
   */
  async dispatchToRecipients(payload: NotificationPayload) {
    if (!payload.recipientIds.length) return this.dispatch(payload);

    const tasks = payload.recipientIds.map((userId) => {
      const channels = this.resolveChannels(userId, payload.eventType, payload.channels);
      return this.dispatch({ ...payload, channels, recipientIds: [userId] });
    });

    const results = await Promise.allSettled(tasks);
    const failed = results.filter((r) => r.status === 'rejected').length;
    return { totalRecipients: payload.recipientIds.length, failed };
  }

  private async sendToChannel(channel: NotificationChannel, payload: NotificationPayload) {
    switch (channel) {
      case 'IN_APP':  return this.sendInApp(payload);
      case 'SLACK':   return this.sendSlack(payload);
      case 'EMAIL':   return this.sendEmail(payload);
    }
  }

  // ── Channel implementations ────────────────────────────────────────────────

  private async sendInApp(payload: NotificationPayload) {
    // Publishes to Redis pub/sub channel; collaboration-service
    // picks it up and emits `notification:new` to the project Socket.IO room.
    // Redis client injected in production — stub log here.
    logger.info(
      { projectId: payload.projectId, eventType: payload.eventType, channel: 'IN_APP' },
      'notification_sent',
    );
  }

  private async sendSlack(payload: NotificationPayload) {
    // Per-org webhook: stored in env or a future OrgSettings DB table
    const webhookUrl = process.env[`SLACK_WEBHOOK_${payload.orgId}`]
      ?? process.env.SLACK_WEBHOOK_URL;

    if (!webhookUrl) {
      logger.debug({ orgId: payload.orgId }, 'slack_webhook_not_configured');
      return;
    }

    const color = payload.severity === 'CRITICAL' ? '#dc2626'
      : payload.severity === 'WARNING' ? '#f59e0b'
      : '#059669';

    const slackBody = JSON.stringify({
      attachments: [
        {
          color,
          title: payload.title,
          text: payload.body,
          fields: Object.entries(payload.metadata ?? {}).map(([k, v]) => ({
            title: k,
            value: String(v),
            short: true,
          })),
          footer: `AI Estimation Platform · Project ${payload.projectId}`,
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    });

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: slackBody,
    });

    if (!res.ok) throw new Error(`Slack webhook ${payload.orgId} returned ${res.status}`);

    logger.info(
      { orgId: payload.orgId, projectId: payload.projectId, channel: 'SLACK' },
      'notification_sent',
    );
  }

  private async sendEmail(payload: NotificationPayload) {
    // Accept pre-resolved emails from the caller, or attempt resolution
    const preResolved = (payload.metadata?.recipientEmails as string[] | undefined) ?? [];
    const resolved = preResolved.length
      ? preResolved
      : await this.resolveEmailAddresses(payload.recipientIds);

    if (!resolved.length) {
      logger.debug({ recipientIds: payload.recipientIds }, 'email_no_recipients');
      return;
    }

    const templateContext = {
      ...payload.metadata,
      title: payload.title,
      body: payload.body,
      projectId: payload.projectId,
      isCritical: payload.severity === 'CRITICAL',
      appUrl: process.env.APP_URL ?? 'https://app.estimation.internal',
      velocityPct: payload.metadata?.velocityScore
        ? Math.round((payload.metadata.velocityScore as number) * 100)
        : undefined,
    };

    const html = compiledTemplates[payload.eventType]?.(templateContext)
      ?? `<p>${payload.body}</p>`;

    await this.mailer.sendMail({
      from: process.env.SMTP_FROM ?? 'noreply@estimation.internal',
      to: resolved.join(', '),
      subject: payload.title,
      html,
    });

    logger.info(
      { recipients: resolved.length, eventType: payload.eventType, channel: 'EMAIL' },
      'notification_sent',
    );
  }

  private async resolveEmailAddresses(userIds: string[]): Promise<string[]> {
    if (!userIds.length) return [];
    // Email addresses are owned by auth-service. In production, call
    // GET /api/v1/auth/users/emails?ids=... via internal HTTP or a shared
    // Redis cache populated by auth-service on login.
    // For now we accept explicit email overrides via metadata.recipientEmails.
    logger.debug(
      { userIds },
      'email_resolution_requires_auth_service_call — returning empty until wired',
    );
    return [];
  }

  // ── Notification builders ──────────────────────────────────────────────────

  buildRiskNotification(event: any): NotificationPayload {
    const isCritical = event.data.severity === 'CRITICAL';
    return {
      orgId: event.orgId ?? '',
      projectId: event.projectId,
      recipientIds: [],
      channels: isCritical ? ['IN_APP', 'SLACK', 'EMAIL'] : ['IN_APP', 'SLACK'],
      eventType: 'RISK_ALERT',
      title: `Risk Alert: ${event.data.title}`,
      body: `${event.data.message}\n\nRecommended: ${event.data.recommendedAction}`,
      severity: isCritical ? 'CRITICAL' : 'WARNING',
      metadata: {
        riskId: event.data.riskId,
        category: event.data.category,
        recommendedAction: event.data.recommendedAction,
      },
    };
  }

  buildEstimationNotification(event: any): NotificationPayload {
    const lowConfidence = event.data.confidenceScore < 0.6;
    return {
      orgId: event.orgId ?? '',
      projectId: event.projectId,
      recipientIds: [],
      channels: ['IN_APP'],
      eventType: lowConfidence ? 'ESTIMATION_LOW_CONFIDENCE' : 'ESTIMATION_READY',
      title: lowConfidence
        ? 'Low-Confidence Estimation Generated'
        : 'Estimation Ready',
      body: `Expected: ${event.data.expectedHours}h | Confidence: ${(event.data.confidenceScore * 100).toFixed(0)}%`,
      severity: lowConfidence ? 'WARNING' : 'INFO',
      metadata: {
        estimationId: event.data.estimationId,
        taskId: event.data.taskId,
        expectedHours: event.data.expectedHours,
        confidenceScore: event.data.confidenceScore,
      },
    };
  }

  buildSprintCompletedNotification(event: any): NotificationPayload {
    const pct = event.data.plannedPoints > 0
      ? ((event.data.completedPoints / event.data.plannedPoints) * 100).toFixed(0)
      : 0;
    return {
      orgId: event.orgId ?? '',
      projectId: event.projectId,
      recipientIds: [],
      channels: ['IN_APP', 'EMAIL'],
      eventType: 'SPRINT_COMPLETED',
      title: 'Sprint Completed',
      body: `Sprint closed with ${pct}% velocity (${event.data.completedPoints}/${event.data.plannedPoints} points).`,
      severity: 'INFO',
      metadata: {
        sprintId: event.data.sprintId,
        completedPoints: event.data.completedPoints,
        plannedPoints: event.data.plannedPoints,
        velocityScore: event.data.velocityScore,
      },
    };
  }
}