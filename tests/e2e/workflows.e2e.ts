import { expect, test } from '@playwright/test'
import { expectNoHorizontalOverflow, login } from './helpers'
import { E2E_USERS } from './test-data'

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
