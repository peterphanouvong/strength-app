import { defineConfig, devices } from '@playwright/test';

// Tests run against the production build. Run `npm run build` first (the gate does),
// then this config serves dist/ via vite preview. PW_PORT lets parallel worktrees
// avoid port collisions.
const PORT = Number(process.env.PW_PORT || 4173);

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: true,
  retries: 1,
  workers: 4,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: devices['iPhone 13'].userAgent,
  },
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
