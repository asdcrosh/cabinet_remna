import { expect, test } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { expectNoHorizontalOverflow, login } from './helpers'
import { E2E_USERS } from './test-data'

// Новый дизайн включается только на время этих сценариев:
// основной набор проверяет прежний дизайн, к которому админ может вернуться.
const prisma = new PrismaClient()

test.beforeAll(async () => {
  await prisma.featureSetting.update({ where: { id: 'default' }, data: { newDesign: true } })
})

test.afterAll(async () => {
  await prisma.featureSetting.update({ where: { id: 'default' }, data: { newDesign: false } })
  await prisma.$disconnect()
})

function isMobile(width: number | undefined) {
  return (width ?? 1440) < 1280
}

test('новый дизайн: все разделы пользователя видны в меню, статус подписки — первым', async ({ page }) => {
  await login(page, E2E_USERS.active.email)
  const mobile = isMobile(page.viewportSize()?.width)

  const nav = mobile
    ? page.getByRole('navigation', { name: 'Нижнее меню' })
    : page.getByRole('navigation', { name: 'Основное меню' })
  const expected = mobile
    ? ['Главная', 'VPN', 'Подписка', 'Помощь', 'Профиль']
    : ['Главная', 'VPN', 'Подписка', 'Бонусы', 'Помощь', 'Профиль']
  for (const label of expected) {
    await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible()
  }

  const overview = page.getByTestId('subscription-overview')
  await expect(overview).toBeVisible()
  await expect(overview).toBeInViewport()
  await expect(page.getByRole('region', { name: 'Рулетка бонусов' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /^Бонусы/ }).first()).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('новый дизайн: устройства живут в разделе VPN, старый адрес переадресует', async ({ page }) => {
  await login(page, E2E_USERS.active.email)
  await page.goto('/dashboard/devices')
  await expect(page).toHaveURL(/\/dashboard\/subscription#devices$/)
  await expect(page.getByRole('heading', { level: 1, name: 'VPN' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Устройства', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Ссылка подключения' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Сменить ссылку' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('новый дизайн: подписка, профиль и помощь собирают раньше скрытые функции', async ({ page }) => {
  await login(page, E2E_USERS.active.email)

  await page.goto('/dashboard/billing')
  await expect(page.getByRole('heading', { level: 1, name: 'Подписка' })).toBeVisible()
  // Во время потоковой отрисовки секция может ненадолго оказаться в DOM дважды.
  await expect(page.locator('#auto-renewal').first()).toBeVisible()

  await page.goto('/dashboard/settings')
  await expect(page.getByRole('heading', { level: 1, name: 'Профиль' })).toBeVisible()
  const hub = page.getByRole('navigation', { name: 'Разделы профиля' })
  await expect(hub.getByRole('link', { name: /Пригласить друга/ })).toBeVisible()
  await expect(hub.getByRole('link', { name: /Уведомления/ })).toBeVisible()

  await page.goto('/dashboard/support')
  await expect(page.getByRole('heading', { name: 'Быстрые ответы' })).toBeVisible()
  await page.locator('summary', { hasText: 'Не подключается VPN' }).click()
  await expect(page.getByRole('link', { name: 'Не помогло — написать' }).first()).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('новый дизайн: бонусы и приглашения — один раздел', async ({ page }) => {
  await login(page, E2E_USERS.active.email)
  await page.goto('/dashboard/referrals')
  const tabs = page.getByRole('navigation', { name: 'Разделы бонусов' })
  await expect(tabs.getByRole('link', { name: 'Пригласить друга' })).toHaveAttribute('aria-current', 'page')
  await tabs.getByRole('link', { name: 'Рулетка и задания' }).click()
  await expect(page).toHaveURL(/\/dashboard\/bonus-box$/)
})

test('новый дизайн: админка из восьми разделов, вкладки и поиск', async ({ page }) => {
  await login(page, E2E_USERS.admin.email)
  await page.goto('/dashboard/admin')
  await expect(page.getByRole('heading', { level: 1, name: 'Сегодня' })).toBeVisible()

  await page.goto('/dashboard/admin/recovery')
  const tabs = page.getByRole('navigation', { name: 'Подразделы' })
  await expect(tabs.getByRole('link', { name: 'Все платежи' })).toBeVisible()
  await expect(tabs.getByRole('link', { name: 'Контроль выдачи' })).toHaveAttribute('aria-current', 'page')

  if (!isMobile(page.viewportSize()?.width)) {
    const sidebar = page.getByRole('navigation', { name: 'Основное меню' })
    for (const label of ['Сегодня', 'Клиенты', 'Платежи', 'Поддержка', 'Тарифы', 'Промокоды и акции', 'Рассылки', 'Аналитика', 'Система']) {
      // У «Сегодня» и «Поддержки» к названию добавляется счётчик.
      await expect(sidebar.getByRole('link', { name: new RegExp(`^${label}(\\s\\d+\\+?)?$`) })).toBeInViewport()
    }

    await page.keyboard.press('ControlOrMeta+k')
    const palette = page.getByRole('dialog')
    await expect(palette).toBeVisible()
    await palette.getByRole('combobox').fill(E2E_USERS.active.email)
    // Первым идёт клиент, ниже — его платежи с тем же email.
    const option = palette.getByRole('option', { name: new RegExp(E2E_USERS.active.email) }).first()
    await expect(option).toBeVisible()
    await option.click()
    await expect(page).toHaveURL(new RegExp(`/dashboard/admin/users/${E2E_USERS.active.id}$`))
    await expect(page.getByRole('button', { name: 'Продлить или сменить тариф' })).toBeVisible()
  }
  await expectNoHorizontalOverflow(page)
})
