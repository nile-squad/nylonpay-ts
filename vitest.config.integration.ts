import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    // Resolve/wait can need the full server inline budget (~60s) plus a short
    // client poll continuation under maxPollDurationMs from createTestSdk.
    testTimeout: 90_000,
    hookTimeout: 15_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    reporters: ["verbose"],
    setupFiles: ["dotenv/config"],
    globalSetup: ["tests/integration/global-setup.ts"],
  },
});
