import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Create organization
  const org = await prisma.organization.upsert({
    where: { slug: 'acme-corp' },
    update: {},
    create: {
      name: 'Acme Corporation',
      slug: 'acme-corp',
      apiKey: `pk_live_${faker.string.alphanumeric(32)}`,
    },
  });
  console.log(`✅ Created org: ${org.name}`);

  // 2. Create team
  const team = await prisma.team.upsert({
    where: {
      orgId_name: { orgId: org.id, name: 'Backend Squad' },
    },
    update: {},
    create: {
      orgId: org.id,
      name: 'Backend Squad',
      description: 'Core infrastructure team',
    },
  });
  console.log(`✅ Created team: ${team.name}`);

  // 3. Create developers
  const developers = await Promise.all([
    prisma.developer.upsert({
      where: { email: 'alice@acme.com' },
      update: {},
      create: {
        name: 'Alice Chen',
        email: 'alice@acme.com',
        externalId: 'gh-user-alice',
        orgId: org.id,
        role: 'TEAM_LEAD',
        estimationAcc: 0.92,
        avgTaskDuration: 8.5,
        cognitiveLoad: 65,
        burnoutRisk: 'LOW',
      },
    }),
    prisma.developer.upsert({
      where: { email: 'bob@acme.com' },
      update: {},
      create: {
        name: 'Bob Martinez',
        email: 'bob@acme.com',
        externalId: 'gh-user-bob',
        orgId: org.id,
        role: 'DEVELOPER',
        estimationAcc: 0.78,
        avgTaskDuration: 6.2,
        cognitiveLoad: 72,
        burnoutRisk: 'MODERATE',
      },
    }),
    prisma.developer.upsert({
      where: { email: 'carol@acme.com' },
      update: {},
      create: {
        name: 'Carol Singh',
        email: 'carol@acme.com',
        externalId: 'gh-user-carol',
        orgId: org.id,
        role: 'DEVELOPER',
        estimationAcc: 0.85,
        avgTaskDuration: 7.8,
        cognitiveLoad: 58,
        burnoutRisk: 'LOW',
      },
    }),
  ]);
  console.log(`✅ Created ${developers.length} developers`);

  // 4. Add developers to team
  for (const dev of developers) {
    await prisma.teamMember.upsert({
      where: {
        teamId_developerId: { teamId: team.id, developerId: dev.id },
      },
      update: {},
      create: {
        teamId: team.id,
        developerId: dev.id,
      },
    });
  }
  console.log(`✅ Added ${developers.length} developers to team`);

  // 5. Add skills
  const skills = ['TypeScript', 'Node.js', 'PostgreSQL', 'React', 'Docker'];
  for (const dev of developers) {
    for (let i = 0; i < Math.floor(Math.random() * 3) + 2; i++) {
      const skill = skills[Math.floor(Math.random() * skills.length)];
      await prisma.developerSkill.upsert({
        where: { developerId_skill: { developerId: dev.id, skill } },
        update: {},
        create: {
          developerId: dev.id,
          skill,
          level: Math.floor(Math.random() * 3) + 2,
          yearsExp: Math.floor(Math.random() * 8) + 1,
        },
      });
    }
  }
  console.log(`✅ Added skills to developers`);

  // 6. Create project
  const project = await prisma.project.upsert({
    where: { id: 'proj-001' },
    update: {},
    create: {
      id: 'proj-001',
      orgId: org.id,
      teamId: team.id,
      name: 'E-Commerce Platform',
      description: 'Next-gen commerce experience',
      status: 'ACTIVE',
      startDate: new Date('2025-01-01'),
      targetDate: new Date('2026-06-30'),
    },
  });
  console.log(`✅ Created project: ${project.name}`);

  // 7. Create sprints
  const now = new Date();
  const sprints = [];
  for (let i = 0; i < 3; i++) {
    const sprint = await prisma.sprint.upsert({
      where: { id: `sprint-${i + 1}` },
      update: {},
      create: {
        id: `sprint-${i + 1}`,
        projectId: project.id,
        name: `Sprint ${i + 1}`,
        goal: `Complete ${5 - i} features`,
        startDate: new Date(now.getTime() + i * 14 * 24 * 60 * 60 * 1000),
        endDate: new Date(now.getTime() + (i + 1) * 14 * 24 * 60 * 60 * 1000),
        status: i === 0 ? 'ACTIVE' : 'PLANNED',
      },
    });
    sprints.push(sprint);
  }
  console.log(`✅ Created ${sprints.length} sprints`);

  // 8. Create tasks
  const taskTitles = [
    'Implement user authentication',
    'Setup database migrations',
    'Create REST API endpoints',
    'Build product catalog UI',
    'Setup CI/CD pipeline',
  ];

  for (let i = 0; i < taskTitles.length; i++) {
    const task = await prisma.task.create({
      data: {
        externalId: `task-${i + 1}`,
        projectId: project.id,
        title: taskTitles[i],
        description: `Subtasks and requirements for: ${taskTitles[i]}`,
        storyPoints: (i + 1) * 2,
        complexityScore: Math.random() * 100,
        status: i === 0 ? 'IN_PROGRESS' : i === 1 ? 'IN_REVIEW' : 'BACKLOG',
        priority: (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const)[Math.floor(Math.random() * 4)],
      },
    });

    // Assign to sprint
    if (i < 2) {
      await prisma.sprintTask.create({
        data: {
          sprintId: sprints[0].id,
          taskId: task.id,
        },
      });
    }

    // Assign to developer
    if (i < developers.length) {
      await prisma.taskAssignment.create({
        data: {
          taskId: task.id,
          developerId: developers[i].id,
        },
      });
    }
  }
  console.log(`✅ Created ${taskTitles.length} tasks`);

  // 9. Create webhook
  await prisma.webhook.create({
    data: {
      orgId: org.id,
      url: 'https://webhook.example.com/estimation-events',
      secret: faker.string.alphanumeric(32),
      events: ['ESTIMATE_GENERATED', 'RISK_ALERT_TRIGGERED'],
      isActive: true,
    },
  });
  console.log(`✅ Created webhook`);

  console.log('✅ Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
