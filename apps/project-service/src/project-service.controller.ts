// apps/project-service/src/project-service.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ProjectService,
  CreateProjectSchema,
  UpdateProjectSchema,
  CreateTaskSchema,
  UpdateTaskStatusSchema,
  CreateTeamSchema,
  AddTeamMemberSchema,
} from './project-service.service';
import { SprintService, CreateSprintSchema, UpdateSprintSchema } from './sprint.service';
import { ZodValidationPipe } from './zod-validation.pipe';

@Controller('api/v1')
@UseGuards(AuthGuard('jwt'))
export class ProjectController {
  constructor(
    private readonly projectService: ProjectService,
    private readonly sprintService: SprintService,
  ) {}

  // ── Projects ───────────────────────────────────────────────────────────────

  @Post('projects')
  createProject(
    @Body(new ZodValidationPipe(CreateProjectSchema)) body: any,
    @Request() req: any,
  ) {
    return this.projectService.createProject(body, req.user.userId);
  }

  @Get('projects')
  listProjects(@Query('orgId') orgId: string, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.projectService.listProjects(orgId, parseInt(page), parseInt(limit));
  }

  @Get('projects/:id')
  getProject(@Param('id') id: string) {
    return this.projectService.getProjectDetails(id);
  }

  @Patch('projects/:id')
  updateProject(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateProjectSchema)) body: any,
    @Request() req: any,
  ) {
    return this.projectService.updateProject(id, body, req.user.userId);
  }

  @Patch('projects/:id/archive')
  @HttpCode(HttpStatus.OK)
  archiveProject(@Param('id') id: string, @Request() req: any) {
    return this.projectService.archiveProject(id, req.user.userId);
  }

  // ── Teams ──────────────────────────────────────────────────────────────────

  @Post('teams')
  createTeam(
    @Body(new ZodValidationPipe(CreateTeamSchema)) body: any,
    @Request() req: any,
  ) {
    return this.projectService.createTeam(body, req.user.userId);
  }

  @Get('teams/:teamId')
  getTeam(@Param('teamId') teamId: string) {
    return this.projectService.getTeam(teamId);
  }

  @Post('teams/:teamId/members')
  addTeamMember(
    @Param('teamId') teamId: string,
    @Body(new ZodValidationPipe(AddTeamMemberSchema)) body: any,
  ) {
    return this.projectService.addTeamMember(teamId, body);
  }

  @Delete('teams/:teamId/members/:developerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTeamMember(
    @Param('teamId') teamId: string,
    @Param('developerId') developerId: string,
  ) {
    return this.projectService.removeTeamMember(teamId, developerId);
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────

  @Get('projects/:id/tasks')
  getTasks(@Param('id') id: string, @Query('status') status?: string) {
    return this.projectService.getProjectTasks(id, status);
  }

  @Post('projects/:id/tasks')
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

  @Post('tasks/:taskId/dependencies')
  addDependency(
    @Param('taskId') blockingTaskId: string,
    @Body('blockedTaskId') blockedTaskId: string,
  ) {
    return this.projectService.addTaskDependency(blockingTaskId, blockedTaskId);
  }

  @Delete('tasks/:taskId/dependencies/:blockedTaskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeDependency(
    @Param('taskId') blockingTaskId: string,
    @Param('blockedTaskId') blockedTaskId: string,
  ) {
    return this.projectService.removeTaskDependency(blockingTaskId, blockedTaskId);
  }

  @Get('tasks/:taskId/dependencies')
  getDependencyGraph(@Param('taskId') taskId: string) {
    return this.projectService.getTaskDependencies(taskId);
  }

  // ── Sprints ────────────────────────────────────────────────────────────────

  @Get('projects/:id/sprints')
  getSprints(@Param('id') id: string) {
    return this.projectService.getProjectSprints(id);
  }

  @Post('projects/:id/sprints')
  createSprint(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateSprintSchema)) body: any,
  ) {
    return this.sprintService.createSprint(id, body);
  }

  @Get('projects/:id/sprints/:sprintId')
  getSprint(@Param('sprintId') sprintId: string) {
    return this.sprintService.getSprintById(sprintId);
  }

  @Patch('projects/:id/sprints/:sprintId')
  updateSprint(
    @Param('sprintId') sprintId: string,
    @Body(new ZodValidationPipe(UpdateSprintSchema)) body: any,
  ) {
    return this.sprintService.updateSprint(sprintId, body);
  }

  @Post('projects/:id/sprints/:sprintId/activate')
  @HttpCode(HttpStatus.OK)
  activateSprint(@Param('sprintId') sprintId: string) {
    return this.sprintService.activateSprint(sprintId);
  }

  @Post('projects/:id/sprints/:sprintId/complete')
  @HttpCode(HttpStatus.OK)
  completeSprint(@Param('sprintId') sprintId: string) {
    return this.sprintService.completeSprint(sprintId);
  }

  @Post('projects/:id/sprints/:sprintId/tasks')
  addTaskToSprint(@Param('sprintId') sprintId: string, @Body('taskId') taskId: string) {
    return this.sprintService.addTaskToSprint(sprintId, taskId);
  }

  @Delete('projects/:id/sprints/:sprintId/tasks/:taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTaskFromSprint(@Param('sprintId') sprintId: string, @Param('taskId') taskId: string) {
    return this.sprintService.removeTaskFromSprint(sprintId, taskId);
  }
}