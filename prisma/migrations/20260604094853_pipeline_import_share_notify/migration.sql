-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('new', 'screened', 'sent_to_client', 'interview', 'approved', 'rejected', 'hired');

-- CreateEnum
CREATE TYPE "NoteKind" AS ENUM ('note', 'call', 'email', 'telegram', 'whatsapp', 'interview');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('telegram', 'recruiter');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('queued', 'sent', 'failed', 'skipped');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EventType" ADD VALUE 'imported';
ALTER TYPE "EventType" ADD VALUE 'stage_changed';
ALTER TYPE "EventType" ADD VALUE 'note_added';
ALTER TYPE "EventType" ADD VALUE 'communication';
ALTER TYPE "EventType" ADD VALUE 'shared';
ALTER TYPE "EventType" ADD VALUE 'client_approved';
ALTER TYPE "EventType" ADD VALUE 'client_rejected';
ALTER TYPE "EventType" ADD VALUE 'interview_requested';

-- AlterTable
ALTER TABLE "candidate" ADD COLUMN     "dedupe_key" TEXT,
ADD COLUMN     "import_batch_id" TEXT;

-- CreateTable
CREATE TABLE "pipeline" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "stage" "PipelineStage" NOT NULL DEFAULT 'new',
    "entered_stage_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "job_id" TEXT,
    "kind" "NoteKind" NOT NULL DEFAULT 'note',
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT true,
    "author" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_link" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "client_id" TEXT,
    "label" TEXT,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_link_candidate" (
    "id" TEXT NOT NULL,
    "share_link_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "share_notes" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "share_link_candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'queued',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "job_id" TEXT,
    "candidate_id" TEXT,
    "external_ref" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batch" (
    "id" TEXT NOT NULL,
    "filename" TEXT,
    "source" TEXT,
    "total" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pipeline_job_id_stage_idx" ON "pipeline"("job_id", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_candidate_id_job_id_key" ON "pipeline"("candidate_id", "job_id");

-- CreateIndex
CREATE INDEX "note_candidate_id_idx" ON "note"("candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "share_link_token_key" ON "share_link"("token");

-- CreateIndex
CREATE INDEX "share_link_job_id_idx" ON "share_link"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "share_link_candidate_share_link_id_candidate_id_key" ON "share_link_candidate"("share_link_id", "candidate_id");

-- CreateIndex
CREATE INDEX "notification_channel_status_idx" ON "notification"("channel", "status");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_dedupe_key_key" ON "candidate"("dedupe_key");

-- CreateIndex
CREATE INDEX "candidate_country_idx" ON "candidate"("country");

-- AddForeignKey
ALTER TABLE "candidate" ADD CONSTRAINT "candidate_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline" ADD CONSTRAINT "pipeline_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline" ADD CONSTRAINT "pipeline_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note" ADD CONSTRAINT "note_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note" ADD CONSTRAINT "note_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_link" ADD CONSTRAINT "share_link_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_link" ADD CONSTRAINT "share_link_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_link_candidate" ADD CONSTRAINT "share_link_candidate_share_link_id_fkey" FOREIGN KEY ("share_link_id") REFERENCES "share_link"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_link_candidate" ADD CONSTRAINT "share_link_candidate_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

