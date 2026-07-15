import { expect, test } from '@playwright/test'
import { expectNoHorizontalOverflow, login } from './helpers'
import { E2E_USERS } from './test-data'

test('истёкшая подписка не показывает отрицательные дни', async ({ page }, testInfo) => {
  await login(page, E2E_USERS.expired.email)

  const subscriptionOverview = page.getByTestId('subscription-overview')
  await expect(subscriptionOverview.getByRole('heading', { name: 'E2E Стандарт' })).toBeVisible()
  await expect(subscriptionOverview.getByText('-2 дн.', { exact: true })).toHaveCount(0)
  await expect(subscriptionOverview.getByText('Срок доступа истёк', { exact: true })).toBeVisible()

  const metrics = subscriptionOverview.locator('.dashboard-hero-metric')
  await expect(metrics).toHaveCount(3)
  expect(await metrics.evaluateAll((items) => items.every((item) => item.scrollWidth <= item.clientWidth))).toBe(true)
  if (testInfo.project.name === 'mobile-chromium') {
    const [daysMetric, usageMetric] = await Promise.all([metrics.nth(0).boundingBox(), metrics.nth(1).boundingBox()])
    expect(daysMetric).not.toBeNull()
    expect(usageMetric).not.toBeNull()
    expect(daysMetric!.width).toBeGreaterThan(usageMetric!.width * 1.5)
  }
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
  const settingsTabs = page.getByRole('tablist', { name: 'Разделы настроек' })
  await expect(settingsTabs.getByRole('tab')).toHaveCount(4)
  await expect(settingsTabs.getByRole('tab', { name: 'Платежи' })).toBeVisible()
  expect(await settingsTabs.locator('..').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await expectNoHorizontalOverflow(page)

  await navigation.getByRole('button', { name: 'Открыть ещё разделы' }).click()
  const settingsDialog = page.getByRole('dialog', { name: 'Ещё' })
  await expect(settingsDialog).toBeVisible()
  await settingsDialog.getByRole('button', { name: 'Выйти' }).click()
  await expect(page).toHaveURL(/\/login(?:\?|$)/)
})

test('мобильные уведомления раскрываются под верхней панелью', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Проверка предназначена для mobile viewport')
  await login(page, E2E_USERS.basic.email)

  const trigger = page.getByRole('button', { name: /^Уведомления/ })
  await trigger.click()

  const panel = page.getByRole('dialog', { name: 'Уведомления' })
  await expect(panel).toBeVisible()

  const [triggerBox, panelBox] = await Promise.all([trigger.boundingBox(), panel.boundingBox()])
  expect(triggerBox).not.toBeNull()
  expect(panelBox).not.toBeNull()
  expect(panelBox!.y).toBeGreaterThanOrEqual(triggerBox!.y + triggerBox!.height)
  expect(panelBox!.y).toBeLessThan(page.viewportSize()!.height / 3)
})
