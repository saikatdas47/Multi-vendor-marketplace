import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: process.env.E2E_BASE_URL || 'http://localhost:8000', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: process.env.E2E_NO_SERVER ? undefined : { command: 'cd ../backend && npm start', url: 'http://localhost:8000/health/', reuseExistingServer: true, timeout: 30_000 },
})
