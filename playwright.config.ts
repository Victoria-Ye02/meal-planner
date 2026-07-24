import { defineConfig, devices } from "@playwright/test";

/**
 * Single happy-path E2E test (see e2e/happy-path.spec.ts) against a real
 * running dev server, real Neon Postgres, and the real OpenRouter API —
 * there is no mocking layer for a true end-to-end test of this flow.
 *
 * Deliberately Chromium-only: this is a portfolio project, not a project
 * that needs a cross-browser compatibility matrix (see task-13-brief.md's
 * "Code Organization" guidance to keep this minimal).
 */
export default defineConfig({
  testDir: "./e2e",
  // Playwright owns `*.spec.ts`, Vitest owns `*.test.ts` (see
  // vitest.config.ts's `test.include`) — distinct suffixes keep each
  // runner from ever picking up the other's files.
  testMatch: "**/*.spec.ts",
  // Generous: the real AI recipe-generation call alone can take up to ~20s
  // (lib/ai/generateRecipes.ts's own REQUEST_TIMEOUT_MS), on top of
  // signup/login/navigation and the save/assign round-trips this test also
  // does against the real Neon DB.
  timeout: 120_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Starts `next dev` for the test run and tears it down after, so
  // `npm run e2e` is self-contained. `reuseExistingServer` locally means a
  // server you already have running (e.g. for manual poking around) isn't
  // killed or duplicated.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
