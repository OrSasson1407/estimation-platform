import { Controller, Post, Body, Headers } from '@nestjs/common';
import { JiraConnector } from './connectors/jira-connector';

@Controller('api/v1/webhooks')
export class IntegrationController {
  private jiraConnector = new JiraConnector();

  @Post('jira')
  async handleJiraWebhook(@Body() payload: any, @Headers('x-hub-signature') signature: string) {
    // In production, verify the HMAC signature here

    const events = await this.jiraConnector.handleWebhookPayload(payload);

    // TODO: Publish `events` to Kafka topic 'integrations.jira.synced'
    console.log('Normalized events ready for Kafka:', events);

    return { received: true, processedEvents: events.length };
  }
}
