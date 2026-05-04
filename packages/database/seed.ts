import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Create a Mock Developer
  await prisma.developer.upsert({
    where: { email: "or@example.com" },
    update: {},
    create: {
      name: "Or Sasson",
      email: "or@example.com",
      externalId: "jira-user-001",
      estimationAcc: 0.95,
      burnoutRisk: "LOW",
    },
  });

  console.log("✅ Seeding complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
