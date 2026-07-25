/**
 * One-time backfill: computes and stores embeddings for every existing
 * `SavedRecipe` row that doesn't have one yet (i.e. everything saved
 * before the vector-RAG upgrade). New saves compute their own embedding
 * inline (app/api/recipes/save/route.ts) — this script only needs to run
 * once per environment to catch up pre-existing rows.
 *
 * Usage: npx tsx scripts/backfill-embeddings.ts
 */
import "dotenv/config";

import { generateEmbedding } from "../lib/ai/embeddings";
import { buildRecipeEmbeddingText } from "../lib/ai/recipeEmbeddingText";
import { prisma } from "../lib/db";
import { setSavedRecipeEmbedding } from "../lib/ai/vectorSearch";

async function main() {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      userId: string;
      recipeId: string;
      title: string;
      ingredients: string[];
      instructions: string;
    }>
  >(
    `SELECT sr."userId" AS "userId", sr."recipeId" AS "recipeId", r."title" AS "title", r."ingredients" AS "ingredients", r."instructions" AS "instructions"
     FROM "SavedRecipe" sr
     JOIN "Recipe" r ON r."id" = sr."recipeId"
     WHERE sr."embedding" IS NULL`,
  );

  console.log(`Found ${rows.length} saved recipe(s) without an embedding.`);

  let succeeded = 0;
  let failed = 0;

  for (const row of rows) {
    const text = buildRecipeEmbeddingText({
      title: row.title,
      ingredients: row.ingredients,
      instructions: row.instructions,
    });

    const result = await generateEmbedding(text);
    if (!result.success) {
      failed += 1;
      console.error(
        `  FAILED  userId=${row.userId} recipeId=${row.recipeId} title=${JSON.stringify(row.title)} — ${result.error}`,
      );
      continue;
    }

    await setSavedRecipeEmbedding({
      userId: row.userId,
      recipeId: row.recipeId,
      embedding: result.embedding,
    });
    succeeded += 1;
    console.log(
      `  OK      userId=${row.userId} recipeId=${row.recipeId} title=${JSON.stringify(row.title)}`,
    );
  }

  console.log(
    `\nBackfill complete: ${succeeded} succeeded, ${failed} failed, ${rows.length} total.`,
  );
  if (failed > 0) {
    console.log(
      "Re-run this script to retry failed rows (they still have a NULL embedding).",
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Backfill script crashed:", err);
    process.exit(1);
  });
