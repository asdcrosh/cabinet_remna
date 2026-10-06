import { expect, test } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { expectNoHorizontalOverflow, login } from './helpers'
import { E2E_PLAN_ID, E2E_USERS } from './test-data'
import type { BonusBoxOverview } from '../../src/components/bonus-box/bonus-box-types'

const prisma = new PrismaClient()
const missionId = 'e2e-home-login-mission'

test.beforeAll(async () => {
  await prisma.plan.update({
    where: { id: E2E_PLAN_ID },
    data: { whitelistAddonEnabled: true, whitelistAddonPriceKopecks: 9900, whitelistAddonInternalSquads: ['e2e-whitelist'] },
  })
})

test.afterEach(async () => {
  await prisma.featureSetting.update({ where: { id: 'default' }, data: { bonusBox: true, referrals: true } })
  await prisma.bonusBoxMission.deleteMany({ where: { id: missionId } })
  await prisma.bonusBoxAttempt.deleteMany({ where: { userId: E2E_USERS.basic.id } })
})

test.afterAll(async () => {
  await prisma.plan.update({
    where: { id: E2E_PLAN_ID },
    data: { whitelistAddonEnabled: false, whitelistAddonPriceKopecks: 0, whitelistAddonInternalSquads: [] },
  })
  await prisma.$disconnect()
})

test('главная сразу показывает белые списки и доступную рулетку', async ({ page }, testInfo) => {
  let spins = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/api/bonus-box') && request.method() === 'POST') spins += 1
  })
  await login(page, E2E_USERS.active.email)
  const roulette = page.getByRole('region', { name: 'Рулетка бонусов' })
  const buy = page.getByRole('button', { name: 'Подключить за 99 ₽' })
  const spin = roulette.getByRole('button', { name: /Получить подарок/ })
  await expect(spin).toBeEnabled()
  await expect(buy).toBeInViewport()
  await expect(spin).toBeInViewport()
  expect((await buy.boundingBox())!.y).toBeLessThan((await roulette.boundingBox())!.y)
  expect((await roulette.boundingBox())!.y).toBeLessThan((await page.getByTestId('subscription-overview').boundingBox())!.y)
  expect(spins).toBe(0)
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: true })

  await buy.click()
  const checkout = page.getByRole('dialog', { name: 'Докупить белые списки' })
  await expect(checkout).toBeVisible()
  await expect(checkout.getByText('99 ₽', { exact: true })).toBeVisible()
  let purchase: Record<string, unknown> | null = null
  await page.route('**/api/payment/create', async (route) => {
    purchase = route.request().postDataJSON()
    await route.fulfill({ json: { redirectUrl: '/dashboard?e2e-payment=whitelist' } })
  })
  await checkout.getByRole('button', { name: /Оплатить/ }).click()
  await expect(page).toHaveURL(/e2e-payment=whitelist/)
  expect(purchase).toMatchObject({ planId: E2E_PLAN_ID, purchaseType: 'WHITELIST_ADDON' })
})

test('нулевой баланс открывает способы получения попыток', async ({ page }) => {
  await login(page, E2E_USERS.basic.email)
  const roulette = page.getByRole('region', { name: 'Рулетка бонусов' })
  await roulette.getByRole('button', { name: 'Нет попыток · Получить' }).click()
  const dialog = page.getByRole('dialog', { name: 'Попытки закончились' })
  await expect(dialog.getByRole('link', { name: 'Выбрать тариф', exact: true }).first()).toHaveAttribute('href', '/dashboard/plans')
  await expect(dialog.getByRole('link', { name: 'Пригласить друга' }).first()).toHaveAttribute('href', '/dashboard/referrals')
  await expect(dialog.getByText(/Начисляем автоматически/)).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(roulette.getByRole('button', { name: 'Нет попыток · Получить' })).toBeFocused()
})

