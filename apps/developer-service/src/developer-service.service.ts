import { Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { prisma } from "@estimation/database";
import { createLogger } from "@estimation/logger";
import { KAFKA_TOPICS } from "@estimation/events";
import { Kafka, Producer } from "kafkajs";

const logger = createLogger("developer-service");

@Injectable()
export class DeveloperService {
  // FIX #10: producer declared as instance field, not module-level singleton.
  // Instantiating Kafka at module scope crashes the entire import if the broker
  // is unreachable at startup. Moving it here lets the service start degraded
  // and report unhealthy via its health endpoint instead of hard-crashing.
  private producer: Producer | null = null;

  async onModuleInit() {
    try {
      const kafka = new Kafka({
        brokers: [process.env.KAFKA_BROKER || "localhost:9092"],
      });
      this.producer = kafka.producer();
      await this.producer.connect();
      logger.info("kafka_producer_connected");
    } catch (err) {
      logger.error({ err }, "kafka_producer_connect_failed — service starting degraded");
      // Do not rethrow: service remains up so its /health endpoint is reachable.
    }
  }

  async onModuleDestroy() {
    if (this.producer) {
      await this.producer.disconnect();
    }
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

    if (requestingRole === "DEVELOPER" && developer.id !== requestingUserId) {
      throw new ForbiddenException("Developers may only view their own profile");
    }

    logger.info({ developerId: id, requestedBy: requestingUserId }, "profile_fetched");

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

  async getVelocityHistory(id: string, from?: string, to?: string, granularity = "sprint") {
    const developer = await prisma.developer.findUnique({ where: { id } });
    if (!developer) throw new NotFoundException(`Developer ${id} not found`);

    const records = await prisma.velocityRecord.findMany({
      where: {
        developerId: id,
        ...(from && { recordedAt: { gte: new Date(from) } }),
        ...(to && { recordedAt: { lte: new Date(to) } }),
      },
      include: { sprint: true },
      orderBy: { recordedAt: "asc" },
    });

    return {
      developerId: id,
      granularity,
      history: records.map((r) => ({
        period:
          granularity === "sprint"
            ? r.sprint.name
            : r.recordedAt.toISOString().slice(0, 10),
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
      include: { developer: { include: { skills: true } } },
    });

    if (!members.length) throw new NotFoundException(`Team ${teamId} not found or empty`);

    const developers = members.map((m) => m.developer);
    const allSkills = new Set(developers.flatMap((d) => d.skills.map((s) => s.skill)));
    const skillCoverage = Math.min(allSkills.size / 10, 1);
    const avgAcc = developers.reduce((sum, d) => sum + d.estimationAcc, 0) / developers.length;

    const skillOwnerCount = new Map<string, number>();
    for (const dev of developers) {
      for (const s of dev.skills) {
        skillOwnerCount.set(s.skill, (skillOwnerCount.get(s.skill) ?? 0) + 1);
      }
    }
    const singlePointsOfFailure = [...skillOwnerCount.values()].filter((c) => c === 1).length;
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
      throw new NotFoundException("One or more developer IDs not found");
    }

    const avgLoad = developers.reduce((s, d) => s + d.cognitiveLoad, 0) / developers.length;
    const avgAcc = developers.reduce((s, d) => s + d.estimationAcc, 0) / developers.length;
    const burnoutRisks = developers.map((d) => d.burnoutRisk);

    const riskFactor = burnoutRisks.includes("CRITICAL")
      ? "CRITICAL"
      : burnoutRisks.includes("HIGH")
        ? "HIGH"
        : avgLoad > 75
          ? "MODERATE"
          : "LOW";

    const bottleneckWarnings = developers
      .filter((d) => d.cognitiveLoad > 80)
      .map((d) => `${d.name} has cognitive load at ${d.cognitiveLoad}%`);

    logger.info({ projectId, teamSize: developers.length, riskFactor }, "team_simulation_run");

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

    if (this.producer) {
      await this.producer.send({
        topic: KAFKA_TOPICS.PROFILE_UPDATED,
        messages: [
          {
            key: developerId,
            value: JSON.stringify({
              eventId: crypto.randomUUID(),
              eventType: KAFKA_TOPICS.PROFILE_UPDATED,
              version: "1.0",
              timestamp: new Date().toISOString(),
              orgId: updated.orgId,
              projectId: "",
              userId: developerId,
              data: {
                developerId,
                changedFields: ["cognitiveLoad"],
                burnoutRisk: updated.burnoutRisk,
              },
            }),
          },
        ],
      });
    } else {
      logger.warn({ developerId }, "kafka_unavailable — profile update event not published");
    }

    return updated;
  }
}
