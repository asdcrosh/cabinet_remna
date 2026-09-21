import { expect, test } from '@playwright/test'
import { expectNoHorizontalOverflow, login } from './helpers'
import { E2E_PASSWORD, E2E_USERS } from './test-data'

test.describe.configure({ mode: 'serial' })

const supportMessage = `Не проходит тестовая оплата подписки [worker ${process.env.TEST_WORKER_INDEX ?? 'local'}]`

test('пользователь обновляет профиль через настройки', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Сценарий достаточно проверить один раз')
  await login(page, E2E_USERS.basic.email)
  await page.goto('/dashboard/settings')

  const profileForm = page.locator('form').filter({ has: page.locator('#profile-name:visible') })
  const nameInput = profileForm.locator('#profile-name')
  await expect(nameInput).toHaveCount(1)
  await expect(nameInput).toBeEnabled()
  const updatedName = await nameInput.inputValue() === 'Тест Обновлён'
    ? 'Тестовый Пользователь'
    : 'Тест Обновлён'
  await nameInput.fill(updatedName)
  const updateResponse = page.waitForResponse((response) =>
    response.url().endsWith('/api/me') && response.request().method() === 'PATCH'
  )
  await profileForm.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect((await updateResponse).ok()).toBe(true)
  await expect(page.getByText('Профиль обновлён', { exact: true })).toBeVisible()

  await page.reload()
  const persistedNameInput = page.locator('#profile-name:visible')
  await expect(persistedNameInput).toHaveCount(1)
  await expect(persistedNameInput).toHaveValue(updatedName)
  await expectNoHorizontalOverflow(page)
})

