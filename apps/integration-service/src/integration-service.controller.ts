// apps/integration-service/src/integration-service.controller.ts  ← UPDATED
import { Controller, Post, Body, Headers, RawBodyRequest, Req } from '@nestjs/common';
import { IntegrationService } from './integration-service.service';
import { Request } from 'express';

@Controller('api/v1/webhooks')
export class IntegrationController {
  constructor(private readonly integrationService: IntegrationService) {}

  @Post('jira')
  handleJira(
    @Body() payload: any,
    @Headers('x-hub-signature-256') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const rawBody = req.rawBody?.toString() ?? JSON.stringify(payload);
    return this.integrationService.handleJiraWebhook(payload, signature, rawBody);
  }

  @Post('github')
  handleGitHub(
    @Body() payload: any,
    @Headers('x-hub-signature-256') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const rawBody = req.rawBody?.toString() ?? JSON.stringify(payload);
    return this.integrationService.handleGitHubWebhook(payload, signature, rawBody);
  }
}
