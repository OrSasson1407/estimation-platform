import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { DeveloperService } from './developer-service.service';

@Controller('api/v1/developers')
export class DeveloperController {
  constructor(private readonly developerService: DeveloperService) {}

  @Get(':id/profile')
  async getProfile(@Param('id') id: string) {
    return this.developerService.getProfile(id);
  }

  @Get(':id/velocity-history')
  async getVelocityHistory(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('granularity') granularity?: string,
  ) {
    return this.developerService.getVelocityHistory(id, from, to, granularity);
  }

  @Get('team/:teamId/composition-score')
  async getTeamCompositionScore(@Param('teamId') teamId: string) {
    return this.developerService.getTeamCompositionScore(teamId);
  }

  @Post('team/simulate')
  async simulateTeam(
    @Body('developerIds') developerIds: string[],
    @Body('projectId') projectId: string,
  ) {
    return this.developerService.simulateTeam(developerIds, projectId);
  }
}
