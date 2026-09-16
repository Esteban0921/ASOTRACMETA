import { defineConfig, devices } from '@playwright/test';

// Puertos propios de e2e: así los tests conviven con `pnpm dev` (5173 / 3001) sin reutilizar
// por error un servidor que no está en modo e2e y no expone el reset.
const WEB_PORT = 5273;
const API_PORT = 3101;
const API_URL = `http://127.0.0.1:${API_PORT}`;
const isCI = Boolean(process.env.CI);

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
      // Almacén en memoria con seed determinista y endpoint de reset.
      command: 'pnpm --filter @asotracmet/api dev:e2e',
      env: { PORT: String(API_PORT), LOG_LEVEL: 'warn', WEB_URL: `http://localhost:${WEB_PORT}` },
      url: `${API_URL}/healthz`,
      reuseExistingServer: !isCI,
      timeout: 90_000,
    },
    {
      command: 'pnpm --filter @asotracmet/web dev:e2e',
      env: { API_URL },
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !isCI,
      timeout: 90_000,
    },
  ],
});
