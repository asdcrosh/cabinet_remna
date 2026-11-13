import { escapeTelegramHtml as escape } from '@/lib/telegram-format'
import type { MiniAppOverview } from './model'

export type BotScreen = 'home' | 'subscription' | 'plans' | 'billing' | 'devices' | 'bonus' | 'notifications' | 'referrals' | 'support' | 'connect' | 'settings' | 'admin'
export const botScreens: BotScreen[] = ['home', 'subscription', 'plans', 'billing', 'devices', 'bonus', 'notifications', 'referrals', 'support', 'connect', 'settings', 'admin']
export type RichScreenInput = {
  screen: BotScreen
  overview: MiniAppOverview | null
  appUrl: string
  bannerUrl?: string
  referral?: { url: string; condition: string; invited: number; claimed: number; channelUrl: string | null; eligible: boolean; ownClaimed: boolean }
  devices?: Array<{ title: string; platform: string }>
  tickets?: Array<{ subject: string; status: string }>
  payments?: Array<{ title: string; amount: string; status: string; date: string }>
  autoRenewal?: string | null
  bonus?: { enabled: boolean; attempts: number }
  inbox?: { unread: number; items: Array<{ title: string; date: string; fresh: boolean }> }
  prefs?: { telegram: boolean; email: boolean; broadcasts: boolean }
  adminStats?: { users: number; activeSubscriptions: number; paymentsToday: number; openTickets: number }
  notice?: string
  admin?: boolean
}
const titles: Record<BotScreen, string> = {
  home: '🏠 Личный кабинет', subscription: '🔐 Моя подписка', plans: '💳 Тарифы', billing: '🧾 Подписка и оплата',
  devices: '📱 Устройства', bonus: '🎁 Бонусы', notifications: '🔔 Уведомления', referrals: '🤝 Пригласить друга',
  support: '💬 Поддержка', connect: '🔌 Подключить VPN', settings: '⚙️ Настройки', admin: '🛠 Управление сервисом',
}
const cb = (label: string, screen: string, style = 'primary') => `<tg-button type="callback_data" style="${style}" data="avp:${escape(screen)}">${escape(label)}</tg-button>`
const row = (...buttons: string[]) => `<tg-button-row>${buttons.join('')}</tg-button-row>`
const table = (rows: string[][]) => `<table bordered compact>${rows.map(cells => `<tr>${cells.map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</table>`
const toggle = (on: boolean) => (on ? '✅ Вкл' : '⛔️ Выкл')

// Pure renderer: no personal key, password, initData or panel token can enter its DTO.
export function buildRichScreen(input: RichScreenInput) {
  const app = (label: string, tab: string) => {
    const url = new URL(input.appUrl); url.searchParams.set('tab', tab)
    return `<tg-button type="web_app" style="success" url="${escape(url.toString())}">${escape(label)}</tg-button>`
  }
  const header = input.bannerUrl && /^https:\/\//.test(input.bannerUrl) ? `<img src="${escape(input.bannerUrl)}">` : '<h2>AlekseevVP</h2>'
  const parts = [header, `<h3>${titles[input.screen]}</h3>`]
  if (input.notice) parts.push(`<p>ℹ️ ${escape(input.notice)}</p>`)
  const data = input.overview
  if (!data) {
    parts.push('<p><b>Ваш интернет. Ваши правила.</b></p><p>Войдите через Telegram, чтобы открыть общую подписку и устройства из кабинета.</p>', row(app('Войти через Telegram', 'home')))
    return parts.join('')
  }
  if (data.warning) parts.push(`<p>⚠️ ${escape(data.warning)}</p>`)
  const sub = data.subscription
  const subTable = () => table([
    ['Тариф', sub!.planName], ['Срок', sub!.expiresAt ? new Date(sub!.expiresAt).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' }) : 'Без ограничения'],
    ['Осталось', sub!.daysLeft == null ? 'Без ограничения' : `${Math.max(0, sub!.daysLeft)} дн.`],
    ['Устройства', `${data.deviceCount} / ${sub!.deviceLimit ?? 'без лимита'}`],
  ])
  switch (input.screen) {
    case 'home':
    case 'subscription':
      if (sub) {
        parts.push(`<p><b>${sub.usable ? '✅' : '⏳'} ${escape(sub.title)}</b></p>`)
        if (sub.pending) parts.push('<p>⏳ Оплата получена, подписка выдаётся — обычно это занимает меньше минуты.</p>')
        parts.push(subTable())
      } else {
        parts.push('<p><b>Подписка пока не оформлена</b></p><p>Выберите тариф, чтобы получить доступ и подключить устройства.</p>')
      }
      parts.push(row(cb('🔌 Подключить VPN', 'connect', 'success'), cb('💳 Тарифы', 'plans')),
        row(cb('📱 Устройства', 'devices'), cb('🧾 Платежи', 'billing')),
        row(cb('🎁 Бонусы', 'bonus'), cb('🔔 Уведомления', 'notifications')))
      break
    case 'plans':
      if (!data.plans.length) parts.push('<p>Для вашего аккаунта сейчас нет доступных тарифов.</p>')
      for (const plan of data.plans) parts.push(`<h4>${plan.current ? '⭐ ' : ''}${escape(plan.name)}</h4>`, table([
        ['Срок', plan.unlimited ? 'Без ограничения' : `${plan.days} дней`],
        ['Устройства', plan.unlimitedDevices ? 'Без ограничения' : plan.deviceAddonEnabled ? `${plan.devices}–${plan.maxDevices}` : String(plan.initialDevices)],
        ['Трафик', plan.trafficLimitGb == null ? 'Без ограничения' : `${plan.trafficLimitGb} ГБ`],
      ]))
      parts.push('<p>При продлении того же тарифа дни добавляются. При смене тарифа начинается новый срок, остаток прежнего не переносится. Платная покупка внутри Telegram станет доступна после подключения Stars.</p>', row(app('Открыть тарифы', 'plans')))
      break
    case 'billing': {
      if (sub) parts.push(`<p><b>${sub.usable ? '✅' : '⏳'} ${escape(sub.title)}</b> · ${escape(sub.planName)}</p>`)
      else parts.push('<p><b>Подписка пока не оформлена.</b></p>')
      if (input.autoRenewal) parts.push(`<p>🔁 Автопродление: ${escape(input.autoRenewal)}</p>`)
      if (input.payments?.length) {
        parts.push('<h4>Последние операции</h4>')
        for (const payment of input.payments) parts.push(table([[payment.date, payment.title], [payment.amount, payment.status]]))
      } else parts.push('<p>Оплат пока не было.</p>')
      parts.push('<p>Платная покупка внутри Telegram станет доступна после подключения Stars.</p>', row(app('Открыть платежи', 'billing')))
      break
    }
    case 'devices':
      parts.push(`<p>Подключено устройств: <b>${data.deviceCount}${sub?.deviceLimit ? ` / ${sub.deviceLimit}` : ''}</b>. Лимит общий с кабинетом.</p>`)
      if (!input.devices?.length) parts.push('<p>Подключённых устройств пока нет.</p>')
      for (const device of input.devices ?? []) parts.push(table([[device.title, device.platform]]))
      parts.push(row(cb('🔌 Подключить устройство', 'connect', 'success')), row(app('Переименовать или удалить', 'devices')))
      break
    case 'connect':
      parts.push('<p><b>1.</b> Установите приложение для вашей системы.</p>', table([['🍏 iPhone / Mac', 'Rabbit Hole'], ['🤖 Android', 'INCY'], ['🪟 Windows', 'HAPP']]),
        '<p><b>2.</b> Добавьте свою подписку. <b>3.</b> Включите VPN в приложении.</p>', row(app('Открыть настройку подключения', 'connect')),
        '<p>Персональная ссылка доступна только после входа. Этот экран не показывает состояние VPN-туннеля.</p>')
      break
    case 'bonus':
      if (input.bonus && !input.bonus.enabled) parts.push('<p>Бонусная программа сейчас отключена. Загляните позже.</p>')
      else {
        const attempts = input.bonus?.attempts ?? 0
        parts.push(attempts > 0
          ? `<p><b>🎁 У вас ${attempts} ${attempts === 1 ? 'попытка' : attempts < 5 ? 'попытки' : 'попыток'}</b> для колеса подарков.</p>`
          : '<p>Подарки за активность, бонусы и промокоды из вашего кабинета. Новые попытки появляются за задания и покупки.</p>')
      }
      parts.push(row(app('Открыть бонусы', 'bonus')))
      if (data.referrals) parts.push(row(cb('🤝 Пригласить друга', 'referrals')))
      break
    case 'notifications': {
      const unread = input.inbox?.unread ?? 0
      parts.push(unread > 0 ? `<p><b>🔔 Непрочитанных: ${unread}</b></p>` : '<p>Все уведомления прочитаны. ✨</p>')
      for (const item of input.inbox?.items ?? []) parts.push(table([[item.date, `${item.fresh ? '🔵 ' : ''}${item.title}`]]))
      if (!input.inbox?.items.length) parts.push('<p>Здесь появятся важные события подписки и сообщения сервиса.</p>')
      parts.push(row(app('Открыть уведомления', 'notifications')))
      break
    }
    case 'referrals': {
      const r = input.referral
      parts.push(`<p>${escape(r?.condition || 'Программа бонусов за вступление в канал готовится.')}</p>`)
      if (r) {
        parts.push(table([['Приглашено', String(r.invited)], ['Бонусов подтверждено', String(r.claimed)]]),
          `<p><a href="${escape(r.url)}">Ваша ссылка приглашения</a></p>`,
          row(`<tg-button type="copy_text" text="${escape(r.url)}">Копировать приглашение</tg-button>`))
        if (r.channelUrl) parts.push(row(`<tg-button type="url" style="primary" url="${escape(r.channelUrl)}">Вступить в канал</tg-button>`))
        if (r.eligible && !r.ownClaimed) parts.push(row(cb('Я вступил, проверить', 'claim', 'success')))
        if (r.ownClaimed) parts.push('<p>✅ Бонус подтверждён. Начисление выполняется через общую очередь кабинета.</p>')
      }
      break
    }
    case 'support':
      parts.push('<p>История обращений общая с личным кабинетом. По вопросам оплаты укажите номер заказа.</p>')
      if (!input.tickets?.length) parts.push('<p>Открытых обращений пока нет. Мы на связи и отвечаем быстро.</p>')
      for (const ticket of input.tickets ?? []) parts.push(table([[ticket.subject, ticket.status]]))
      parts.push(row(app('Написать или открыть диалог', 'support')))
      break
    case 'settings':
      parts.push('<p>Профиль, безопасность и каналы уведомлений.</p>')
      if (input.prefs) parts.push(table([
        ['Telegram', toggle(input.prefs.telegram)],
        ['Email', toggle(input.prefs.email)],
        ['Рассылки', toggle(input.prefs.broadcasts)],
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
        parts.push('<p>Пользователи, платежи, тарифы, рассылки и поддержка — в панели управления.</p>', row(app('Открыть админку', 'admin')))
      }
      break
  }
  if (input.screen === 'home') {
    const extraButtons = [...(data.referrals ? [cb('🤝 Пригласить друга', 'referrals')] : []), ...(data.support ? [cb('💬 Поддержка', 'support')] : []), ...(input.admin ? [cb('🛠 Админка', 'admin')] : [])]
    if (extraButtons.length) parts.push(row(...extraButtons))
  }
  if (input.screen === 'home' || input.screen === 'subscription') parts.push(row(app('Открыть весь кабинет', input.screen)))
  parts.push('<hr>', row(cb('🏠 Главная', 'home'), cb('🔄 Обновить', input.screen, 'link')))
  return parts.join('')
}
