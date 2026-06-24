import { defineConfig, devices } from "@playwright/test";

// E2E config for the UI regression guard. Runs the app in DEMO mode (no Supabase
// env) so the signed-in console renders without a backend, then drives it with a
// real browser. See tests/e2e/.
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    // Local runs can point at a pre-downloaded browser via PW_CHROME; in CI the
    // browser is installed by `playwright install` and this stays undefined.
    launchOptions: process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx next dev -p 3100",
    url: "http://127.0.0.1:3100/dashboard",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
