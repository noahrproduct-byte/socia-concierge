import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Resolve the "@/..." path alias (tsconfig paths) so tests can import modules
// that use it transitively, exactly as the app does.
export default defineConfig({
  // Playwright specs (e2e/) run with `npm run test:e2e`, not vitest.
  test: { exclude: ["e2e/**", "node_modules/**", "docs/**"] },
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});
