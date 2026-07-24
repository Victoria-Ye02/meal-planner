import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    aiGenerationLog: {
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { prisma } from "../lib/db";
import {
  DAILY_GENERATION_LIMIT,
  checkRateLimit,
  recordGeneration,
} from "../lib/rateLimit";

const mockCount = prisma.aiGenerationLog.count as unknown as ReturnType<
  typeof vi.fn
>;
const mockCreate = prisma.aiGenerationLog.create as unknown as ReturnType<
  typeof vi.fn
>;

describe("checkRateLimit", () => {
  beforeEach(() => {
    mockCount.mockReset();
    mockCreate.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows the request when the user is under the daily cap", async () => {
    mockCount.mockResolvedValue(5);

    const result = await checkRateLimit("user-1");

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(DAILY_GENERATION_LIMIT - 5);
    expect(result.limit).toBe(DAILY_GENERATION_LIMIT);
  });

  it("denies the request once the user has hit the daily cap", async () => {
    mockCount.mockResolvedValue(DAILY_GENERATION_LIMIT);

    const result = await checkRateLimit("user-1");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("denies the request when the user is over the daily cap", async () => {
    mockCount.mockResolvedValue(DAILY_GENERATION_LIMIT + 3);

    const result = await checkRateLimit("user-1");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("scopes the count to the given user and a trailing 24h window", async () => {
    mockCount.mockResolvedValue(0);

    await checkRateLimit("user-42");

    expect(mockCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-42",
          createdAt: expect.objectContaining({ gte: expect.any(Date) }),
        }),
      }),
    );
  });

  it("recordGeneration creates a log row for the given user", async () => {
    mockCreate.mockResolvedValue({});

    await recordGeneration("user-7");

    expect(mockCreate).toHaveBeenCalledWith({ data: { userId: "user-7" } });
  });
});
