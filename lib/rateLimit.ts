import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";

/**
 * Simple per-user daily cap on AI recipe generation calls (see plan.md's
 * "Architecture Decisions": "simple per-user daily cap on AI generation
 * calls, e.g. 20/day/user"). Backed by the `AiGenerationLog` table: every
 * generation attempt that gets past the cap reserves one row, and the cap
 * is enforced by counting rows created in the trailing 24h window for the
 * given user.
 *
 * Deliberately just a count-and-compare against Postgres (via Prisma) —
 * no in-memory state — so the limit is correctly enforced across multiple
 * server instances/serverless invocations, not just within one process.
 */

export const DAILY_GENERATION_LIMIT = 20;
const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Postgres/Prisma error code for a serialization failure — thrown when two
 * concurrent Serializable transactions can't both be applied consistently. */
const SERIALIZATION_FAILURE_CODE = "P2034";

export interface RateLimitResult {
  allowed: boolean;
  /** Generations still available in the current 24h window (never negative). */
  remaining: number;
  /** The cap this result was evaluated against. */
  limit: number;
  /**
   * The id of the `AiGenerationLog` row reserved for this attempt, present
   * only when `allowed` is true. Callers should pass this to
   * `releaseGenerationSlot` if the generation attempt subsequently fails,
   * so failed attempts don't permanently burn the user's quota.
   */
  logId?: string;
}

/**
 * Atomically checks whether `userId` is under the daily generation cap and,
 * if so, reserves a slot by inserting a log row for this attempt — all
 * inside a single Serializable transaction.
 *
 * This must be called (and its reservation must succeed) *before* the AI
 * call is made. Counting and recording used to happen as two separate
 * steps (check before the AI call, record only after a successful one),
 * which left a window of up to ~20s (the AI call's own timeout) during
 * which any number of concurrent requests from the same user would all
 * observe the same pre-generation count and all pass, defeating the cap.
 * Doing the count-and-insert together, inside one transaction, closes
 * that race: concurrent transactions from the same user can no longer
 * both read the same "under cap" count and both insert.
 *
 * If the reserved attempt's generation subsequently fails, call
 * `releaseGenerationSlot(logId)` to roll back the reservation so only
 * successful generations count against the cap.
 *
 * On a Postgres serialization failure (conflicting concurrent Serializable
 * transactions from the same user racing this same check), this fails
 * closed — the request is treated as rate-limited rather than the error
 * bubbling up as a 500, which is the safer default for a cap that exists
 * to control cost.
 */
export async function reserveGenerationSlot(
  userId: string,
): Promise<RateLimitResult> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const windowStart = new Date(Date.now() - WINDOW_MS);

        const count = await tx.aiGenerationLog.count({
          where: {
            userId,
            createdAt: { gte: windowStart },
          },
        });

        if (count >= DAILY_GENERATION_LIMIT) {
          return {
            allowed: false,
            remaining: 0,
            limit: DAILY_GENERATION_LIMIT,
          };
        }

        const log = await tx.aiGenerationLog.create({ data: { userId } });

        return {
          allowed: true,
          remaining: Math.max(0, DAILY_GENERATION_LIMIT - count - 1),
          limit: DAILY_GENERATION_LIMIT,
          logId: log.id,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === SERIALIZATION_FAILURE_CODE
    ) {
      return { allowed: false, remaining: 0, limit: DAILY_GENERATION_LIMIT };
    }
    throw error;
  }
}

/**
 * Releases a previously reserved generation slot (e.g. because the AI call
 * that used it failed), so the attempt doesn't count against the user's
 * daily cap. Safe to call even if the row is already gone.
 */
export async function releaseGenerationSlot(logId: string): Promise<void> {
  await prisma.aiGenerationLog.deleteMany({ where: { id: logId } });
}
