import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class DeveloperService {
  // TODO: Inject PrismaService once the DB schema is generated

  async getProfile(id: string) {
    // Mocked response matching the Developer Prisma schema
    return {
      id,
      externalId: `ext_${id}`,
      name: 'Jane Doe',
      email: 'jane.doe@example.com',
      skills: ['React', 'Node.js', 'Python'],
      estimationAcc: 0.88, // 0-1 rolling accuracy score
      avgTaskDuration: 4.5, // hours per story point
      cognitiveLoad: 65, // 0-100 current load score
      burnoutRisk: 'LOW',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async getVelocityHistory(id: string, from?: string, to?: string, granularity?: string) {
    return {
      developerId: id,
      history: [
        { period: '2026-04-W1', completedPoints: 12, accuracy: 0.85 },
        { period: '2026-04-W2', completedPoints: 15, accuracy: 0.9 },
      ],
    };
  }

  async getTeamCompositionScore(teamId: string) {
    return {
      teamId,
      synergyScore: 0.82,
      skillCoverage: 0.95,
      singlePointsOfFailure: 1,
      predictedVelocity: 42,
    };
  }

  async simulateTeam(developerIds: string[], projectId: string) {
    return {
      projectId,
      simulatedTeam: developerIds,
      predictedCompletionDate: '2026-06-15T00:00:00Z',
      riskFactor: 'MODERATE',
      bottleneckWarnings: ['Backend API Integration'],
    };
  }
}
