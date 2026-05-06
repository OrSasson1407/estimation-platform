// apps/project-service/src/project-service.controller.ts  ← UPDATED: Zod pipes + JWT guard
import { Controller, Get, Post, Patch, Param, Body, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ProjectService,
  CreateTaskSchema,
  UpdateTaskStatusSchema,
} from './project-service.service';
import { ZodValidationPipe } from './zod-validation.pipe';

@Controller('api/v1/projects')
@UseGuards(AuthGuard('jwt'))
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Get(':id')
  getProject(@Param('id') id: string) {
    return this.projectService.getProjectDetails(id);
  }

  @Get(':id/tasks')
  getTasks(@Param('id') id: string) {
    return this.projectService.getProjectTasks(id);
  }

  @Post(':id/tasks')
  createTask(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateTaskSchema)) body: any,
    @Request() req: any,
  ) {
    return this.projectService.createTask(id, body, req.user.userId);
  }

  @Patch('tasks/:taskId/status')
  updateTaskStatus(
    @Param('taskId') taskId: string,
    @Body(new ZodValidationPipe(UpdateTaskStatusSchema)) body: any,
  ) {
    return this.projectService.updateTaskStatus(taskId, body);
  }

  @Get(':id/sprints')
  getSprints(@Param('id') id: string) {
    return this.projectService.getProjectSprints(id);
  }

  @Post(':id/sprints')
  createSprint(@Param('id') id: string, @Body() body: any) {
    return this.projectService.createSprint(id, body);
  }

  @Post(':id/sprints/:sprintId/tasks')
  addTaskToSprint(@Param('sprintId') sprintId: string, @Body('taskId') taskId: string) {
    return this.projectService.addTaskToSprint(sprintId, taskId);
  }

  @Post(':id/sprints/:sprintId/complete')
  completeSprint(@Param('sprintId') sprintId: string) {
    return this.projectService.completeSprint(sprintId);
  }
}
