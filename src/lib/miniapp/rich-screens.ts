import { escapeTelegramHtml as escape } from '@/lib/telegram-format'
import type { MiniAppOverview } from './model'
import { formatPrice } from '@/lib/format'

export type BotScreen = 'home' | 'subscription' | 'plans' | 'billing' | 'devices' | 'bonus' | 'notifications' | 'referrals' | 'support' | 'connect' | 'settings' | 'admin'
export const botScreens: BotScreen[] = ['home', 'subscription', 'plans', 'billing', 'devices', 'bonus', 'notifications', 'referrals', 'support', 'connect', 'settings', 'admin']
export type BotDevice = { id: string; title: string; platform: string }
export type BotSpinResult = { prizeTitle: string; prizeDescription: string | null; promoCode: string | null; promoCodeExpiresAt: string | null; remainingAttempts: number }
export type BotTicket = { id: string; subject: string; status: string }
export type BotThreadMessage = { from: 'user' | 'admin'; body: string; date: string; attachments?: string[] }
export type BotPromoCode = { code: string; discountPercent: number; expiresAt: string | null }
export type RichScreenInput = {
  screen: BotScreen
  overview: MiniAppOverview | null
  appUrl: string
  bannerUrl?: string
  referral?: { url: string; condition: string; invited: number; claimed: number; channelUrl: string | null; eligible: boolean; ownClaimed: boolean }
  devices?: BotDevice[]
  tickets?: BotTicket[]
  payments?: Array<{ title: string; amount: string; status: string; date: string }>
  autoRenewal?: string | null
  autoRenewalActive?: boolean
  bonus?: { enabled: boolean; attempts: number }
  promoCodes?: BotPromoCode[]
  connectUrl?: string | null
  inbox?: { unread: number; items: Array<{ title: string; date: string; fresh: boolean }> }
  prefs?: { telegram: boolean; email: boolean; broadcasts: boolean }
  adminStats?: { users: number; activeSubscriptions: number; paymentsToday: number; openTickets: number }
  admin?: boolean
  notice?: string
}
const titles: Record<BotScreen, string> = {
  home: '🏠 Главная', subscription: '📡 Моя подписка', plans: '💎 Тарифы', billing: '💳 Платежи', devices: '📱 Устройства',
  bonus: '🎁 Бонусы', notifications: '🔔 Уведомления', referrals: '🤝 Пригласить друга', support: '🛟 Поддержка',
  connect: '🔌 Подключение', settings: '⚙️ Настройки', admin: '🛠 Управление сервисом',
}
const cb = (label: string, screen: string, style = 'primary') => `<tg-button type="callback_data" style="${style}" data="avp:${escape(screen)}">${escape(label)}</tg-button>`
const row = (...buttons: string[]) => `<tg-button-row>${buttons.join('')}</tg-button-row>`
const copyBtn = (label: string, text: string) => `<tg-button type="copy_text" text="${escape(text)}">${escape(label)}</tg-button>`
const urlBtn = (label: string, url: string) => `<tg-button type="url" style="primary" url="${escape(url)}">${escape(label)}</tg-button>`
const table = (rows: string[][]) => `<table bordered compact>${rows.map(cells => `<tr>${cells.map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</table>`
const brandHeader = (bannerUrl?: string) => bannerUrl && /^https:\/\//.test(bannerUrl) ? `<img src="${escape(bannerUrl)}">` : '<h2>AlekseevVP</h2>'
const deviceEmoji = (platform: string) => {
  const value = platform.toLowerCase()
  if (value.includes('tv')) return '📺'
  if (value.includes('mac') || value.includes('windows') || value.includes('linux') || value.includes('pc')) return '💻'
  if (value.includes('ios') || value.includes('iphone') || value.includes('android')) return '📱'
  return '📟'
}
const statusDot = (sub: MiniAppOverview['subscription'] | null | undefined) => !sub ? '⚪' : sub.usable ? '🟢' : '🔴'
const footer = (screen: string) => `<hr>${row(cb('🏠 На главную', 'home'), cb('🔄 Обновить', screen, 'link'))}`

// Pure renderer: no personal key, password, initData or panel token can enter its DTO.
export function buildRichScreen(input: RichScreenInput) {
  const app = (label: string, tab: string) => {
    const url = new URL(input.appUrl); url.searchParams.set('tab', tab)
    return `<tg-button type="web_app" style="success" url="${escape(url.toString())}">${escape(label)}</tg-button>`
  }
  const parts = [brandHeader(input.bannerUrl), `<h3>${titles[input.screen]}</h3>`]
  if (input.notice) parts.push(`<p>💬 ${escape(input.notice)}</p>`)
  const data = input.overview
  if (!data) {
    parts.push('<p>👋 Подписка, устройства и обращения — в одном месте.</p><p>Войдите через Telegram, чтобы открыть свой кабинет.</p>', row(app('🚀 Открыть кабинет', 'home')))
    return parts.join('')
  }
  if (data.warning) parts.push(`<p>⚠️ ${escape(data.warning)}</p>`)
  const sub = data.subscription
  const currentPlan = data.plans.find(plan => plan.current && !plan.isPromo) ?? null
  switch (input.screen) {
    case 'home':
    case 'subscription':
      parts.push(`<h4>${statusDot(sub)} ${escape(sub?.title || 'Подписка пока не оформлена')}</h4>`)
      if (sub) parts.push(table([
        ['💎 Тариф', sub.planName],
        ['📅 Действует до', sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' }) : 'Без ограничения'],
        ['⏳ Осталось', sub.daysLeft == null ? 'Без ограничения' : `${Math.max(0, sub.daysLeft)} дней`],
        ['📱 Устройства', `${data.deviceCount} из ${sub.deviceLimit ?? 'без лимита'}`],
      ]))
      else parts.push('<p>Выберите тариф — и весь сервис заработает: VPN, устройства, бонусы и поддержка.</p>')
      parts.push(row(cb('🔌 Подключить VPN', 'connect', 'success'), cb('💎 Тарифы', 'plans')),
        row(cb('📱 Устройства', 'devices'), cb('💳 Платежи', 'billing')),
        row(cb('🎁 Бонусы', 'bonus'), cb('🔔 Уведомления', 'notifications')))
      break
    case 'plans':
      if (!data.plans.length) parts.push('<p>Для вашего аккаунта сейчас нет доступных тарифов.</p>')
      for (const plan of data.plans) parts.push('<hr>', `<h4>${plan.current ? '✅ Ваш тариф · ' : '💎 '}${escape(plan.name)}</h4>`, table([
        ['⏳ Срок', plan.unlimited ? 'Без ограничения' : `${plan.days} дней`],
        ['📱 Устройства', plan.unlimitedDevices ? 'Без ограничения' : plan.deviceAddonEnabled ? `${plan.devices}–${plan.maxDevices}` : String(plan.initialDevices)],
        ['🌐 Трафик', plan.trafficLimitGb == null ? 'Без ограничения' : `${plan.trafficLimitGb} ГБ`],
      ]), `<p>${plan.isPromo ? '🎁 Бесплатно' : `💰 ${escape(formatPrice(plan.priceKopecks))}`}</p>`,
      row(cb(plan.isPromo ? '🎁 Получить доступ' : plan.current ? '🔄 Продлить тариф' : '💳 Оформить тариф', plan.isPromo ? `buy:${plan.id}` : `pay:${plan.id}`, 'success')))
      parts.push('<hr><p>Продление того же тарифа добавляет дни. При смене тарифа начинается новый срок: остаток прежнего не переносится.</p>')
      break
    case 'billing': {
      parts.push(`<h4>${statusDot(sub)} ${escape(sub?.title || 'Подписка пока не оформлена')}</h4>`)
      if (input.autoRenewal) parts.push(`<p>🔁 Автопродление: ${escape(input.autoRenewal)}</p>`)
      if (currentPlan) parts.push(row(cb(`🔄 Продлить · ${formatPrice(currentPlan.priceKopecks)}`, `pay:${currentPlan.id}`, 'success')))
      if (input.autoRenewalActive) parts.push(row(cb('⏸ Отключить автопродление', 'renew:off')))
      if (!input.payments?.length) parts.push('<p>Оплат пока не было. История появится после первой покупки.</p>')
      if (input.payments?.length) parts.push('<h4>🧾 Последние операции</h4>',
        table(input.payments.map(payment => [`${payment.date} · ${payment.title}`, `${payment.amount} · ${payment.status}`])))
      break
    }
    case 'devices': {
      parts.push(`<p>Подключено устройств: <b>${data.deviceCount}</b>${sub?.deviceLimit ? ` из ${sub.deviceLimit}` : ''}. Список синхронизирован с кабинетом.</p>`)
      if (!input.devices?.length) parts.push('<p>Подключённых устройств пока нет. Откройте инструкцию и добавьте первое.</p>')
      if (input.devices?.length) {
        parts.push(table(input.devices.map(device => [device.title, device.platform])),
          '<p>Нажмите на устройство, чтобы открыть его карточку и управление.</p>')
        for (const device of input.devices.slice(0, 8)) {
          parts.push(row(cb(`${deviceEmoji(device.platform)} ${device.title.slice(0, 20)}`, `dev:${device.id}`)))
        }
      }
      parts.push(row(cb('➕ Добавить устройство', 'connect', 'success')))
      break
    }
    case 'connect': {
      parts.push('<h4>1️⃣ Скопируйте ссылку подписки</h4>')
      if (input.connectUrl) {
        parts.push(row(copyBtn('📋 Скопировать ссылку подписки', input.connectUrl)),
          '<p>Ссылка персональная — не пересылайте её и не публикуйте: по ней любой получит ваш доступ.</p>')
      } else if (sub?.usable) {
        parts.push('<p>Не удалось получить ссылку. Нажмите «Обновить» или попробуйте позже.</p>')
      } else {
        parts.push('<p>Ссылка появится после оформления подписки.</p>', row(cb('💎 Выбрать тариф', 'plans', 'success')))
      }
      parts.push('<h4>2️⃣ Добавьте её в приложение</h4>', table([['iPhone / Mac', 'Rabbit Hole'], ['Android', 'INCY'], ['Windows', 'HAPP']]),
        '<p>В приложении выберите «Добавить подписку» и вставьте ссылку из буфера обмена.</p>',
        '<h4>3️⃣ Включите VPN</h4><p>После импорта нажмите «Подключить» в VPN-клиенте.</p>')
      break
    }
    case 'bonus': {
      if (input.bonus && !input.bonus.enabled) {
        parts.push('<p>Бонусная программа сейчас отключена. Загляните позже.</p>')
        break
      }
      const attempts = input.bonus?.attempts ?? 0
      parts.push('<h4>🎡 Колесо подарков</h4>', attempts > 0
        ? `<p>Доступно попыток: <b>${attempts}</b>. Приз начисляется сразу, не закрывая чат.</p>`
        : '<p>Новые попытки появляются за задания, покупки и приглашения друзей.</p>')
      if (attempts > 0) parts.push(row(cb(`🎡 Крутить колесо · ${attempts}`, 'spin', 'success')))
      if (input.promoCodes?.length) {
        parts.push('<h4>🏷 Ваши промокоды</h4>',
          table(input.promoCodes.map(promo => [`${promo.code} · −${promo.discountPercent}%`,
            promo.expiresAt ? `до ${new Date(promo.expiresAt).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })}` : 'без срока'])),
          '<p>Промокод применяется при оплате тарифа — выберите его на экране оплаты.</p>')
        for (const promo of input.promoCodes.slice(0, 3)) parts.push(row(copyBtn(`📋 Скопировать ${promo.code}`, promo.code)))
      }
      if (data.referrals) parts.push(row(cb('🤝 Пригласить друга', 'referrals')))
      break
    }
    case 'notifications': {
      const unread = input.inbox?.unread ?? 0
      parts.push(unread > 0 ? `<h4>📬 Непрочитанных: ${unread}</h4>` : '<p>✅ Все уведомления прочитаны.</p>')
      if (input.inbox?.items.length) parts.push(table(input.inbox.items.map(item => [item.date, item.fresh ? `${item.title} · новое` : item.title])))
      if (input.inbox && !input.inbox.items.length) parts.push('<p>Здесь появятся важные события подписки и сообщения сервиса.</p>')
      if (unread > 0) parts.push(row(cb('✅ Прочитать все', 'readall', 'success')))
      break
    }
    case 'referrals': {
      const r = input.referral
      parts.push('<h4>🤝 Бонус за друга</h4>', `<p>${escape(r?.condition || 'Программа бонусов за вступление в канал готовится.')}</p>`)
      if (r) {
        parts.push(table([['👥 Приглашено', String(r.invited)], ['🎁 Бонусов подтверждено', String(r.claimed)]]),
          row(copyBtn('📋 Скопировать ссылку', r.url)))
        if (r.channelUrl) parts.push(row(urlBtn('📢 Вступить в канал', r.channelUrl)))
        if (r.eligible && !r.ownClaimed) parts.push(row(cb('✅ Я вступил, проверить', 'claim', 'success')))
        if (r.ownClaimed) parts.push('<p>Бонус подтверждён. Начисление выполняется через общую очередь кабинета.</p>')
      }
      break
    }
    case 'support': {
      parts.push('<p>Отвечаем прямо здесь, в чате. История обращений сохраняется и в кабинете.</p>')
      if (!input.tickets?.length) parts.push('<p>Открытых обращений нет.</p>')
      if (input.tickets?.length) {
        parts.push('<h4>📨 Открытые обращения</h4>', table(input.tickets.map(ticket => [ticket.subject, ticket.status])))
        for (const ticket of input.tickets.slice(0, 5)) {
          parts.push(row(cb(`💬 ${ticket.subject.slice(0, 22)} · ${ticket.status}`, `supt:${ticket.id}`)))
        }
      }
      parts.push(row(cb('✍️ Написать в поддержку', 'sup:new', 'success')),
        '<p>По вопросам оплаты укажите номер заказа.</p>')
      break
    }
    case 'settings': {
      parts.push('<p>Каналы уведомлений. Нажмите, чтобы переключить — настройка сразу действует и в кабинете.</p>')
      if (input.prefs) {
        const toggle = (label: string, key: string, enabled: boolean) => cb(`${enabled ? '✅' : '⛔️'} ${label}`, `set:${key}`, enabled ? 'success' : 'primary')
        parts.push(table([
          ['✈️ Telegram', input.prefs.telegram ? 'Включены' : 'Выключены'],
          ['📧 Email', input.prefs.email ? 'Включены' : 'Выключены'],
          ['📢 Рассылки', input.prefs.broadcasts ? 'Включены' : 'Выключены'],
        ]),
        row(toggle('Telegram', 'telegram', input.prefs.telegram), toggle('Email', 'email', input.prefs.email)),
        row(toggle('Рассылки', 'broadcasts', input.prefs.broadcasts)))
      }
      break
    }
    case 'admin':
      if (input.admin) {
        if (input.adminStats) parts.push(table([
          ['👥 Пользователи', String(input.adminStats.users)],
          ['📡 Активные подписки', String(input.adminStats.activeSubscriptions)],
          ['💳 Оплаты сегодня', String(input.adminStats.paymentsToday)],
          ['🛟 Открытые тикеты', String(input.adminStats.openTickets)],
        ]))
        parts.push(row(cb('🛟 Обращения пользователей', 'admt', 'success'), cb('📢 Рассылка', 'bc:new', 'success')))
        parts.push('<p>Пользователи, платежи и тарифы — в панели управления.</p>', row(app('🛠 Открыть панель управления', 'admin')))
      }
      break
  }
  if (input.screen === 'home') {
    const extraButtons = [...(data.referrals ? [cb('🤝 Пригласить друга', 'referrals')] : []), ...(data.support ? [cb('🛟 Поддержка', 'support')] : []), cb('⚙️ Настройки', 'settings'), ...(input.admin ? [cb('🛠 Админка', 'admin')] : [])]
    if (extraButtons.length) parts.push(row(...extraButtons))
  }
  parts.push(footer(input.screen))
  return parts.join('')
}

// Экран «что нового» для переходов по ссылке /start update из анонса в канале.
export function buildWhatsNewScreen(input: RichScreenInput) {
  const parts = [brandHeader(input.bannerUrl), '<h3>⚡️ Обновление: всё главное — прямо в боте</h3>',
    '<p>Больше не нужно заходить в кабинет за каждой мелочью. Самое нужное делается прямо в чате — быстро и в пару тапов:</p>',
    table([
      ['💳 Оплата', 'Карта и СБП — внутри Telegram, чек показываем перед оплатой'],
      ['🛟 Поддержка', 'Обращение и переписка — как обычный чат'],
      ['🔌 Подключение', 'Ссылка подписки копируется в один тап'],
      ['⚙️ Настройки', 'Каналы уведомлений переключаются кнопками'],
      ['💰 Биллинг и бонусы', 'Автопродление и промокоды под рукой'],
    ]),
    row(cb('🔌 Подключить VPN', 'connect', 'success'), cb('💎 Тарифы', 'plans')),
    row(cb('💳 Платежи', 'billing'), cb('🎁 Бонусы', 'bonus')),
    row(cb('🛟 Поддержка', 'support'), cb('⚙️ Настройки', 'settings'))]
  if (input.overview) {
    parts.push(row(cb('🏠 На главную', 'home')))
  } else {
    parts.push('<p>Войдите через Telegram, чтобы бот показал вашу подписку.</p>',
      row(cb('🏠 На главную', 'home', 'success')))
  }
  return parts.join('')
}

// Карточка устройства: понятно, чем управляешь, прежде чем удалять.
export function buildDeviceScreen(input: RichScreenInput, device: BotDevice) {
  const parts = [brandHeader(input.bannerUrl), '<h3>📱 Устройство</h3>',
    `<h4>${deviceEmoji(device.platform)} ${escape(device.title)}</h4>`,
    table([['Платформа', device.platform]]),
    '<p>Удаление освобождает место в лимите: устройство сразу отключится от VPN, но сможет подключиться снова, пока есть свободные места.</p>',
    row(cb('🗑 Удалить устройство', `devdel:${device.id}`)),
    row(cb('◀️ К списку устройств', 'devices'))]
  return parts.join('')
}

// Подтверждение отвязки устройства — до необратимого действия всегда один шаг.
export function buildDeviceDeleteConfirm(input: RichScreenInput, device: BotDevice) {
  const parts = [brandHeader(input.bannerUrl), '<h3>🗑 Удалить устройство?</h3>',
    `<h4>${deviceEmoji(device.platform)} ${escape(device.title)}</h4>`,
    table([['Платформа', device.platform]]),
    '<p>Место в лимите освободится сразу. Вход в приложение на этом устройстве завершится. Устройство сможет подключиться снова, пока есть свободные места.</p>',
    row(cb('✅ Да, удалить', `devyes:${device.id}`, 'success')),
    row(cb('◀️ Отмена', 'devices'))]
  return parts.join('')
}

// Результат розыгрыша колеса подарков прямо в чате.
export function buildSpinResultScreen(input: RichScreenInput, spin: BotSpinResult) {
  const parts = [brandHeader(input.bannerUrl), '<h3>🎡 Колесо подарков</h3>',
    `<h4>🎉 ${escape(spin.prizeTitle)}</h4>`]
  if (spin.prizeDescription) parts.push(`<p>${escape(spin.prizeDescription)}</p>`)
  if (spin.promoCode) {
    parts.push(table([['Промокод', spin.promoCode], ...(spin.promoCodeExpiresAt ? [['Действует до', new Date(spin.promoCodeExpiresAt).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })]] as string[][] : [])]),
      row(copyBtn('📋 Скопировать промокод', spin.promoCode)))
  }
  parts.push(`<p>Осталось попыток: ${spin.remainingAttempts}.</p>`)
  if (spin.remainingAttempts > 0) parts.push(row(cb(`🎡 Крутить ещё · ${spin.remainingAttempts}`, 'spin', 'success')))
  parts.push(row(cb('🎁 К бонусам', 'bonus')), footer('bonus'))
  return parts.join('')
}

// Выбор темы обращения перед вводом текста.
export function buildSupportCategoryScreen(input: RichScreenInput, categories: Array<{ value: string; label: string; description: string }>) {
  const parts = [brandHeader(input.bannerUrl), '<h3>🛟 Новое обращение</h3>',
    '<p>Выберите тему — так обращение быстрее попадёт к нужному специалисту.</p>']
  for (const category of categories) {
    parts.push(row(cb(category.label, `supcat:${category.value}`)))
  }
  parts.push(row(cb('◀️ Отмена', 'support')))
  return parts.join('')
}

// Ожидание текста обращения: следующее сообщение пользователя уйдёт в поддержку.
export function buildSupportPromptScreen(input: RichScreenInput, prompt: { title: string; hint: string }) {
  const parts = [brandHeader(input.bannerUrl), `<h3>✍️ ${escape(prompt.title)}</h3>`,
    `<p>${escape(prompt.hint)}</p>`,
    '<p>Просто отправьте следующее сообщение в этот чат — оно попадёт в поддержку и в ваш кабинет. Можно приложить фото или файл (JPG, PNG, WEBP, PDF до 5 МБ).</p>',
    row(cb('◀️ Отмена', 'sup:cancel'))]
  return parts.join('')
}

// Диалог с поддержкой внутри бота: последние сообщения и действия с тикетом.
// viewer 'admin' меняет подписи сторон и набор кнопок на административные.
export function buildSupportThreadScreen(input: RichScreenInput, thread: { id: string; subject: string; status: string; userLabel?: string; messages: BotThreadMessage[] }, opts?: { viewer?: 'user' | 'admin' }) {
  const viewer = opts?.viewer ?? 'user'
  const parts = [brandHeader(input.bannerUrl), '<h3>🛟 Обращение</h3>',
    `<h4>${escape(thread.subject)}</h4>`,
    table([...(thread.userLabel ? [['👤 Пользователь', thread.userLabel]] : []), ['Статус', thread.status]])]
  if (input.notice) parts.push(`<p>💬 ${escape(input.notice)}</p>`)
  if (!thread.messages.length) parts.push('<p>Сообщений пока нет.</p>')
  if (thread.messages.length) {
    parts.push('<h4>💬 Переписка</h4>')
    for (const message of thread.messages) {
      const author = message.from === 'admin' ? (viewer === 'admin' ? 'Вы' : '🛟 Поддержка') : (viewer === 'admin' ? '👤 Пользователь' : 'Вы')
      const files = message.attachments && message.attachments.length > 0
        ? `<br>📎 ${escape(message.attachments.join(', '))}`
        : ''
      parts.push(`<p>${author} · ${escape(message.date)}<br>${escape(message.body)}${files}</p>`)
    }
  }
  if (thread.status !== 'Закрыто') {
    parts.push('<p>✍️ Пишите ответ прямо в чат — следующее сообщение попадёт в обращение и появится здесь. Ваш текст после отправки убирается, переписка остаётся в этом окне. Можно приложить фото или файл.</p>')
    if (viewer === 'admin') parts.push(row(cb('⚡ Быстрые ответы', `admq:${thread.id}`)))
    parts.push(row(cb('✅ Закрыть обращение', `${viewer === 'admin' ? 'admc' : 'supc'}:${thread.id}`)))
  }
  parts.push(row(cb('◀️ К обращениям', viewer === 'admin' ? 'admt' : 'support')))
  return parts.join('')
}

// Шаблонные ответы администратора: нажатие сразу отправляет текст пользователю.
export function buildAdminTemplatesScreen(input: RichScreenInput,
  thread: { id: string; subject: string },
  templates: Array<{ label: string; text: string }>) {
  const parts = [brandHeader(input.bannerUrl), '<h3>⚡ Быстрые ответы</h3>',
    `<h4>${escape(thread.subject)}</h4>`,
    '<p>Нажмите на шаблон — он сразу уйдёт пользователю в этот чат и в кабинет.</p>']
  templates.forEach((template, index) => {
    parts.push(row(cb(template.label, `admqs:${thread.id}:${index}`)),
      `<p>${escape(template.text.length > 120 ? `${template.text.slice(0, 120)}…` : template.text)}</p>`)
  })
  parts.push(row(cb('◀️ К обращению', `admt:${thread.id}`)))
  return parts.join('')
}

export type BotAdminTicket = { id: string; subject: string; status: string; userLabel: string; date: string; fresh: boolean }

// Очередь обращений для администратора — ответить можно прямо из бота.
export function buildAdminTicketsScreen(input: RichScreenInput, tickets: BotAdminTicket[]) {
  const parts = [brandHeader(input.bannerUrl), '<h3>🛟 Обращения пользователей</h3>']
  if (input.notice) parts.push(`<p>💬 ${escape(input.notice)}</p>`)
  if (!tickets.length) parts.push('<p>✅ Открытых обращений нет.</p>')
  if (tickets.length) {
    parts.push(table(tickets.map(ticket => [`${ticket.fresh ? '🔴 ' : ''}${ticket.userLabel}`, `${ticket.subject} · ${ticket.status}`])),
      '<p>Нажмите на обращение, чтобы открыть переписку и ответить.</p>')
    for (const ticket of tickets.slice(0, 8)) {
      parts.push(row(cb(`💬 ${ticket.subject.slice(0, 18)} · ${ticket.userLabel.slice(0, 12)}`, `admt:${ticket.id}`)))
    }
  }
  parts.push(row(cb('◀️ В управление', 'admin')))
  return parts.join('')
}

export type BotBroadcastThemeView = { key: string; label: string; segmentLabel: string; buttonLabel: string | null; hint: string }

// Выбор темы рассылки: кнопка действия и аудитория подставятся автоматически.
export function buildBroadcastThemesScreen(input: RichScreenInput, themes: BotBroadcastThemeView[]) {
  const parts = [brandHeader(input.bannerUrl), '<h3>📢 Новая рассылка</h3>']
  if (input.notice) parts.push(`<p>💬 ${escape(input.notice)}</p>`)
  parts.push('<p>Выберите тему — к сообщению сама добавится кнопка, которая открывает нужный раздел бота.</p>',
    table(themes.map(theme => [theme.label, `${theme.segmentLabel}${theme.buttonLabel ? ` · кнопка «${theme.buttonLabel}»` : ''}`])))
  for (const theme of themes) {
    parts.push(row(cb(theme.label, `bct:${theme.key}`)))
  }
  parts.push(row(cb('◀️ В управление', 'admin')))
  return parts.join('')
}

// Ожидание текста рассылки: следующее сообщение администратора — черновик.
export function buildBroadcastPromptScreen(input: RichScreenInput, theme: BotBroadcastThemeView) {
  const parts = [brandHeader(input.bannerUrl), `<h3>📢 ${escape(theme.label)}</h3>`]
  if (input.notice) parts.push(`<p>💬 ${escape(input.notice)}</p>`)
  parts.push(table([['👥 Аудитория', theme.segmentLabel], ['🔘 Кнопка в сообщении', theme.buttonLabel ?? 'Без кнопки']]),
    `<p>${escape(theme.hint)}</p>`,
    `<p>Отправьте текст рассылки одним сообщением (до 1200 символов). Можно использовать переменные: {name}, {plan}, {days_left}.</p>`,
    '<p>Нужна картинка — просто отправьте фото, а текст укажите в подписи к нему.</p>',
    row(cb('◀️ Отмена', 'bc:cancel')))
  return parts.join('')
}

// Превью перед отправкой: администратор видит ровно то, что уйдёт пользователям.
export function buildBroadcastPreviewScreen(input: RichScreenInput, draft: { themeLabel: string; segmentLabel: string; buttonLabel: string | null; text: string; withImage?: boolean }) {
  const parts = [brandHeader(input.bannerUrl), '<h3>📢 Проверьте рассылку</h3>']
  if (input.notice) parts.push(`<p>💬 ${escape(input.notice)}</p>`)
  parts.push(table([['Тема', draft.themeLabel], ['👥 Аудитория', draft.segmentLabel], ['🔘 Кнопка', draft.buttonLabel ?? 'Без кнопки'], ['🖼 Картинка', draft.withImage ? 'Приложена' : 'Нет']]),
    '<hr><h4>Текст сообщения</h4>',
    `<p>${escape(draft.text).replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>')}</p>`)
  if (draft.buttonLabel) parts.push(`<p>Кнопка «${escape(draft.buttonLabel)}» появится под сообщением и откроет раздел в боте.</p>`)
  parts.push(row(cb('🚀 Отправить', 'bc:send', 'success')),
    row(cb('✍️ Изменить текст', 'bc:edit'), cb('◀️ Отмена', 'bc:cancel')))
  return parts.join('')
}