test('последняя приветственная попытка на главной открывает приз и способы получить ещё', async ({ page }) => {
  await prisma.bonusBoxAttempt.create({
    data: { userId: E2E_USERS.basic.id, source: 'MANUAL', sourceKey: 'welcome:e2e-home' },
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await login(page, E2E_USERS.basic.email)
  const overview: BonusBoxOverview = await (await page.request.get('/api/bonus-box')).json()
  const prize = overview.prizes.find((item) => item.type === 'PROMO_CODE_PERCENT')!
  let spins = 0
  await page.route('**/api/bonus-box', async (route) => {
    if (route.request().method() === 'POST') {
      spins += 1
      await route.fulfill({ json: {
        id: 'e2e-home-opening', prize, reel: [prize], winningIndex: 0, stopOffsetRatio: 0.5,
        promoCode: 'E2EHOME', promoCodeExpiresAt: null, remainingAttempts: 0, remoteSynced: true,
      } })
    } else {
      await route.fulfill({ json: { ...overview, attemptsCount: 0, welcomeAttemptsCount: 0, canOpenReason: 'Нет доступных открытий.' } })
    }
  })
  const roulette = page.getByRole('region', { name: 'Рулетка бонусов' })
  await roulette.getByRole('button', { name: /Получить приветственный подарок/ }).click({ clickCount: 2 })
  const result = page.getByRole('dialog')
  await expect(result.getByText('E2EHOME', { exact: true })).toBeVisible()
  expect(spins).toBe(1)
  await result.getByRole('button', { name: 'Готово', exact: true }).click()
  await expect(roulette.getByRole('button', { name: 'Нет попыток · Получить' })).toBeEnabled()
  await roulette.getByRole('button', { name: 'Нет попыток · Получить' }).click()
  await expect(page.getByRole('dialog', { name: 'Попытки закончились' })).toBeVisible()
})

test('попытки за задание можно получить прямо на главной', async ({ page }) => {
  await prisma.bonusBoxMission.create({
    data: { id: missionId, title: 'E2E Войти в кабинет', type: 'LOGIN_STREAK', target: 1, rewardAttempts: 2 },
  })
  await login(page, E2E_USERS.basic.email)
  await page.getByRole('region', { name: 'Рулетка бонусов' }).getByRole('button', { name: 'Нет попыток · Получить' }).click()
  const dialog = page.getByRole('dialog', { name: 'Попытки закончились' })
  await expect(dialog.getByRole('heading', { name: 'E2E Войти в кабинет' })).toBeVisible()
  const claim = page.waitForResponse((response) => response.url().includes(`/missions/${missionId}/claim`))
  await dialog.getByRole('button', { name: 'Получить', exact: true }).click()
  expect((await claim).ok()).toBe(true)
  const updatedDialog = page.getByRole('dialog', { name: 'Получить попытки' })
  await expect(updatedDialog.getByText('Получено', { exact: true })).toBeVisible()
  await updatedDialog.getByRole('button', { name: /Вернуться к рулетке/ }).click()
  await expect(page.getByRole('region', { name: 'Рулетка бонусов' }).getByRole('link', { name: 'Оформить подписку' })).toBeVisible()
  expect(await prisma.bonusBoxAttempt.count({ where: { userId: E2E_USERS.basic.id, usedAt: null } })).toBe(2)
})

test('переход к тарифу с главной заранее включает белые списки', async ({ page }, testInfo) => {
  await login(page, E2E_USERS.basic.email)
  await page.getByRole('link', { name: 'Выбрать тариф с белыми списками' }).click()
  await expect(page).toHaveURL(/whitelistAddon=true/)
  if (testInfo.project.name === 'mobile-chromium') {
    await page.getByRole('region', { name: 'Выбор тарифа' }).getByRole('button', { name: 'Выбрать', exact: true }).click()
  } else {
    await page.getByRole('button', { name: /Перейти к оплате/ }).click()
  }
  const addon = page.getByRole('checkbox', { name: 'Добавить за 99 ₽' })
  await expect(addon).toBeChecked()
  await page.getByText('Добавить за 99 ₽', { exact: true }).click()
  await expect(addon).not.toBeChecked()
  await expectNoHorizontalOverflow(page)
})

test('главная учитывает отключённые бонусы и приглашения', async ({ page }) => {
  await prisma.featureSetting.update({ where: { id: 'default' }, data: { referrals: false } })
  await login(page, E2E_USERS.basic.email)
  await page.getByRole('region', { name: 'Рулетка бонусов' }).getByRole('button', { name: 'Нет попыток · Получить' }).click()
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Пригласить друга' })).toHaveCount(0)
  await prisma.featureSetting.update({ where: { id: 'default' }, data: { bonusBox: false } })
  await page.reload()
  await expect(page.getByRole('region', { name: 'Рулетка бонусов' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Выбрать тариф с белыми списками' })).toBeVisible()
})
