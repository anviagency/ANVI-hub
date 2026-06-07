-- AlterTable
ALTER TABLE "candidate_analysis" ADD COLUMN     "approval_probability" DOUBLE PRECISION,
ADD COLUMN     "engine_source" TEXT NOT NULL DEFAULT 'deterministic',
ADD COLUMN     "fit_breakdown" JSONB,
ADD COLUMN     "reasoning" TEXT,
ADD COLUMN     "retention_probability" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "job_intelligence" (
    "job_id" TEXT NOT NULL,
    "must_have" JSONB NOT NULL DEFAULT '[]',
    "nice_to_have" JSONB NOT NULL DEFAULT '[]',
    "inferred_industries" JSONB NOT NULL DEFAULT '[]',
    "culture_signals" JSONB NOT NULL DEFAULT '[]',
    "seniority_signal" TEXT,
    "summary" TEXT,
    "model_version" TEXT,
    "source" TEXT NOT NULL DEFAULT 'deterministic',
    "raw" JSONB NOT NULL DEFAULT '{}',
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_intelligence_pkey" PRIMARY KEY ("job_id")
);

-- AddForeignKey
ALTER TABLE "job_intelligence" ADD CONSTRAINT "job_intelligence_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