// Рассылка поставлена в очередь.
export function buildBroadcastSentScreen(input: RichScreenInput, stats: { themeLabel: string; recipients: number; limited: boolean }) {
  const parts = [brandHeader(input.bannerUrl), '<h3>🚀 Рассылка в очереди</h3>',
    table([['Тема', stats.themeLabel], ['👥 Получателей', String(stats.recipients)]])]
  if (stats.limited) parts.push('<p>⚠️ Достигнут лимит в 5000 получателей — часть аудитории не вошла.</p>')
  parts.push('<p>Сообщения доставляются в фоне. Статистика появится в панели управления, в разделе рассылок.</p>',
    row(cb('📢 Новая рассылка', 'bc:new', 'success')),
    row(cb('◀️ В управление', 'admin')))
  return parts.join('')
}

// Подтверждение отключения автопродления.
export function buildAutoRenewalOffConfirm(input: RichScreenInput) {
  const parts = [brandHeader(input.bannerUrl), '<h3>⏸ Отключить автопродление?</h3>',
    '<p>Автоматическое списание прекратится. Подписка будет действовать до конца оплаченного срока — продлить её можно в любой момент вручную.</p>',
    row(cb('✅ Да, отключить', 'renew:offyes', 'success')),
    row(cb('◀️ Отмена', 'billing'))]
  return parts.join('')
}

