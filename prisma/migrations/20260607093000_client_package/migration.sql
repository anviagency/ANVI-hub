-- CreateTable
CREATE TABLE "client_package" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "client_id" TEXT,
    "title" TEXT,
    "branding" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'ready',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_package_item" (
    "id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "client_package_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_package_token_key" ON "client_package"("token");

-- CreateIndex
CREATE INDEX "client_package_job_id_idx" ON "client_package"("job_id");

-- AddForeignKey
ALTER TABLE "client_package" ADD CONSTRAINT "client_package_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_package_item" ADD CONSTRAINT "client_package_item_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "client_package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

