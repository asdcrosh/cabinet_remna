import { expect, test } from '@playwright/test'
import { expectNoHorizontalOverflow, login } from './helpers'
import { E2E_BONUS_PRIZE_IDS, E2E_USERS } from './test-data'

test('истёкшая подписка не показывает отрицательные дни', async ({ page }) => {
  await login(page, E2E_USERS.expired.email)

  const subscriptionOverview = page.getByTestId('subscription-overview')
  await expect(subscriptionOverview.getByRole('heading', { name: 'E2E Стандарт' })).toBeVisible()
  await expect(subscriptionOverview.getByText('-2 дн.', { exact: true })).toHaveCount(0)
  await expect(subscriptionOverview.getByText('Истекла', { exact: true }).first()).toBeVisible()

  await expect(subscriptionOverview.getByText('Осталось', { exact: true })).toBeVisible()
  await expect(subscriptionOverview.getByRole('link', { name: 'Возобновить доступ' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('мобильная навигация переносит второстепенные разделы вниз', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Проверка предназначена для mobile viewport')
  await login(page, E2E_USERS.basic.email)

  await expect(page.locator('.dashboard-topbar')).toBeHidden()
  const navigation = page.getByRole('navigation', { name: 'Основная мобильная навигация' })
  await expect(navigation).toBeVisible()
  await expect(navigation.getByRole('link')).toHaveCount(4)
  await expect(navigation.getByRole('link', { name: 'Главная' })).toBeVisible()
  await expect(navigation.getByRole('link', { name: 'Подключение' })).toBeVisible()
  await expect(navigation.getByRole('link', { name: 'Тарифы' })).toBeVisible()
  await expect(navigation.getByRole('link', { name: 'Поддержка' })).toBeVisible()
  await navigation.getByRole('button', { name: 'Открыть ещё разделы' }).click()

  const moreMenu = page.getByRole('dialog', { name: 'Ещё' })
  await expect(moreMenu.getByRole('link', { name: 'Уведомления' })).toBeVisible()
  await expect(moreMenu.getByRole('link', { name: 'Бонусы' })).toBeVisible()
  await expect(moreMenu.getByRole('link', { name: 'Аккаунт' })).toBeVisible()
  await expect(moreMenu.getByRole('link', { name: 'Админка', exact: true })).toHaveCount(0)
  await moreMenu.getByRole('link', { name: 'Аккаунт' }).click()

  await expect(page).toHaveURL(/\/dashboard\/settings(?:\?|$)/)
  await expect(page.getByRole('heading', { name: 'Аккаунт' })).toBeVisible()
  const settingsTabs = page.getByRole('tablist', { name: 'Разделы настроек' })
  await expect(settingsTabs.getByRole('tab')).toHaveCount(5)
  const autoRenewalTab = settingsTabs.getByRole('tab', { name: 'Автопродление' })
  await expect(autoRenewalTab).toBeVisible()
  await autoRenewalTab.click()
  await expect(page.getByText('Подключение только с согласия')).toBeVisible()
  await expect(page.getByText('Отключение без поддержки')).toBeVisible()
  expect(await settingsTabs.locator('..').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await expectNoHorizontalOverflow(page)

  await page.getByRole('button', { name: 'Выйти' }).click()
  await expect(page).toHaveURL(/\/login(?:\?|$)/)
})

test('свайп переключает основные разделы кабинета', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Проверка предназначена для mobile viewport')
  await login(page, E2E_USERS.basic.email)

  await page.locator('#dashboard-content').evaluate((content) => {
    const makeTouch = (x: number) => new Touch({
      identifier: 1,
      target: content,
      clientX: x,
      clientY: 240,
      screenX: x,
      screenY: 240,
      pageX: x,
      pageY: 240,
      radiusX: 2,
      radiusY: 2,
      force: 1,
    })
    const start = makeTouch(320)
    const end = makeTouch(90)
    content.dispatchEvent(new TouchEvent('touchstart', {
      bubbles: true,
      cancelable: true,
      touches: [start],
      targetTouches: [start],
      changedTouches: [start],
    }))
    content.dispatchEvent(new TouchEvent('touchend', {
      bubbles: true,
      cancelable: true,
      touches: [],
      targetTouches: [],
      changedTouches: [end],
    }))
  })

  await expect(page).toHaveURL(/\/dashboard\/subscription(?:\?|$)/)
  await expect(page.getByRole('heading', { name: 'Подписки пока нет' })).toBeVisible()
})

test('мобильный выбор тарифа открывает оплату отдельным окном', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Проверка предназначена для mobile viewport')
  await login(page, E2E_USERS.basic.email)
  await page.goto('/dashboard/plans')

  await expect(page.getByRole('heading', { name: 'Тарифы' })).toBeVisible()
  const catalog = page.getByRole('region', { name: 'Выбор тарифа' })
  const period = catalog.locator('article').filter({ hasText: 'E2E Стандарт' }).first()
  await period.scrollIntoViewIfNeeded()
  await expect(period.getByText('7 дней', { exact: false })).toBeVisible()
  await period.getByRole('button', { name: 'Оплатить' }).click()

  const checkout = page.getByRole('dialog', { name: 'Оформление подписки' })
  await expect(checkout).toBeVisible()
  await expect(checkout.getByRole('heading', { name: 'E2E Стандарт' })).toBeVisible()
  const deviceSelector = checkout.getByRole('region', { name: 'Количество устройств' })
  const deviceLimit = deviceSelector.getByRole('spinbutton', { name: 'Количество устройств, от 5 до 20' })
  await expect(deviceLimit).toHaveValue('5')
  await expect(checkout.getByText('Включено 5, далее +100.00 ₽ за устройство на весь срок')).toBeVisible()
  await deviceLimit.fill('8')
  await deviceLimit.press('Enter')
  await expect(deviceLimit).toHaveValue('8')
  await expect(checkout.getByText('130.00 ₽ + 300.00 ₽ за 3 доп.')).toBeVisible()
  await expect(deviceSelector.getByText('430.00 ₽', { exact: true })).toBeVisible()
  const paymentProviders = checkout.getByRole('radiogroup', { name: 'Способ оплаты' })
  await expect(paymentProviders.getByRole('radio', { name: 'ЮKassa' })).toBeVisible()
  await expect(paymentProviders.getByRole('radio', { name: 'PayAnyWay' })).toBeVisible()
  await paymentProviders.getByRole('radio', { name: 'PayAnyWay' }).click()
  await expect(paymentProviders.getByRole('radio', { name: 'PayAnyWay' })).toHaveAttribute('aria-checked', 'true')
  const payButton = checkout.getByRole('button', { name: /Перейти к оплате/ })
  await expect(payButton).toBeVisible()
  const payButtonBox = await payButton.boundingBox()
  expect(payButtonBox).not.toBeNull()
  expect(payButtonBox!.y + payButtonBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height)
  await expectNoHorizontalOverflow(page)
})

test('истёкшее подключение показывает только продление', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Проверка предназначена для mobile viewport')
  await login(page, E2E_USERS.expired.email)
  await page.goto('/dashboard/subscription')

  await expect(page.getByRole('heading', { name: 'Подключение' })).toBeVisible()
  await expect(page.locator('h2:visible', { hasText: 'Подписка истекла' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Продлить' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'HAPP', exact: true })).toHaveCount(0)
  await expectNoHorizontalOverflow(page)
})

test('активное подключение показывает добавление приложения и управление устройствами', async ({ page }) => {
  await login(page, E2E_USERS.active.email)
  await page.goto('/dashboard/subscription')

  const access = page.getByTestId('subscription-access')
  await expect(access.getByRole('heading', { name: 'Подписка активна' })).toBeVisible()
  const autoRenewal = page.locator('#auto-renewal')
  await expect(autoRenewal.getByRole('heading', { name: 'Автопродление' })).toBeVisible()
  await expect(autoRenewal.getByText('Работает', { exact: true })).toBeVisible()
  await expect(autoRenewal.getByText('130.00 ₽ · 7 дн.', { exact: true })).toBeVisible()
  await expect(autoRenewal.getByText('VISA •••• 4567', { exact: true })).toBeVisible()
  await expect(autoRenewal.getByRole('button', { name: 'Отключить и отвязать карту' })).toBeVisible()
  await autoRenewal.getByRole('button', { name: 'Отключить и отвязать карту' }).click()
  const cancelDialog = page.getByRole('dialog', { name: 'Отвязать карту' })
  await expect(cancelDialog.getByText('VISA •••• 4567')).toBeVisible()
  await expect(cancelDialog.getByText(/Карта будет отвязана от аккаунта/)).toBeVisible()
  await expect(cancelDialog.getByText(/Доступ сохранится до/)).toBeVisible()
  await cancelDialog.getByRole('button', { name: 'Оставить включённым' }).click()
  await expect(page.getByRole('heading', { name: 'Подключить ещё устройство' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Подключить в/ })).toBeVisible()
  await expect(page.getByLabel('Устройство для подключения')).toBeVisible()
  await expect(page.getByText('Rabbit Hole', { exact: true })).toHaveCount(0)

  const devices = page.getByRole('region', { name: 'Устройства' })
  await expect(devices.getByText('Pixel 8 · Android')).toBeVisible()
  await expect(devices.getByText('Свободно мест: 4.')).toBeVisible()
  await expect(devices.getByRole('button', { name: 'Подключить ещё', exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('рулетка отправляет только один запрос и показывает результат', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await login(page, E2E_USERS.active.email)

  let openRequests = 0
  const prize = {
    id: E2E_BONUS_PRIZE_IDS.epic,
    title: 'E2E скидка 25%',
    description: 'Проверка редкого исхода',
    type: 'PROMO_CODE_PERCENT',
    value: 25,
    weight: 20,
    rarity: 'EPIC',
    chance: 0.2,
  }
  const commonPrize = {
    id: E2E_BONUS_PRIZE_IDS.common,
    title: 'E2E ещё один ход',
    description: 'Проверка обычного исхода',
    type: 'BONUS_ATTEMPTS',
    value: 1,
    weight: 80,
    rarity: 'COMMON',
    chance: 0.8,
  }

  await page.route('**/api/bonus-box', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    openRequests += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'e2e-opening-result',
        prize,
        reel: [commonPrize, prize],
        winningIndex: 1,
        stopOffsetRatio: 0.5,
        promoCode: 'E2EPROMO25',
        promoCodeExpiresAt: '2099-12-31T00:00:00.000Z',
        remainingAttempts: 2,
        remoteSynced: true,
      }),
    })
  })

  await page.goto('/dashboard/bonus-box')
  const hub = page.getByRole('button', { name: /Запустить рулетку/ })
  await hub.click({ clickCount: 2 })

  await expect(page.getByRole('status').filter({ hasText: 'E2E скидка 25%' })).toBeVisible()
  expect(openRequests).toBe(1)
  await expectNoHorizontalOverflow(page)
})

test('рулетка после ограничения показывает обратный отсчёт', async ({ page }) => {
  await login(page, E2E_USERS.active.email)
  await page.route('**/api/bonus-box', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 429,
      headers: { 'Retry-After': '2' },
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Слишком много открытий. Попробуйте позже.', retryAfter: 2 }),
    })
  })

  await page.goto('/dashboard/bonus-box')
  await page.getByRole('button', { name: /Запустить рулетку/ }).click()

  const cooldown = page.getByRole('status').filter({ hasText: 'Следующий запуск через' })
  await expect(cooldown).toContainText('0:02')
  await expect(page.getByRole('button', { name: /Повтор через/ })).toBeDisabled()
  await expect(cooldown).toHaveCount(0, { timeout: 4_000 })
  await expect(page.getByRole('button', { name: /Запустить рулетку/ })).toBeEnabled()
})

test('администратор видит карту вероятностей призов', async ({ page }) => {
  await login(page, E2E_USERS.admin.email)
  await page.goto('/dashboard/admin/bonus-box')
  await page.getByRole('tab', { name: 'Призы и история' }).click()

  const board = page.getByTestId('bonus-probability-board')
  await expect(board.getByRole('heading', { name: 'Карта выпадения' })).toBeVisible()
  await expect(board.getByText('E2E скидка 25%')).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('админская навигация не смешивается с личным кабинетом', async ({ page }, testInfo) => {
  await login(page, E2E_USERS.admin.email)

  if (testInfo.project.name === 'mobile-chromium') {
    await expect(page.locator('.dashboard-topbar')).toBeHidden()
    let navigation = page.getByRole('navigation', { name: 'Основная мобильная навигация' })
    await navigation.getByRole('button', { name: 'Открыть ещё разделы' }).click()
    const cabinetMoreMenu = page.getByRole('dialog', { name: 'Ещё' })
    await expect(cabinetMoreMenu.getByRole('link', { name: 'Кабинет', exact: true })).toBeVisible()
    await cabinetMoreMenu.getByRole('link', { name: 'Админка', exact: true }).click()

    await expect(page).toHaveURL(/\/dashboard\/admin(?:\?|$)/)
    navigation = page.getByRole('navigation', { name: 'Основная мобильная навигация' })
    await expect(navigation.getByRole('link', { name: 'Обзор' })).toBeVisible()
    await expect(navigation.getByRole('link', { name: 'Пользователи' })).toBeVisible()
    await expect(navigation.getByRole('link', { name: 'Платежи' })).toBeVisible()
    await expect(navigation.getByRole('link', { name: 'Главная' })).toHaveCount(0)
    await navigation.getByRole('button', { name: 'Открыть ещё разделы' }).click()
    const adminMoreMenu = page.getByRole('dialog', { name: 'Разделы админки' })
    await expect(adminMoreMenu.getByRole('link', { name: 'Кабинет', exact: true })).toBeVisible()
    await expect(adminMoreMenu.getByRole('link', { name: 'Админка', exact: true })).toBeVisible()
  } else {
    await page.goto('/dashboard/admin')
    const sidebar = page.locator('.dashboard-sidebar')
    await expect(sidebar.getByRole('link', { name: 'Кабинет', exact: true })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: 'Админка', exact: true })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: 'Главная' })).toHaveCount(0)
  }
})

