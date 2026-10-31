import { defineConfig } from "@playwright/test";

// End-to-end tests for the student flows. They are NOT part of `npm test` (which runs the fast unit tests in tests/).
// Run them against a deployed or local site with a test student that already belongs to an AIS company with a practice set assigned:
//   E2E_BASE_URL=https://classroom-erp.vercel.app E2E_EMAIL=student@example.com E2E_PASSWORD=... npx playwright test
// Without those variables every test is skipped. Never put real passwords in this file.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure", screenshot: "only-on-failure" },
  reporter: [["list"]],
});
