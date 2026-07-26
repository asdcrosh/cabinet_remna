import { expect, test } from '@playwright/test'
import { expectNoHorizontalOverflow, login } from './helpers'
import { E2E_USERS } from './test-data'

test('истёкшая подписка не показывает отрицательные дни', async ({ page }) => {
  await login(page, E2E_USERS.expired.email)

  const subscriptionOverview = page.getByTestId('subscription-overview')
  await expect(subscriptionOverview.getByRole('heading', { name: 'E2E Стандарт' })).toBeVisible()
  await expect(subscriptionOverview.getByText('-2 дн.', { exact: true })).toHaveCount(0)
  await expect(subscriptionOverview.getByText('Срок доступа истёк', { exact: true })).toBeVisible()

  await expect(subscriptionOverview.getByText('Осталось', { exact: true })).toBeVisible()
  await expect(subscriptionOverview.getByText('Трафик', { exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('мобильная навигация показывает пять основных разделов', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Проверка предназначена для mobile viewport')
  await login(page, E2E_USERS.basic.email)

  const navigation = page.getByRole('navigation', { name: 'Основная мобильная навигация' })
  await expect(navigation).toBeVisible()
  await expect(navigation.getByRole('link')).toHaveCount(5)
  await expect(navigation.getByRole('link', { name: 'Главная' })).toBeVisible()
  await expect(navigation.getByRole('link', { name: 'Подключение' })).toBeVisible()
  await expect(navigation.getByRole('link', { name: 'Тарифы' })).toBeVisible()
  await expect(navigation.getByRole('link', { name: 'Бонусы' })).toBeVisible()
  await navigation.getByRole('link', { name: 'Аккаунт' }).click()

  await expect(page).toHaveURL(/\/dashboard\/settings(?:\?|$)/)
  await expect(page.getByRole('heading', { name: 'Аккаунт' })).toBeVisible()
  const settingsTabs = page.getByRole('tablist', { name: 'Разделы настроек' })
  await expect(settingsTabs.getByRole('tab')).toHaveCount(3)
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
  await expect(page.getByRole('heading', { name: 'Нет активной подписки' })).toBeVisible()
})

test('мобильный выбор тарифа открывает оплату отдельным окном', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Проверка предназначена для mobile viewport')
  await login(page, E2E_USERS.basic.email)
  await page.goto('/dashboard/plans')

  await expect(page.getByRole('heading', { name: 'Тарифы' })).toBeVisible()
  const catalog = page
    .locator('section[aria-labelledby="mobile-plan-picker-title"]')
  const period = catalog.locator('article').filter({ hasText: 'E2E Стандарт' }).first()
  await period.scrollIntoViewIfNeeded()
  await expect(period.getByText('7 дней', { exact: false })).toBeVisible()
  await period.getByRole('button', { name: 'Оплатить' }).click()

  const checkout = page.getByRole('dialog', { name: 'Оплата тарифа' })
  await expect(checkout).toBeVisible()
  await expect(checkout.getByRole('heading', { name: 'E2E Стандарт' })).toBeVisible()
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
  await expect(page.getByText('Подписка истекла', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Продлить' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'HAPP', exact: true })).toHaveCount(0)
  await expectNoHorizontalOverflow(page)
})

test('админская навигация не смешивается с личным кабинетом', async ({ page }, testInfo) => {
  await login(page, E2E_USERS.admin.email)
  await page.goto('/dashboard/admin')

  if (testInfo.project.name === 'mobile-chromium') {
    const navigation = page.getByRole('navigation', { name: 'Основная мобильная навигация' })
    await expect(navigation.getByRole('link', { name: 'Обзор' })).toBeVisible()
    await expect(navigation.getByRole('link', { name: 'Пользователи' })).toBeVisible()
    await expect(navigation.getByRole('link', { name: 'Платежи' })).toBeVisible()
    await expect(navigation.getByRole('link', { name: 'Главная' })).toHaveCount(0)
    await navigation.getByRole('button', { name: 'Открыть ещё разделы' }).click()
    await expect(page.getByRole('dialog', { name: 'Админка' })).toBeVisible()
  } else {
    const sidebar = page.locator('.dashboard-sidebar')
    await expect(sidebar.getByRole('link', { name: 'Кабинет', exact: true })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: 'Админка', exact: true })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: 'Главная' })).toHaveCount(0)
  }
})

test('действия пользователя открывают формы и не закрываются вместе с меню', async ({ page }, testInfo) => {
  await login(page, E2E_USERS.admin.email)
  await page.goto(`/dashboard/admin/users?q=${encodeURIComponent(E2E_USERS.basic.email)}`)

  const label = `Действия: ${E2E_USERS.basic.email}`
  const userCard = page.locator('article').filter({ hasText: E2E_USERS.basic.email })
  const menuRole = testInfo.project.name === 'mobile-chromium' ? 'dialog' : 'menu'
  const openUserAction = async (name: string) => {
    await userCard.getByRole('button', { name: label }).click()
    await page.getByRole(menuRole, { name: label }).getByRole('button', { name }).click()
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
  await card.getByRole('button', { name: 'Действия: E2E Стандарт' }).click()
  const actions = page.getByRole('menu', { name: 'Действия: E2E Стандарт' })
  await actions.getByRole('button', { name: 'Изменить тариф E2E Стандарт' }).click()
  const editor = page.getByRole('dialog', { name: /Редактировать «E2E Стандарт»/ })
  await expect(editor).toBeVisible()
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
  const lastMenu = page.getByRole('menu')
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
    ['/dashboard/admin/recovery', 'Довыдача'],
    ['/dashboard/admin/bonus-box', 'Подарки'],
    ['/dashboard/admin/notifications', 'Уведомления'],
    ['/dashboard/admin/broadcasts', 'Рассылки'],
    ['/dashboard/admin/remnashop-sync', 'Синхронизация'],
    ['/dashboard/admin/system', 'Система'],
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
