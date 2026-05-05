import { Controller, Get, Param } from '@nestjs/common';
import { RiskService } from './risk-service';

@Controller('api/v1/risks')
export class RiskController {
  constructor(private readonly riskService: RiskService) {}

  @Get('project/:projectId')
  async getProjectRisks(@Param('projectId') projectId: string) {
    return this.riskService.getProjectRisks(projectId);
  }
}
