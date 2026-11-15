import { createHash, timingSafeEqual } from 'node:crypto'
import { miniAppBotCall } from './bot-api'
import { miniAppUrl } from './config'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getBotAdminThreadScreen, getBotAdminTicketsScreen, getBotBroadcastThemesScreen, getBotPaymentScreen, getBotScreen, getBotScreenInput, getBotSupportThreadScreen } from './bot-screens'
import { botScreens, buildAutoRenewalOffConfirm, buildBroadcastPreviewScreen, buildBroadcastPromptScreen, buildBroadcastSentScreen, buildDeviceDeleteConfirm, buildDeviceScreen, buildSpinResultScreen, buildSupportCategoryScreen, buildSupportPromptScreen, buildWhatsNewScreen, type BotScreen } from './rich-screens'
import { broadcastThemeView, createBotBroadcast, findBroadcastTheme, parseBroadcastDraft, serializeBroadcastDraft, validateBroadcastText } from './broadcast-bot'
import { claimChannelReward } from './channel-referrals'
import { unbindUserDevice } from '@/lib/device-unbind'
import { BonusBoxError, openBonusBox } from '@/lib/bonus-box'
import { starsEnabled } from './stars'
import { buildPlanCatalog } from '@/lib/plan-catalog'
import { createPaymentForUser } from '@/lib/payment-checkout'
import { withDistributedLock } from '@/lib/distributed-lock'
import { rateLimitKey } from '@/lib/rate-limit'
import { answerStarsPreCheckout, isOurStarsPayload, refundStarsPayment, settleStarsPayment } from './stars-payments'
import { displayCallbackScreen } from './callback-screen'
import { clearBotDialogState, getBotDialogStateByTelegram, setBotDialogState } from './bot-dialog'
import { closeTicketAsAdmin, closeTicketFromBot, createTicketFromBot, isSupportCategory, replyToTicketAsAdmin, replyToTicketFromBot } from './support-bot'
import { supportCategories } from '@/lib/support'
import { disableAutoRenewal } from '@/lib/auto-renewal'

const user = z.object({ id: z.number().int().positive().safe() })
export const telegramUpdateSchema = z.object({
  update_id: z.number().int().nonnegative(),
  pre_checkout_query: z.object({ id: z.string().max(128), from: user, currency: z.string(),
    total_amount: z.number().int().positive(), invoice_payload: z.string().max(128) }).optional(),
  callback_query: z.object({ id: z.string().max(128), from: user, data: z.string().max(64).optional(),
    message: z.object({ message_id: z.number().int().positive(), chat: z.object({ id: z.number().int().safe(), type: z.string() }) }).optional(),
  }).optional(),
  message: z.object({
    chat: z.object({ id: z.number().int().safe(), type: z.string() }),
    from: user.optional(), text: z.string().max(4096).optional(),
    caption: z.string().max(4096).optional(),
    photo: z.array(z.object({ file_id: z.string().max(256), width: z.number(), height: z.number(),
      file_size: z.number().optional() })).max(16).optional(),
    successful_payment: z.object({ currency: z.string(), total_amount: z.number().int().positive(),
      invoice_payload: z.string().max(128), telegram_payment_charge_id: z.string().min(1).max(256) }).optional(),
    refunded_payment: z.object({ currency: z.string(), total_amount: z.number().int().positive(),
      invoice_payload: z.string().max(128), telegram_payment_charge_id: z.string().min(1).max(256) }).optional(),
  }).optional(),
})

export function validWebhookSecret(received: string | null, expected = process.env.TELEGRAM_MINIAPP_WEBHOOK_SECRET) {
  if (!received || !expected || expected.length < 32 || received.length > 256) return false
  return timingSafeEqual(createHash('sha256').update(received).digest(), createHash('sha256').update(expected).digest())
}

export function isPaymentUpdate(value: unknown) {
  if (!value || typeof value !== 'object') return false
  if (Reflect.has(value, 'pre_checkout_query')) return true
  const message = Reflect.get(value, 'message')
  return Boolean(message && typeof message === 'object' && (Reflect.has(message, 'successful_payment') || Reflect.has(message, 'refunded_payment')))
}

