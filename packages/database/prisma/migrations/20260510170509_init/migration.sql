/*
  Warnings:

  - A unique constraint covering the columns `[apiKey]` on the table `Organization` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[orgId,name]` on the table `Team` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `DeveloperSkill` table without a default value. This is not possible if the table is not empty.
  - The required column `apiKey` was added to the `Organization` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Added the required column `updatedAt` to the `RiskAlert` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Sprint` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Team` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "WebhookEventType" AS ENUM ('ESTIMATE_GENERATED', 'RISK_ALERT_TRIGGERED', 'SPRINT_COMPLETED', 'TASK_STATUS_CHANGED', 'DEVELOPER_VELOCITY_UPDATED', 'DEVELOPER_PROFILE_UPDATED');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "SimulationType" AS ENUM ('WHAT_IF', 'STRESS_TEST', 'PORTFOLIO');

-- CreateEnum
CREATE TYPE "TeamMemberRole" AS ENUM ('DEVELOPER', 'LEAD', 'MANAGER', 'QA', 'DESIGNER');

-- DropForeignKey
ALTER TABLE "Developer" DROP CONSTRAINT "Developer_orgId_fkey";

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_orgId_fkey";

-- DropForeignKey
ALTER TABLE "TaskDependency" DROP CONSTRAINT "TaskDependency_blockedTaskId_fkey";

-- DropForeignKey
ALTER TABLE "TaskDependency" DROP CONSTRAINT "TaskDependency_blockingTaskId_fkey";

-- DropForeignKey
ALTER TABLE "Team" DROP CONSTRAINT "Team_orgId_fkey";

-- DropForeignKey
ALTER TABLE "VelocityRecord" DROP CONSTRAINT "VelocityRecord_sprintId_fkey";

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "ipAddress" TEXT;

-- AlterTable
ALTER TABLE "Developer" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastActiveAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "DeveloperSkill" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "yearsExp" INTEGER;

-- AlterTable
ALTER TABLE "Estimation" ADD COLUMN     "actualHours" DOUBLE PRECISION,
ADD COLUMN     "revisedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "apiKey" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "RiskAlert" ADD COLUMN     "resolvedBy" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Sprint" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "description" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "TeamMember" ADD COLUMN     "role" "TeamMemberRole" NOT NULL DEFAULT 'DEVELOPER';

-- CreateTable
CREATE TABLE "SimulationResult" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "SimulationType" NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "eventType" "WebhookEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SimulationResult_projectId_idx" ON "SimulationResult"("projectId");

-- CreateIndex
CREATE INDEX "SimulationResult_type_idx" ON "SimulationResult"("type");

-- CreateIndex
CREATE INDEX "SimulationResult_createdAt_idx" ON "SimulationResult"("createdAt");

-- CreateIndex
CREATE INDEX "Webhook_orgId_idx" ON "Webhook"("orgId");

-- CreateIndex
CREATE INDEX "Webhook_isActive_idx" ON "Webhook"("isActive");

-- CreateIndex
CREATE INDEX "WebhookDelivery_webhookId_idx" ON "WebhookDelivery"("webhookId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_idx" ON "WebhookDelivery"("status");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Developer_isActive_idx" ON "Developer"("isActive");

-- CreateIndex
CREATE INDEX "DeveloperSkill_skill_idx" ON "DeveloperSkill"("skill");

-- CreateIndex
CREATE INDEX "Estimation_generatedAt_idx" ON "Estimation"("generatedAt");

-- CreateIndex
CREATE INDEX "FeedbackFlag_estimationId_idx" ON "FeedbackFlag"("estimationId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_apiKey_key" ON "Organization"("apiKey");

-- CreateIndex
CREATE INDEX "Organization_slug_idx" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Project_teamId_idx" ON "Project"("teamId");

-- CreateIndex
CREATE INDEX "RiskAlert_createdAt_idx" ON "RiskAlert"("createdAt");

-- CreateIndex
CREATE INDEX "Sprint_status_idx" ON "Sprint"("status");

-- CreateIndex
CREATE INDEX "SprintTask_sprintId_idx" ON "SprintTask"("sprintId");

-- CreateIndex
CREATE INDEX "TaskAssignment_taskId_idx" ON "TaskAssignment"("taskId");

-- CreateIndex
CREATE INDEX "Team_orgId_idx" ON "Team"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_orgId_name_key" ON "Team"("orgId", "name");

-- CreateIndex
CREATE INDEX "TeamMember_teamId_idx" ON "TeamMember"("teamId");

-- CreateIndex
CREATE INDEX "VelocityRecord_sprintId_idx" ON "VelocityRecord"("sprintId");

-- CreateIndex
CREATE INDEX "VelocityRecord_recordedAt_idx" ON "VelocityRecord"("recordedAt");

-- AddForeignKey
ALTER TABLE "Developer" ADD CONSTRAINT "Developer_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VelocityRecord" ADD CONSTRAINT "VelocityRecord_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_blockingTaskId_fkey" FOREIGN KEY ("blockingTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_blockedTaskId_fkey" FOREIGN KEY ("blockedTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationResult" ADD CONSTRAINT "SimulationResult_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
