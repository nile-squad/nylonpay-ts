import { defineConfig } from "vitest/config";

// The canonical security suite (S1–S13) runs as its own gate, separate from the
// default unit run. It is fully mocked — no network, no backend, no env. It
// imports SDK internals from `src/` (not `dist/`) because the cryptographic
// surface it exercises is not all public API.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/security/**/*.test.ts"],
  },
});
