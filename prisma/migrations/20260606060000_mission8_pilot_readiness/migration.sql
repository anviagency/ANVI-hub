-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'availability_confirmed';
ALTER TYPE "EventType" ADD VALUE 'availability_declined';
ALTER TYPE "EventType" ADD VALUE 'candidate_confirmed_interview';
ALTER TYPE "EventType" ADD VALUE 'candidate_reschedule_requested';
ALTER TYPE "EventType" ADD VALUE 'client_message';

-- AlterTable
ALTER TABLE "interview" ADD COLUMN     "candidate_message" TEXT,
ADD COLUMN     "candidate_responded_at" TIMESTAMP(3),
ADD COLUMN     "candidate_status" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "meeting_provisioned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "proposed_slots" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "candidate_access" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "job_id" TEXT,
    "expires_at" TIMESTAMP(3),
    "last_viewed_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_message" (
    "id" TEXT NOT NULL,
    "client_id" TEXT,
    "job_id" TEXT NOT NULL,
    "candidate_id" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'question',
    "body" TEXT NOT NULL,
    "via" TEXT NOT NULL DEFAULT 'share_link',
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "candidate_access_token_key" ON "candidate_access"("token");

-- CreateIndex
CREATE INDEX "candidate_access_candidate_id_idx" ON "candidate_access"("candidate_id");

-- CreateIndex
CREATE INDEX "client_message_job_id_idx" ON "client_message"("job_id");

-- CreateIndex
CREATE INDEX "client_message_resolved_at_idx" ON "client_message"("resolved_at");

-- AddForeignKey
ALTER TABLE "candidate_access" ADD CONSTRAINT "candidate_access_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_access" ADD CONSTRAINT "candidate_access_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_message" ADD CONSTRAINT "client_message_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_message" ADD CONSTRAINT "client_message_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_message" ADD CONSTRAINT "client_message_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
