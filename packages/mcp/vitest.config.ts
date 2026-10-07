import { defineConfig } from "vitest/config";

// Golden tests live in tests/golden/mcp (frozen, AGENTS.md rule 3).
export default defineConfig({
  test: {
    include: ["../../tests/golden/mcp/**/*.test.ts", "../../tests/adversarial/mcp/**/*.test.ts"],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
