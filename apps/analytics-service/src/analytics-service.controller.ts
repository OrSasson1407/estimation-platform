// apps/analytics-service/src/analytics-service.controller.ts  ← NEW
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AnalyticsService } from './analytics-service.service';

@Controller('api/v1/analytics')
@UseGuards(AuthGuard('jwt'))
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('projects/:projectId/estimations')
  getEstimationStats(@Param('projectId') projectId: string, @Query('days') days?: string) {
    return this.analyticsService.getProjectEstimationStats(projectId, days ? +days : 30);
  }

  @Get('projects/:projectId/velocity')
  getVelocityTrend(@Param('projectId') projectId: string) {
    return this.analyticsService.getVelocityTrend(projectId);
  }

  @Get('projects/:projectId/risks')
  getRiskSummary(@Param('projectId') projectId: string, @Query('days') days?: string) {
    return this.analyticsService.getRiskSummary(projectId, days ? +days : 30);
  }

  @Get('orgs/:orgId/overview')
  getPlatformOverview(@Param('orgId') orgId: string) {
    return this.analyticsService.getPlatformOverview(orgId);
  }
}