export function buildRichPaymentScreen(input: RichScreenInput, planId: string, yookassaAvailable: boolean) {
  const plan = input.overview?.plans.find(item => item.id === planId && !item.isPromo)
  if (!plan) return `${brandHeader(input.bannerUrl)}<h3>💳 Тариф недоступен</h3><p>Откройте актуальный список тарифов.</p>${row(cb('💎 К тарифам', 'plans'))}`
  const checkoutUrl = new URL(input.appUrl)
  checkoutUrl.searchParams.set('tab', 'plans')
  checkoutUrl.searchParams.set('plan', plan.id)
  const parts = [
    `${brandHeader(input.bannerUrl)}<h3>💳 Способ оплаты</h3>`,
    `<h4>💎 ${escape(plan.name)}</h4>`,
    table([
      ['⏳ Срок', plan.unlimited ? 'Бессрочно' : `${plan.days} дней`],
      ['💰 Базовая стоимость', formatPrice(plan.priceKopecks)],
    ]),
    '<p>Итоговая сумма со скидками появится перед оплатой. Карта и СБП открываются прямо здесь, в Telegram.</p>',
  ]
  if (yookassaAvailable) parts.push(row(`<tg-button type="web_app" style="success" url="${escape(checkoutUrl.toString())}">💳 Оплатить картой или СБП</tg-button>`))
  if (input.overview?.starsEnabled && input.overview.starsRateKopecks) {
    parts.push(row(cb('⭐ Оплатить в Stars', `buy:${plan.id}`)))
  }
  if (!yookassaAvailable && !input.overview?.starsEnabled) parts.push('<p>Оплата сейчас недоступна.</p>')
  parts.push('<hr><p>Бот и кабинет используют один аккаунт: оплата из любого места продлит ту же подписку.</p>', row(cb('💎 К тарифам', 'plans')))
  return parts.join('')
}
