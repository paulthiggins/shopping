import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4182", trace: "retain-on-failure" },
  webServer: {
    command:
      "SERVE_DIST=1 PORT=4182 CREATE_LIMIT=1000 DB_PATH=data/browser-tests.sqlite node server/index.ts",
    url: "http://127.0.0.1:4182/healthz",
    reuseExistingServer: false,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
});
