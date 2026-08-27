import { expect, test } from '@playwright/test'
import { expectNoHorizontalOverflow, login } from './helpers'
import { E2E_PASSWORD, E2E_USERS } from './test-data'

test.describe.configure({ mode: 'serial' })

test('пользователь обновляет профиль через настройки', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Сценарий достаточно проверить один раз')
  await login(page, E2E_USERS.basic.email)
  await page.goto('/dashboard/settings')

  const nameInput = page.locator('#profile-name')
  await expect(nameInput).toHaveCount(1)
  await expect(nameInput).toBeEnabled()
  const updatedName = await nameInput.inputValue() === 'Тест Обновлён'
    ? 'E2E Пользователь'
    : 'Тест Обновлён'
  await nameInput.fill(updatedName)
  const updateResponse = page.waitForResponse((response) =>
    response.url().endsWith('/api/me') && response.request().method() === 'PATCH'
  )
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect((await updateResponse).ok()).toBe(true)
  await expect(page.getByText('Профиль обновлён', { exact: true })).toBeVisible()

  await page.reload()
  const persistedNameInput = page.locator('#profile-name')
  await expect(persistedNameInput).toHaveCount(1)
  await expect(persistedNameInput).toHaveValue(updatedName)
  await expectNoHorizontalOverflow(page)
})

test('пользователь создаёт обращение в поддержку', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Сценарий достаточно проверить один раз')
  await login(page, E2E_USERS.basic.email)
  await page.goto('/dashboard/support')

  await expect(page.getByRole('heading', { name: 'Чем можем помочь?' })).toBeVisible()
  await page.getByRole('button', { name: /Новое обращение/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Новое обращение' })).toBeVisible()
  await page.getByRole('button', { name: 'Оплата' }).click()
  await page.getByRole('textbox', { name: 'Сообщение' }).fill('Не проходит тестовая оплата подписки')
  await page.getByRole('button', { name: 'Отправить обращение' }).click()

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
  const clientButton = page.getByRole('button', { name: 'Клиент', exact: true })
  await expect(clientButton).toBeVisible()
  await clientButton.click()
  const clientPanel = page.locator('aside').filter({ hasText: 'Контекст обращения' }).first()
  await expect(clientPanel).toBeVisible()
  await expect(clientPanel.getByText(E2E_USERS.basic.email, { exact: true })).toBeVisible()
  await clientPanel.getByRole('button', { name: 'Закрыть данные клиента' }).click()
  await expect(clientPanel).toBeHidden()
  await expectNoHorizontalOverflow(page)
})

test('поддержка удобна пользователю и администратору на телефоне', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Сценарий нужен для мобильного проекта')
  const message = 'На телефоне не получается добавить новое устройство'

  await login(page, E2E_USERS.basic.email)
  await page.goto('/dashboard/support')

  await expect(page.getByRole('heading', { name: 'Чем можем помочь?' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.getByRole('button', { name: /Новое обращение/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Новое обращение' })).toBeVisible()
  await page.getByRole('button', { name: 'Устройства' }).click()
  await page.getByRole('textbox', { name: 'Сообщение' }).fill(message)
  await expectNoHorizontalOverflow(page)
  await page.getByRole('button', { name: 'Отправить обращение' }).click()

  await expect(page.getByRole('heading', { name: 'Вопрос по устройствам' })).toBeVisible()
  await expect(page.getByText(message, { exact: true }).last()).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await page.context().clearCookies()
  await login(page, E2E_USERS.admin.email)
  await page.goto('/dashboard/admin/support')

  await expect(page.getByText('Рабочая очередь', { exact: true })).toBeVisible()
  const ticketButton = page.getByRole('button').filter({ hasText: message }).first()
  await expect(ticketButton).toBeVisible()
  await ticketButton.click()
  await expect(page.getByRole('heading', { name: 'Вопрос по устройствам' })).toBeVisible()
  await page.getByRole('button', { name: 'Клиент', exact: true }).click()
  const clientPanel = page.locator('aside').filter({ hasText: 'Контекст обращения' }).first()
  await expect(clientPanel).toBeVisible()
  await expect(clientPanel.getByText(E2E_USERS.basic.email, { exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('смена пароля сохраняет текущую сессию и отзывает остальные', async ({ browser, page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Сценарий достаточно проверить один раз')
  test.setTimeout(process.env.CI ? 120_000 : 60_000)
  const newPassword = 'E2eNewPassword456'

  await login(page, E2E_USERS.password.email)
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

test('пользователь блокирует устройство с подтверждением', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Сценарий достаточно проверить один раз')
  await login(page, E2E_USERS.active.email)
  await page.goto('/dashboard/devices')

  await expect(page.getByRole('heading', { name: 'Pixel 8 · Android' })).toBeVisible()
  await page.getByRole('button', { name: 'Блокировать', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Заблокировать устройство?' })
  await expect(dialog).toBeVisible()
  const blockResponse = page.waitForResponse((response) =>
    response.url().includes('/api/devices/') && response.request().method() === 'DELETE'
  )
  await dialog.getByRole('button', { name: 'Заблокировать', exact: true }).click()
  await expect((await blockResponse).ok()).toBe(true)

  await expect(page.getByRole('heading', { name: 'Pixel 8 · Android' })).toHaveCount(0)
  await expect(page.getByText('Активных устройств нет.', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Заблокированные' })).toBeVisible()
  await expect(page.getByText('Pixel 8 · Android', { exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

async function changePassword(page: import('@playwright/test').Page, oldPassword: string, newPassword: string) {
  await page.getByLabel('Текущий пароль').fill(oldPassword)
  await page.getByLabel('Новый пароль').fill(newPassword)
  await page.getByLabel('Повторите пароль').fill(newPassword)
  const response = page.waitForResponse((candidate) =>
    candidate.url().endsWith('/api/me/password') && candidate.request().method() === 'POST'
  )
  await page.getByRole('button', { name: 'Сменить пароль' }).click()
  await expect((await response).ok()).toBe(true)
  await expect(page.getByText('Пароль изменён', { exact: true })).toBeVisible()
}
