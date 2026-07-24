import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(),
    aiGenerationLog: {
      count: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { Prisma } from "../app/generated/prisma/client";
import { prisma } from "../lib/db";
import {
  DAILY_GENERATION_LIMIT,
  releaseGenerationSlot,
  reserveGenerationSlot,
} from "../lib/rateLimit";

const mockTransaction = prisma.$transaction as unknown as ReturnType<
  typeof vi.fn
>;
const mockDeleteMany = prisma.aiGenerationLog.deleteMany as unknown as ReturnType<
  typeof vi.fn
>;

/**
 * `reserveGenerationSlot` runs its logic inside `prisma.$transaction(fn,
 * options)`. To unit-test it without a real database, we stub
 * `$transaction` to just invoke `fn` with a fake `tx` client backed by the
 * given `count`/`create` mocks, and assert the `options.isolationLevel`
 * that was requested.
 */
function stubTransaction({
  count,
  create,
}: {
  count: number;
  create?: (data: { userId: string }) => { id: string };
}) {
  const txCount = vi.fn().mockResolvedValue(count);
  const txCreate = vi
    .fn()
    .mockImplementation(async ({ data }: { data: { userId: string } }) =>
      create ? create(data) : { id: "log-1", ...data },
    );

  mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      aiGenerationLog: { count: txCount, create: txCreate },
    }),
  );

  return { txCount, txCreate };
}

describe("reserveGenerationSlot", () => {
  beforeEach(() => {
    mockTransaction.mockReset();
    mockDeleteMany.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows and reserves a slot when the user is under the daily cap", async () => {
    const { txCreate } = stubTransaction({ count: 5 });

    const result = await reserveGenerationSlot("user-1");

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(DAILY_GENERATION_LIMIT - 6);
    expect(result.limit).toBe(DAILY_GENERATION_LIMIT);
    expect(result.logId).toBe("log-1");
    expect(txCreate).toHaveBeenCalledWith({ data: { userId: "user-1" } });
  });

  it("runs the count-and-insert inside a Serializable transaction", async () => {
    stubTransaction({ count: 0 });

    await reserveGenerationSlot("user-1");

    expect(mockTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }),
    );
  });

  it("denies the request once the user has hit the daily cap, without inserting", async () => {
    const { txCreate } = stubTransaction({ count: DAILY_GENERATION_LIMIT });

    const result = await reserveGenerationSlot("user-1");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.logId).toBeUndefined();
    expect(txCreate).not.toHaveBeenCalled();
  });

  it("denies the request when the user is over the daily cap", async () => {
    stubTransaction({ count: DAILY_GENERATION_LIMIT + 3 });

    const result = await reserveGenerationSlot("user-1");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("fails closed (treated as rate-limited) on a Postgres serialization failure from a concurrent conflicting transaction", async () => {
    const serializationError = Object.assign(
      Object.create(Prisma.PrismaClientKnownRequestError.prototype),
      { code: "P2034", message: "Transaction failed due to a write conflict." },
    );
    mockTransaction.mockRejectedValue(serializationError);

    const result = await reserveGenerationSlot("user-1");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.limit).toBe(DAILY_GENERATION_LIMIT);
  });

  it("re-throws non-serialization errors instead of silently rate-limiting", async () => {
    mockTransaction.mockRejectedValue(new Error("connection refused"));

    await expect(reserveGenerationSlot("user-1")).rejects.toThrow(
      "connection refused",
    );
  });
});

describe("releaseGenerationSlot", () => {
  beforeEach(() => {
    mockDeleteMany.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deletes the reserved log row by id", async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 });

    await releaseGenerationSlot("log-1");

    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: "log-1" } });
  });
});
