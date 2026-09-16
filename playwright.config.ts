import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = 5173;
const API_PORT = 3001;
const isCI = Boolean(process.env.CI);

// E2E (RULE-014): la API arranca en modo e2e con almacén en memoria y seed determinista.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @asotracmet/api dev:e2e',
      url: `http://127.0.0.1:${API_PORT}/healthz`,
      reuseExistingServer: !isCI,
      timeout: 90_000,
    },
    {
      command: 'pnpm --filter @asotracmet/web dev',
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !isCI,
      timeout: 90_000,
    },
  ],
});
