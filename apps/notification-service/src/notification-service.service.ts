// apps/notification-service/src/notification-service.service.ts  ← NEW
import { Injectable } from '@nestjs/common';
import { createLogger } from '@estimation/logger';

const logger = createLogger('notification-service');

export type NotificationChannel = 'IN_APP' | 'SLACK' | 'EMAIL';

export interface NotificationPayload {
  orgId: string;
  projectId: string;
  recipientIds: string[];
  channels: NotificationChannel[];
  title: string;
  body: string;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  metadata?: Record<string, unknown>;
}

@Injectable()
export class NotificationService {
  // ── Channel dispatchers ──────────────────────────────────────────────────────

  async dispatch(payload: NotificationPayload) {
    const results = await Promise.allSettled(
      payload.channels.map((ch) => this.sendToChannel(ch, payload)),
    );

    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length) {
      logger.warn(
        { failures: failures.length, title: payload.title },
        'notification_partial_failure',
      );
    }

    return {
      dispatched: payload.channels.length,
      failed: failures.length,
    };
  }

  private async sendToChannel(channel: NotificationChannel, payload: NotificationPayload) {
    switch (channel) {
      case 'IN_APP':
        return this.sendInApp(payload);
      case 'SLACK':
        return this.sendSlack(payload);
      case 'EMAIL':
        return this.sendEmail(payload);
    }
  }

  // In-app: publish to Redis so collaboration-service forwards via Socket.IO
  private async sendInApp(payload: NotificationPayload) {
    // In production: publish to Redis channel `notifications:${projectId}`
    // collaboration-service subscribes and emits to Socket.IO room
    logger.info(
      { projectId: payload.projectId, title: payload.title, channel: 'IN_APP' },
      'notification_sent',
    );
  }

  // Slack: POST to incoming webhook URL stored per org
  private async sendSlack(payload: NotificationPayload) {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) return;

    const color =
      payload.severity === 'CRITICAL'
        ? '#FF0000'
        : payload.severity === 'WARNING'
          ? '#FFA500'
          : '#36A64F';

    const body = JSON.stringify({
      attachments: [
        {
          color,
          title: payload.title,
          text: payload.body,
          footer: `AI Estimation Platform • Project ${payload.projectId}`,
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    });

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!res.ok) throw new Error(`Slack webhook failed: ${res.status}`);
    logger.info(
      { projectId: payload.projectId, title: payload.title, channel: 'SLACK' },
      'notification_sent',
    );
  }

  // Email: render template and send via SMTP (nodemailer in production)
  private async sendEmail(payload: NotificationPayload) {
    // Template rendering — in production wire to nodemailer + HTML template
    const html = this.renderEmailTemplate(payload);
    logger.info(
      { recipients: payload.recipientIds.length, title: payload.title, channel: 'EMAIL' },
      'notification_sent',
    );
    // TODO: wire nodemailer transport with SMTP_HOST env
  }

  private renderEmailTemplate(payload: NotificationPayload): string {
    return `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2 style="color:${payload.severity === 'CRITICAL' ? '#dc2626' : '#2563eb'}">
          ${payload.title}
        </h2>
        <p>${payload.body}</p>
        <hr/>
        <small>Project: ${payload.projectId} | AI Estimation Platform</small>
      </div>
    `;
  }

  // ── Predefined notification builders ────────────────────────────────────────

  buildRiskNotification(event: any): NotificationPayload {
    return {
      orgId: event.orgId,
      projectId: event.projectId,
      recipientIds: [], // populated from team roster in production
      channels: ['IN_APP', 'SLACK'],
      title: `⚠️ Risk Alert: ${event.data.title}`,
      body: `${event.data.message}\n\nRecommended: ${event.data.recommendedAction}`,
      severity: event.data.severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
      metadata: { riskId: event.data.riskId, category: event.data.category },
    };
  }

  buildEstimationNotification(event: any): NotificationPayload {
    return {
      orgId: event.orgId,
      projectId: event.projectId,
      recipientIds: [],
      channels: ['IN_APP'],
      title: '📊 New Estimation Generated',
      body: `Task estimation ready. Expected: ${event.data.expectedHours}h | Confidence: ${(event.data.confidenceScore * 100).toFixed(0)}%`,
      severity: event.data.confidenceScore < 0.6 ? 'WARNING' : 'INFO',
      metadata: { estimationId: event.data.estimationId },
    };
  }

  buildSprintCompletedNotification(event: any): NotificationPayload {
    const pct =
      event.data.plannedPoints > 0
        ? ((event.data.completedPoints / event.data.plannedPoints) * 100).toFixed(0)
        : 0;
    return {
      orgId: event.orgId,
      projectId: event.projectId,
      recipientIds: [],
      channels: ['IN_APP', 'EMAIL'],
      title: '🏁 Sprint Completed',
      body: `Sprint closed. Completed ${event.data.completedPoints}/${event.data.plannedPoints} points (${pct}% velocity).`,
      severity: 'INFO',
      metadata: { sprintId: event.data.sprintId },
    };
  }
}