export function isUnsupportedPaymentUpdate(value: unknown) {
  if (!isPaymentUpdate(value) || !value || typeof value !== 'object') return false
  const checkout = Reflect.get(value, 'pre_checkout_query')
  const message = Reflect.get(value, 'message')
  const event = checkout ?? (message && typeof message === 'object'
    ? Reflect.get(message, 'successful_payment') ?? Reflect.get(message, 'refunded_payment') : null)
  return !event || typeof event !== 'object' || !isOurStarsPayload(Reflect.get(event, 'invoice_payload'))
}

// Old Remnashop messages remain in chats after a webhook switch. Never claim
// their callbacks as handled until every legacy action has a migration path.
export function isUnsupportedCallback(value: unknown) {
  if (!value || typeof value !== 'object' || !Reflect.has(value, 'callback_query')) return false
  const callback = Reflect.get(value, 'callback_query')
  return !callback || typeof callback !== 'object' ||
    typeof Reflect.get(callback, 'data') !== 'string' ||
    !Reflect.get(callback, 'data').startsWith('avp:')
}

export function isMiniAppOwnedUpdate(value: unknown) {
  if (!value || typeof value !== 'object') return false
  if (isPaymentUpdate(value)) return !isUnsupportedPaymentUpdate(value)
  if (Reflect.has(value, 'callback_query')) return !isUnsupportedCallback(value)
  const message = Reflect.get(value, 'message')
  if (!message || typeof message !== 'object') return false
  const content = Reflect.get(message, 'text')
  if (typeof content !== 'string') return false
  if (['Моя подписка', 'Мои устройства', 'Пригласить друга', 'Поддержка'].includes(content)) return true
  return /^\/(?:app|menu|subscription|connect|plans|billing|devices|bonus|notifications|referrals|settings|admin|support|paysupport|help)(?:@[A-Za-z0-9_]+)?(?:\s|$)/.test(content)
    || /^\/start(?:@[A-Za-z0-9_]+)?(?:\s+(?:ref_[A-Z0-9]{6,8}|update))?$/.test(content)
}

// Произвольный текст принадлежит новому боту, если пользователя ждёт ввод
// (например, сообщение в поддержку). Проверяется до передачи старому боту.
export async function isPendingBotDialogUpdate(value: unknown) {
  if (!value || typeof value !== 'object') return false
  const message = Reflect.get(value, 'message')
  if (!message || typeof message !== 'object') return false
  if (Reflect.has(message, 'successful_payment') || Reflect.has(message, 'refunded_payment')) return false
  const chat = Reflect.get(message, 'chat')
  const from = Reflect.get(message, 'from')
  const text = Reflect.get(message, 'text')
  const photo = Reflect.get(message, 'photo')
  const hasPhoto = Array.isArray(photo) && photo.length > 0
  if (!chat || typeof chat !== 'object' || !from || typeof from !== 'object') return false
  if (typeof text !== 'string' && !hasPhoto) return false
  if (Reflect.get(chat, 'type') !== 'private') return false
  const chatId = Reflect.get(chat, 'id')
  const fromId = Reflect.get(from, 'id')
  if (typeof chatId !== 'number' || typeof fromId !== 'number' || chatId !== fromId) return false
  const state = await getBotDialogStateByTelegram(fromId)
  if (!state) return false
  // Фото без текста забираем только у рассылки: в поддержке снимков не ждём.
  if (typeof text !== 'string') return state.startsWith('broadcast:')
  return true
}

// No account details or subscription URLs in messages. The signed Mini App session is the boundary.
export function welcomeMessage(section = 'home', referral?: string) {
  const url = new URL(miniAppUrl())
  url.searchParams.set('tab', section)
  if (referral && /^[A-Z0-9]{6,8}$/.test(referral)) url.searchParams.set('ref', referral)
  return {
    text: section === 'support'
      ? 'Поддержка AlekseevVP. Откройте приложение и создайте обращение. По вопросам оплаты укажите номер заказа.'
      : 'AlekseevVP\nВаш интернет. Ваши правила.\n\nПодписка, устройства и помощь в одном приложении.',
    reply_markup: { inline_keyboard: [[{ text: 'Открыть AlekseevVP', web_app: { url: url.toString() }, style: 'primary' }]] },
  }
}

