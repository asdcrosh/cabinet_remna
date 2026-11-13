import { escapeTelegramHtml as escape } from '@/lib/telegram-format'
import type { MiniAppOverview } from './model'
import { formatPrice } from '@/lib/format'

export type BotScreen = 'home' | 'subscription' | 'plans' | 'devices' | 'referrals' | 'support' | 'connect'
export const botScreens: BotScreen[] = ['home', 'subscription', 'plans', 'devices', 'referrals', 'support', 'connect']
export type RichScreenInput = {
  screen: BotScreen
  overview: MiniAppOverview | null
  appUrl: string
  bannerUrl?: string
  referral?: { url: string; condition: string; invited: number; claimed: number; channelUrl: string | null; eligible: boolean; ownClaimed: boolean }
  devices?: Array<{ title: string; platform: string }>
  tickets?: Array<{ subject: string; status: string }>
  notice?: string
}
const titles: Record<BotScreen, string> = { home: 'Ваш личный доступ', subscription: 'Ваша подписка', plans: 'Тарифы и доступ', devices: 'Ваши устройства', referrals: 'Пригласить друга', support: 'Поддержка рядом', connect: 'Подключить VPN' }
const cb = (label: string, screen: string, style = 'primary') => `<tg-button type="callback_data" style="${style}" data="avp:${escape(screen)}">${escape(label)}</tg-button>`
const row = (...buttons: string[]) => `<tg-button-row>${buttons.join('')}</tg-button-row>`
const table = (rows: string[][]) => `<table bordered compact>${rows.map(cells => `<tr>${cells.map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</table>`

// Pure renderer: no personal key, password, initData or panel token can enter its DTO.
export function buildRichScreen(input: RichScreenInput) {
  const app = (label: string, tab: string) => {
    const url = new URL(input.appUrl); url.searchParams.set('tab', tab)
    return `<tg-button type="web_app" style="success" url="${escape(url.toString())}">${escape(label)}</tg-button>`
  }
  const header = input.bannerUrl && /^https:\/\//.test(input.bannerUrl) ? `<img src="${escape(input.bannerUrl)}">` : '<h2>AlekseevVP</h2>'
  const parts = [header, `<h3>${titles[input.screen]}</h3>`]
  if (input.notice) parts.push(`<p>${escape(input.notice)}</p>`)
  const data = input.overview
  if (!data) {
    parts.push('<p>Ваш интернет. Ваши правила.</p><p>Войдите через Telegram, чтобы открыть общую подписку и устройства из кабинета.</p>', row(app('Войти через Telegram', 'home')))
    return parts.join('')
  }
  if (data.warning) parts.push(`<p>${escape(data.warning)}</p>`)
  const sub = data.subscription
  switch (input.screen) {
    case 'home':
    case 'subscription':
      parts.push(`<p><b>${escape(sub?.title || 'Подписка пока не оформлена')}</b></p>`)
      if (sub) parts.push(table([
        ['Тариф', sub.planName], ['Срок', sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' }) : 'Без ограничения'],
        ['Осталось', sub.daysLeft == null ? 'Без ограничения' : `${Math.max(0, sub.daysLeft)} дней`],
        ['Устройства', `${data.deviceCount} / ${sub.deviceLimit ?? 'без лимита'}`],
      ]))
      parts.push(row(cb('Подключить VPN', 'connect', 'success'), cb('Тарифы', 'plans')),
        row(cb('Устройства', 'devices'), cb('Моя подписка', 'subscription')))
      break
    case 'plans':
      if (!data.plans.length) parts.push('<p>Для вашего аккаунта сейчас нет доступных тарифов.</p>')
      for (const plan of data.plans) parts.push(`<h4>${escape(plan.name)}</h4>`, table([
        ['Срок', plan.unlimited ? 'Без ограничения' : `${plan.days} дней`],
        ['Устройства', plan.unlimitedDevices ? 'Без ограничения' : plan.deviceAddonEnabled ? `${plan.devices}–${plan.maxDevices}` : String(plan.initialDevices)],
        ['Трафик', plan.trafficLimitGb == null ? 'Без ограничения' : `${plan.trafficLimitGb} ГБ`],
      ]), `<p>${plan.isPromo ? 'Бесплатно' : `Базовая цена ${escape(formatPrice(plan.priceKopecks))}`}</p>`,
      row(cb(plan.isPromo ? 'Получить доступ' : 'Выбрать способ оплаты', plan.isPromo ? `buy:${plan.id}` : `pay:${plan.id}`, 'success')))
      parts.push('<p>При продлении того же тарифа дни добавляются. При смене тарифа начинается новый срок, остаток прежнего не переносится.</p>', row(app('Подробности в приложении', 'plans')))
      break
    case 'devices':
      parts.push('<p>Устройства и лимит общие с кабинетом.</p>')
      if (!input.devices?.length) parts.push('<p>Подключённых устройств пока нет.</p>')
      for (const device of input.devices ?? []) parts.push(table([[device.title, device.platform]]))
      parts.push(row(cb('Подключить устройство', 'connect', 'success')), row(app('Переименовать или удалить', 'devices')))
      break
    case 'connect':
      parts.push('<p>1. Установите приложение для вашей системы.</p>', table([['iPhone / Mac', 'Rabbit Hole'], ['Android', 'INCY'], ['Windows', 'HAPP']]),
        '<p>2. Добавьте свою подписку. 3. Включите VPN в приложении.</p>', row(app('Открыть настройку подключения', 'connect')),
        '<p>Персональная ссылка доступна только после входа. Этот экран не показывает состояние VPN-туннеля.</p>')
      break
    case 'referrals': {
      const r = input.referral
      parts.push(`<p>${escape(r?.condition || 'Программа бонусов за вступление в канал готовится.')}</p>`)
      if (r) {
        parts.push(table([['Приглашено', String(r.invited)], ['Бонусов подтверждено', String(r.claimed)]]),
          `<p><a href="${escape(r.url)}">Ваша ссылка приглашения</a></p>`,
          row(`<tg-button type="copy_text" text="${escape(r.url)}">Копировать приглашение</tg-button>`))
        if (r.channelUrl) parts.push(row(`<tg-button type="url" style="primary" url="${escape(r.channelUrl)}">Вступить в канал</tg-button>`))
        if (r.eligible && !r.ownClaimed) parts.push(row(cb('Я вступил, проверить', 'claim', 'success')))
        if (r.ownClaimed) parts.push('<p>Бонус подтверждён. Начисление выполняется через общую очередь кабинета.</p>')
      }
      break
    }
    case 'support':
      parts.push('<p>История обращений общая с личным кабинетом. По вопросам оплаты укажите номер заказа.</p>')
      if (!input.tickets?.length) parts.push('<p>Открытых обращений пока нет.</p>')
      for (const ticket of input.tickets ?? []) parts.push(table([[ticket.subject, ticket.status]]))
      parts.push(row(app('Написать или открыть диалог', 'support')))
      break
  }
  if (input.screen === 'home') {
    const extraButtons = [...(data.referrals ? [cb('Пригласить друга', 'referrals')] : []), ...(data.support ? [cb('Поддержка', 'support')] : [])]
    if (extraButtons.length) parts.push(row(...extraButtons))
  }
  parts.push('<hr>', row(cb('Главная', 'home'), cb('Обновить', input.screen, 'link')))
  return parts.join('')
}

export function buildRichPaymentScreen(input: RichScreenInput, planId: string, yookassaAvailable: boolean) {
  const plan = input.overview?.plans.find(item => item.id === planId && !item.isPromo)
  if (!plan) return `<h3>Тариф недоступен</h3><p>Откройте актуальный список тарифов.</p>${row(cb('К тарифам', 'plans'))}`
  const siteUrl = new URL('/pay', input.appUrl)
  siteUrl.searchParams.set('plan', plan.id)
  const parts = [
    '<h2>AlekseevVP</h2><h3>Выберите способ оплаты</h3>',
    table([
      ['За что', `${plan.name}, ${plan.unlimited ? 'бессрочно' : `${plan.days} дней`}`],
      ['Базовая стоимость', formatPrice(plan.priceKopecks)],
    ]),
    '<p>Дополнительные устройства и скидки будут учтены перед оплатой. Итоговую сумму покажем на сайте.</p>',
  ]
  if (yookassaAvailable) parts.push(row(`<tg-button type="url" style="success" url="${escape(siteUrl.toString())}">Оплатить ₽ через ЮKassa на сайте</tg-button>`))
  if (input.overview?.starsEnabled && input.overview.starsRateKopecks) {
    parts.push(row(cb('Оплатить в Stars', `buy:${plan.id}`)))
  }
  if (!yookassaAvailable && !input.overview?.starsEnabled) parts.push('<p>Оплата сейчас недоступна.</p>')
  parts.push('<p>Сайт кабинета и бот используют одну учётную запись и подписку. Для оплаты на сайте может потребоваться вход.</p>', row(cb('К тарифам', 'plans')))
  return parts.join('')
}
