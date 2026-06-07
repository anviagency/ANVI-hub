-- CreateTable
CREATE TABLE "client_insight" (
    "client_id" TEXT NOT NULL,
    "approved_count" INTEGER NOT NULL DEFAULT 0,
    "rejected_count" INTEGER NOT NULL DEFAULT 0,
    "budget_ceiling_observed" DOUBLE PRECISION,
    "rejects_above_rate" DOUBLE PRECISION,
    "preferred_countries" JSONB NOT NULL DEFAULT '[]',
    "english_floor" TEXT,
    "trait_weights" JSONB NOT NULL DEFAULT '{}',
    "preferences" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT,
    "approval_rate" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'deterministic',
    "model_version" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_insight_pkey" PRIMARY KEY ("client_id")
);

-- AddForeignKey
ALTER TABLE "client_insight" ADD CONSTRAINT "client_insight_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