export const welcomeWidgetHtml = '<html><body><div style="padding:20px;background:#101b25;color:#eef6ef;border-radius:20px"><div style="font-size:12px;color:#b5d4bc">ALEKSEEVVP</div><h2>Ваш интернет.<br>Ваши правила.</h2><p>Подписка, устройства и помощь<br>в одном приложении.</p></div></body></html>'

export async function handleMiniAppUpdate(update: z.infer<typeof telegramUpdateSchema>) {
  if (update.pre_checkout_query) { await answerStarsPreCheckout(update.pre_checkout_query); return }
  if (update.message?.successful_payment || update.message?.refunded_payment) {
    const message = update.message
    if (message.chat.type !== 'private' || (message.from && message.chat.id !== message.from.id)) throw new Error('Unexpected Stars payer')
    if (message.successful_payment) await settleStarsPayment(message.chat.id, message.successful_payment)
    else if (message.refunded_payment) await refundStarsPayment(message.chat.id, message.refunded_payment)
    return
  }
  const callback = update.callback_query
  if (callback?.data?.startsWith('avp:')) {
    if (!callback.message || callback.message.chat.type !== 'private' || callback.message.chat.id !== callback.from.id) return
    // Expired callback acknowledgements must not prevent the screen from opening.
    await miniAppBotCall('answerCallbackQuery', { callback_query_id: callback.id }).catch(() => {})
    const action = callback.data.slice(4)
    if (action.startsWith('buy:')) {
      await sendStarsInvoiceFromBot(callback.from.id, callback.id, action.slice(4))
      return
    }
    if (action.startsWith('pay:')) {
      const html = await getBotPaymentScreen(callback.from.id, action.slice(4))
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    if (action.startsWith('dev:')) {
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) }, select: { id: true } })
      const device = account ? await prisma.device.findFirst({ where: { id: action.slice(4), userId: account.id },
        select: { id: true, displayName: true, platform: true } }) : null
      const html = device
        ? buildDeviceScreen(await getBotScreenInput(callback.from.id, 'devices'),
          { id: device.id, title: device.displayName || 'Устройство', platform: device.platform || 'VPN-клиент' })
        : await getBotScreen(callback.from.id, 'devices', 'Устройство не найдено')
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    if (action.startsWith('devdel:') || action.startsWith('devyes:')) {
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) }, select: { id: true } })
      const deviceId = action.slice(7)
      const device = account ? await prisma.device.findFirst({ where: { id: deviceId, userId: account.id },
        select: { id: true, hwid: true, displayName: true, platform: true } }) : null
      if (action.startsWith('devdel:') && device) {
        const input = await getBotScreenInput(callback.from.id, 'devices')
        const html = buildDeviceDeleteConfirm(input, { id: device.id, title: device.displayName || 'Устройство', platform: device.platform || 'VPN-клиент' })
        await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
        return
      }
      let notice = 'Устройство не найдено'
      if (action.startsWith('devyes:') && device && account) {
        const result = await unbindUserDevice({ userId: account.id, hwid: device.hwid })
        notice = result.ok ? 'Устройство удалено, место в лимите освобождено'
          : result.error === 'NOT_FOUND' ? 'Устройство не найдено' : 'Не удалось отвязать устройство. Попробуйте позже.'
      }
      const html = await getBotScreen(callback.from.id, 'devices', notice)
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    if (action === 'spin') {
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) }, select: { id: true } })
      let html: string
      if (!account) html = await getBotScreen(callback.from.id, 'bonus', 'Сначала войдите в приложение через Telegram')
      else try {
        const spin = await openBonusBox(account.id, callbackUuid('avp-spin', callback.id))
        const input = await getBotScreenInput(callback.from.id, 'bonus')
        html = buildSpinResultScreen(input, { prizeTitle: spin.prize.title, prizeDescription: spin.prize.description,
          promoCode: spin.promoCode, promoCodeExpiresAt: spin.promoCodeExpiresAt, remainingAttempts: spin.remainingAttempts })
      } catch (e) {
        html = await getBotScreen(callback.from.id, 'bonus', e instanceof BonusBoxError ? e.message : 'Розыгрыш временно недоступен')
      }
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    if (action === 'readall') {
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) }, select: { id: true } })
      if (account) await prisma.userNotification.updateMany({ where: { userId: account.id, readAt: null }, data: { readAt: new Date() } })
      const html = await getBotScreen(callback.from.id, 'notifications')
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    if (action.startsWith('set:')) {
      const key = action.slice(4)
      const field = key === 'telegram' ? 'telegramEnabled' : key === 'email' ? 'emailEnabled' : key === 'broadcasts' ? 'broadcastsEnabled' : null
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) }, select: { id: true } })
      let notice = 'Сначала войдите в приложение через Telegram'
      if (account && field) {
        const current = await prisma.userNotificationPreference.findUnique({ where: { userId: account.id } })
        const next = !(current?.[field] ?? true)
        await prisma.userNotificationPreference.upsert({ where: { userId: account.id },
          create: { userId: account.id, [field]: next }, update: { [field]: next } })
        notice = next ? 'Уведомления включены' : 'Уведомления выключены'
      }
      const html = await getBotScreen(callback.from.id, 'settings', notice)
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    if (action === 'renew:off') {
      const html = buildAutoRenewalOffConfirm(await getBotScreenInput(callback.from.id, 'billing'))
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    if (action === 'renew:offyes') {
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) }, select: { id: true } })
      const disabled = account ? await disableAutoRenewal(account.id) : null
      const notice = disabled ? 'Автопродление отключено. Подписка действует до конца оплаченного срока.' : 'Автопродление уже отключено'
      const html = await getBotScreen(callback.from.id, 'billing', notice)
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    if (action === 'sup:new') {
      const input = await getBotScreenInput(callback.from.id, 'support')
      const html = buildSupportCategoryScreen(input, supportCategories.map(category => ({ value: category.value, label: category.label, description: category.description })))
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    if (action === 'sup:cancel') {
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) }, select: { id: true } })
      if (account) await clearBotDialogState(account.id)
      const html = await getBotScreen(callback.from.id, 'support', 'Ввод отменён')
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    if (action.startsWith('supcat:')) {
      const category = action.slice(7)
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) }, select: { id: true } })
      if (account && isSupportCategory(category)) {
        await setBotDialogState(account.id, `support:new:${category}`)
        const label = supportCategories.find(item => item.value === category)?.label ?? 'Обращение'
        const html = buildSupportPromptScreen(await getBotScreenInput(callback.from.id, 'support'),
          { title: label, hint: 'Опишите вопрос: что случилось, на каком устройстве и когда. По вопросам оплаты укажите номер заказа.' })
        await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
        return
      }
      const html = await getBotScreen(callback.from.id, 'support', 'Сначала войдите в приложение через Telegram')
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    if (action.startsWith('supt:')) {
      const html = await getBotSupportThreadScreen(callback.from.id, action.slice(5))
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    if (action.startsWith('supr:')) {
      const ticketId = action.slice(5)
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) }, select: { id: true } })
      const ticket = account ? await prisma.supportTicket.findFirst({ where: { id: ticketId, userId: account.id }, select: { subject: true, status: true } }) : null
      if (account && ticket && ticket.status !== 'CLOSED') {
        await setBotDialogState(account.id, `support:reply:${ticketId}`)
        const html = buildSupportPromptScreen(await getBotScreenInput(callback.from.id, 'support'),
          { title: ticket.subject, hint: 'Напишите ответ — он добавится в переписку и появится в кабинете.' })
        await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
        return
      }
      const html = await getBotScreen(callback.from.id, 'support', ticket ? 'Обращение уже закрыто. Создайте новое.' : 'Обращение не найдено')
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    if (action.startsWith('supc:')) {
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) }, select: { id: true } })
      const result = account ? await closeTicketFromBot(account.id, action.slice(5)) : { ok: false as const, error: 'Сначала войдите в приложение через Telegram' }
      const html = await getBotScreen(callback.from.id, 'support', result.ok ? 'Обращение закрыто. История сохранилась в кабинете.' : result.error)
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    if (action === 'bc:new') {
      const html = await getBotBroadcastThemesScreen(callback.from.id)
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    if (action.startsWith('bct:')) {
      const theme = findBroadcastTheme(action.slice(4))
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) }, select: { id: true, role: true } })
      if (account && account.role !== 'USER' && theme) {
        await setBotDialogState(account.id, `broadcast:text:${theme.key}`)
        const html = buildBroadcastPromptScreen(await getBotScreenInput(callback.from.id, 'admin'), broadcastThemeView(theme))
        await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
        return
      }
      const html = await getBotBroadcastThemesScreen(callback.from.id, theme ? 'Раздел доступен администраторам.' : 'Тема не найдена. Выберите другую.')
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    if (action === 'bc:edit') {
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) },
        select: { id: true, role: true, botDialog: { select: { state: true } } } })
      const state = account?.botDialog?.state ?? ''
      const theme = state.startsWith('broadcast:preview:') ? findBroadcastTheme(state.slice('broadcast:preview:'.length)) : null
      if (account && account.role !== 'USER' && theme) {
        await setBotDialogState(account.id, `broadcast:text:${theme.key}`)
        const html = buildBroadcastPromptScreen(await getBotScreenInput(callback.from.id, 'admin', 'Отправьте новый текст рассылки.'), broadcastThemeView(theme))
        await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
        return
      }
      const html = await getBotBroadcastThemesScreen(callback.from.id, 'Черновик не найден. Начните заново.')
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    if (action === 'bc:send') {
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) },
        select: { id: true, role: true, botDialog: { select: { state: true, payload: true } } } })
      const state = account?.botDialog?.state ?? ''
      const theme = state.startsWith('broadcast:preview:') ? findBroadcastTheme(state.slice('broadcast:preview:'.length)) : null
      const draft = parseBroadcastDraft(account?.botDialog?.payload)
      if (!account || account.role === 'USER' || !theme || !draft) {
        const html = await getBotBroadcastThemesScreen(callback.from.id, 'Черновик рассылки не найден. Соберите её заново.')
        await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
        return
      }
      // Черновик забираем атомарно: повторное нажатие не создаст вторую кампанию.
      const claimed = await prisma.telegramBotDialog.deleteMany({ where: { userId: account.id, state } })
      if (claimed.count !== 1) {
        const html = await getBotScreen(callback.from.id, 'admin', 'Эта рассылка уже отправлена в очередь.')
        await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
        return
      }
      const result = await createBotBroadcast(account.id, theme.key, draft.text, draft.image)
      const html = result.ok
        ? buildBroadcastSentScreen(await getBotScreenInput(callback.from.id, 'admin'),
          { themeLabel: result.theme.label, recipients: result.recipients, limited: result.limited })
        : await getBotBroadcastThemesScreen(callback.from.id, result.error)
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    if (action === 'bc:cancel') {
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) }, select: { id: true } })
      if (account) await clearBotDialogState(account.id)
      const html = await getBotScreen(callback.from.id, 'admin', 'Рассылка отменена.')
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    if (action === 'admt') {
      const html = await getBotAdminTicketsScreen(callback.from.id)
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    if (action.startsWith('admt:')) {
      const html = await getBotAdminThreadScreen(callback.from.id, action.slice(5))
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    if (action.startsWith('admr:')) {
      const ticketId = action.slice(5)
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) }, select: { id: true, role: true } })
      const ticket = account && account.role !== 'USER'
        ? await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { subject: true, status: true } })
        : null
      if (account && ticket && ticket.status !== 'CLOSED') {
        await setBotDialogState(account.id, `admin:reply:${ticketId}`)
        const html = buildSupportPromptScreen(await getBotScreenInput(callback.from.id, 'admin'),
          { title: ticket.subject, hint: 'Напишите ответ — пользователь получит его в бот и в кабинет.' })
        await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
        return
      }
      const html = await getBotAdminTicketsScreen(callback.from.id, ticket ? 'Обращение уже закрыто.' : 'Обращение не найдено')
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    if (action.startsWith('admc:')) {
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) }, select: { id: true, role: true } })
      const result = account && account.role !== 'USER'
        ? await closeTicketAsAdmin(account.id, action.slice(5))
        : { ok: false as const, error: 'Раздел доступен администраторам.' }
      const html = await getBotAdminTicketsScreen(callback.from.id, result.ok ? 'Обращение закрыто.' : result.error)
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    let screen: BotScreen = botScreens.includes(action as BotScreen) ? action as BotScreen : 'home'
    let notice: string | undefined
    if (action === 'claim') {
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) }, select: { id: true } })
      if (!account) notice = 'Сначала войдите в приложение через Telegram'
      else try {
        await claimChannelReward(account.id); screen = 'referrals'; notice = 'Бонус подтверждён и ожидает начисления'
      } catch (e) { notice = e instanceof Error ? e.message : 'Операция временно недоступна' }
    }
    const html = await getBotScreen(callback.from.id, screen, notice)
    await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
    return
  }
  const message = update.message
  if (!message || message.chat.type !== 'private' || !message.from || message.chat.id !== message.from.id) return
  const text = message.text?.trim() ?? ''
  const caption = message.caption?.trim() ?? ''
  const photoFileId = message.photo && message.photo.length > 0 ? message.photo[message.photo.length - 1]!.file_id : null
  const dialogInput = text || caption
  const menu: Record<string, BotScreen> = {
    'Моя подписка': 'subscription', 'Мои устройства': 'devices', 'Пригласить друга': 'referrals', 'Поддержка': 'support',
    'Тарифы': 'plans', 'Платежи': 'billing', 'Бонусы': 'bonus', 'Уведомления': 'notifications', 'Настройки': 'settings',
  }
  const menuScreen = menu[text]
  const isNavigation = Boolean(menuScreen) || text.startsWith('/')
  // Кнопки меню и команды отменяют ожидаемый ввод, свободный текст уходит в него.
  // Рассылка ждёт и фото с подписью — оно приходит без поля text.
  if (!isNavigation && (dialogInput || photoFileId)) {
    const account = await prisma.user.findUnique({ where: { telegramId: BigInt(message.from.id) },
      select: { id: true, botDialog: { select: { state: true, payload: true } } } })
    if (account?.botDialog) {
      await handleBotDialogMessage(message.chat.id, account.id, account.botDialog.state, dialogInput, account.botDialog.payload, photoFileId)
      return
    }
  } else if (isNavigation) {
    await prisma.telegramBotDialog.deleteMany({ where: { user: { telegramId: BigInt(message.from.id) } } })
  }
  if (menuScreen && process.env.TELEGRAM_RICH_MESSAGES_ENABLED === 'true') {
    await miniAppBotCall('sendRichMessage', { chat_id: message.chat.id, rich_message: { html: await getBotScreen(message.from.id, menuScreen) },
      protect_content: true, reply_markup: { remove_keyboard: true } })
    return
  }
  const command = message.text?.split(/\s+/)[0]?.split('@')[0]
  const commands: Record<string, BotScreen> = {
    '/start': 'home', '/app': 'home', '/menu': 'home', '/subscription': 'subscription', '/connect': 'connect',
    '/plans': 'plans', '/billing': 'billing', '/devices': 'devices', '/bonus': 'bonus', '/notifications': 'notifications',
    '/referrals': 'referrals', '/settings': 'settings', '/admin': 'admin',
    '/support': 'support', '/paysupport': 'support', '/help': 'support',
  }
  const section = menuScreen || commands[command || '']
  if (!section) return
  const startPayload = message.text?.match(/^\/start(?:@[a-zA-Z0-9_]+)?(?:\s+(.+))?$/)?.[1]?.trim()
  const referral = startPayload?.match(/^ref_([A-Z0-9]{6,8})$/)?.[1]
  const content = welcomeMessage(section, referral)
  if (process.env.TELEGRAM_RICH_MESSAGES_ENABLED === 'true') {
    // Переход по ссылке из анонса в канале встречаем экраном новых возможностей.
    const html = command === '/start' && startPayload === 'update'
      ? buildWhatsNewScreen(await getBotScreenInput(message.from.id, 'home'))
      : await getBotScreen(message.from.id, section as BotScreen, undefined, referral)
    await miniAppBotCall('sendRichMessage', { chat_id: message.chat.id,
      rich_message: { html },
      protect_content: true, reply_markup: { remove_keyboard: true } })
    return
  }
  if (process.env.TELEGRAM_WIDGETS_ENABLED === 'true' && command === '/start') {
    try {
      await miniAppBotCall('sendWidget', { chat_id: message.chat.id, html: welcomeWidgetHtml,
        caption: content.text, reply_markup: content.reply_markup, allow_queries: false })
      return
    } catch { /* Older Bot API installations retain a usable standard message. */ }
  }
  await miniAppBotCall('sendMessage', { chat_id: message.chat.id, ...content })
}

