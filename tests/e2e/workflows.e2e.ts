import { expect, test } from '@playwright/test'
import { expectNoHorizontalOverflow, login } from './helpers'
import { E2E_PASSWORD, E2E_USERS } from './test-data'

test.describe.configure({ mode: 'serial' })

test('пользователь обновляет профиль через настройки', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Сценарий достаточно проверить один раз')
  await login(page, E2E_USERS.basic.email)
  await page.goto('/dashboard/settings')

  const nameInput = page.locator('#profile-name')
  await nameInput.fill('Тест Обновлён')
  const updateResponse = page.waitForResponse((response) =>
    response.url().endsWith('/api/me') && response.request().method() === 'PATCH'
  )
  await page.getByRole('button', { name: 'Сохранить профиль' }).click()
  await expect((await updateResponse).ok()).toBe(true)

  await page.reload()
  await expect(page.locator('#profile-name')).toHaveValue('Тест Обновлён')
  await expectNoHorizontalOverflow(page)
})

test('пользователь создаёт обращение в поддержку', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Сценарий достаточно проверить один раз')
  await login(page, E2E_USERS.basic.email)
  await page.goto('/dashboard/support')

  await expect(page.getByRole('heading', { name: 'Новое обращение' })).toBeVisible()
  await page.getByRole('button', { name: 'Оплата' }).click()
  await page.getByRole('textbox', { name: 'Сообщение' }).fill('Не проходит тестовая оплата подписки')
  await page.getByRole('button', { name: 'Отправить' }).click()

  await expect(page.getByRole('heading', { name: 'Вопрос по оплате' })).toBeVisible()
  await expect(page.getByText('Не проходит тестовая оплата подписки', { exact: true })).toHaveCount(2)
  await expectNoHorizontalOverflow(page)
})

test('главный администратор видит пользователя и новое обращение', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Сценарий достаточно проверить один раз')
  await login(page, E2E_USERS.admin.email)
  await page.goto(`/dashboard/admin/users?q=${encodeURIComponent(E2E_USERS.basic.email)}`)

  await expect(page.getByRole('heading', { name: 'Пользователи' })).toBeVisible()
  await expect(page.locator('article').filter({ hasText: E2E_USERS.basic.email })).toHaveCount(1)

  await page.goto('/dashboard/admin/support')
  await expect(page.getByRole('heading', { name: 'Вопрос по оплате' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('смена пароля сохраняет текущую сессию и отзывает остальные', async ({ browser, page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Сценарий достаточно проверить один раз')
  const newPassword = 'E2eNewPassword456'

  await login(page, E2E_USERS.basic.email)
  const previousSessionContext = await browser.newContext({
    storageState: await page.context().storageState(),
  })
  const previousSessionPage = await previousSessionContext.newPage()
  await page.goto('/dashboard/settings')
  await page.getByRole('tab', { name: /Безопасность/ }).click()
  await changePassword(page, E2E_PASSWORD, newPassword)

  await previousSessionPage.goto('/dashboard')
  await expect(previousSessionPage).toHaveURL(/\/login(?:\?|$)/)
  await previousSessionContext.close()

  await page.reload()
  await expect(page).toHaveURL(/\/dashboard\/settings(?:\?|$)/)
  await page.getByRole('tab', { name: /Безопасность/ }).click()
  await changePassword(page, newPassword, E2E_PASSWORD)

  await page.reload()
  await expect(page).toHaveURL(/\/dashboard\/settings(?:\?|$)/)
  await expectNoHorizontalOverflow(page)
})

test('пользователь отвязывает устройство с подтверждением', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Сценарий достаточно проверить один раз')
  await login(page, E2E_USERS.expired.email)
  await page.goto('/dashboard/devices')

  await expect(page.getByRole('heading', { name: 'Pixel 8 · Android' })).toBeVisible()
  await page.getByRole('button', { name: 'Отвязать' }).click()
  const dialog = page.getByRole('dialog', { name: 'Отвязать устройство?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Отвязать' }).click()

  await expect(page.getByRole('heading', { name: 'Pixel 8 · Android' })).toHaveCount(0)
  await expect(page.getByText('Устройств пока нет', { exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

async function changePassword(page: import('@playwright/test').Page, oldPassword: string, newPassword: string) {
  await page.getByLabel('Текущий пароль').fill(oldPassword)
  await page.getByLabel('Новый пароль').fill(newPassword)
  await page.getByLabel('Подтверждение').fill(newPassword)
  const response = page.waitForResponse((candidate) =>
    candidate.url().endsWith('/api/me/password') && candidate.request().method() === 'POST'
  )
  await page.getByRole('button', { name: 'Сменить пароль' }).click()
  await expect((await response).ok()).toBe(true)
  await expect(page.getByText('Пароль изменён', { exact: true })).toBeVisible()
}
