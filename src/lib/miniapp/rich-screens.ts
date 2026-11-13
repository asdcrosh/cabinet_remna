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
const titles: Record<BotScreen, string> = { home: 'Главная', subscription: 'Подписка', plans: 'Выберите тариф', devices: 'Устройства', referrals: 'Пригласить друга', support: 'Поддержка', connect: 'Подключение' }
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
        row(cb('Мои устройства', 'devices'), cb('Моя подписка', 'subscription')))
      break
    case 'plans':
      if (!data.plans.length) parts.push('<p>Для вашего аккаунта сейчас нет доступных тарифов.</p>')
      for (const plan of data.plans) parts.push('<hr>', `<h4>${escape(plan.name)}</h4>`, table([
        ['Срок', plan.unlimited ? 'Без ограничения' : `${plan.days} дней`],
        ['Устройства', plan.unlimitedDevices ? 'Без ограничения' : plan.deviceAddonEnabled ? `${plan.devices}–${plan.maxDevices}` : String(plan.initialDevices)],
        ['Трафик', plan.trafficLimitGb == null ? 'Без ограничения' : `${plan.trafficLimitGb} ГБ`],
      ]), `<p>${plan.isPromo ? 'Бесплатно' : `Базовая цена ${escape(formatPrice(plan.priceKopecks))}`}</p>`,
      row(cb(plan.isPromo ? 'Получить доступ' : 'Оформить тариф', plan.isPromo ? `buy:${plan.id}` : `pay:${plan.id}`, 'success')))
      parts.push('<hr><p>Продление того же тарифа добавляет дни. При смене тарифа начинается новый срок: остаток прежнего не переносится.</p>', row(app('Сравнить в приложении', 'plans')))
      break
    case 'devices':
      parts.push('<p>Список синхронизирован с кабинетом.</p>')
      if (!input.devices?.length) parts.push('<p>Подключённых устройств пока нет. Откройте инструкцию и добавьте первое.</p>')
      if (input.devices?.length) parts.push(table(input.devices.map(device => [device.title, device.platform])))
      parts.push(row(cb('Добавить устройство', 'connect', 'success')), row(app('Переименовать или удалить', 'devices')))
      break
    case 'connect':
      parts.push('<h4>01 / Выберите приложение</h4>', table([['iPhone / Mac', 'Rabbit Hole'], ['Android', 'INCY'], ['Windows', 'HAPP']]),
        '<h4>02 / Добавьте подписку</h4><p>Откройте персональную ссылку в приложении кабинета.</p>',
        '<h4>03 / Включите VPN</h4><p>После импорта нажмите «Подключить» в VPN-клиенте.</p>',
        row(app('Открыть настройку', 'connect')),
        '<p>Персональная ссылка доступна только после входа. Бот не показывает состояние VPN-туннеля.</p>')
      break
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
  }
  if (input.screen === 'home') {
    const extraButtons = [...(data.referrals ? [cb('Пригласить друга', 'referrals')] : []), ...(data.support ? [cb('Поддержка', 'support')] : [])]
    if (extraButtons.length) parts.push(row(...extraButtons))
  }
  parts.push('<hr>', row(cb('На главную', 'home'), cb('Обновить', input.screen, 'link')))
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
