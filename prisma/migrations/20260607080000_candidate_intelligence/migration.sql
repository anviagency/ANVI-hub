-- CreateTable
CREATE TABLE "candidate_intelligence" (
    "candidate_id" TEXT NOT NULL,
    "languages" JSONB NOT NULL DEFAULT '[]',
    "frameworks" JSONB NOT NULL DEFAULT '[]',
    "databases" JSONB NOT NULL DEFAULT '[]',
    "cloud_providers" JSONB NOT NULL DEFAULT '[]',
    "devops_tools" JSONB NOT NULL DEFAULT '[]',
    "aiml_tools" JSONB NOT NULL DEFAULT '[]',
    "architecture_exp" JSONB NOT NULL DEFAULT '[]',
    "industries" JSONB NOT NULL DEFAULT '[]',
    "domains" JSONB NOT NULL DEFAULT '[]',
    "company_sizes" JSONB NOT NULL DEFAULT '[]',
    "startup_exp" BOOLEAN NOT NULL DEFAULT false,
    "enterprise_exp" BOOLEAN NOT NULL DEFAULT false,
    "consulting_exp" BOOLEAN NOT NULL DEFAULT false,
    "team_leadership" BOOLEAN NOT NULL DEFAULT false,
    "management_years" DOUBLE PRECISION,
    "hiring_exp" BOOLEAN NOT NULL DEFAULT false,
    "mentoring_exp" BOOLEAN NOT NULL DEFAULT false,
    "max_team_size" INTEGER,
    "spoken_languages" JSONB NOT NULL DEFAULT '[]',
    "written_languages" JSONB NOT NULL DEFAULT '[]',
    "english_confidence" INTEGER,
    "communication_confidence" INTEGER,
    "city" TEXT,
    "timezone" TEXT,
    "relocation_willing" BOOLEAN,
    "remote_experience" BOOLEAN NOT NULL DEFAULT false,
    "avg_tenure_months" INTEGER,
    "stability_score" INTEGER,
    "job_hopping" BOOLEAN NOT NULL DEFAULT false,
    "employment_gaps" JSONB NOT NULL DEFAULT '[]',
    "education" JSONB NOT NULL DEFAULT '[]',
    "certifications" JSONB NOT NULL DEFAULT '[]',
    "military_exp" BOOLEAN NOT NULL DEFAULT false,
    "model_version" TEXT,
    "confidence" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'deterministic',
    "raw" JSONB NOT NULL DEFAULT '{}',
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_intelligence_pkey" PRIMARY KEY ("candidate_id")
);

-- AddForeignKey
ALTER TABLE "candidate_intelligence" ADD CONSTRAINT "candidate_intelligence_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

