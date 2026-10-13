import { defineConfig, devices } from "@playwright/test";

/*
 * End-to-end tests against Monad testnet. Each run makes throwaway wallets, funds them from
 * E2E_FUNDER_PRIVATE_KEY (frontend/.env.e2e), and logs them in through Privy with a mock injected wallet.
 * Run: npx playwright test (starts `npm run dev` unless one is already on port 3000).
 */
export default defineConfig({
  testDir: "./e2e",
  // One chain, real transactions: run the flow in order, one test at a time
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 10 * 60_000,
  expect: { timeout: 60_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
