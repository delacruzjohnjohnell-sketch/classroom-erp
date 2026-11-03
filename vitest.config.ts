// Vitest runs the BFAR and BIR Lab tests; the other editions keep their node:test suites under tests/.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The "@/..." alias the app uses, so components that import "@/lib/..." can be rendered in tests.
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  esbuild: { jsx: "automatic" },
  test: {
    include: ["src/bfar/**/*.test.ts", "src/birlab/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
