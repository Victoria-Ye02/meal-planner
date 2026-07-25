import { prisma } from "@/lib/db";

/**
 * Raw-SQL pgvector access for `SavedRecipe.embedding`. Prisma's schema DSL
 * has no native vector scalar (the column is declared `Unsupported("vector(1536)")`
 * in schema.prisma), so both writing and querying it must go through
 * `$executeRawUnsafe`/`$queryRawUnsafe` rather than the generated Prisma
 * Client API.
 *
 * Safety note: "Unsafe" here means Prisma does not auto-parameterize the
 * SQL text for us — it does NOT mean raw values are ever concatenated into
 * the query string. Every value below is passed as a `$1`/`$2`/... bind
 * parameter, exactly like a parameterized query in any other driver, which
 * is what actually prevents SQL injection. The embedding vector itself is
 * passed as a single string parameter (pgvector's textual input format,
 * `[0.1,0.2,...]`) and cast with `::vector` in the query — this is the
 * standard pattern for using pgvector through a client with no native
 * vector type, not a shortcut around parameterization.
 */

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/** Writes (or overwrites) the embedding for one user's saved recipe. */
export async function setSavedRecipeEmbedding({
  userId,
  recipeId,
  embedding,
}: {
  userId: string;
  recipeId: string;
  embedding: number[];
}): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "SavedRecipe" SET embedding = $1::vector WHERE "userId" = $2 AND "recipeId" = $3`,
    toVectorLiteral(embedding),
    userId,
    recipeId,
  );
}

export interface SimilarSavedRecipe {
  recipeId: string;
  title: string;
  ingredients: string[];
  instructions: string;
}

/**
 * Returns the `limit` saved recipes (for `userId`) whose embedding is
 * closest to `queryEmbedding` by cosine distance (pgvector's `<=>`
 * operator — smaller is more similar). Rows with no embedding yet
 * (pre-backfill, or a save that raced the embedding write) are excluded
 * rather than sorted arbitrarily.
 */
export async function findSimilarSavedRecipes({
  userId,
  queryEmbedding,
  limit,
}: {
  userId: string;
  queryEmbedding: number[];
  limit: number;
}): Promise<SimilarSavedRecipe[]> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      recipeId: string;
      title: string;
      ingredients: string[];
      instructions: string;
      distance: number;
    }>
  >(
    `SELECT sr."recipeId" AS "recipeId", r."title" AS "title", r."ingredients" AS "ingredients", r."instructions" AS "instructions", (sr."embedding" <=> $1::vector) AS "distance"
     FROM "SavedRecipe" sr
     JOIN "Recipe" r ON r."id" = sr."recipeId"
     WHERE sr."userId" = $2 AND sr."embedding" IS NOT NULL
     ORDER BY sr."embedding" <=> $1::vector
     LIMIT $3`,
    toVectorLiteral(queryEmbedding),
    userId,
    limit,
  );

  return rows.map(({ recipeId, title, ingredients, instructions }) => ({
    recipeId,
    title,
    ingredients,
    instructions,
  }));
}
