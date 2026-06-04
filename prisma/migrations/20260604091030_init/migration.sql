-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('open', 'paused', 'filled');

-- CreateEnum
CREATE TYPE "Availability" AS ENUM ('available', 'on_hold', 'placed');

-- CreateEnum
CREATE TYPE "Recommendation" AS ENUM ('strong', 'possible', 'weak');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('created', 'updated', 'contacted', 'screened', 'submitted', 'interview_scheduled', 'passed', 'failed', 'placed');

-- CreateEnum
CREATE TYPE "Actor" AS ENUM ('recruiter', 'system', 'client');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "initials" TEXT,
    "country" TEXT,
    "tz" TEXT,
    "whatsapp_number" TEXT,
    "email" TEXT,
    "portal_slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill" (
    "id" TEXT NOT NULL,
    "canonical_name" TEXT NOT NULL,
    "synonyms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "release_year" INTEGER,

    CONSTRAINT "skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job" (
    "id" TEXT NOT NULL,
    "client_id" TEXT,
    "title" TEXT NOT NULL,
    "seniority" TEXT,
    "budget_min" DOUBLE PRECISION,
    "budget_max" DOUBLE PRECISION,
    "budget_unit" TEXT,
    "english_level" TEXT,
    "experience_years_min" INTEGER,
    "description_raw" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_skill" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "min_years" INTEGER,

    CONSTRAINT "job_skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "country" TEXT,
    "flag" TEXT,
    "availability" "Availability" NOT NULL DEFAULT 'available',
    "availability_note" TEXT,
    "english_level" TEXT,
    "total_years" DOUBLE PRECISION,
    "career_start_year" INTEGER,
    "salary_expectation" DOUBLE PRECISION,
    "client_rate" DOUBLE PRECISION,
    "cv_url" TEXT,
    "linkedin_url" TEXT,
    "linkedin_title" TEXT,
    "ai_summary" TEXT,
    "source" TEXT,
    "last_contacted_at" TIMESTAMP(3),
    "last_screened_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_skill" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "years" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "candidate_skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employment" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "title" TEXT,
    "full_time" BOOLEAN NOT NULL DEFAULT true,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_analysis" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "match_score" DOUBLE PRECISION NOT NULL,
    "recommendation" "Recommendation" NOT NULL DEFAULT 'possible',
    "strengths" JSONB NOT NULL DEFAULT '[]',
    "risks" JSONB NOT NULL DEFAULT '[]',
    "anomalies" JSONB NOT NULL DEFAULT '[]',
    "model_version" TEXT,
    "analyzed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_event" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "job_id" TEXT,
    "client_id" TEXT,
    "type" "EventType" NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "actor" "Actor" NOT NULL DEFAULT 'recruiter',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "job_id" TEXT,
    "timeless_meeting_id" TEXT,
    "recording_url" TEXT,
    "transcript" TEXT,
    "summary" TEXT,
    "action_items" JSONB NOT NULL DEFAULT '[]',
    "scheduled_for" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "outcome" TEXT,

    CONSTRAINT "interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "client_status" "ClientStatus" NOT NULL DEFAULT 'pending',
    "client_feedback" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "placement" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "job_id" TEXT,
    "start_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "placement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_portal_slug_key" ON "client"("portal_slug");

-- CreateIndex
CREATE UNIQUE INDEX "skill_canonical_name_key" ON "skill"("canonical_name");

-- CreateIndex
CREATE INDEX "job_client_id_idx" ON "job"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_skill_job_id_skill_id_key" ON "job_skill"("job_id", "skill_id");

-- CreateIndex
CREATE INDEX "candidate_availability_idx" ON "candidate"("availability");

-- CreateIndex
CREATE INDEX "candidate_updated_at_idx" ON "candidate"("updated_at");

-- CreateIndex
CREATE INDEX "candidate_skill_skill_id_idx" ON "candidate_skill"("skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_skill_candidate_id_skill_id_key" ON "candidate_skill"("candidate_id", "skill_id");

-- CreateIndex
CREATE INDEX "employment_candidate_id_idx" ON "employment"("candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_analysis_candidate_id_job_id_key" ON "candidate_analysis"("candidate_id", "job_id");

-- CreateIndex
CREATE INDEX "candidate_event_candidate_id_idx" ON "candidate_event"("candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_job_id_candidate_id_key" ON "submission"("job_id", "candidate_id");

-- AddForeignKey
ALTER TABLE "job" ADD CONSTRAINT "job_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_skill" ADD CONSTRAINT "job_skill_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_skill" ADD CONSTRAINT "job_skill_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_skill" ADD CONSTRAINT "candidate_skill_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_skill" ADD CONSTRAINT "candidate_skill_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment" ADD CONSTRAINT "employment_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_analysis" ADD CONSTRAINT "candidate_analysis_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_analysis" ADD CONSTRAINT "candidate_analysis_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_event" ADD CONSTRAINT "candidate_event_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_event" ADD CONSTRAINT "candidate_event_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_event" ADD CONSTRAINT "candidate_event_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview" ADD CONSTRAINT "interview_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview" ADD CONSTRAINT "interview_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission" ADD CONSTRAINT "submission_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission" ADD CONSTRAINT "submission_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission" ADD CONSTRAINT "submission_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement" ADD CONSTRAINT "placement_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement" ADD CONSTRAINT "placement_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement" ADD CONSTRAINT "placement_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
