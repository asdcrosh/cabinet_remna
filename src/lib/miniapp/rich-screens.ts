import { escapeTelegramHtml as escape } from '@/lib/telegram-format'
import type { MiniAppOverview } from './model'
import { formatPrice } from '@/lib/format'

export type BotScreen = 'home' | 'subscription' | 'plans' | 'billing' | 'devices' | 'bonus' | 'notifications' | 'referrals' | 'support' | 'connect' | 'settings' | 'admin'
export const botScreens: BotScreen[] = ['home', 'subscription', 'plans', 'billing', 'devices', 'bonus', 'notifications', 'referrals', 'support', 'connect', 'settings', 'admin']
export type BotDevice = { id: string; title: string; platform: string }
export type BotSpinResult = { prizeTitle: string; prizeDescription: string | null; promoCode: string | null; promoCodeExpiresAt: string | null; remainingAttempts: number }
export type RichScreenInput = {
  screen: BotScreen
  overview: MiniAppOverview | null
  appUrl: string
  bannerUrl?: string
  referral?: { url: string; condition: string; invited: number; claimed: number; channelUrl: string | null; eligible: boolean; ownClaimed: boolean }
  devices?: BotDevice[]
  tickets?: Array<{ subject: string; status: string }>
  payments?: Array<{ title: string; amount: string; status: string; date: string }>
  autoRenewal?: string | null
  bonus?: { enabled: boolean; attempts: number }
  inbox?: { unread: number; items: Array<{ title: string; date: string; fresh: boolean }> }
  prefs?: { telegram: boolean; email: boolean; broadcasts: boolean }
  adminStats?: { users: number; activeSubscriptions: number; paymentsToday: number; openTickets: number }
  admin?: boolean
  notice?: string
}
const titles: Record<BotScreen, string> = {
  home: 'Главная', subscription: 'Подписка', plans: 'Выберите тариф', billing: 'Платежи', devices: 'Устройства',
  bonus: 'Бонусы', notifications: 'Уведомления', referrals: 'Пригласить друга', support: 'Поддержка',
  connect: 'Подключение', settings: 'Настройки', admin: 'Управление сервисом',
}
const cb = (label: string, screen: string, style = 'primary') => `<tg-button type="callback_data" style="${style}" data="avp:${escape(screen)}">${escape(label)}</tg-button>`
const row = (...buttons: string[]) => `<tg-button-row>${buttons.join('')}</tg-button-row>`
const table = (rows: string[][]) => `<table bordered compact>${rows.map(cells => `<tr>${cells.map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</table>`
const brandHeader = (bannerUrl?: string) => bannerUrl && /^https:\/\//.test(bannerUrl) ? `<img src="${escape(bannerUrl)}">` : '<h2>AlekseevVP</h2>'

// Pure renderer: no personal key, password, initData or panel token can enter its DTO.
export function buildRichScreen(input: RichScreenInput) {
  const app = (label: string, tab: string) => {
    const url = new URL(input.appUrl); url.searchParams.set('tab', tab)
    return `<tg-button type="web_app" style="success" url="${escape(url.toString())}">${escape(label)}</tg-button>`
  }
  const parts = [brandHeader(input.bannerUrl), `<h3>${titles[input.screen]}</h3>`]
  if (input.notice) parts.push(`<p>${escape(input.notice)}</p>`)
  const data = input.overview
  if (!data) {
    parts.push('<p>Подписка, устройства и обращения в одном месте.</p><p>Войдите через Telegram, чтобы открыть свой кабинет.</p>', row(app('Открыть кабинет', 'home')))
    return parts.join('')
  }
  if (data.warning) parts.push(`<p>${escape(data.warning)}</p>`)
  const sub = data.subscription
  const currentPlan = data.plans.find(plan => plan.current && !plan.isPromo) ?? null
  switch (input.screen) {
    case 'home':
    case 'subscription':
      parts.push(`<h4>${escape(sub?.title || 'Подписка пока не оформлена')}</h4>`)
      if (sub) parts.push(table([
        ['Тариф', sub.planName],
        ['Действует до', sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' }) : 'Без ограничения'],
        ['Осталось', sub.daysLeft == null ? 'Без ограничения' : `${Math.max(0, sub.daysLeft)} дней`],
        ['Устройства', `${data.deviceCount} из ${sub.deviceLimit ?? 'без лимита'}`],
      ]))
      parts.push(row(cb('Подключить VPN', 'connect', 'success'), cb('Выбрать тариф', 'plans')),
        row(cb('Устройства', 'devices'), cb('Платежи', 'billing')),
        row(cb('Бонусы', 'bonus'), cb('Уведомления', 'notifications')))
      break
    case 'plans':
      if (!data.plans.length) parts.push('<p>Для вашего аккаунта сейчас нет доступных тарифов.</p>')
      for (const plan of data.plans) parts.push('<hr>', `<h4>${plan.current ? 'Текущий · ' : ''}${escape(plan.name)}</h4>`, table([
        ['Срок', plan.unlimited ? 'Без ограничения' : `${plan.days} дней`],
        ['Устройства', plan.unlimitedDevices ? 'Без ограничения' : plan.deviceAddonEnabled ? `${plan.devices}–${plan.maxDevices}` : String(plan.initialDevices)],
        ['Трафик', plan.trafficLimitGb == null ? 'Без ограничения' : `${plan.trafficLimitGb} ГБ`],
      ]), `<p>${plan.isPromo ? 'Бесплатно' : `Базовая цена ${escape(formatPrice(plan.priceKopecks))}`}</p>`,
      row(cb(plan.isPromo ? 'Получить доступ' : plan.current ? 'Продлить тариф' : 'Оформить тариф', plan.isPromo ? `buy:${plan.id}` : `pay:${plan.id}`, 'success')))
      parts.push('<hr><p>Продление того же тарифа добавляет дни. При смене тарифа начинается новый срок: остаток прежнего не переносится.</p>', row(app('Сравнить в приложении', 'plans')))
      break
    case 'billing': {
      parts.push(`<h4>${escape(sub?.title || 'Подписка пока не оформлена')}</h4>`)
      if (input.autoRenewal) parts.push(`<p>Автопродление: ${escape(input.autoRenewal)}</p>`)
      if (currentPlan) parts.push(row(cb(`Продлить · ${formatPrice(currentPlan.priceKopecks)}`, `pay:${currentPlan.id}`, 'success')))
      if (!input.payments?.length) parts.push('<p>Оплат пока не было. История появится после первой покупки.</p>')
      if (input.payments?.length) parts.push('<h4>Последние операции</h4>',
        table(input.payments.map(payment => [`${payment.date} · ${payment.title}`, `${payment.amount} · ${payment.status}`])))
      parts.push(row(app('История и автопродление', 'billing')))
      break
    }
    case 'devices': {
      parts.push(`<p>Подключено устройств: ${data.deviceCount}${sub?.deviceLimit ? ` из ${sub.deviceLimit}` : ''}. Список синхронизирован с кабинетом.</p>`)
      if (!input.devices?.length) parts.push('<p>Подключённых устройств пока нет. Откройте инструкцию и добавьте первое.</p>')
      if (input.devices?.length) {
        parts.push(table(input.devices.map(device => [device.title, device.platform])))
        const deleteButtons = input.devices.slice(0, 6).map(device => cb(`Удалить ${device.title.slice(0, 18)}`, `devdel:${device.id}`))
        const deleteRows: string[] = []
        for (let i = 0; i < deleteButtons.length; i += 2) deleteRows.push(row(...deleteButtons.slice(i, i + 2)))
        parts.push(...deleteRows)
      }
      parts.push(row(cb('Добавить устройство', 'connect', 'success')))
      break
    }
    case 'connect':
      parts.push('<h4>01 / Выберите приложение</h4>', table([['iPhone / Mac', 'Rabbit Hole'], ['Android', 'INCY'], ['Windows', 'HAPP']]),
        '<h4>02 / Добавьте подписку</h4><p>Откройте персональную ссылку в приложении кабинета.</p>',
        '<h4>03 / Включите VPN</h4><p>После импорта нажмите «Подключить» в VPN-клиенте.</p>',
        row(app('Открыть настройку', 'connect')),
        '<p>Персональная ссылка доступна только после входа. Бот не показывает состояние VPN-туннеля.</p>')
      break
    case 'bonus': {
      if (input.bonus && !input.bonus.enabled) {
        parts.push('<p>Бонусная программа сейчас отключена. Загляните позже.</p>')
        break
      }
      const attempts = input.bonus?.attempts ?? 0
      parts.push('<h4>Колесо подарков</h4>', attempts > 0
        ? `<p>Доступно попыток: ${attempts}. Приз начисляется сразу, не закрывая чат.</p>`
        : '<p>Новые попытки появляются за задания, покупки и приглашения друзей.</p>')
      if (attempts > 0) parts.push(row(cb(`Крутить колесо · ${attempts}`, 'spin', 'success')))
      if (data.referrals) parts.push(row(cb('Пригласить друга', 'referrals')))
      parts.push(row(app('Задания и призы', 'bonus')))
      break
    }
    case 'notifications': {
      const unread = input.inbox?.unread ?? 0
      parts.push(unread > 0 ? `<h4>Непрочитанных: ${unread}</h4>` : '<p>Все уведомления прочитаны.</p>')
      if (input.inbox?.items.length) parts.push(table(input.inbox.items.map(item => [item.date, item.fresh ? `${item.title} · новое` : item.title])))
      if (input.inbox && !input.inbox.items.length) parts.push('<p>Здесь появятся важные события подписки и сообщения сервиса.</p>')
      if (unread > 0) parts.push(row(cb('Прочитать все', 'readall', 'success')))
      break
    }
    case 'referrals': {
      const r = input.referral
      parts.push('<h4>Бонус за друга</h4>', `<p>${escape(r?.condition || 'Программа бонусов за вступление в канал готовится.')}</p>`)
      if (r) {
        parts.push(table([['Приглашено', String(r.invited)], ['Бонусов подтверждено', String(r.claimed)]]),
          row(`<tg-button type="copy_text" text="${escape(r.url)}">Скопировать ссылку</tg-button>`))
        if (r.channelUrl) parts.push(row(`<tg-button type="url" style="primary" url="${escape(r.channelUrl)}">Вступить в канал</tg-button>`))
        if (r.eligible && !r.ownClaimed) parts.push(row(cb('Я вступил, проверить', 'claim', 'success')))
        if (r.ownClaimed) parts.push('<p>Бонус подтверждён. Начисление выполняется через общую очередь кабинета.</p>')
      }
      break
    }
    case 'support':
      parts.push('<p>Напишите нам в кабинете. История диалогов сохранится в вашем аккаунте.</p>')
      if (!input.tickets?.length) parts.push('<p>Открытых обращений нет.</p>')
      if (input.tickets?.length) parts.push('<h4>Открытые обращения</h4>', table(input.tickets.map(ticket => [ticket.subject, ticket.status])))
      parts.push('<p>По вопросам оплаты укажите номер заказа.</p>', row(app('Открыть поддержку', 'support')))
      break
    case 'settings':
      parts.push('<p>Профиль, безопасность и каналы уведомлений.</p>')
      if (input.prefs) parts.push(table([
        ['Telegram', input.prefs.telegram ? 'Включены' : 'Выключены'],
        ['Email', input.prefs.email ? 'Включены' : 'Выключены'],
        ['Рассылки', input.prefs.broadcasts ? 'Включены' : 'Выключены'],
      ]))
      parts.push(row(app('Открыть настройки', 'settings')))
      break
    case 'admin':
      if (input.admin) {
        if (input.adminStats) parts.push(table([
          ['Пользователи', String(input.adminStats.users)],
          ['Активные подписки', String(input.adminStats.activeSubscriptions)],
          ['Оплаты сегодня', String(input.adminStats.paymentsToday)],
          ['Открытые тикеты', String(input.adminStats.openTickets)],
        ]))
        parts.push('<p>Пользователи, платежи, тарифы, рассылки и поддержка — в панели управления.</p>', row(app('Открыть панель управления', 'admin')))
      }
      break
  }
  if (input.screen === 'home') {
    const extraButtons = [...(data.referrals ? [cb('Пригласить друга', 'referrals')] : []), ...(data.support ? [cb('Поддержка', 'support')] : []), cb('Настройки', 'settings'), ...(input.admin ? [cb('Админка', 'admin')] : [])]
    if (extraButtons.length) parts.push(row(...extraButtons))
  }
  parts.push('<hr>', row(cb('На главную', 'home'), cb('Обновить', input.screen, 'link')))
  return parts.join('')
}

// Подтверждение отвязки устройства — до необратимого действия всегда один шаг.
export function buildDeviceDeleteConfirm(input: RichScreenInput, device: BotDevice) {
  const parts = [brandHeader(input.bannerUrl), '<h3>Удалить устройство?</h3>',
    table([[device.title, device.platform]]),
    '<p>Место в лимите освободится сразу. Вход в приложение на этом устройстве завершится. Устройство сможет подключиться снова, пока есть свободные места.</p>',
    row(cb('Да, удалить', `devyes:${device.id}`, 'success')),
    row(cb('Отмена', 'devices'))]
  return parts.join('')
}

// Результат розыгрыша колеса подарков прямо в чате.
export function buildSpinResultScreen(input: RichScreenInput, spin: BotSpinResult) {
  const parts = [brandHeader(input.bannerUrl), '<h3>Колесо подарков</h3>',
    `<h4>🎉 ${escape(spin.prizeTitle)}</h4>`]
  if (spin.prizeDescription) parts.push(`<p>${escape(spin.prizeDescription)}</p>`)
  if (spin.promoCode) {
    parts.push(table([['Промокод', spin.promoCode], ...(spin.promoCodeExpiresAt ? [['Действует до', new Date(spin.promoCodeExpiresAt).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })]] as string[][] : [])]),
      row(`<tg-button type="copy_text" text="${escape(spin.promoCode)}">Скопировать промокод</tg-button>`))
  }
  parts.push(`<p>Осталось попыток: ${spin.remainingAttempts}.</p>`)
  if (spin.remainingAttempts > 0) parts.push(row(cb(`Крутить ещё · ${spin.remainingAttempts}`, 'spin', 'success')))
  parts.push(row(cb('К бонусам', 'bonus')), '<hr>', row(cb('На главную', 'home'), cb('Обновить', 'bonus', 'link')))
  return parts.join('')
}

export function buildRichPaymentScreen(input: RichScreenInput, planId: string, yookassaAvailable: boolean) {
  const plan = input.overview?.plans.find(item => item.id === planId && !item.isPromo)
  if (!plan) return `${brandHeader(input.bannerUrl)}<h3>Тариф недоступен</h3><p>Откройте актуальный список тарифов.</p>${row(cb('К тарифам', 'plans'))}`
  const siteUrl = new URL('/pay', input.appUrl)
  siteUrl.searchParams.set('plan', plan.id)
  const parts = [
    `${brandHeader(input.bannerUrl)}<h3>Способ оплаты</h3>`,
    table([
      ['За что', `${plan.name}, ${plan.unlimited ? 'бессрочно' : `${plan.days} дней`}`],
      ['Базовая стоимость', formatPrice(plan.priceKopecks)],
    ]),
    '<p>Дополнительные устройства и скидки учитываются перед оплатой. Итоговую сумму покажем на сайте.</p>',
  ]
  if (yookassaAvailable) parts.push(row(`<tg-button type="url" style="success" url="${escape(siteUrl.toString())}">Оплатить ₽ через ЮKassa на сайте</tg-button>`))
  if (input.overview?.starsEnabled && input.overview.starsRateKopecks) {
    parts.push(row(cb('Оплатить в Stars', `buy:${plan.id}`)))
  }
  if (!yookassaAvailable && !input.overview?.starsEnabled) parts.push('<p>Оплата сейчас недоступна.</p>')
  parts.push('<hr><p>Бот и сайт используют один аккаунт. Для оплаты на сайте может потребоваться вход.</p>', row(cb('К тарифам', 'plans')))
  return parts.join('')
}