function checkoutUuid(callbackId: string) {
  return callbackUuid('avp-checkout', callbackId)
}

// Свободный текст в ожидаемом диалоге: новое обращение, ответ в тикет
// или ответ администратора. Состояние сохраняется при ошибках валидации,
// чтобы текст можно было исправить и отправить повторно.
async function handleBotDialogMessage(chatId: number, userId: string, state: string, text: string, payload?: string | null, imageFileId?: string | null) {
  let html: string
  if (state.startsWith('broadcast:text:') || state.startsWith('broadcast:preview:')) {
    const prefix = state.startsWith('broadcast:text:') ? 'broadcast:text:' : 'broadcast:preview:'
    const theme = findBroadcastTheme(state.slice(prefix.length))
    const previousDraft = parseBroadcastDraft(payload)
    if (!theme) {
      await clearBotDialogState(userId)
      html = await getBotScreen(chatId, 'admin', 'Тема рассылки устарела. Начните заново.')
    } else {
      const validated = validateBroadcastText(text)
      if (validated.ok) {
        // Текст без нового фото сохраняет приложенное ранее — и наоборот.
        const draft = { text: validated.body, image: imageFileId ?? previousDraft?.image ?? null }
        await setBotDialogState(userId, `broadcast:preview:${theme.key}`, serializeBroadcastDraft(draft))
        html = buildBroadcastPreviewScreen(await getBotScreenInput(chatId, 'admin'),
          { themeLabel: theme.label, segmentLabel: theme.segmentLabel, buttonLabel: theme.button?.label ?? null, text: draft.text, withImage: Boolean(draft.image) })
      } else if (prefix === 'broadcast:preview:' && previousDraft) {
        // На шаге превью невалидный ввод не затирает старый черновик.
        const notice = imageFileId && !text.trim()
          ? 'У фото должна быть подпись с текстом рассылки. Черновик не изменился.'
          : `${validated.error} Черновик не изменился.`
        html = buildBroadcastPreviewScreen(await getBotScreenInput(chatId, 'admin', notice),
          { themeLabel: theme.label, segmentLabel: theme.segmentLabel, buttonLabel: theme.button?.label ?? null, text: previousDraft.text, withImage: Boolean(previousDraft.image) })
      } else {
        // Состояние сохраняется: текст можно исправить и отправить повторно.
        const notice = imageFileId && !text.trim() ? 'У фото должна быть подпись с текстом рассылки.' : validated.error
        html = buildBroadcastPromptScreen(await getBotScreenInput(chatId, 'admin', notice), broadcastThemeView(theme))
      }
    }
  } else if (state.startsWith('support:new:')) {
    const category = state.slice('support:new:'.length)
    let notice: string
    if (!isSupportCategory(category)) {
      await clearBotDialogState(userId)
      notice = 'Сессия обращения устарела. Начните заново.'
    } else {
      const result = await createTicketFromBot(userId, category, text)
      if (result.ok) {
        await clearBotDialogState(userId)
        notice = 'Обращение отправлено. Ответ придёт в этот чат и в кабинет.'
      } else notice = result.error
    }
    html = await getBotScreen(chatId, 'support', notice)
  } else if (state.startsWith('support:reply:')) {
    const ticketId = state.slice('support:reply:'.length)
    const result = await replyToTicketFromBot(userId, ticketId, text)
    if (result.ok) {
      await clearBotDialogState(userId)
      html = await getBotSupportThreadScreen(chatId, ticketId)
    } else if (result.error.includes('закрыто') || result.error.includes('не найдено')) {
      await clearBotDialogState(userId)
      html = await getBotScreen(chatId, 'support', result.error)
    } else {
      html = await getBotScreen(chatId, 'support', result.error)
    }
  } else if (state.startsWith('admin:reply:')) {
    const ticketId = state.slice('admin:reply:'.length)
    const result = await replyToTicketAsAdmin(userId, ticketId, text)
    if (result.ok) {
      await clearBotDialogState(userId)
      html = await getBotAdminThreadScreen(chatId, ticketId, 'Ответ отправлен пользователю.')
    } else if (result.error.includes('закрыто') || result.error.includes('не найдено') || result.error.includes('доступен')) {
      await clearBotDialogState(userId)
      html = await getBotAdminTicketsScreen(chatId, result.error)
    } else {
      html = await getBotAdminThreadScreen(chatId, ticketId, result.error)
    }
  } else {
    await clearBotDialogState(userId)
    html = await getBotScreen(chatId, 'support', 'Сессия устарела. Начните заново.')
  }
  await miniAppBotCall('sendRichMessage', { chat_id: chatId, rich_message: { html }, protect_content: true })
}

