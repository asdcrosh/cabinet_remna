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

test('каталог тарифов использует компактные строки с понятными действиями', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Проверка предназначена для desktop viewport')
  await login(page, E2E_USERS.admin.email)
  await page.goto('/dashboard/admin/plans')

  await expect(page.getByRole('heading', { name: 'Тарифы' })).toBeVisible()
  const grid = page.getByTestId('admin-plan-grid')
  const card = page.getByTestId('admin-plan-card').filter({ hasText: 'E2E Стандарт' })
  await expect(card).toHaveCount(1)
  await expect(card.getByRole('button', { name: 'Изменить тариф E2E Стандарт' })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Скрыть тариф E2E Стандарт' })).toBeVisible()

  const [gridBox, cardBox] = await Promise.all([grid.boundingBox(), card.boundingBox()])
  expect(gridBox).not.toBeNull()
  expect(cardBox).not.toBeNull()
  expect(cardBox!.width).toBeGreaterThan(gridBox!.width * 0.9)
  expect(cardBox!.height).toBeLessThan(240)
  await expectNoHorizontalOverflow(page)
})

test('фильтры промокодов помещаются без скрытой прокрутки', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Проверка предназначена для desktop viewport')
  await login(page, E2E_USERS.admin.email)
  await page.goto('/dashboard/admin/promo-codes')

  await expect(page.getByRole('heading', { level: 1, name: 'Промокоды' })).toBeVisible()
  const statusFilter = page.getByTestId('promo-status-filter')
  const originFilter = page.getByTestId('promo-origin-filter')
  await expect(statusFilter).toHaveCount(1)
  await expect(originFilter).toHaveCount(1)
  await expect(statusFilter.getByRole('button')).toHaveCount(3)
  await expect(originFilter).toHaveValue('ALL')
  await expect(originFilter.locator('option')).toHaveCount(4)
  expect(await statusFilter.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  expect(await originFilter.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await expect(page.getByRole('button', { name: 'Удалить выбранные' })).toHaveCount(0)
  await expectNoHorizontalOverflow(page)
})
