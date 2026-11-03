// Vitest runs only the BFAR module's tests; the other editions keep their node:test suites under tests/.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/bfar/**/*.test.ts"],
    environment: "node",
  },
});
