import { defineConfig, devices } from '@playwright/test';

/** A production build, with its service worker */
const PWA_URL = 'http://localhost:4173';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
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
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
    },
    {
      // Served at the root, as the dev server is, so the same steps apply
      command:
        'npx vite build --base / --outDir dist-e2e --emptyOutDir && ' +
        'npx vite preview --base / --outDir dist-e2e --port 4173 --strictPort',
      url: PWA_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 300000,
    },
  ],
});
