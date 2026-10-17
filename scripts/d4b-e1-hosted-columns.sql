-- D4b + E1 hosted-DB columns — additive, nullable, idempotent.
-- Equivalent to what `prisma db push` would execute for the two structural
-- changes shipped in bb263e5 (tokenEncrypted) and 1f138ec (Candidate.accountId).
-- All existing rows keep NULL in the new columns; Postgres unique indexes
-- allow multiple NULLs, so the unique index cannot fail on current data.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'ReferenceRequest' AND column_name = 'tokenEncrypted') THEN
    ALTER TABLE "ReferenceRequest" ADD COLUMN "tokenEncrypted" TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'Candidate' AND column_name = 'accountId') THEN
    ALTER TABLE "Candidate" ADD COLUMN "accountId" TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Candidate_accountId_key') THEN
    CREATE UNIQUE INDEX "Candidate_accountId_key" ON "Candidate"("accountId");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'Candidate_accountId_fkey' AND table_name = 'Candidate') THEN
    ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_accountId_fkey"
      FOREIGN KEY ("accountId") REFERENCES "ChecklistAccount"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
