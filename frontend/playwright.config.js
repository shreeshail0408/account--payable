import { defineConfig, devices } from "@playwright/test";

/*
 * End-to-end tests. `npm run test:e2e` starts an isolated backend on a throwaway PostgreSQL
 * database (e2e/start-backend.sh drops and recreates `ap_e2e`) and a Vite dev server pointed at it.
 * Your dev database and the servers on :8000/:5173 are never used.
 */
const API_PORT = process.env.E2E_API_PORT || "8020";
const WEB_PORT = process.env.E2E_WEB_PORT || "5190";
const BASE_URL = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  // One backend, shared data and a per-user rate limit: run serially.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { outputFolder: "e2e/.report", open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: "setup", testMatch: /setup\.js$/ },
    { name: "smoke", testMatch: /smoke\.spec\.js$/, dependencies: ["setup"] },
    { name: "a11y", testMatch: /a11y\.spec\.js$/, dependencies: ["setup"] },
    // Runs after the smoke flow so pages have invoices, approvals and payments to show.
    { name: "screenshots", testMatch: /screenshots\.spec\.js$/, dependencies: ["smoke"] },
  ],
  webServer: [
    {
      command: "bash e2e/start-backend.sh",
      url: `http://127.0.0.1:${API_PORT}/api/schema/`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { E2E_API_PORT: API_PORT, E2E_WEB_PORT: WEB_PORT },
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: BASE_URL,
      timeout: 60_000,
      reuseExistingServer: false,
      env: { VITE_API_URL: `http://localhost:${API_PORT}/api` },
    },
  ],
});
