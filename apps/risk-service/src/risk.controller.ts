// apps/risk-service/src/risk.controller.ts  ← PHASE 1 UPGRADE
import { Controller, Get, Patch, Param, Query, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RiskService } from './risk-service';

@Controller('api/v1/risks')
@UseGuards(AuthGuard('jwt'))
export class RiskController {
  constructor(private readonly riskService: RiskService) {}

  @Get('project/:projectId')
  getProjectRisks(@Param('projectId') projectId: string) {
    return this.riskService.getProjectRisks(projectId);
  }

  @Get('project/:projectId/history')
  getAlertHistory(@Param('projectId') projectId: string, @Query('limit') limit?: string) {
    return this.riskService.getAlertHistory(projectId, limit ? parseInt(limit) : 50);
  }

  @Patch('alerts/:alertId/resolve')
  resolveAlert(@Param('alertId') alertId: string, @Request() req: any) {
    return this.riskService.resolveAlert(alertId, req.user.userId);
  }
}
