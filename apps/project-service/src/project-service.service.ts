import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class ProjectService {
  // TODO: Inject PrismaService once the DB schema is generated

  async getProjectDetails(projectId: string) {
    return {
      id: projectId,
      name: 'AI Estimation Platform Integration',
      description: 'Connecting the new ML pipeline to the main platform.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async getProjectTasks(projectId: string) {
    // Mocked response matching the Task Prisma schema
    return [
      {
        id: 'task_1',
        externalId: 'PROJ-123',
        projectId,
        title: 'Implement REST API for Estimations',
        description: 'Create the primary API endpoints for the estimation engine.',
        storyPoints: 5,
        complexityScore: 42.5,
        techDebtScore: 10.0,
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        assigneeId: 'user_abc123',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'task_2',
        externalId: 'PROJ-124',
        projectId,
        title: 'Kafka Event Publisher',
        description: 'Publish estimation events to the Kafka bus.',
        storyPoints: 3,
        complexityScore: 28.0,
        techDebtScore: 5.0,
        status: 'TODO',
        priority: 'MEDIUM',
        assigneeId: null,
        createdAt: new Date().toISOString(),
      },
    ];
  }

  async createTask(projectId: string, taskData: any) {
    // In reality, this will validate via Zod and insert into PostgreSQL
    const newTask = {
      id: `task_${Math.floor(Math.random() * 1000)}`,
      projectId,
      ...taskData,
      complexityScore: 0, // Will be updated asynchronously by ML pipeline
      createdAt: new Date().toISOString(),
    };

    // TODO: Emit 'projects.task.created' Kafka event here[cite: 2]

    return newTask;
  }

  async getProjectSprints(projectId: string) {
    return [
      {
        id: 'sprint_1',
        projectId,
        name: 'Sprint 42',
        startDate: '2026-05-01T00:00:00Z',
        endDate: '2026-05-14T23:59:59Z',
        status: 'ACTIVE',
      },
    ];
  }
}
