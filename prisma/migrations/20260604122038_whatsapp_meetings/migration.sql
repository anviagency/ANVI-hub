-- CreateEnum
CREATE TYPE "WaDirection" AS ENUM ('outbound', 'inbound');

-- CreateEnum
CREATE TYPE "WaKind" AS ENUM ('template', 'interactive', 'text');

-- CreateEnum
CREATE TYPE "WaStatus" AS ENUM ('queued', 'sent', 'delivered', 'failed', 'skipped', 'received');

-- AlterEnum
ALTER TYPE "NotificationChannel" ADD VALUE 'email';

-- AlterTable
ALTER TABLE "interview" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "meeting_tag" TEXT,
ADD COLUMN     "meeting_time" TIMESTAMP(3),
ADD COLUMN     "participants" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "webhook_status" TEXT NOT NULL DEFAULT 'none';

-- CreateTable
CREATE TABLE "wa_message" (
    "id" TEXT NOT NULL,
    "direction" "WaDirection" NOT NULL,
    "kind" "WaKind" NOT NULL,
    "status" "WaStatus" NOT NULL DEFAULT 'queued',
    "to_number" TEXT,
    "from_number" TEXT,
    "client_id" TEXT,
    "candidate_id" TEXT,
    "job_id" TEXT,
    "template_name" TEXT,
    "event" TEXT,
    "body" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "external_id" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_event" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "type" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "webhook_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wa_message_client_id_idx" ON "wa_message"("client_id");

-- CreateIndex
CREATE INDEX "wa_message_candidate_id_idx" ON "wa_message"("candidate_id");

-- CreateIndex
CREATE INDEX "wa_message_status_idx" ON "wa_message"("status");

-- CreateIndex
CREATE INDEX "webhook_event_provider_status_idx" ON "webhook_event"("provider", "status");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_event_provider_external_id_key" ON "webhook_event"("provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_timeless_meeting_id_key" ON "interview"("timeless_meeting_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_meeting_tag_key" ON "interview"("meeting_tag");

-- CreateIndex
CREATE INDEX "interview_candidate_id_idx" ON "interview"("candidate_id");

