-- Enable pgvector (idempotent — this was already manually enabled during
-- risk-checking for this feature; kept here so the migration history and
-- any future fresh database both stay accurate/reproducible).
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "SavedRecipe" ADD COLUMN     "embedding" vector(1536);
