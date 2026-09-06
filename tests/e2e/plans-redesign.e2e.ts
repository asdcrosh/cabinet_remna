import { PrismaClient } from '@prisma/client'
import { expect, test } from '@playwright/test'
import { expectNoHorizontalOverflow, login } from './helpers'
import { E2E_USERS } from './test-data'

const prisma = new PrismaClient()
const alternativePlanId = 'e2e-catalog-alternative'

test.beforeAll(async () => {
  await prisma.plan.upsert({
    where: { id: alternativePlanId },
    create: {
      id: alternativePlanId, name: 'E2E 90 дней', priceKopecks: 30000, durationDays: 90,
      deviceLimit: 5, maxDeviceLimit: 5, isActive: true, sortOrder: 10001,
    },
    update: {},
  })
})

test.afterAll(async () => {
  await prisma.plan.deleteMany({ where: { id: alternativePlanId } })
  await prisma.$disconnect()
})

test('тарифы показывают текущий доступ, точную сумму и последствия перехода', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile-chromium'
  await login(page, E2E_USERS.active.email)
  await page.getByRole('button', { name: 'Закрыть уведомление' }).click()
  await page.goto('/dashboard/plans?intent=renew')
  await expect(page.getByRole('region', { name: 'Текущая подписка' })).toContainText('E2E Стандарт')
  await expect(page.getByRole('region', { name: 'Текущая подписка' })).toContainText('Оплачено до')
  const catalog = page.getByRole('region', { name: 'Выбор тарифа', exact: true })

  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => document.documentElement.classList.toggle('dark', value === 'dark'), theme)
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: testInfo.outputPath(`plans-${theme}.png`), fullPage: true, animations: 'disabled' })
  }

  if (mobile) await catalog.locator('article').filter({ hasText: 'E2E Стандарт' }).getByRole('button', { name: 'Продлить', exact: true }).click()
  const checkout = mobile
    ? page.getByRole('dialog', { name: 'Оформление подписки' })
    : catalog.getByTestId('plan-card')
  await checkout.getByRole('spinbutton', { name: 'Количество устройств, от 5 до 20' }).fill('8')
  await checkout.getByRole('spinbutton').press('Enter')
  const summary = checkout.getByRole('region', { name: 'Состав оплаты' })
  await expect(summary).toContainText('Дополнительные устройства · 3')
  await expect(summary).toContainText('430 ₽')
  await expect(checkout.getByRole('region', { name: 'После оплаты' })).toContainText('добавится 7 дн.')
  if (mobile) {
    await page.keyboard.press('Escape')
    await expect(checkout).toBeHidden()
    await catalog.locator('article').filter({ hasText: 'E2E 90 дней' }).getByRole('button', { name: 'Выбрать', exact: true }).click()
  } else {
    await catalog.getByRole('radiogroup', { name: 'Выбор тарифа' }).getByRole('radio', { checked: true }).focus()
    await page.keyboard.press('End')
    await expect(catalog.getByRole('radio', { name: /E2E 90 дней/ })).toBeChecked()
  }

  await expect(checkout.getByRole('region', { name: 'После оплаты' })).toContainText('Неиспользованные дни не переносятся')
  if (mobile) await expect(checkout.getByRole('heading', { name: 'Вы меняете тариф' })).toBeInViewport()
  await expect(checkout.getByRole('region', { name: 'Состав оплаты' })).toContainText('300 ₽')
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('plan-switch.png'), fullPage: true, animations: 'disabled' })

  let paymentBody: Record<string, unknown> | undefined
  await page.route('**/api/payment/create', async (route) => {
    paymentBody = route.request().postDataJSON()
    await route.fulfill({ json: { redirectUrl: '/dashboard/billing' } })
  })
  await checkout.getByRole('button', { name: /Перейти к оплате/ }).click()
  if (!mobile) await page.getByRole('dialog', { name: 'Перейти на тариф «E2E 90 дней»?' }).getByRole('button', { name: /Оплатить/ }).click()
  await expect(page).toHaveURL(/\/dashboard\/billing/)
  expect(paymentBody).toMatchObject({ planId: alternativePlanId, deviceLimit: 5, provider: 'YOOKASSA' })
  expect(paymentBody).not.toHaveProperty('autoRenewalConsent')
})
