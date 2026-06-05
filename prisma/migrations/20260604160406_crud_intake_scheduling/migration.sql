-- AlterTable
ALTER TABLE "candidate" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "availability_confirmed_at" TIMESTAMP(3),
ADD COLUMN     "cv_text" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "interview" ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "duration_mins" INTEGER,
ADD COLUMN     "meeting_provider" TEXT,
ADD COLUMN     "meeting_url" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'scheduled',
ADD COLUMN     "timezone" TEXT;

-- AlterTable
ALTER TABLE "job" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "note" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "edited_at" TIMESTAMP(3);

