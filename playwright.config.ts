import { defineConfig } from '@playwright/test'
export default defineConfig({
  globalSetup: './tests/browser/require-local-ui.ts',
  testDir: './tests/browser', fullyParallel: false, workers: 1, timeout: 180000,
  expect: { timeout: 15000 }, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5173', browserName: 'chromium', channel: 'msedge', headless: true, trace: 'off', screenshot: 'off', video: 'off' },
  webServer: { command: 'npm.cmd run dev:local', url: 'http://127.0.0.1:5173', reuseExistingServer: true, timeout: 60000 },
})
