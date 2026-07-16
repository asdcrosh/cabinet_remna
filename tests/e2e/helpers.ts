import { expect, type Page } from '@playwright/test'
import { E2E_PASSWORD } from './test-data'

let loginAttemptSequence = 0

function nextLoginClientIp(page: Page) {
  loginAttemptSequence = (loginAttemptSequence % 200) + 1
  const testNetwork = (page.viewportSize()?.width ?? 1440) < 768
    ? '203.0.113'
    : '198.51.100'

  return `${testNetwork}.${20 + loginAttemptSequence}`
}

export async function login(page: Page, email: string, password = E2E_PASSWORD) {
  // Each scenario represents an independent browser client. Reusing one IP for
  // the whole suite incorrectly exhausts the real login rate limit in CI.
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': nextLoginClientIp(page) })
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/)
}

export async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth)
}
