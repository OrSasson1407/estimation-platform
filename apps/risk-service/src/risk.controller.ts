// apps/risk-service/src/risk.controller.ts
import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Body,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RiskService } from './risk-service';
import { RiskConsumer } from './risk.consumer';

@Controller('api/v1/risks')
@UseGuards(AuthGuard('jwt'))
export class RiskController {
  constructor(
    private readonly riskService: RiskService,
    private readonly riskConsumer: RiskConsumer,
  ) {}

  // ── Active alerts ─────────────────────────────────────────────────────────

  @Get('project/:projectId')
  getProjectRisks(@Param('projectId') projectId: string) {
    return this.riskService.getProjectRisks(projectId);
  }

  @Get('project/:projectId/history')
  getAlertHistory(
    @Param('projectId') projectId: string,
    @Query('limit') limit?: string,
  ) {
    return this.riskService.getAlertHistory(projectId, limit ? parseInt(limit) : 50);
  }

  // ── Alert resolution ──────────────────────────────────────────────────────

  @Patch('alerts/:alertId/resolve')
  @HttpCode(HttpStatus.OK)
  resolveAlert(@Param('alertId') alertId: string, @Request() req: any) {
    return this.riskService.resolveAlert(alertId, req.user.userId);
  }

  // ── On-demand anomaly check ───────────────────────────────────────────────

  @Post('anomaly/velocity')
  @HttpCode(HttpStatus.OK)
  checkVelocityAnomaly(
    @Body() body: { developerId: string; currentVelocity: number },
  ) {
    return this.riskService.runVelocityAnomalyCheck(body.developerId, body.currentVelocity);
  }

  // ── Consumer health ───────────────────────────────────────────────────────

  @Get('health/consumer')
  getConsumerStats() {
    return this.riskConsumer.getStats();
  }
}