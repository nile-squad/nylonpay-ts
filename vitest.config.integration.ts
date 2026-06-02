import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 15_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    reporters: ["verbose"],
    env: loadEnv("integration", process.cwd(), ""),
  },
});
