import { defineConfig, devices } from "@playwright/test";

// End-to-end QA sweep (docs/qa/bug-report.md). Runs against a dev server that
// is already up (QA_BASE_URL, default http://localhost:3006) so the same run
// can point at a local test backend or a Vercel preview. Desktop and phone
// widths are separate projects; every spec runs in both.
//
//   npx playwright test                 # both widths
//   npx playwright test --project=mobile
//   QA_CHROMIUM=/path/to/chrome npx playwright test   # a browser you already have
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./docs/qa/sweep/artifacts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["json", { outputFile: "docs/qa/sweep/results.json" }]],
  use: {
    baseURL: process.env.QA_BASE_URL || "http://localhost:3006",
    trace: "retain-on-failure",
    launchOptions: process.env.QA_CHROMIUM ? { executablePath: process.env.QA_CHROMIUM } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 } },
  ],
});