test('массовое начисление прокруток позволяет выбрать получателя и проверить итог', async ({ page }) => {
  await login(page, E2E_USERS.admin.email)
  await page.goto('/dashboard/admin/bonus-box')

  await page.getByRole('tab', { name: 'Призы и история' }).click()
  await page.getByText('Настройки рулетки', { exact: true }).click()

  const grantPanel = page.getByTestId('bonus-attempt-grant-panel')
  await expect(grantPanel).toBeVisible()
  await grantPanel.getByRole('button', { name: /Выбрать/ }).click()
  await grantPanel.getByLabel('Найти пользователя').fill(E2E_USERS.basic.email)

  const recipient = grantPanel.getByRole('button', { name: new RegExp(E2E_USERS.basic.email) })
  await expect(recipient).toBeVisible()
  await recipient.click()
  await grantPanel.getByRole('button', { name: '3', exact: true }).click()
  await expect(grantPanel.getByLabel('Количество прокруток каждому')).toHaveValue('3')
  await grantPanel.getByRole('button', { name: 'Начислить', exact: true }).click()

  const confirmation = page.getByRole('dialog', { name: 'Подтвердить начисление' })
  await expect(confirmation).toBeVisible()
  await expect(confirmation.getByText('Получателей')).toBeVisible()
  await expect(confirmation.getByText('Всего прокруток')).toBeVisible()
  await confirmation.getByRole('button', { name: 'Отмена' }).click()
  await expectNoHorizontalOverflow(page)
})

