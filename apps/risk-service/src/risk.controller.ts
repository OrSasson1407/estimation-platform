// apps/risk-service/src/risk.controller.ts  ← UPDATED: resolve endpoint + JWT guard
import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
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

  @Patch('alerts/:alertId/resolve')
  resolveAlert(@Param('alertId') alertId: string) {
    return this.riskService.resolveAlert(alertId);
  }
}
