// apps/project-service/src/project-service.service.ts  ← PHASE 1 UPGRADE
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '@estimation/database';
import { createLogger } from '@estimation/logger';
import { KAFKA_TOPICS } from '@estimation/events';
import { Kafka, Producer } from 'kafkajs';
import { z } from 'zod';

const logger = createLogger('project-service');

// ─── Zod schemas ──────────────────────────────────────────────────────────────

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  orgId: z.string().min(1),
  teamId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  targetDate: z.string().datetime().optional(),
});

export const CreateTaskSchema = z.object({
  externalId: z.string().min(1),
  title: z.string().min(1).max(255),
  description: z.string(),
  storyPoints: z.number().int().positive().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  parentTaskId: z.string().optional(),
});

export const UpdateTaskStatusSchema = z.object({
  status: z.enum(['BACKLOG', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED']),
  changedBy: z.string(),
});

export type CreateProjectDto = z.infer<typeof CreateProjectSchema>;
export type CreateTaskDto = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskStatusDto = z.infer<typeof UpdateTaskStatusSchema>;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ProjectService {
  private producer: Producer;

  constructor() {
    const kafka = new Kafka({ brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] });
    this.producer = kafka.producer();
  }

  async onModuleInit() {
    await this.producer.connect();
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
  }

  // ── Project CRUD ───────────────────────────────────────────────────────────

  async createProject(dto: CreateProjectDto, userId: string) {
    const project = await prisma.project.create({
      data: {
        orgId: dto.orgId,
        teamId: dto.teamId,
        name: dto.name,
        description: dto.description,
        status: 'ACTIVE',
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
      },
    });

    logger.info({ projectId: project.id, orgId: dto.orgId, createdBy: userId }, 'project_created');
    return project;
  }

  async getProjectDetails(projectId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        team: {
          include: {
            members: {
              include: { developer: { select: { id: true, name: true, role: true } } },
            },
          },
        },
        _count: { select: { tasks: true, sprints: true, riskAlerts: true } },
      },
    });

    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    logger.info({ projectId }, 'project_fetched');
    return project;
  }

  async archiveProject(projectId: string, userId: string) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: { status: 'CANCELLED' },
    });

    logger.info({ projectId, archivedBy: userId }, 'project_archived');
    return updated;
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────

  async getProjectTasks(projectId: string, statusFilter?: string) {
    await this.getProjectDetails(projectId);

    const where: any = { projectId };
    if (statusFilter) where.status = statusFilter;

    return prisma.task.findMany({
      where,
      include: {
        assignments: { include: { developer: { select: { id: true, name: true } } } },
        estimations: {
          where: { status: 'ACTIVE' },
          orderBy: { generatedAt: 'desc' },
          take: 1,
        },
        _count: { select: { subTasks: true, blockedBy: true, blocking: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async createTask(projectId: string, dto: CreateTaskDto, userId: string) {
    await this.getProjectDetails(projectId);

    // Guard: parent task must belong to same project
    if (dto.parentTaskId) {
      const parent = await prisma.task.findUnique({ where: { id: dto.parentTaskId } });
      if (!parent || parent.projectId !== projectId) {
        throw new BadRequestException('parentTaskId does not belong to this project');
      }
    }

    const task = await prisma.task.create({
      data: {
        externalId: dto.externalId,
        projectId,
        title: dto.title,
        description: dto.description,
        storyPoints: dto.storyPoints,
        priority: dto.priority,
        parentTaskId: dto.parentTaskId,
        status: 'BACKLOG',
        complexityScore: 0,
        techDebtScore: 0,
      },
    });

    // Publish projects.task.created → triggers estimation-service
    await this.producer.send({
      topic: KAFKA_TOPICS.TASK_CREATED,
      messages: [
        {
          key: task.id,
          value: JSON.stringify({
            eventId: crypto.randomUUID(),
            eventType: KAFKA_TOPICS.TASK_CREATED,
            version: '1.0',
            timestamp: new Date().toISOString(),
            orgId: '',
            projectId,
            userId,
            data: {
              taskId: task.id,
              externalId: task.externalId,
              title: task.title,
              description: task.description,
              projectId,
              priority: task.priority,
            },
          }),
        },
      ],
    });

    logger.info({ taskId: task.id, projectId, createdBy: userId }, 'task_created');
    return task;
  }

  async updateTaskStatus(taskId: string, dto: UpdateTaskStatusDto) {
    const existing = await prisma.task.findUnique({ where: { id: taskId } });
    if (!existing) throw new NotFoundException(`Task ${taskId} not found`);

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: { status: dto.status },
    });

    await this.producer.send({
      topic: KAFKA_TOPICS.TASK_STATUS_CHANGED,
      messages: [
        {
          key: taskId,
          value: JSON.stringify({
            eventId: crypto.randomUUID(),
            eventType: KAFKA_TOPICS.TASK_STATUS_CHANGED,
            version: '1.0',
            timestamp: new Date().toISOString(),
            orgId: '',
            projectId: existing.projectId,
            userId: dto.changedBy,
            data: {
              taskId,
              projectId: existing.projectId,
              previousStatus: existing.status,
              newStatus: dto.status,
              changedBy: dto.changedBy,
            },
          }),
        },
      ],
    });

    logger.info({ taskId, from: existing.status, to: dto.status }, 'task_status_changed');
    return updated;
  }

  // ── Dependency graph ───────────────────────────────────────────────────────

  async addTaskDependency(blockingTaskId: string, blockedTaskId: string) {
    if (blockingTaskId === blockedTaskId) {
      throw new BadRequestException('A task cannot depend on itself');
    }

    const [blocking, blocked] = await Promise.all([
      prisma.task.findUnique({ where: { id: blockingTaskId } }),
      prisma.task.findUnique({ where: { id: blockedTaskId } }),
    ]);
    if (!blocking) throw new NotFoundException(`Task ${blockingTaskId} not found`);
    if (!blocked) throw new NotFoundException(`Task ${blockedTaskId} not found`);

    const existing = await prisma.taskDependency.findUnique({
      where: { blockingTaskId_blockedTaskId: { blockingTaskId, blockedTaskId } },
    });
    if (existing) throw new BadRequestException('Dependency already exists');

    const dep = await prisma.taskDependency.create({ data: { blockingTaskId, blockedTaskId } });
    logger.info({ blockingTaskId, blockedTaskId }, 'task_dependency_added');
    return dep;
  }

  async removeTaskDependency(blockingTaskId: string, blockedTaskId: string) {
    const existing = await prisma.taskDependency.findUnique({
      where: { blockingTaskId_blockedTaskId: { blockingTaskId, blockedTaskId } },
    });
    if (!existing) throw new NotFoundException('Dependency not found');
    await prisma.taskDependency.delete({
      where: { blockingTaskId_blockedTaskId: { blockingTaskId, blockedTaskId } },
    });
    logger.info({ blockingTaskId, blockedTaskId }, 'task_dependency_removed');
  }

  async getTaskDependencies(taskId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        blockedBy: {
          include: { blockingTask: { select: { id: true, title: true, status: true } } },
        },
        blocking: {
          include: { blockedTask: { select: { id: true, title: true, status: true } } },
        },
      },
    });
    if (!task) throw new NotFoundException(`Task ${taskId} not found`);
    return {
      taskId,
      blockedBy: task.blockedBy.map((d) => d.blockingTask),
      blocking: task.blocking.map((d) => d.blockedTask),
    };
  }

  // ── Sprints (list only — CRUD in SprintService) ───────────────────────────

  async getProjectSprints(projectId: string) {
    await this.getProjectDetails(projectId);

    return prisma.sprint.findMany({
      where: { projectId },
      include: {
        _count: { select: { sprintTasks: true } },
      },
      orderBy: { startDate: 'desc' },
    });
  }
}