test('настройки рефералов задают условие и награды обеим сторонам', async ({ page }) => {
  await login(page, E2E_USERS.admin.email)
  await page.goto('/dashboard/admin/referrals')

  await expect(page.getByRole('heading', { name: 'Реферальная программа' })).toBeVisible()
  const panel = page.getByTestId('referral-settings')
  const trigger = panel.getByRole('radiogroup', { name: 'Момент начисления' })
  await expect(trigger.getByRole('radio')).toHaveCount(2)
  const registrationTrigger = trigger.getByRole('radio', { name: /После регистрации/ })
  const minimumPayment = panel.getByLabel('Минимальная сумма первой оплаты')
  await registrationTrigger.click()
  await expect(registrationTrigger).toBeChecked()
  await expect(minimumPayment).toBeDisabled()

  const promotionEnd = panel.getByLabel('Акция действует до')
  await promotionEnd.evaluate((element) => {
    const input = element as HTMLInputElement
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    if (!valueSetter) throw new Error('Native date input setter is unavailable')
    valueSetter.call(input, '2099-12-31')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await expect(panel.getByText(/До 31 дек/)).toBeVisible()

  const referrerReward = panel.getByRole('region', { name: 'Пригласившему' })
  const referredReward = panel.getByRole('region', { name: 'Новому пользователю' })
  await referrerReward.getByLabel('Дней подписки').fill('10')
  await referredReward.getByLabel('Прокруток').fill('3')
  await expect(panel.getByRole('button', { name: 'Сохранить условия' })).toBeEnabled()
  await expectNoHorizontalOverflow(page)
})

test('фильтры списков применяются без отдельной кнопки', async ({ page }, testInfo) => {
  await login(page, E2E_USERS.admin.email)
  await page.goto('/dashboard/admin/payments')

  if (testInfo.project.name === 'mobile-chromium') {
    await page.getByRole('button', { name: 'Поиск и фильтры' }).click()
  }
  const filters = page.getByRole('form', { name: 'Фильтры списка' })
  await expect(filters.getByRole('button', { name: /Применить|Найти|Искать/ })).toHaveCount(0)

  await filters.getByLabel('Провайдер').selectOption('PLATEGA')
  await expect(page).toHaveURL(/provider=PLATEGA/)

  await filters.getByLabel('Поиск платежей').fill('e2e')
  await expect(page).toHaveURL(/q=e2e/)
})

test('действия пользователя открывают формы и не закрываются вместе с меню', async ({ page }) => {
  await login(page, E2E_USERS.admin.email)
  await page.goto(`/dashboard/admin/users?q=${encodeURIComponent(E2E_USERS.basic.email)}`)

  const label = `Действия: ${E2E_USERS.basic.email}`
  const userCard = page.locator('article').filter({ hasText: E2E_USERS.basic.email })
  const openUserAction = async (name: string) => {
    await userCard.getByRole('button', { name: label }).click()
    await page.getByRole('dialog', { name: label }).getByRole('button', { name }).click()
  }
  const closeDialog = async (name: string) => {
    const dialog = page.getByRole('dialog', { name })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Закрыть' }).click()
  }

  await openUserAction('Открыть пользователя')
  await closeDialog(E2E_USERS.basic.email)
  await openUserAction('Начислить подарок')
  await closeDialog('Начислить открытия')
  await openUserAction('Назначить тариф')
  await closeDialog('Назначить тариф')
  await openUserAction('Редактировать профиль')
  await closeDialog('Профиль пользователя')
})

test('мобильные уведомления доступны через меню «Ещё»', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Проверка предназначена для mobile viewport')
  await login(page, E2E_USERS.basic.email)

  const navigation = page.getByRole('navigation', { name: 'Основная мобильная навигация' })
  await navigation.getByRole('button', { name: 'Открыть ещё разделы' }).click()
  const moreMenu = page.getByRole('dialog', { name: 'Ещё' })
  await moreMenu.getByRole('link', { name: 'Уведомления' }).click()

  await expect(page).toHaveURL(/\/dashboard\/notifications(?:\?|$)/)
  await expect(page.getByRole('heading', { name: 'Уведомления' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('каталог тарифов использует компактные строки с понятными действиями', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Проверка предназначена для desktop viewport')
  await login(page, E2E_USERS.admin.email)
  await page.goto('/dashboard/admin/plans')

  await expect(page.getByRole('heading', { name: 'Тарифы' })).toBeVisible()
  const grid = page.getByTestId('admin-plan-grid')
  const card = page.getByTestId('admin-plan-card').filter({ hasText: 'E2E Стандарт' })
  await expect(card).toHaveCount(1)
  const actionsTrigger = card.getByRole('button', { name: 'Действия: E2E Стандарт' })
  await actionsTrigger.click()
  await expect(actionsTrigger).toHaveAttribute('aria-expanded', 'true')
  const actions = page.getByRole('dialog', { name: 'Действия: E2E Стандарт' })
  await expect(actions).toBeVisible()
  await actions.getByRole('button', { name: 'Изменить тариф E2E Стандарт' }).click()
  const editor = page.getByRole('dialog', { name: /Редактировать «E2E Стандарт»/ })
  await expect(editor).toBeVisible()
  await expect(editor.getByRole('spinbutton', { name: 'Включено устройств' })).toHaveValue('5')
  await expect(editor.getByRole('spinbutton', { name: 'Максимум устройств' })).toHaveValue('20')
  await expect(editor.getByRole('spinbutton', { name: 'Доплата за устройство, ₽' })).toHaveValue('100')
  await editor.getByText('Разрешить покупку дополнения', { exact: true }).click()

  const editorFooter = editor.getByTestId('admin-modal-footer')
  await expect(editorFooter).toBeVisible()
  expect(await editor.evaluate((element) => element.scrollTop)).toBe(0)
  const [editorBox, footerBox] = await Promise.all([editor.boundingBox(), editorFooter.boundingBox()])
  expect(editorBox).not.toBeNull()
  expect(footerBox).not.toBeNull()
  expect(Math.abs(footerBox!.y + footerBox!.height - (editorBox!.y + editorBox!.height))).toBeLessThanOrEqual(2)
  await editor.getByRole('button', { name: 'Закрыть' }).click()

  let toggleIsActive: boolean | undefined
  await page.route(/\/api\/admin\/plans\/[^/]+$/, async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue()
      return
    }
    toggleIsActive = (route.request().postDataJSON() as { isActive?: boolean }).isActive
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await card.getByRole('button', { name: 'Действия: E2E Стандарт' }).click()
  await actions.getByRole('button', { name: 'Скрыть тариф E2E Стандарт' }).click()
  await expect.poll(() => toggleIsActive).toBe(false)

  const lastCard = page.getByTestId('admin-plan-card').last()
  await lastCard.scrollIntoViewIfNeeded()
  await lastCard.getByRole('button', { name: /^Действия:/ }).click()
  const lastMenu = page.getByRole('dialog', { name: /^Действия:/ })
  await expect(lastMenu).toBeVisible()
  const menuBox = await lastMenu.boundingBox()
  expect(menuBox).not.toBeNull()
  expect(menuBox!.y).toBeGreaterThanOrEqual(8)
  expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height - 8)
  await page.keyboard.press('Escape')

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

test('экраны админки не создают горизонтальную прокрутку', async ({ page }) => {
  await login(page, E2E_USERS.admin.email)

  const screens = [
    ['/dashboard/admin', 'Обзор'],
    ['/dashboard/admin/payments', 'Платежи'],
    ['/dashboard/admin/support', 'Поддержка'],
    ['/dashboard/admin/duplicates', 'Возможные дубли'],
    ['/dashboard/admin/audit', 'История действий'],
    ['/dashboard/admin/recovery', 'Контроль подписок'],
    ['/dashboard/admin/bonus-box', 'Подарки'],
    ['/dashboard/admin/notifications', 'Уведомления'],
    ['/dashboard/admin/broadcasts', 'Рассылки'],
    ['/dashboard/admin/remnashop-sync', 'Remnashop'],
    ['/dashboard/admin/system', 'Настройки'],
  ] as const

  for (const [href, title] of screens) {
    await page.goto(href)
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    await expectNoHorizontalOverflow(page)
  }
})

test('функции кабинета управляются из системного раздела', async ({ page }) => {
  await login(page, E2E_USERS.admin.email)
  await page.goto('/dashboard/admin/system')
  await page.getByRole('tab', { name: 'Функции' }).click()

  const features = page.getByRole('main').getByTestId('feature-settings')
  await expect(features).toBeVisible()
  await expect(features.getByRole('switch')).toHaveCount(4)
  await expect(features.getByText('Рефералы', { exact: true })).toBeVisible()
  await expect(features.getByText('Подарки', { exact: true })).toBeVisible()
  await expect(features.getByText('Поддержка', { exact: true })).toBeVisible()
  await expect(features.getByText('Рассылки', { exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('рассылка собирается в компактном редакторе', async ({ page }) => {
  await login(page, E2E_USERS.admin.email)
  await page.goto('/dashboard/admin/broadcasts')

  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { level: 1, name: 'Рассылки' })).toBeVisible()
  await main.getByLabel('Шаблон').selectOption({ index: 1 })
  await expect(main.getByPlaceholder('Короткое сообщение для пользователя')).not.toHaveValue('')

  await main.getByRole('button', { name: /Аудитория/ }).click()
  await expect(main.getByRole('combobox', { name: /^Аудитория/ })).toBeVisible()
  await main.getByRole('button', { name: /Отправка/ }).click()
  await expect(main.getByText('Предпросмотр', { exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('уведомления используют компактные фильтры', async ({ page }) => {
  await login(page, E2E_USERS.admin.email)
  await page.goto('/dashboard/admin/notifications')

  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { level: 1, name: 'Уведомления' })).toBeVisible()
  await main.getByLabel('Тип уведомлений').selectOption('payment')
  await main.getByRole('button', { name: 'Только непрочитанные' }).click()
  await expect(main.getByRole('button', { name: 'Только непрочитанные' })).toHaveAttribute('aria-pressed', 'true')
  await expectNoHorizontalOverflow(page)
})
