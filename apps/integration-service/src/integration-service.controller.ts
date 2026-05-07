// apps/integration-service/src/integration-service.controller.ts  ← PHASE 1 UPGRADE
import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  RawBodyRequest,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { IntegrationService } from './integration-service.service';

@Controller('api/v1/integrations')
export class IntegrationController {
  constructor(private readonly integrationService: IntegrationService) {}

  // ── Inbound webhooks (no JWT — authenticated by HMAC signature) ───────────

  @Post('webhooks/jira')
  @HttpCode(HttpStatus.OK)
  async jiraWebhook(
    @Body() body: any,
    @Headers('x-hub-signature-256') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const rawBody = req.rawBody?.toString() ?? JSON.stringify(body);
    return this.integrationService.handleJiraWebhook(body, signature, rawBody);
  }

  @Post('webhooks/github')
  @HttpCode(HttpStatus.OK)
  async githubWebhook(
    @Body() body: any,
    @Headers('x-hub-signature-256') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const rawBody = req.rawBody?.toString() ?? JSON.stringify(body);
    return this.integrationService.handleGitHubWebhook(body, signature, rawBody);
  }

  @Post('webhooks/sonarqube')
  @HttpCode(HttpStatus.OK)
  async sonarWebhook(
    @Body() body: any,
    @Headers('x-sonar-webhook-hmac-sha256') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const rawBody = req.rawBody?.toString() ?? JSON.stringify(body);
    return this.integrationService.handleSonarWebhook(body, signature, rawBody);
  }

  // ── Authenticated management endpoints ────────────────────────────────────

  @Get('status')
  @UseGuards(AuthGuard('jwt'))
  getStatus() {
    return this.integrationService.getIntegrationStatus();
  }
}
