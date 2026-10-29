import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/offline.spec.ts',
  timeout: 60000,
  expect: { timeout: 20000 },
  use: {
    baseURL: 'http://127.0.0.1:5175/nearby-lifers/',
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command:
      'GITHUB_PAGES=true npm run preview -- --host 127.0.0.1 --port 5175 --strictPort',
    url: 'http://127.0.0.1:5175/nearby-lifers/',
    reuseExistingServer: false,
  },
  workers: 2,
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
})
