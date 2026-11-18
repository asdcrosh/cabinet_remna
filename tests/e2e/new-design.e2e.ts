import { expect, test } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { expectNoHorizontalOverflow, login } from './helpers'
import { E2E_BONUS_PRIZE_IDS, E2E_USERS } from './test-data'
import { defaultPersonalOfferSettings } from '../../src/lib/personal-offers'

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

// ---------------------------------------------------------------------------
// Этап 2 админки: промокоды и акции, плоские вкладки в Бонусах, шаблоны и SLA в Поддержке
// ---------------------------------------------------------------------------

test.describe('новый дизайн: этап 2 админки', () => {
  // Свои данные на каждый прогон: проекты Playwright идут друг за другом по одной базе.
  const run = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`.toUpperCase()
  const manualCode = `E2E-MAN-${run}`
  const boxCode = `BOX-E2E-${run}`
  const offerCode = `E2EBACK${run}`
  const ticketSubject = `E2E шаблоны ${run}`
  const template = `E2E шаблон ${run}: проверяю подключение.`
  let ticketId = ''
  let offerBefore: { id: string; promoCodeId: string | null } | null = null
  let offerCreated = false
  let supportSettingBefore: Awaited<ReturnType<typeof prisma.supportSetting.findUnique>> = null

  test.beforeAll(async () => {
    await prisma.promoCode.create({ data: { code: manualCode, discountPercent: 12 } })
    const boxPromo = await prisma.promoCode.create({
      data: {
        code: boxCode,
        discountPercent: 7,
        audience: 'PERSONAL',
        allowedEmails: [E2E_USERS.active.email],
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    })
    const attempt = await prisma.bonusBoxAttempt.create({
      data: { userId: E2E_USERS.active.id, source: 'MANUAL', sourceKey: `e2e-stage2-${run}`, usedAt: new Date() },
    })
    await prisma.bonusBoxOpening.create({
      data: {
        userId: E2E_USERS.active.id,
        attemptId: attempt.id,
        prizeId: E2E_BONUS_PRIZE_IDS.epic,
        prizeSnapshot: {},
        promoCodeId: boxPromo.id,
      },
    })

    // В CI предложения не засеяны: заводим «Давно не покупал», если его нет, и потом убираем.
    const existingOffer = await prisma.personalOfferSetting.findUnique({ where: { scenario: 'RETURN_PROMO' } })
    if (existingOffer) {
      offerBefore = { id: existingOffer.id, promoCodeId: existingOffer.promoCodeId }
    } else {
      const seed = defaultPersonalOfferSettings.find((offer) => offer.scenario === 'RETURN_PROMO')!
      await prisma.personalOfferSetting.create({ data: seed })
      offerCreated = true
    }

    supportSettingBefore = await prisma.supportSetting.findUnique({ where: { id: 'default' } })
    const ticket = await prisma.supportTicket.create({
      data: {
        userId: E2E_USERS.active.id,
        subject: ticketSubject,
        messages: { create: { senderId: E2E_USERS.active.id, senderRole: 'USER', body: 'Не подключается VPN' } },
      },
    })
    ticketId = ticket.id
  })

  test.afterAll(async () => {
    await prisma.supportTicket.deleteMany({ where: { id: ticketId } })
    if (supportSettingBefore) {
      const { id, slaWarningMinutes, slaBreachMinutes, quickReplies } = supportSettingBefore
      await prisma.supportSetting.update({
        where: { id },
        data: { slaWarningMinutes, slaBreachMinutes, quickReplies: quickReplies ?? [] },
      })
    } else {
      await prisma.supportSetting.deleteMany({ where: { id: 'default' } })
    }
    if (offerCreated) {
      await prisma.personalOfferSetting.deleteMany({ where: { scenario: 'RETURN_PROMO' } })
    } else if (offerBefore) {
      await prisma.personalOfferSetting.update({ where: { id: offerBefore.id }, data: { promoCodeId: offerBefore.promoCodeId } })
    }
    await prisma.bonusBoxAttempt.deleteMany({ where: { sourceKey: `e2e-stage2-${run}` } })
    await prisma.promoCode.deleteMany({ where: { code: { in: [manualCode, boxCode, offerCode] } } })
  })

  test('коды из рулетки — отдельным фильтром, «Новая скидка» сразу открывает форму', async ({ page }) => {
    await login(page, E2E_USERS.admin.email)
    await page.goto('/dashboard/admin/promo-codes')

    const source = page.getByTestId('promo-source-filter')
    const promoCard = (code: string) => page.getByTestId('admin-promo-card').filter({ hasText: code })
    await expect(source.getByRole('button', { name: /^Созданные/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(promoCard(manualCode)).toBeVisible()
    await expect(promoCard(boxCode)).toHaveCount(0)

    await source.getByRole('button', { name: /^Из рулетки/ }).click()
    await expect(page).toHaveURL(/[?&]source=box/)
    await expect(promoCard(boxCode)).toBeVisible()
    await expect(promoCard(manualCode)).toHaveCount(0)

    // Выигрыш рулетки — не акция: в общем календаре его нет.
    await page.goto('/dashboard/admin/campaigns')
    const ledger = page.getByRole('region', { name: 'Календарь кампаний' })
    await expect(ledger.getByText(manualCode, { exact: true })).toBeVisible()
    await expect(ledger.getByText(boxCode, { exact: true })).toHaveCount(0)

    await page.getByRole('link', { name: 'Новая скидка' }).click()
    await expect(page.getByRole('dialog', { name: 'Новый промокод' })).toBeVisible()
    await expect(page).toHaveURL(/\/dashboard\/admin\/promo-codes$/)
    await expectNoHorizontalOverflow(page)
  })

  test('промокод создаётся прямо из формы предложения', async ({ page }) => {
    await login(page, E2E_USERS.admin.email)
    await page.goto('/dashboard/admin/offers')
    await page.getByRole('button', { name: 'Изменить оффер Давно не покупал' }).click()
    const dialog = page.getByRole('dialog', { name: 'Давно не покупал' })
    await dialog.getByRole('tab', { name: 'Условия' }).click()
    await dialog.getByRole('button', { name: 'Новый промокод' }).click()

    const creator = dialog.getByRole('group', { name: 'Новый промокод' })
    await creator.getByLabel('Код').fill(offerCode)
    await creator.getByLabel('Скидка, %').fill('20')
    await creator.getByRole('button', { name: 'Создать и выбрать' }).click()

    await expect(creator).toHaveCount(0)
    const select = dialog.getByLabel('Промокод для оффера «Давно не покупал»')
    await expect(select.locator('option:checked')).toHaveText(`${offerCode} · 20%`)

    await dialog.getByRole('button', { name: 'Сохранить' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByText(`промокод ${offerCode} на 20%`)).toBeVisible()
    await expect.poll(async () => {
      const offer = await prisma.personalOfferSetting.findUnique({
        where: { scenario: 'RETURN_PROMO' },
        select: { promoCode: { select: { code: true, discountPercent: true, isActive: true } } },
      })
      return offer?.promoCode
    }).toEqual({ code: offerCode, discountPercent: 20, isActive: true })
  })

  test('Бонусы: один уровень вкладок, «Начислить попытки» — в шапке', async ({ page }) => {
    await login(page, E2E_USERS.admin.email)
    await page.goto('/dashboard/admin/bonus-box')
    await expect(page.getByRole('heading', { level: 1, name: 'Бонусы' })).toBeVisible()

    const tabs = page.getByRole('tablist', { name: 'Разделы управления бонусами' })
    await expect(tabs.getByRole('tab')).toHaveText(['Призы', 'Задания и события', 'Экономика', 'История'])
    await expect(tabs.getByRole('tab', { name: 'Призы' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('heading', { name: 'Состав подарков' })).toBeVisible()
    // Больше никаких свёрнутых «Настроек рулетки» с подвкладками внутри.
    await expect(page.locator('summary', { hasText: 'Настройки рулетки' })).toHaveCount(0)
    await expect(page.getByRole('tablist', { name: 'Состав и история подарков' })).toHaveCount(0)

    await tabs.getByRole('tab', { name: 'Экономика' }).click()
    await expect(page).toHaveURL(/[?&]view=economy/)
    await expect(page.getByRole('heading', { name: 'Экономика бонусов' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Настройки рулетки' })).toBeVisible()

    await tabs.getByRole('tab', { name: 'История' }).click()
    await expect(page.getByRole('heading', { name: 'История открытий' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('tab', { name: 'История' })).toHaveAttribute('aria-selected', 'true')

    // Старая ссылка из «Кампаний» ведёт на задания и события.
    await page.goto('/dashboard/admin/bonus-box?view=overview')
    await expect(page.getByRole('tab', { name: 'Задания и события' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('heading', { name: 'Сезонные события' })).toBeVisible()

    await page.getByRole('button', { name: 'Начислить попытки' }).click()
    const grant = page.getByRole('dialog', { name: 'Начислить попытки' })
    await expect(grant.getByTestId('bonus-attempt-grant-panel')).toBeVisible()
    await expect(grant.getByRole('button', { name: 'Начислить', exact: true })).toBeVisible()
    await grant.getByRole('button', { name: 'Закрыть', exact: true }).click()
    await expect(grant).toHaveCount(0)
    await expectNoHorizontalOverflow(page)
  })

  test('шаблоны ответов и SLA — прямо в Поддержке', async ({ page }) => {
    await login(page, E2E_USERS.admin.email)
    await page.goto('/dashboard/admin/support')
    await page.getByRole('button', { name: 'Шаблоны и SLA' }).click()

    const dialog = page.getByRole('dialog', { name: 'Шаблоны ответов и SLA' })
    await dialog.getByRole('textbox', { name: /^Шаблоны ответов/ }).fill(`${template}\nГотово, попробуйте ещё раз.`)
    await dialog.getByLabel('Предупреждать через, минут').fill('90')
    await dialog.getByRole('button', { name: 'Сохранить' }).click()
    await expect(dialog).toHaveCount(0)
    await expect.poll(async () => {
      const setting = await prisma.supportSetting.findUnique({ where: { id: 'default' } })
      return { warning: setting?.slaWarningMinutes, replies: setting?.quickReplies }
    }).toEqual({ warning: 90, replies: [template, 'Готово, попробуйте ещё раз.'] })

    if (!isMobile(page.viewportSize()?.width)) {
      // Шестерёнка рядом со списком шаблонов в окне ответа.
      await page.goto(`/dashboard/admin/support?ticket=${ticketId}`)
      await page.getByRole('button', { name: 'Открыть шаблоны ответов' }).click()
      await expect(page.getByRole('button', { name: template })).toBeVisible()
      await page.getByRole('button', { name: 'Настроить шаблоны и SLA' }).click()
      await expect(page.getByRole('dialog', { name: 'Шаблоны ответов и SLA' })).toBeVisible()
      await page.keyboard.press('Escape')
    }

    // В «Системе» осталась короткая сводка со ссылкой сюда.
    await page.goto('/dashboard/admin/system#support')
    await page.getByRole('link', { name: 'Открыть шаблоны и SLA' }).click()
    await expect(page.getByRole('dialog', { name: 'Шаблоны ответов и SLA' })).toBeVisible()
    // Одноразовый ?settings=1 убирается, чтобы окно не всплывало после обновления.
    await expect(page).toHaveURL(/\/dashboard\/admin\/support/)
    await expect(page).not.toHaveURL(/[?&]settings=/)
  })
})