test('пользователь создаёт обращение в поддержку', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Сценарий достаточно проверить один раз')
  await login(page, E2E_USERS.basic.email)
  await page.goto('/dashboard/support')

  await expect(page.getByRole('heading', { name: 'Поддержка', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: /Новое обращение/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Новое обращение' })).toBeVisible()
  await page.getByRole('button', { name: 'Оплата', exact: true }).click()
  await page.getByRole('textbox', { name: 'Сообщение' }).fill(supportMessage)
  await page.getByRole('button', { name: 'Отправить обращение' }).click()

  await expect(page.getByRole('heading', { name: 'Вопрос по оплате' })).toBeVisible()
  await expect(page.getByText(supportMessage, { exact: true }).last()).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('главный администратор видит пользователя и новое обращение', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Сценарий достаточно проверить один раз')
  await login(page, E2E_USERS.admin.email)
  await page.goto(`/dashboard/admin/users?q=${encodeURIComponent(E2E_USERS.basic.email)}`)

  await expect(page.getByRole('heading', { name: 'Пользователи' })).toBeVisible()
  await expect(page.locator('article').filter({ hasText: E2E_USERS.basic.email })).toHaveCount(1)

  await page.goto('/dashboard/admin/support')
  await expect(page.getByPlaceholder('Клиент, Telegram, платёж или текст')).toBeVisible()
  await expect(page.getByLabel('Статус очереди')).toBeVisible()
  await expect(page.getByLabel('Исполнитель очереди')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Вопрос по оплате' })).toBeVisible()
  await expect(page.getByText(/Ждёт \d+ мин/).first()).toBeVisible()
  const ticketAssignee = page.getByLabel('Исполнитель обращения', { exact: true })
  const currentStaffOption = ticketAssignee.locator('option').filter({ hasText: '(вы)' })
  await expect(currentStaffOption).toHaveCount(1)
  const currentStaffValue = await currentStaffOption.getAttribute('value')
  expect(currentStaffValue).toBeTruthy()
  const assignmentResponse = page.waitForResponse((response) => (
    response.request().method() === 'PATCH'
      && /\/api\/admin\/support\/tickets\/[^/]+$/.test(new URL(response.url()).pathname)
  ))
  await ticketAssignee.selectOption(currentStaffValue!)
  expect((await assignmentResponse).ok()).toBe(true)
  await expect(ticketAssignee).toHaveValue(currentStaffValue!)

  const clientButton = page.getByRole('button', { name: 'Контекст клиента', exact: true })
  await expect(clientButton).toBeVisible()
  await clientButton.click()
  const clientPanel = page.locator('aside').filter({ hasText: 'Контекст обращения' }).first()
  await expect(clientPanel).toBeVisible()
  await expect(clientPanel.getByText(E2E_USERS.basic.email, { exact: true })).toBeVisible()

  await clientPanel.getByRole('link', { name: 'Профиль' }).click()
  await expect(page.getByRole('heading', { name: 'Пользователи' })).toBeVisible()
  const returnLink = page.getByRole('link', { name: 'К обращению' })
  await expect(returnLink).toBeVisible()
  await returnLink.click()
  await expect(page).toHaveURL(/\/dashboard\/admin\/support\?.*ticket=/)
  await page.getByRole('button', { name: 'Контекст клиента', exact: true }).click()
  const returnedClientPanel = page.locator('aside').filter({ hasText: 'Контекст обращения' }).first()
  await expect(returnedClientPanel).toBeVisible()

  const internalNote = 'E2E: клиент подтвердил повторную проверку платежа'
  await returnedClientPanel.getByRole('tab', { name: /Заметки/ }).click()
  await returnedClientPanel.getByLabel('Внутренняя заметка').fill(internalNote)
  await returnedClientPanel.getByRole('button', { name: 'Добавить заметку' }).click()
  await expect(returnedClientPanel.getByText(internalNote, { exact: true })).toBeVisible()
  await returnedClientPanel.getByRole('button', { name: 'Закрыть данные клиента' }).click()
  await expect(returnedClientPanel).toBeHidden()
  await page.getByLabel('Исполнитель очереди').selectOption('mine')
  await expect(page.getByText(supportMessage, { exact: true }).first()).toBeVisible()
  await page.getByLabel('Исполнитель очереди').selectOption('unassigned')
  await expect(page.getByText(supportMessage, { exact: true })).toHaveCount(0)
  await page.getByLabel('Исполнитель очереди').selectOption('all')
  await page.getByLabel(/Выбрать обращение/).first().check()
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click()
  const bulkDialog = page.getByRole('dialog', { name: 'Закрыть выбранные обращения?' })
  await expect(bulkDialog.getByText('Вопрос по оплате', { exact: true })).toBeVisible()
  await bulkDialog.getByRole('button', { name: 'Закрыть обращения' }).click()
  await expect(page.getByText('Выполнено: 1. Не применено: 0.')).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await page.context().clearCookies()
  await login(page, E2E_USERS.basic.email)
  await page.goto('/dashboard/support')
  await expect(page.getByText(internalNote, { exact: true })).toHaveCount(0)
})

test('поддержка удобна пользователю и администратору на телефоне', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Сценарий нужен для мобильного проекта')
  test.setTimeout(process.env.CI ? 120_000 : 60_000)
  const message = `На телефоне не получается добавить новое устройство ${'длинноесообщение'.repeat(24)}`

  await login(page, E2E_USERS.basic.email)
  const profileResponse = await page.request.patch('/api/me', {
    data: { name: 'Очень Длинное Имя Пользователя Тест' },
  })
  expect(profileResponse.ok()).toBe(true)
  await page.goto('/dashboard/support')

  for (const viewport of [
    { width: 320, height: 700 },
    { width: 360, height: 740 },
    { width: 768, height: 900 },
  ]) {
    await page.setViewportSize(viewport)
    await expectNoHorizontalOverflow(page)
  }
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.getByRole('heading', { name: 'Поддержка', level: 1 })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.getByRole('button', { name: /Новое обращение/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Новое обращение' })).toBeVisible()
  await page.getByRole('button', { name: 'Устройства' }).click()
  const messageInput = page.getByRole('textbox', { name: 'Сообщение' })
  await page.setViewportSize({ width: 320, height: 480 })
  await messageInput.focus()
  await expect(page.getByRole('button', { name: 'Отправить обращение' })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  const attachmentInput = page.locator('input[type="file"]').last()
  const png = { name: 'screen.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }
  await attachmentInput.setInputFiles([
    png,
    { ...png, name: 'screen-2.png' },
    { ...png, name: 'screen-3.png' },
  ])
  await expect(page.getByRole('button', { name: /Убрать файл/ })).toHaveCount(3)
  for (let index = 0; index < 3; index += 1) {
    await page.getByRole('button', { name: /Убрать файл/ }).first().click()
  }
  await attachmentInput.setInputFiles([
    png,
    { ...png, name: 'screen-2.png' },
    { ...png, name: 'screen-3.png' },
    { ...png, name: 'screen-4.png' },
  ])
  await expect(page.getByText('Можно прикрепить не больше 3 файлов.')).toBeVisible()

  await messageInput.fill(message)
  await expectNoHorizontalOverflow(page)
  await page.getByRole('button', { name: 'Отправить обращение' }).click()

  await expect(page.getByRole('heading', { name: 'Вопрос по устройствам' })).toBeVisible()
  await expect(page.getByText(message, { exact: true }).last()).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await page.context().clearCookies()
  await login(page, E2E_USERS.admin.email)
  await page.goto('/dashboard/admin/support')

  await expect(page.getByText('Обращения', { exact: true })).toBeVisible()
  const ticketButton = page.getByRole('button').filter({ hasText: message }).first()
  await expect(ticketButton).toBeVisible()
  await ticketButton.click()
  await expect(page.getByRole('heading', { name: 'Вопрос по устройствам' })).toBeVisible()
  await page.getByRole('button', { name: 'Контекст клиента', exact: true }).click()
  const clientPanel = page.locator('aside').filter({ hasText: 'Контекст обращения' }).first()
  await expect(clientPanel).toBeVisible()
  await expect(clientPanel.getByText(E2E_USERS.basic.email, { exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  const replyDraft = 'Черновик ответа не должен исчезнуть при закрытии'
  const replyInput = page.locator('form textarea').last()
  await replyInput.fill(replyDraft)
  const statusSelect = page.getByLabel('Статус обращения')
  await statusSelect.selectOption('CLOSED')
  await page.getByLabel('Статус очереди').selectOption('closed')
  await page.getByRole('button').filter({ hasText: message }).first().click()
  await expect(page.getByText('Диалог закрыт', { exact: true })).toBeVisible()
  await page.getByLabel('Статус обращения').selectOption('OPEN')
  await page.getByLabel('Статус очереди').selectOption('active')
  await page.getByRole('button').filter({ hasText: message }).first().click()
  await expect(page.locator('form textarea').last()).toHaveValue(replyDraft)
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

test('пользователь отключает устройство с подтверждением', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Сценарий достаточно проверить один раз')
  await login(page, E2E_USERS.active.email)
  await page.goto('/dashboard/devices')

  await expect(page.getByRole('heading', { name: 'Pixel 8' })).toBeVisible()
  await page.getByRole('button', { name: 'Отключить Pixel 8' }).click()
  const dialog = page.getByRole('dialog', { name: 'Отключить устройство?' })
  await expect(dialog).toBeVisible()
  const disconnectResponse = page.waitForResponse((response) =>
    response.url().includes('/api/devices/') && response.request().method() === 'DELETE'
  )
  await dialog.getByRole('button', { name: 'Отключить', exact: true }).click()
  await expect((await disconnectResponse).ok()).toBe(true)

  await expect(page.getByRole('heading', { name: 'Pixel 8 · Android' })).toHaveCount(0)
  await expect(page.getByText('Активных устройств нет.', { exact: true })).toBeVisible()
  await page.getByText('Отключённые устройства: 1', { exact: true }).click()
  await expect(page.getByText('Pixel 8', { exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  const restoreResponse = page.waitForResponse((response) =>
    response.url().includes('/api/devices/') && response.request().method() === 'PATCH'
  )
  await page.getByRole('button', { name: 'Вернуть доступ' }).click()
  await expect((await restoreResponse).ok()).toBe(true)
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
  await expect(page.getByText('Пароль изменён. Другие сеансы завершены.', { exact: true })).toBeVisible()
}
