import { expect, type Page } from '@playwright/test'
import { E2E_PASSWORD } from './test-data'

export async function login(page: Page, email: string, password = E2E_PASSWORD) {
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
