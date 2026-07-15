import { expect, test } from '@playwright/test'
import { expectNoHorizontalOverflow, login } from './helpers'
import { E2E_USERS } from './test-data'

test('истёкшая подписка не показывает отрицательные дни', async ({ page }) => {
  await login(page, E2E_USERS.expired.email)

  const subscriptionOverview = page.getByTestId('subscription-overview')
  await expect(subscriptionOverview.getByRole('heading', { name: 'E2E Стандарт' })).toBeVisible()
  await expect(subscriptionOverview.getByText('-2 дн.', { exact: true })).toHaveCount(0)
  await expect(subscriptionOverview.getByText('Срок доступа истёк', { exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('мобильная навигация открывает дополнительные разделы', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Проверка предназначена для mobile viewport')
  await login(page, E2E_USERS.basic.email)

  const navigation = page.getByRole('navigation', { name: 'Основная мобильная навигация' })
  await expect(navigation).toBeVisible()
  await navigation.getByRole('button', { name: 'Открыть ещё разделы' }).click()

  const dialog = page.getByRole('dialog', { name: 'Ещё' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('link', { name: 'Настройки' }).click()

  await expect(page).toHaveURL(/\/dashboard\/settings(?:\?|$)/)
  await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await navigation.getByRole('button', { name: 'Открыть ещё разделы' }).click()
  const settingsDialog = page.getByRole('dialog', { name: 'Ещё' })
  await expect(settingsDialog).toBeVisible()
  await settingsDialog.getByRole('button', { name: 'Выйти' }).click()
  await expect(page).toHaveURL(/\/login(?:\?|$)/)
})
