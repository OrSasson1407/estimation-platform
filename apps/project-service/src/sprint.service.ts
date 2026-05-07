// apps/project-service/src/sprint.service.ts  ← PHASE 1 NEW FILE
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '@estimation/database';
import { createLogger } from '@estimation/logger';
import { KAFKA_TOPICS } from '@estimation/events';
import { Kafka, Producer } from 'kafkajs';
import { z } from 'zod';

const logger = createLogger('sprint-service');

// ─── Zod schemas ──────────────────────────────────────────────────────────────

export const CreateSprintSchema = z.object({
  name: z.string().min(1).max(100),
  goal: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

export const UpdateSprintSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  goal: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  status: z.enum(['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
});

export type CreateSprintDto = z.infer<typeof CreateSprintSchema>;
export type UpdateSprintDto = z.infer<typeof UpdateSprintSchema>;

@Injectable()
export class SprintService {
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

  async createSprint(projectId: string, dto: CreateSprintDto) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end <= start) throw new BadRequestException('endDate must be after startDate');

    const sprint = await prisma.sprint.create({
      data: {
        projectId,
        name: dto.name,
        goal: dto.goal,
        startDate: start,
        endDate: end,
        status: 'PLANNED',
      },
    });

    logger.info({ sprintId: sprint.id, projectId }, 'sprint_created');
    return sprint;
  }

  async updateSprint(sprintId: string, dto: UpdateSprintDto) {
    const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint) throw new NotFoundException(`Sprint ${sprintId} not found`);

    const updated = await prisma.sprint.update({
      where: { id: sprintId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.goal !== undefined && { goal: dto.goal }),
        ...(dto.startDate && { startDate: new Date(dto.startDate) }),
        ...(dto.endDate && { endDate: new Date(dto.endDate) }),
        ...(dto.status && { status: dto.status }),
      },
    });

    logger.info({ sprintId, changes: Object.keys(dto) }, 'sprint_updated');
    return updated;
  }

  async activateSprint(sprintId: string) {
    const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint) throw new NotFoundException(`Sprint ${sprintId} not found`);
    if (sprint.status !== 'PLANNED') {
      throw new BadRequestException(`Sprint is ${sprint.status}, cannot activate`);
    }

    const updated = await prisma.sprint.update({
      where: { id: sprintId },
      data: { status: 'ACTIVE' },
    });

    logger.info({ sprintId }, 'sprint_activated');
    return updated;
  }

  async completeSprint(sprintId: string) {
    const sprint = await prisma.sprint.findUnique({
      where: { id: sprintId },
      include: {
        sprintTasks: { include: { task: true } },
        project: true,
      },
    });
    if (!sprint) throw new NotFoundException(`Sprint ${sprintId} not found`);
    if (sprint.status === 'COMPLETED') {
      throw new BadRequestException('Sprint is already completed');
    }

    const completedPoints = sprint.sprintTasks
      .filter((st) => st.task.status === 'DONE')
      .reduce((sum, st) => sum + (st.task.storyPoints ?? 0), 0);

    const plannedPoints = sprint.sprintTasks.reduce(
      (sum, st) => sum + (st.task.storyPoints ?? 0),
      0,
    );

    const velocityScore = plannedPoints > 0 ? completedPoints / plannedPoints : 0;

    const updated = await prisma.sprint.update({
      where: { id: sprintId },
      data: { status: 'COMPLETED' },
    });

    // Publish projects.sprint.completed
    await this.producer.send({
      topic: KAFKA_TOPICS.SPRINT_COMPLETED,
      messages: [
        {
          key: sprintId,
          value: JSON.stringify({
            eventId: crypto.randomUUID(),
            eventType: KAFKA_TOPICS.SPRINT_COMPLETED,
            version: '1.0',
            timestamp: new Date().toISOString(),
            orgId: sprint.project?.orgId ?? '',
            projectId: sprint.projectId,
            data: {
              sprintId,
              projectId: sprint.projectId,
              completedPoints,
              plannedPoints,
              velocityScore,
            },
          }),
        },
      ],
    });

    logger.info({ sprintId, completedPoints, plannedPoints, velocityScore }, 'sprint_completed');
    return { ...updated, completedPoints, plannedPoints, velocityScore };
  }

  async addTaskToSprint(sprintId: string, taskId: string) {
    const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint) throw new NotFoundException(`Sprint ${sprintId} not found`);

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException(`Task ${taskId} not found`);

    const existing = await prisma.sprintTask.findUnique({
      where: { sprintId_taskId: { sprintId, taskId } },
    });
    if (existing) throw new BadRequestException('Task already in sprint');

    return prisma.sprintTask.create({ data: { sprintId, taskId } });
  }

  async removeTaskFromSprint(sprintId: string, taskId: string) {
    const existing = await prisma.sprintTask.findUnique({
      where: { sprintId_taskId: { sprintId, taskId } },
    });
    if (!existing) throw new NotFoundException('Task not found in sprint');
    return prisma.sprintTask.delete({ where: { sprintId_taskId: { sprintId, taskId } } });
  }

  async getSprintById(sprintId: string) {
    const sprint = await prisma.sprint.findUnique({
      where: { id: sprintId },
      include: {
        sprintTasks: {
          include: {
            task: {
              include: {
                assignments: { include: { developer: { select: { id: true, name: true } } } },
                estimations: {
                  where: { status: 'ACTIVE' },
                  orderBy: { generatedAt: 'desc' },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
    if (!sprint) throw new NotFoundException(`Sprint ${sprintId} not found`);
    return sprint;
  }
}
