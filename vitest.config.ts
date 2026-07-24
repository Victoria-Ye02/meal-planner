import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirrors tsconfig.json's "@/*" -> "./*" path mapping so route handlers
    // and lib modules that import via the "@/" alias (as Next.js resolves
    // it at runtime) can be imported directly in tests.
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    // Vitest and Playwright each own a distinct suffix so `npm test` never
    // picks up `e2e/**/*.spec.ts` (Playwright) and `playwright test` never
    // picks up these `*.test.ts` files.
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Vitest instruments every file matching `include`, even ones no
      // test imports — a file with zero tests (e.g. a forgotten route
      // handler) shows up as 0% instead of being silently absent from the
      // report, which would hide exactly the gap this task exists to find.
      include: ["lib/**/*.ts", "app/api/**/*.ts"],
      exclude: [
        // Prisma-generated client code — not hand-written, not ours to
        // cover.
        "app/generated/**",
        // Type re-exports only (`export type Foo = z.infer<...>`), no
        // executable logic to cover.
        "lib/**/*.d.ts",
      ],
    },
  },
});
