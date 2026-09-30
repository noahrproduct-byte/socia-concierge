import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Resolve the "@/..." path alias (tsconfig paths) so tests can import modules
// that use it transitively, exactly as the app does.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});
