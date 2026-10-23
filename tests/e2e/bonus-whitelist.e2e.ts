import { PrismaClient } from '@prisma/client'
import { expect, test } from '@playwright/test'
import { expectNoHorizontalOverflow, login } from './helpers'
import { E2E_USERS } from './test-data'

const prisma = new PrismaClient()
const title = 'E2E Белые списки на неделю'
const squad = '12345678-1234-4234-8234-123456789012'

test.afterEach(async () => {
  await prisma.bonusBoxPrize.deleteMany({ where: { title } })
})
test.afterAll(async () => prisma.$disconnect())

test('administrator configures and edits a whitelist reward', async ({ page }, testInfo) => {
  await page.route('**/api/admin/remnawave/squads', (route) => route.fulfill({
    json: { squads: [{ uuid: squad, name: 'Белые списки — тест', isActive: true }] },
  }))
  await login(page, E2E_USERS.admin.email)
  await page.goto('/dashboard/admin/bonus-box?view=prizes')
  await page.getByRole('button', { name: 'Создать подарок', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Название', { exact: true }).fill(title)
  await dialog.getByLabel('Тип').selectOption('WHITELIST_DAYS')
  await dialog.getByLabel('Срок белых списков, дней').fill('7')
  await dialog.getByLabel('Вес выпадения').fill('15')
  await dialog.getByRole('checkbox', { name: 'Белые списки — тест' }).check()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('whitelist-reward.png'), fullPage: true })

  const saved = page.waitForResponse((response) => response.url().endsWith('/api/admin/bonus-box/prizes') && response.request().method() === 'POST')
  await dialog.getByRole('button', { name: 'Создать', exact: true }).click()
  expect((await saved).status()).toBe(200)
  await expect(dialog).not.toBeVisible()
  const reward = await prisma.bonusBoxPrize.findFirstOrThrow({ where: { title } })
  expect(reward).toMatchObject({ type: 'WHITELIST_DAYS', value: 7, weight: 15, internalSquads: [squad] })

  // Reopen via its edit action and verify that the selection survives a refresh.
  await page.reload()
  const card = page.locator('article').filter({ hasText: title }).first()
  await card.getByRole('button', { name: `Действия: ${title}` }).click()
  await page.getByRole('button', { name: 'Изменить', exact: true }).click()
  await expect(dialog.getByRole('checkbox', { name: 'Белые списки — тест' })).toBeChecked()
  await expect(dialog.getByLabel('Срок белых списков, дней')).toHaveValue('7')
})
