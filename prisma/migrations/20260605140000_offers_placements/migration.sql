-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('draft', 'sent', 'accepted', 'declined', 'withdrawn');

-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'offer_extended';
ALTER TYPE "EventType" ADD VALUE 'offer_accepted';
ALTER TYPE "EventType" ADD VALUE 'offer_declined';
ALTER TYPE "EventType" ADD VALUE 'offer_withdrawn';

-- AlterEnum
ALTER TYPE "PipelineStage" ADD VALUE 'offer';

-- AlterTable
ALTER TABLE "placement" ADD COLUMN     "client_rate" DOUBLE PRECISION,
ADD COLUMN     "end_date" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "offer_id" TEXT,
ADD COLUMN     "onboarding_status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "title" TEXT;

-- AlterTable: backfill updated_at for any existing rows, then drop the default so
-- the column is purely app-managed (@updatedAt) to match the Prisma datamodel.
ALTER TABLE "placement" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "placement" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "offer" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'sent',
    "client_rate" DOUBLE PRECISION,
    "salary" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "start_date" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "notes" TEXT,
    "decline_reason" TEXT,
    "created_by" TEXT,
    "sent_at" TIMESTAMP(3),
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "offer_candidate_id_idx" ON "offer"("candidate_id");

-- CreateIndex
CREATE INDEX "offer_job_id_idx" ON "offer"("job_id");

-- CreateIndex
CREATE INDEX "offer_client_id_idx" ON "offer"("client_id");

-- CreateIndex
CREATE INDEX "offer_status_idx" ON "offer"("status");

-- CreateIndex
CREATE UNIQUE INDEX "placement_offer_id_key" ON "placement"("offer_id");

-- CreateIndex
CREATE INDEX "placement_client_id_idx" ON "placement"("client_id");

-- CreateIndex
CREATE INDEX "placement_status_idx" ON "placement"("status");

-- AddForeignKey
ALTER TABLE "offer" ADD CONSTRAINT "offer_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer" ADD CONSTRAINT "offer_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer" ADD CONSTRAINT "offer_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement" ADD CONSTRAINT "placement_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
