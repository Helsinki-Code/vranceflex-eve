import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", ".output/**", ".eve/**"],
    // DB-backed suites truncate the same test database, so files must not run
    // in parallel when one is configured.
    fileParallelism: !process.env.TEST_DATABASE_URL,
  },
});
