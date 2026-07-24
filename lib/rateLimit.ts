import { prisma } from "@/lib/db";

/**
 * Simple per-user daily cap on AI recipe generation calls (see plan.md's
 * "Architecture Decisions": "simple per-user daily cap on AI generation
 * calls, e.g. 20/day/user"). Backed by the `AiGenerationLog` table: every
 * successful generation is expected to record one row, and this check
 * counts rows created in the trailing 24h window for the given user.
 *
 * Deliberately just a count-and-compare against Postgres (via Prisma) —
 * no in-memory state — so the limit is correctly enforced across multiple
 * server instances/serverless invocations, not just within one process.
 */

export const DAILY_GENERATION_LIMIT = 20;
const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface RateLimitResult {
  allowed: boolean;
  /** Generations still available in the current 24h window (never negative). */
  remaining: number;
  /** The cap this result was evaluated against. */
  limit: number;
}

/**
 * Checks (without recording) whether `userId` is currently under the daily
 * generation cap. Callers should only call `recordGeneration` after a
 * generation actually succeeds, so failed/aborted attempts don't count
 * against the user's limit.
 */
export async function checkRateLimit(userId: string): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - WINDOW_MS);

  const count = await prisma.aiGenerationLog.count({
    where: {
      userId,
      createdAt: { gte: windowStart },
    },
  });

  const remaining = Math.max(0, DAILY_GENERATION_LIMIT - count);
  return {
    allowed: count < DAILY_GENERATION_LIMIT,
    remaining,
    limit: DAILY_GENERATION_LIMIT,
  };
}

/** Records one AI generation call against `userId`'s daily count. */
export async function recordGeneration(userId: string): Promise<void> {
  await prisma.aiGenerationLog.create({ data: { userId } });
}
