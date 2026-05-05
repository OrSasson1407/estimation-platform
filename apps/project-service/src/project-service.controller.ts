import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ProjectService } from './project-service.service';

@Controller('api/v1/projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Get(':id')
  async getProject(@Param('id') id: string) {
    return this.projectService.getProjectDetails(id);
  }

  @Get(':id/tasks')
  async getTasks(@Param('id') id: string) {
    return this.projectService.getProjectTasks(id);
  }

  @Post(':id/tasks')
  async createTask(@Param('id') id: string, @Body() taskData: Record<string, any>) {
    return this.projectService.createTask(id, taskData);
  }

  @Get(':id/sprints')
  async getSprints(@Param('id') id: string) {
    return this.projectService.getProjectSprints(id);
  }
}
