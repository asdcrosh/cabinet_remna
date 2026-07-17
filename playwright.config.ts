import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000'
const usesExternalServer = Boolean(process.env.PLAYWRIGHT_TEST_BASE_URL)
const testClientIp = {
  desktop: '198.51.100.10',
  mobile: '198.51.100.11',
} as const

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
        extraHTTPHeaders: { 'x-forwarded-for': testClientIp.desktop },
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
        extraHTTPHeaders: { 'x-forwarded-for': testClientIp.mobile },
      },
    },
  ],
  webServer: usesExternalServer
    ? undefined
    : [
        {
          name: 'Remnawave mock',
          command: 'node tests/e2e/mock-remnawave.mjs',
          url: 'http://127.0.0.1:4010/health',
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
        },
        {
          name: 'Cabinet',
          command: 'npm run dev',
          url: `${baseURL}/login`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            APP_URL: baseURL,
            NEXT_PUBLIC_APP_URL: baseURL,
            ALLOWED_ORIGINS: baseURL,
            TRUSTED_PROXY_HEADERS: 'true',
            REMNAWAVE_BASE_URL: 'http://127.0.0.1:4010',
            REMNAWAVE_TOKEN: 'e2e-token',
            YOOKASSA_SHOP_ID: 'e2e-shop',
            YOOKASSA_SECRET_KEY: 'e2e-secret',
            PAYANYWAY_ENABLED: 'true',
            PAYANYWAY_MNT_ID: '12345678',
            PAYANYWAY_INTEGRITY_CODE: 'e2e-payanyway-integrity-code-32-characters',
            PAYANYWAY_TEST_MODE: 'true',
          },
        },
      ],
})
