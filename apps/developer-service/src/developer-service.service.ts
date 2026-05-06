// apps/developer-service/src/developer-service.service.ts  ← UPDATED: full Prisma impl
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { prisma } from '@estimation/database';
import { createLogger } from '@estimation/logger';
import { KAFKA_TOPICS } from '@estimation/events';
import { Kafka } from 'kafkajs';

const logger = createLogger('developer-service');

const kafka = new Kafka({ brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] });
const producer = kafka.producer();

@Injectable()
export class DeveloperService {
  async onModuleInit() {
    await producer.connect();
  }

  async onModuleDestroy() {
    await producer.disconnect();
  }

  async getProfile(id: string, requestingUserId: string, requestingRole: string) {
    const developer = await prisma.developer.findUnique({
      where: { id },
      include: {
        skills: true,
        teamMemberships: { include: { team: true } },
      },
    });

    if (!developer) throw new NotFoundException(`Developer ${id} not found`);

    // RBAC: developers can only read their own profile
    if (requestingRole === 'DEVELOPER' && developer.id !== requestingUserId) {
      throw new ForbiddenException('Developers may only view their own profile');
    }

    logger.info({ developerId: id, requestedBy: requestingUserId }, 'profile_fetched');

    return {
      id: developer.id,
      externalId: developer.externalId,
      name: developer.name,
      email: developer.email,
      role: developer.role,
      skills: developer.skills.map((s) => ({ skill: s.skill, level: s.level })),
      estimationAcc: developer.estimationAcc,
      avgTaskDuration: developer.avgTaskDuration,
      cognitiveLoad: developer.cognitiveLoad,
      burnoutRisk: developer.burnoutRisk,
      teams: developer.teamMemberships.map((m) => ({ id: m.team.id, name: m.team.name })),
      createdAt: developer.createdAt,
      updatedAt: developer.updatedAt,
    };
  }

  async getVelocityHistory(id: string, from?: string, to?: string, granularity = 'sprint') {
    const developer = await prisma.developer.findUnique({ where: { id } });
    if (!developer) throw new NotFoundException(`Developer ${id} not found`);

    const records = await prisma.velocityRecord.findMany({
      where: {
        developerId: id,
        ...(from && { recordedAt: { gte: new Date(from) } }),
        ...(to && { recordedAt: { lte: new Date(to) } }),
      },
      include: { sprint: true },
      orderBy: { recordedAt: 'asc' },
    });

    return {
      developerId: id,
      granularity,
      history: records.map((r) => ({
        period: granularity === 'sprint' ? r.sprint.name : r.recordedAt.toISOString().slice(0, 10),
        sprintId: r.sprintId,
        completedPoints: r.points,
        hoursLogged: r.hours,
        recordedAt: r.recordedAt,
      })),
    };
  }

  async getTeamCompositionScore(teamId: string) {
    const members = await prisma.teamMember.findMany({
      where: { teamId },
      include: {
        developer: { include: { skills: true } },
      },
    });

    if (!members.length) throw new NotFoundException(`Team ${teamId} not found or empty`);

    const developers = members.map((m) => m.developer);

    // Skill coverage: unique skills vs total possible skill slots
    const allSkills = new Set(developers.flatMap((d) => d.skills.map((s) => s.skill)));
    const skillCoverage = Math.min(allSkills.size / 10, 1); // normalised to 10 core skills

    // Synergy: average pairwise estimation accuracy
    const avgAcc = developers.reduce((sum, d) => sum + d.estimationAcc, 0) / developers.length;

    // Single points of failure: skills owned by exactly one developer
    const skillOwnerCount = new Map<string, number>();
    for (const dev of developers) {
      for (const s of dev.skills) {
        skillOwnerCount.set(s.skill, (skillOwnerCount.get(s.skill) ?? 0) + 1);
      }
    }
    const singlePointsOfFailure = [...skillOwnerCount.values()].filter((c) => c === 1).length;

    // Predicted velocity: sum of individual average task durations
    const predictedVelocity = developers.reduce((sum, d) => sum + d.avgTaskDuration, 0);

    return {
      teamId,
      memberCount: members.length,
      synergyScore: parseFloat(avgAcc.toFixed(3)),
      skillCoverage: parseFloat(skillCoverage.toFixed(3)),
      singlePointsOfFailure,
      predictedVelocity: parseFloat(predictedVelocity.toFixed(1)),
    };
  }

  async simulateTeam(developerIds: string[], projectId: string) {
    const developers = await prisma.developer.findMany({
      where: { id: { in: developerIds } },
      include: { skills: true },
    });

    if (developers.length !== developerIds.length) {
      throw new NotFoundException('One or more developer IDs not found');
    }

    const avgLoad = developers.reduce((s, d) => s + d.cognitiveLoad, 0) / developers.length;
    const avgAcc = developers.reduce((s, d) => s + d.estimationAcc, 0) / developers.length;
    const burnoutRisks = developers.map((d) => d.burnoutRisk);

    const riskFactor = burnoutRisks.includes('CRITICAL')
      ? 'CRITICAL'
      : burnoutRisks.includes('HIGH')
        ? 'HIGH'
        : avgLoad > 75
          ? 'MODERATE'
          : 'LOW';

    const bottleneckWarnings = developers
      .filter((d) => d.cognitiveLoad > 80)
      .map((d) => `${d.name} has cognitive load at ${d.cognitiveLoad}%`);

    logger.info({ projectId, teamSize: developers.length, riskFactor }, 'team_simulation_run');

    return {
      projectId,
      simulatedTeam: developers.map((d) => ({ id: d.id, name: d.name })),
      teamAccuracyScore: parseFloat(avgAcc.toFixed(3)),
      averageCognitiveLoad: parseFloat(avgLoad.toFixed(1)),
      riskFactor,
      bottleneckWarnings,
    };
  }

  async updateCognitiveLoad(developerId: string, load: number) {
    const updated = await prisma.developer.update({
      where: { id: developerId },
      data: { cognitiveLoad: load },
    });

    // Publish profile update event to Kafka
    await producer.send({
      topic: KAFKA_TOPICS.PROFILE_UPDATED,
      messages: [
        {
          key: developerId,
          value: JSON.stringify({
            eventId: crypto.randomUUID(),
            eventType: KAFKA_TOPICS.PROFILE_UPDATED,
            version: '1.0',
            timestamp: new Date().toISOString(),
            orgId: updated.orgId,
            projectId: '',
            userId: developerId,
            data: {
              developerId,
              changedFields: ['cognitiveLoad'],
              burnoutRisk: updated.burnoutRisk,
            },
          }),
        },
      ],
    });

    return updated;
  }
}
