import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Create a Mock Organization
  const org = await prisma.organization.upsert({
    where: { slug: 'acme-corp' },
    update: {},
    create: {
      name: 'Acme Corporation',
      slug: 'acme-corp',
    },
  });

  // 2. Create a Mock Developer linked to the Organization
  await prisma.developer.upsert({
    where: { email: 'or@example.com' },
    update: {},
    create: {
      name: 'Or Sasson',
      email: 'or@example.com',
      externalId: 'jira-user-001',
      estimationAcc: 0.95,
      burnoutRisk: 'LOW',
      orgId: org.id, // <-- Here is the missing relational link!
    },
  });

  console.log('✅ Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