function callbackUuid(salt: string, callbackId: string) {
  const hash = createHash('sha256').update(`${salt}:${callbackId}`).digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

async function sendStarsInvoiceFromBot(telegramId: number, callbackId: string, planId: string) {
  if (!starsEnabled()) {
    await miniAppBotCall('sendMessage', { chat_id: telegramId, text: 'Оплата Stars временно недоступна.' })
    return
  }
  const account = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) }, select: { id: true } })
  if (!account) {
    await miniAppBotCall('sendMessage', { chat_id: telegramId, text: 'Войдите через Telegram в приложение AlekseevVP, затем выберите тариф.' })
    return
  }
  const catalog = await buildPlanCatalog({ userId: account.id })
  const plan = catalog.plans.find(item => item.id === planId)
  if (!plan) {
    await miniAppBotCall('sendMessage', { chat_id: telegramId, text: 'Тариф больше недоступен. Откройте актуальный список.' })
    return
  }
  const request = new Request(miniAppUrl(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    planId, purchaseType: 'SUBSCRIPTION', provider: 'TELEGRAM_STARS', deviceLimit: plan.initialDeviceLimit,
    idempotencyKey: checkoutUuid(callbackId),
  }) })
  const limitKey = `bot-stars:${createHash('sha256').update(String(telegramId)).digest('hex')}`
  const limited = await rateLimitKey(limitKey, 10, 60_000)
  if (!limited.ok) {
    await miniAppBotCall('sendMessage', { chat_id: telegramId, text: 'Слишком много попыток оплаты. Попробуйте позже.' })
    return
  }
  const locked = await withDistributedLock(`billing-operation:${account.id}`,
    () => createPaymentForUser(request, account.id, { telegramBot: true }), { timeoutMs: 30_000 })
  if (!locked.acquired) {
    await miniAppBotCall('sendMessage', { chat_id: telegramId, text: 'Другая операция оплаты ещё выполняется. Повторите позже.' })
    return
  }
  const result = await locked.value.json() as { confirmationUrl?: string; localPaymentId?: string; starsAmount?: number; error?: string; redirectUrl?: string }
  if (result.error) {
    await miniAppBotCall('sendMessage', { chat_id: telegramId, text: result.error })
    return
  }
  if (result.redirectUrl) {
    await miniAppBotCall('sendMessage', { chat_id: telegramId, text: 'Доступ оформлен. Откройте подписку, чтобы увидеть новый срок.' })
    return
  }
  if (!result.confirmationUrl || !result.localPaymentId || !Number.isInteger(result.starsAmount)) throw new Error('Stars invoice was not created')
  await miniAppBotCall('sendInvoice', { chat_id: telegramId, title: plan.name.slice(0, 32),
    description: plan.unlimitedDuration ? 'Бессрочная подписка AlekseevVP' : `Подписка AlekseevVP на ${plan.durationDays} дней`,
    payload: `avp:${result.localPaymentId}`, provider_token: '', currency: 'XTR',
    prices: [{ label: plan.name.slice(0, 32), amount: result.starsAmount }], protect_content: true })
}
