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
    include: ["tests/**/*.test.ts"],
  },
});
