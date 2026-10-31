import { defineConfig, devices } from '@playwright/test';

// Ports come from the environment so several checkouts can run E2E at once
const DEV_PORT = Number(process.env.E2E_DEV_PORT ?? 5173);
const PWA_PORT = Number(process.env.E2E_PWA_PORT ?? 4173);
const DEV_URL = `http://localhost:${DEV_PORT}`;

/** A production build, with its service worker */
const PWA_URL = `http://localhost:${PWA_PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: DEV_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: 'pwa/**',
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: 'pwa/**',
    },
    // The service worker only runs in a production build
    {
      name: 'pwa-chromium',
      use: { ...devices['Desktop Chrome'], baseURL: PWA_URL },
      testMatch: 'pwa/**/*.spec.ts',
    },
    {
      name: 'pwa-firefox',
      use: { ...devices['Desktop Firefox'], baseURL: PWA_URL },
      testMatch: 'pwa/**/*.spec.ts',
    },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],
  webServer: [
    {
      command: `npx vite --port ${DEV_PORT} --strictPort`,
      url: DEV_URL,
      reuseExistingServer: !process.env.CI,
    },
    {
      // Served at the root, as the dev server is, so the same steps apply
      command:
        'npx vite build --base / --outDir dist-e2e --emptyOutDir && ' +
        'npx vite preview --base / --outDir dist-e2e --port ' +
        PWA_PORT +
        ' --strictPort',
      url: PWA_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 300000,
    },
  ],
});
