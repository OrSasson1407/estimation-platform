// apps/project-service/src/project-service.service.ts  ← UPDATED: full Prisma + Kafka
import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@estimation/database';
import { createLogger } from '@estimation/logger';
import { KAFKA_TOPICS } from '@estimation/events';
import { Kafka } from 'kafkajs';
import { z } from 'zod';

const logger = createLogger('project-service');

const kafka = new Kafka({ brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] });
const producer = kafka.producer();

// ─── Zod schemas ──────────────────────────────────────────────────────────────

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

export type CreateTaskDto = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskStatusDto = z.infer<typeof UpdateTaskStatusSchema>;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ProjectService {
  async onModuleInit() {
    await producer.connect();
  }

  async onModuleDestroy() {
    await producer.disconnect();
  }

  async getProjectDetails(projectId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        team: true,
        _count: { select: { tasks: true, sprints: true } },
      },
    });

    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    logger.info({ projectId }, 'project_fetched');
    return project;
  }

  async getProjectTasks(projectId: string) {
    await this.getProjectDetails(projectId); // guard: 404 if missing

    return prisma.task.findMany({
      where: { projectId },
      include: {
        assignments: { include: { developer: { select: { id: true, name: true } } } },
        estimations: {
          where: { status: 'ACTIVE' },
          orderBy: { generatedAt: 'desc' },
          take: 1,
        },
        _count: { select: { subTasks: true, blockedBy: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async createTask(projectId: string, dto: CreateTaskDto, userId: string) {
    await this.getProjectDetails(projectId); // guard: 404 if missing

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
        complexityScore: 0, // updated async by ML pipeline
        techDebtScore: 0,
      },
    });

    // Publish projects.task.created → triggers estimation-service via Kafka
    await producer.send({
      topic: KAFKA_TOPICS.TASK_CREATED,
      messages: [
        {
          key: task.id,
          value: JSON.stringify({
            eventId: crypto.randomUUID(),
            eventType: KAFKA_TOPICS.TASK_CREATED,
            version: '1.0',
            timestamp: new Date().toISOString(),
            orgId: '', // populated after org lookup in production
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

    // Publish projects.task.status_changed → risk-service listens for anomalies
    await producer.send({
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

  async createSprint(
    projectId: string,
    data: { name: string; goal?: string; startDate: string; endDate: string },
  ) {
    await this.getProjectDetails(projectId);

    return prisma.sprint.create({
      data: {
        projectId,
        name: data.name,
        goal: data.goal,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        status: 'PLANNED',
      },
    });
  }

  async addTaskToSprint(sprintId: string, taskId: string) {
    const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint) throw new NotFoundException(`Sprint ${sprintId} not found`);

    return prisma.sprintTask.create({ data: { sprintId, taskId } });
  }

  async completeSprint(sprintId: string) {
    const sprint = await prisma.sprint.findUnique({
      where: { id: sprintId },
      include: { sprintTasks: { include: { task: true } } },
    });
    if (!sprint) throw new NotFoundException(`Sprint ${sprintId} not found`);

    const completedPoints = sprint.sprintTasks
      .filter((st) => st.task.status === 'DONE')
      .reduce((sum, st) => sum + (st.task.storyPoints ?? 0), 0);

    const plannedPoints = sprint.sprintTasks.reduce(
      (sum, st) => sum + (st.task.storyPoints ?? 0),
      0,
    );

    const updated = await prisma.sprint.update({
      where: { id: sprintId },
      data: { status: 'COMPLETED' },
    });

    // Publish projects.sprint.completed → analytics-service + notification-service
    await producer.send({
      topic: KAFKA_TOPICS.SPRINT_COMPLETED,
      messages: [
        {
          key: sprintId,
          value: JSON.stringify({
            eventId: crypto.randomUUID(),
            eventType: KAFKA_TOPICS.SPRINT_COMPLETED,
            version: '1.0',
            timestamp: new Date().toISOString(),
            orgId: '',
            projectId: sprint.projectId,
            data: {
              sprintId,
              projectId: sprint.projectId,
              completedPoints,
              plannedPoints,
              velocityScore: plannedPoints > 0 ? completedPoints / plannedPoints : 0,
            },
          }),
        },
      ],
    });

    logger.info({ sprintId, completedPoints, plannedPoints }, 'sprint_completed');
    return updated;
  }
}
