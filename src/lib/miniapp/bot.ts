import { createHash, timingSafeEqual } from 'node:crypto'
import { downloadTelegramFile, miniAppBotCall } from './bot-api'
import { miniAppUrl } from './config'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getBotAdminThreadScreen, getBotAdminTicketsScreen, getBotBroadcastThemesScreen, getBotPaymentScreen, getBotPlansPromoScreen, getBotScreen, getBotScreenInput, getBotSupportThreadScreen, validateBotPromoCode } from './bot-screens'
import { botScreens, buildAdminAssignScreen, buildAdminTemplatesScreen, buildAutoRenewalOffConfirm, buildBroadcastPreviewScreen, buildBroadcastPromptScreen, buildBroadcastSentScreen, buildChannelGateScreen, buildDeviceDeleteConfirm, buildDeviceScreen, buildSpinResultScreen, buildStarsInvoiceScreen, buildSupportCategoryScreen, buildSupportPromptScreen, buildWhatsNewScreen, type BotScreen } from './rich-screens'
import { broadcastThemeView, createBotBroadcast, extractBroadcastButton, findBroadcastTheme, parseBroadcastDraft, serializeBroadcastDraft, validateBroadcastText, type BroadcastDraft } from './broadcast-bot'
import { channelGate, claimChannelReward } from './channel-referrals'
import { unbindUserDevice } from '@/lib/device-unbind'
import { BonusBoxError, openBonusBox } from '@/lib/bonus-box'
import { starsEnabled } from './stars'
import { buildPlanCatalog } from '@/lib/plan-catalog'
import { createPaymentForUser } from '@/lib/payment-checkout'
import { withDistributedLock } from '@/lib/distributed-lock'
import { rateLimitKey } from '@/lib/rate-limit'
import { answerStarsPreCheckout, isOurStarsPayload, refundStarsPayment, settleStarsPayment } from './stars-payments'
import { displayCallbackScreen, showBotScreen } from './callback-screen'
import { clearBotDialogState, getBotDialogStateByTelegram, setBotDialogState } from './bot-dialog'
import { addTicketNoteAsAdmin, assignTicketAsAdmin, closeTicketAsAdmin, closeTicketFromBot, createTicketFromBot, isSupportCategory, rateTicketFromBot, replyToTicketAsAdmin, replyToTicketFromBot } from './support-bot'
import { supportReplyTemplates } from './support-templates'
import { supportCategories } from '@/lib/support'
import { buildSupportAttachment, SUPPORT_ATTACHMENT_MAX_SIZE, SupportAttachmentError } from '@/lib/support-attachments'
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
    message_id: z.number().int().positive(),
    chat: z.object({ id: z.number().int().safe(), type: z.string() }),
    from: user.optional(), text: z.string().max(4096).optional(),
    caption: z.string().max(4096).optional(),
    photo: z.array(z.object({ file_id: z.string().max(256), width: z.number(), height: z.number(),
      file_size: z.number().optional() })).max(16).optional(),
    document: z.object({ file_id: z.string().max(256), file_name: z.string().max(256).optional(),
      mime_type: z.string().max(128).optional(), file_size: z.number().optional() }).optional(),
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
    || /^\/start(?:@[A-Za-z0-9_]+)?(?:\s+(?:ref_[A-Z0-9]{6,8}|update|admt_[A-Za-z0-9]{1,40}|home|subscription|plans|billing|devices|bonus|promos|notifications|referrals|support|connect|settings|admin))?$/.test(content)
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
  const hasDocument = Boolean(Reflect.get(message, 'document'))
  if (!chat || typeof chat !== 'object' || !from || typeof from !== 'object') return false
  if (typeof text !== 'string' && !hasPhoto && !hasDocument) return false
  if (Reflect.get(chat, 'type') !== 'private') return false
  const chatId = Reflect.get(chat, 'id')
  const fromId = Reflect.get(from, 'id')
  if (typeof chatId !== 'number' || typeof fromId !== 'number' || chatId !== fromId) return false
  const state = await getBotDialogStateByTelegram(fromId)
  if (!state) return false
  // Медиа без поля text (подпись приходит в caption) забираем только там,
  // где его ждут: рассылка и переписка поддержки.
  if (typeof text !== 'string') {
    return state.startsWith('broadcast:') || state.startsWith('support:') || state.startsWith('admin:reply:')
  }
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
    if (process.env.TELEGRAM_RICH_MESSAGES_ENABLED === 'true') {
      // Единое окно: счёт и сервисное сообщение об оплате убираем, экран
      // обновляется сам — чат остаётся чистым.
      if (message.successful_payment) {
        const settled = await settleStarsPayment(message.chat.id, message.successful_payment)
        if (!settled.alreadySettled) {
          const paymentId = message.successful_payment.invoice_payload.slice(4)
          const payment = await prisma.payment.findUnique({ where: { id: paymentId }, select: { botInvoiceMessageId: true } })
          if (payment?.botInvoiceMessageId) {
            await miniAppBotCall('deleteMessage', { chat_id: message.chat.id, message_id: payment.botInvoiceMessageId }).catch(() => {})
            await prisma.payment.update({ where: { id: paymentId }, data: { botInvoiceMessageId: null } }).catch(() => {})
          }
          await miniAppBotCall('deleteMessage', { chat_id: message.chat.id, message_id: message.message_id }).catch(() => {})
          await miniAppBotCall('sendChatAction', { chat_id: message.chat.id, action: 'typing' }).catch(() => {})
          await showBotScreen(message.chat.id, await getBotScreen(message.chat.id, 'subscription',
            '🎉 Оплата прошла — подписка обновлена!'), message.message_id)
        }
      } else if (message.refunded_payment) {
        await refundStarsPayment(message.chat.id, message.refunded_payment)
        await miniAppBotCall('deleteMessage', { chat_id: message.chat.id, message_id: message.message_id }).catch(() => {})
        await showBotScreen(message.chat.id, await getBotScreen(message.chat.id, 'billing',
          '↩️ Оплата возвращена — Stars поступят на ваш баланс Telegram.'), message.message_id)
      }
      return
    }
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
    // Кнопка «Я подписался»: свежая проверка членства, затем попытка начислить бонус.
    if (action === 'chan:check') {
      const gate = await channelGate(callback.from.id, { fresh: true })
      if (gate) {
        const html = buildChannelGateScreen(gate.channelUrl,
          'Подписка пока не найдена — вступите в канал и нажмите кнопку ещё раз.')
        await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
        return
      }
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) }, select: { id: true } })
      let notice = '✅ Подписка подтверждена — добро пожаловать!'
      // Реферальный бонус начисляем только приглашённым с невостребованной наградой.
      const pendingReferral = account ? await prisma.telegramChannelReferral.findUnique({
        where: { referredTelegramId: BigInt(callback.from.id) }, select: { claimedAt: true } }) : null
      if (account && pendingReferral && !pendingReferral.claimedAt) try {
        await claimChannelReward(account.id)
        notice = '🎉 Подписка подтверждена — реферальный бонус начислен!'
      } catch (e) { notice = e instanceof Error ? e.message : notice }
      const html = await getBotScreen(callback.from.id, 'home', notice)
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    // Пока пользователь не вступил в канал, любые кнопки ведут на экран подписки.
    // Проверка без кэша: нажатие кнопки сразу после выхода из канала блокируется.
    const callbackGate = await channelGate(callback.from.id, { fresh: true })
    if (callbackGate) {
      await displayCallbackScreen(callback.from.id, callback.message.message_id,
        buildChannelGateScreen(callbackGate.channelUrl), miniAppUrl())
      return
    }
    if (action.startsWith('buyp:')) {
      // Оплата Stars с промокодом: payp:<planId>:<code>
      const rest = action.slice(5)
      const sep = rest.lastIndexOf(':')
      const planId = sep > 0 ? rest.slice(0, sep) : rest
      const code = sep > 0 ? rest.slice(sep + 1) : ''
      const promo = code ? await validateBotPromoCode(callback.from.id, code) : null
      if (!promo) {
        const html = await getBotScreen(callback.from.id, 'plans', 'Промокод недоступен — возможно, он уже использован или истёк')
        await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
        return
      }
      await sendStarsInvoiceFromBot(callback.from.id, callback.id, planId, promo.code)
      return
    }
    if (action.startsWith('buy:')) {
      await sendStarsInvoiceFromBot(callback.from.id, callback.id, action.slice(4))
      return
    }
    if (action.startsWith('payp:')) {
      // Экран оплаты с применённым промокодом: payp:<planId>:<code>
      const rest = action.slice(5)
      const sep = rest.lastIndexOf(':')
      const planId = sep > 0 ? rest.slice(0, sep) : rest
      const code = sep > 0 ? rest.slice(sep + 1) : ''
      const promo = code ? await validateBotPromoCode(callback.from.id, code) : null
      const html = promo
        ? await getBotPaymentScreen(callback.from.id, planId, promo)
        : await getBotScreen(callback.from.id, 'plans', 'Промокод недоступен — возможно, он уже использован или истёк')
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    if (action.startsWith('pay:')) {
      const html = await getBotPaymentScreen(callback.from.id, action.slice(4))
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    if (action.startsWith('promo:')) {
      const html = await getBotPlansPromoScreen(callback.from.id, action.slice(6))
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
      // Анимация розыгрыша: два быстрых кадра в том же сообщении перед призом.
      for (const frame of ['🎡 Крутим колесо…', '🎁 Достаём приз…']) {
        await displayCallbackScreen(callback.from.id, callback.message.message_id,
          `<h3>🎁 Бонусы</h3><h4>${frame}</h4>`, miniAppUrl()).catch(() => null)
        await new Promise(resolve => setTimeout(resolve, 500))
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
        const label = supportCategories.find(item => item.value === category)?.label ?? 'Обращение'
        const html = buildSupportPromptScreen(await getBotScreenInput(callback.from.id, 'support'),
          { title: label, hint: 'Опишите вопрос: что случилось, на каком устройстве и когда. По вопросам оплаты укажите номер заказа.' })
        const used = await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
        // Id prompt-сообщения: созданное обращение откроется в этом же окне.
        await setBotDialogState(account.id, `support:new:${category}`, used ? String(used) : null)
        return
      }
      const html = await getBotScreen(callback.from.id, 'support', 'Сначала войдите в приложение через Telegram')
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    if (action.startsWith('supt:')) {
      const ticketId = action.slice(5)
      const html = await getBotSupportThreadScreen(callback.from.id, ticketId)
      const used = await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      // Запоминаем, в каком сообщении живёт тред: ответы обновят его на месте.
      // Другие треды в этом же сообщении больше не открыты — их якоря снимаем.
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) }, select: { id: true } })
      if (account && used) {
        await prisma.$transaction([
          prisma.supportTicket.updateMany({ where: { id: ticketId, userId: account.id }, data: { userBotMessageId: used } }),
          prisma.supportTicket.updateMany({ where: { id: { not: ticketId }, userId: account.id, userBotMessageId: used }, data: { userBotMessageId: null } }),
        ])
        // Живой режим: пока тред открыт, следующие сообщения уходят в него.
        const ticket = await prisma.supportTicket.findFirst({ where: { id: ticketId, userId: account.id }, select: { status: true } })
        if (ticket && ticket.status !== 'CLOSED') await setBotDialogState(account.id, `support:reply:${ticketId}`)
      }
      return
    }
    if (action.startsWith('supr:')) {
      const ticketId = action.slice(5)
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) }, select: { id: true } })
      const ticket = account ? await prisma.supportTicket.findFirst({ where: { id: ticketId, userId: account.id }, select: { subject: true, status: true } }) : null
      if (account && ticket && ticket.status !== 'CLOSED') {
        await setBotDialogState(account.id, `support:reply:${ticketId}`)
        const html = await getBotSupportThreadScreen(callback.from.id, ticketId, '✍️ Пишите ответ прямо в чат — следующее сообщение попадёт в обращение.')
        const used = await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
        if (used) await prisma.supportTicket.updateMany({ where: { id: ticketId, userId: account.id }, data: { userBotMessageId: used } })
        return
      }
      const html = await getBotScreen(callback.from.id, 'support', ticket ? 'Обращение уже закрыто. Создайте новое.' : 'Обращение не найдено')
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    if (action.startsWith('supc:')) {
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) }, select: { id: true } })
      const result = account ? await closeTicketFromBot(account.id, action.slice(5)) : { ok: false as const, error: 'Сначала войдите в приложение через Telegram' }
      if (account) await clearBotDialogState(account.id)
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
      const result = await createBotBroadcast(account.id, theme.key, draft.text, draft.image, draft.button)
      const html = result.ok
        ? buildBroadcastSentScreen(await getBotScreenInput(callback.from.id, 'admin'),
          { themeLabel: result.theme.label, recipients: result.recipients, limited: result.limited,
            channelPosted: result.channelPosted })
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
    // Список шаблонных ответов для открытого обращения.
    if (action.startsWith('admq:')) {
      const ticketId = action.slice(5)
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) }, select: { id: true, role: true } })
      const ticket = account && account.role !== 'USER'
        ? await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { subject: true, status: true } })
        : null
      if (account && ticket && ticket.status !== 'CLOSED') {
        const html = buildAdminTemplatesScreen(await getBotScreenInput(callback.from.id, 'admin'),
          { id: ticketId, subject: ticket.subject }, supportReplyTemplates)
        const used = await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
        if (used) {
          await prisma.supportTicket.updateMany({ where: { id: ticketId },
            data: { adminBotChatId: BigInt(callback.from.id), adminBotMessageId: used } })
        }
        return
      }
      const html = await getBotAdminTicketsScreen(callback.from.id, ticket ? 'Обращение уже закрыто.' : 'Обращение не найдено')
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    // Шаблон выбран: ответ уходит пользователю, окно возвращается к переписке.
    if (action.startsWith('admqs:')) {
      const rest = action.slice(6)
      const sep = rest.lastIndexOf(':')
      const ticketId = sep > 0 ? rest.slice(0, sep) : ''
      const template = supportReplyTemplates[Number(rest.slice(sep + 1))]
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) }, select: { id: true, role: true } })
      if (account && account.role !== 'USER' && ticketId && template) {
        const result = await replyToTicketAsAdmin(account.id, ticketId, template.text)
        const html = result.ok
          ? await getBotAdminThreadScreen(callback.from.id, ticketId, '⚡ Шаблонный ответ отправлен пользователю.')
          : await getBotAdminThreadScreen(callback.from.id, ticketId, result.error)
        const used = await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
        if (used) {
          await prisma.supportTicket.updateMany({ where: { id: ticketId },
            data: { adminBotChatId: BigInt(callback.from.id), adminBotMessageId: used } })
        }
        // Живой режим сохраняется: после шаблона можно писать дальше.
        if (result.ok) await setBotDialogState(account.id, `admin:reply:${ticketId}`)
        return
      }
      const html = await getBotAdminTicketsScreen(callback.from.id, 'Шаблон не найден. Откройте обращение заново.')
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    // Оценка закрытого обращения пользователем.
    if (action.startsWith('rate:up:') || action.startsWith('rate:down:')) {
      const rating = action.startsWith('rate:up:') ? 'up' as const : 'down' as const
      const ticketId = action.slice(rating === 'up' ? 8 : 10)
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) }, select: { id: true } })
      const result = account
        ? await rateTicketFromBot(account.id, ticketId, rating)
        : { ok: false as const, error: 'Сначала войдите в приложение через Telegram' }
      const html = await getBotSupportThreadScreen(callback.from.id, ticketId,
        result.ok ? 'Спасибо за оценку! Она помогает нам становиться лучше.' : result.error)
      const used = await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      if (account && used) {
        await prisma.supportTicket.updateMany({ where: { id: ticketId, userId: account.id }, data: { userBotMessageId: used } })
      }
      return
    }
    // Выбор исполнителя обращения.
    if (action.startsWith('adma:')) {
      const ticketId = action.slice(5)
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) }, select: { id: true, role: true } })
      if (account && account.role !== 'USER') {
        const [ticket, admins] = await Promise.all([
          prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { subject: true, status: true, assigneeId: true } }),
          prisma.user.findMany({ where: { role: { not: 'USER' } }, orderBy: { createdAt: 'asc' }, take: 10,
            select: { id: true, name: true, telegramUsername: true, email: true } }),
        ])
        if (ticket && ticket.status !== 'CLOSED') {
          const html = buildAdminAssignScreen(await getBotScreenInput(callback.from.id, 'admin'),
            { id: ticketId, subject: ticket.subject },
            admins.map(admin => ({
              id: admin.id,
              label: admin.name?.split(' ')[0] || (admin.telegramUsername ? `@${admin.telegramUsername}` : admin.email),
              current: ticket.assigneeId === admin.id,
            })))
          const used = await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
          if (used) {
            await prisma.supportTicket.updateMany({ where: { id: ticketId },
              data: { adminBotChatId: BigInt(callback.from.id), adminBotMessageId: used } })
          }
          return
        }
      }
      const html = await getBotAdminTicketsScreen(callback.from.id, 'Обращение не найдено или уже закрыто.')
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    if (action.startsWith('admas:')) {
      const rest = action.slice(6)
      const sep = rest.lastIndexOf(':')
      const ticketId = sep > 0 ? rest.slice(0, sep) : ''
      const assigneeId = sep > 0 ? rest.slice(sep + 1) : ''
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) }, select: { id: true, role: true } })
      if (account && account.role !== 'USER' && ticketId && assigneeId) {
        const result = await assignTicketAsAdmin(account.id, ticketId, assigneeId)
        const html = await getBotAdminThreadScreen(callback.from.id, ticketId,
          result.ok ? '👤 Исполнитель назначен.' : result.error)
        const used = await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
        if (used) {
          await prisma.supportTicket.updateMany({ where: { id: ticketId },
            data: { adminBotChatId: BigInt(callback.from.id), adminBotMessageId: used } })
        }
        return
      }
      const html = await getBotAdminTicketsScreen(callback.from.id, 'Не удалось назначить исполнителя.')
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    // Внутренняя заметка: следующее сообщение админа уйдёт в заметки тикета.
    if (action.startsWith('admn:')) {
      const ticketId = action.slice(5)
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) }, select: { id: true, role: true } })
      const ticket = account && account.role !== 'USER'
        ? await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { status: true } })
        : null
      if (account && ticket) {
        await setBotDialogState(account.id, `admin:note:${ticketId}`)
        const html = await getBotAdminThreadScreen(callback.from.id, ticketId,
          '📝 Следующее сообщение станет внутренней заметкой — её увидит только команда в кабинете.')
        const used = await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
        if (used) {
          await prisma.supportTicket.updateMany({ where: { id: ticketId },
            data: { adminBotChatId: BigInt(callback.from.id), adminBotMessageId: used } })
        }
        return
      }
      const html = await getBotAdminTicketsScreen(callback.from.id, 'Обращение не найдено.')
      await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      return
    }
    if (action === 'admt') {
      const html = await getBotAdminTicketsScreen(callback.from.id)
      const used = await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) }, select: { id: true, role: true } })
      // Возврат в очередь выходит из живого режима переписки.
      if (account) await clearBotDialogState(account.id)
      if (account && account.role !== 'USER' && used) {
        // Сообщение теперь показывает очередь: якоря тредов в нём снимаем,
        // чтобы обновление треда не затёрло список.
        await prisma.$transaction([
          prisma.user.updateMany({ where: { id: account.id }, data: { adminQueueBotMessageId: used } }),
          prisma.supportTicket.updateMany({ where: { adminBotChatId: BigInt(callback.from.id), adminBotMessageId: used }, data: { adminBotMessageId: null } }),
        ])
      }
      return
    }
    if (action.startsWith('admt:')) {
      const ticketId = action.slice(5)
      const html = await getBotAdminThreadScreen(callback.from.id, ticketId)
      const used = await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
      // Якорь окна треда для последнего просмотревшего администратора.
      // Очередь и другие треды в этом сообщении больше не показаны — их якоря снимаем.
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) }, select: { id: true, role: true } })
      if (account && account.role !== 'USER' && used) {
        await prisma.$transaction([
          prisma.supportTicket.updateMany({ where: { id: ticketId },
            data: { adminBotChatId: BigInt(callback.from.id), adminBotMessageId: used } }),
          prisma.supportTicket.updateMany({ where: { id: { not: ticketId }, adminBotChatId: BigInt(callback.from.id), adminBotMessageId: used },
            data: { adminBotMessageId: null } }),
          prisma.user.updateMany({ where: { id: account.id, adminQueueBotMessageId: used }, data: { adminQueueBotMessageId: null } }),
        ])
        // Живой режим администратора: свободный текст уходит в открытый тред.
        const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { status: true } })
        if (ticket && ticket.status !== 'CLOSED') await setBotDialogState(account.id, `admin:reply:${ticketId}`)
      }
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
        const html = await getBotAdminThreadScreen(callback.from.id, ticketId, '✍️ Пишите ответ прямо в чат — пользователь увидит его в этом же окне и в кабинете.')
        const used = await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
        if (used) {
          await prisma.supportTicket.updateMany({ where: { id: ticketId },
            data: { adminBotChatId: BigInt(callback.from.id), adminBotMessageId: used } })
        }
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
      if (account) await clearBotDialogState(account.id)
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
    // Навигация по экранам выходит из живого режима ввода (поддержка, рассылка).
    await prisma.telegramBotDialog.deleteMany({ where: { user: { telegramId: BigInt(callback.from.id) } } })
    const html = await getBotScreen(callback.from.id, screen, notice)
    await displayCallbackScreen(callback.from.id, callback.message.message_id, html, miniAppUrl())
    return
  }
  const message = update.message
  if (!message || message.chat.type !== 'private' || !message.from || message.chat.id !== message.from.id) return
  // Пользователь без подписки на канал видит только экран подписки — на любое сообщение.
  if (process.env.TELEGRAM_RICH_MESSAGES_ENABLED === 'true') {
    const gate = await channelGate(message.from.id)
    if (gate) {
      await prisma.telegramBotDialog.deleteMany({ where: { user: { telegramId: BigInt(message.from.id) } } })
      await miniAppBotCall('deleteMessage', { chat_id: message.chat.id, message_id: message.message_id }).catch(() => {})
      await miniAppBotCall('sendChatAction', { chat_id: message.chat.id, action: 'typing' }).catch(() => {})
      await showBotScreen(message.chat.id, buildChannelGateScreen(gate.channelUrl), message.message_id)
      return
    }
  }
  const text = message.text?.trim() ?? ''
  const caption = message.caption?.trim() ?? ''
  const photoSize = message.photo && message.photo.length > 0 ? message.photo[message.photo.length - 1]! : null
  // Медиа диалога: документ (с именем и типом) или сжатое Telegram-фото (всегда JPEG).
  const media: BotDialogMedia | null = message.document
    ? { kind: 'document', fileId: message.document.file_id, fileName: message.document.file_name ?? 'document',
      mimeType: message.document.mime_type ?? 'application/octet-stream', size: message.document.file_size ?? null }
    : photoSize
      ? { kind: 'photo', fileId: photoSize.file_id, fileName: 'photo.jpg', mimeType: 'image/jpeg', size: photoSize.file_size ?? null }
      : null
  const dialogInput = text || caption
  const menu: Record<string, BotScreen> = {
    'Моя подписка': 'subscription', 'Мои устройства': 'devices', 'Пригласить друга': 'referrals', 'Поддержка': 'support',
    'Тарифы': 'plans', 'Платежи': 'billing', 'Бонусы': 'bonus', 'Уведомления': 'notifications', 'Настройки': 'settings',
  }
  const menuScreen = menu[text]
  const isNavigation = Boolean(menuScreen) || text.startsWith('/')
  // Кнопки меню и команды отменяют ожидаемый ввод, свободный текст уходит в него.
  // Рассылка и поддержка ждут и медиа с подписью — оно приходит без поля text.
  if (!isNavigation && (dialogInput || media)) {
    const account = await prisma.user.findUnique({ where: { telegramId: BigInt(message.from.id) },
      select: { id: true, botDialog: { select: { state: true, payload: true } } } })
    if (account?.botDialog) {
      await handleBotDialogMessage(message.chat.id, account.id, account.botDialog.state, dialogInput, message.message_id, account.botDialog.payload, media)
      return
    }
  } else if (isNavigation) {
    await prisma.telegramBotDialog.deleteMany({ where: { user: { telegramId: BigInt(message.from.id) } } })
  }
  if (menuScreen && process.env.TELEGRAM_RICH_MESSAGES_ENABLED === 'true') {
    // Единое окно: текст кнопки меню убираем, экран обновляется на месте.
    await miniAppBotCall('deleteMessage', { chat_id: message.chat.id, message_id: message.message_id }).catch(() => {})
    // Анимация «печатает…», пока экран собирается.
    await miniAppBotCall('sendChatAction', { chat_id: message.chat.id, action: 'typing' }).catch(() => {})
    await showBotScreen(message.chat.id, await getBotScreen(message.from.id, menuScreen), message.message_id)
    return
  }
  const command = message.text?.split(/\s+/)[0]?.split('@')[0]
  const commands: Record<string, BotScreen> = {
    '/start': 'home', '/app': 'home', '/menu': 'home', '/subscription': 'subscription', '/connect': 'connect',
    '/plans': 'plans', '/billing': 'billing', '/devices': 'devices', '/bonus': 'bonus', '/notifications': 'notifications',
    '/referrals': 'referrals', '/settings': 'settings', '/admin': 'admin',
    '/support': 'support', '/paysupport': 'support', '/help': 'support',
  }
  const startPayload = message.text?.match(/^\/start(?:@[a-zA-Z0-9_]+)?(?:\s+(.+))?$/)?.[1]?.trim()
  // Диаплинки из канала и рассылок: /start plans, /start bonus и т.п. открывают раздел.
  const startScreen = command === '/start' && botScreens.includes(startPayload as BotScreen)
    ? startPayload as BotScreen : undefined
  const section = menuScreen || startScreen || commands[command || '']
  if (!section) return
  const referral = startPayload?.match(/^ref_([A-Z0-9]{6,8})$/)?.[1]
  // Deep link из уведомления админу: сразу открываем тред обращения в боте.
  const adminThreadTicketId = command === '/start' ? startPayload?.match(/^admt_([A-Za-z0-9]{1,40})$/)?.[1] : undefined
  if (adminThreadTicketId && process.env.TELEGRAM_RICH_MESSAGES_ENABLED === 'true') {
    const account = await prisma.user.findUnique({ where: { telegramId: BigInt(message.from.id) }, select: { id: true, role: true } })
    if (account && account.role !== 'USER') {
      const html = await getBotAdminThreadScreen(message.from.id, adminThreadTicketId)
      await miniAppBotCall('deleteMessage', { chat_id: message.chat.id, message_id: message.message_id }).catch(() => {})
      const used = await showBotScreen(message.chat.id, html, message.message_id)
      if (used) {
        // Как при открытии из очереди: якорь окна и живой режим ответа.
        await prisma.$transaction([
          prisma.supportTicket.updateMany({ where: { id: adminThreadTicketId },
            data: { adminBotChatId: BigInt(message.chat.id), adminBotMessageId: used } }),
          prisma.supportTicket.updateMany({ where: { id: { not: adminThreadTicketId }, adminBotChatId: BigInt(message.chat.id), adminBotMessageId: used },
            data: { adminBotMessageId: null } }),
          prisma.user.updateMany({ where: { id: account.id, adminQueueBotMessageId: used }, data: { adminQueueBotMessageId: null } }),
        ])
        const ticket = await prisma.supportTicket.findUnique({ where: { id: adminThreadTicketId }, select: { status: true } })
        if (ticket && ticket.status !== 'CLOSED') await setBotDialogState(account.id, `admin:reply:${adminThreadTicketId}`)
      }
      return
    }
  }
  const content = welcomeMessage(section, referral)
  if (process.env.TELEGRAM_RICH_MESSAGES_ENABLED === 'true') {
    // Команда убирается, экран открывается в едином окне бота.
    // Пока экран собирается — анимация «печатает…».
    await miniAppBotCall('deleteMessage', { chat_id: message.chat.id, message_id: message.message_id }).catch(() => {})
    await miniAppBotCall('sendChatAction', { chat_id: message.chat.id, action: 'typing' }).catch(() => {})
    // Переход по ссылке из анонса в канале встречаем экраном новых возможностей.
    const html = command === '/start' && startPayload === 'update'
      ? buildWhatsNewScreen(await getBotScreenInput(message.from.id, 'home'))
      : await getBotScreen(message.from.id, section as BotScreen, undefined, referral)
    await showBotScreen(message.chat.id, html, message.message_id)
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

// Медиа, приложенное к сообщению диалога: сжатое фото Telegram или документ.
type BotDialogMedia = { kind: 'photo' | 'document'; fileId: string; fileName: string; mimeType: string; size: number | null }

// Скачивает приложенный файл и проверяет его правилами вложений поддержки.
// Ошибка возвращается текстом — сообщение пользователя остаётся в чате для повтора.
async function resolveBotSupportAttachment(media: BotDialogMedia | null | undefined) {
  if (!media) return { attachment: null, error: null as string | null }
  if (media.size && media.size > SUPPORT_ATTACHMENT_MAX_SIZE) {
    return { attachment: null, error: 'Файл больше 5 МБ. Сожмите его или отправьте сообщение без вложения.' }
  }
  const bytes = await downloadTelegramFile(media.fileId, SUPPORT_ATTACHMENT_MAX_SIZE)
  if (!bytes) return { attachment: null, error: 'Не удалось получить файл. Попробуйте отправить ещё раз.' }
  try {
    return { attachment: buildSupportAttachment({ fileName: media.fileName, mimeType: media.mimeType, data: bytes }), error: null }
  } catch (e) {
    return { attachment: null, error: e instanceof SupportAttachmentError ? e.message : 'Такой файл не поддерживается.' }
  }
}

// Свободный текст в ожидаемом диалоге: новое обращение, ответ в тикет
// или ответ администратора. Состояние сохраняется при ошибках, чтобы текст
// можно было отправить повторно. Сообщение пользователя удаляется из чата
// всегда — и при успехе, и при ошибке: переписка живёт в одном обновляемом
// окне, а ошибка показывается в нём временным уведомлением.
async function handleBotDialogMessage(chatId: number, userId: string, state: string, text: string, sourceMessageId: number, payload?: string | null, media?: BotDialogMedia | null) {
  let html: string
  // Если у треда есть открытое окно — правим его на месте, новое сообщение не шлём.
  let editTarget: { ticketId: string; messageId: number; field: 'userBotMessageId' | 'adminBotMessageId' } | null = null
  // Сообщение принято в диалог — удаляем его из чата после рендера.
  let consumeMessage = false
  // Для рассылки годится только фото (sendPhoto), документы остаются поддержке.
  const imageFileId = media?.kind === 'photo' ? media.fileId : null
  if (state.startsWith('broadcast:text:') || state.startsWith('broadcast:preview:')) {
    const prefix = state.startsWith('broadcast:text:') ? 'broadcast:text:' : 'broadcast:preview:'
    const theme = findBroadcastTheme(state.slice(prefix.length))
    const previousDraft = parseBroadcastDraft(payload)
    if (!theme) {
      await clearBotDialogState(userId)
      html = await getBotScreen(chatId, 'admin', 'Тема рассылки устарела. Начните заново.')
    } else {
      // Своя кнопка — последней строкой «Кнопка: Текст | цель», она заменяет кнопку темы.
      const extracted = extractBroadcastButton(text)
      const validated = 'error' in extracted ? null : validateBroadcastText(extracted.body)
      const draftError = 'error' in extracted ? extracted.error : validated && !validated.ok ? validated.error : null
      if (validated?.ok && !('error' in extracted)) {
        // Текст без нового фото сохраняет приложенное ранее — и наоборот.
        const draft: BroadcastDraft = { text: validated.body, image: imageFileId ?? previousDraft?.image ?? null,
          button: extracted.button ?? previousDraft?.button ?? null }
        await setBotDialogState(userId, `broadcast:preview:${theme.key}`, serializeBroadcastDraft(draft))
        consumeMessage = true
        html = buildBroadcastPreviewScreen(await getBotScreenInput(chatId, 'admin'),
          { themeLabel: theme.label, segmentLabel: theme.segmentLabel,
            buttonLabel: draft.button?.label ?? theme.button?.label ?? null,
            buttonTarget: draft.button ? draft.button.url ?? draft.button.data!.replace(/^avp:/, '') : null,
            text: draft.text, withImage: Boolean(draft.image) })
      } else if (prefix === 'broadcast:preview:' && previousDraft) {
        // На шаге превью невалидный ввод не затирает старый черновик.
        const notice = imageFileId && !text.trim()
          ? 'У фото должна быть подпись с текстом рассылки. Черновик не изменился.'
          : `${draftError} Черновик не изменился.`
        html = buildBroadcastPreviewScreen(await getBotScreenInput(chatId, 'admin', notice),
          { themeLabel: theme.label, segmentLabel: theme.segmentLabel,
            buttonLabel: previousDraft.button?.label ?? theme.button?.label ?? null,
            buttonTarget: previousDraft.button ? previousDraft.button.url ?? previousDraft.button.data!.replace(/^avp:/, '') : null,
            text: previousDraft.text, withImage: Boolean(previousDraft.image) })
      } else {
        // Состояние сохраняется: текст можно исправить и отправить повторно.
        const notice = imageFileId && !text.trim() ? 'У фото должна быть подпись с текстом рассылки.' : draftError!
        html = buildBroadcastPromptScreen(await getBotScreenInput(chatId, 'admin', notice), broadcastThemeView(theme))
      }
    }
  } else if (state.startsWith('support:new:')) {
    const category = state.slice('support:new:'.length)
    if (!isSupportCategory(category)) {
      await clearBotDialogState(userId)
      html = await getBotScreen(chatId, 'support', 'Сессия обращения устарела. Начните заново.')
    } else {
      const { attachment, error: attachmentError } = await resolveBotSupportAttachment(media)
      if (attachmentError) {
        // Не доставлено: сообщение убираем из чата, окно временно показывает причину.
        consumeMessage = true
        html = await getBotScreen(chatId, 'support', `⚠️ ${attachmentError} Сообщение не доставлено — отправьте его ещё раз.`)
      } else {
      const result = await createTicketFromBot(userId, category, text, attachment)
      if (result.ok && result.ticketId) {
        // Обращение создано — сразу открываем его окно и включаем живой режим:
        // следующие сообщения пользователя падают в этот же тред.
        consumeMessage = true
        await setBotDialogState(userId, `support:reply:${result.ticketId}`)
        html = await getBotSupportThreadScreen(chatId, result.ticketId,
          '✅ Обращение создано. Ответ поддержки появится прямо здесь.')
        const promptMessageId = payload && Number.isInteger(Number(payload)) ? Number(payload) : null
        editTarget = promptMessageId
          ? { ticketId: result.ticketId, messageId: promptMessageId, field: 'userBotMessageId' as const }
          : null
      } else if (!result.ok) {
        consumeMessage = true
        html = await getBotScreen(chatId, 'support', `⚠️ ${result.error} Сообщение не доставлено — отправьте его ещё раз.`)
      } else {
        consumeMessage = true
        html = await getBotScreen(chatId, 'support', '⚠️ Не удалось открыть обращение. Сообщение не доставлено — отправьте его ещё раз.')
      }
      }
    }
  } else if (state.startsWith('support:reply:')) {
    const ticketId = state.slice('support:reply:'.length)
    const { attachment, error: attachmentError } = await resolveBotSupportAttachment(media)
    if (attachmentError) {
      // Не доставлено: сообщение убираем, окно треда временно показывает причину и просит повторить.
      consumeMessage = true
      html = await getBotSupportThreadScreen(chatId, ticketId, `⚠️ ${attachmentError} Сообщение не доставлено — отправьте его ещё раз.`)
      const failedAnchor = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { userBotMessageId: true } })
      editTarget = failedAnchor?.userBotMessageId ? { ticketId, messageId: failedAnchor.userBotMessageId, field: 'userBotMessageId' as const } : null
    } else {
    const result = await replyToTicketFromBot(userId, ticketId, text, attachment)
    if (result.ok) {
      // Живой режим: состояние НЕ очищается — пиши дальше, окно обновляется на месте.
      consumeMessage = true
      html = await getBotSupportThreadScreen(chatId, ticketId)
      const anchor = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { userBotMessageId: true } })
      editTarget = anchor?.userBotMessageId ? { ticketId, messageId: anchor.userBotMessageId, field: 'userBotMessageId' as const } : null
    } else if (result.error.includes('закрыто') || result.error.includes('не найдено')) {
      await clearBotDialogState(userId)
      consumeMessage = true
      html = await getBotScreen(chatId, 'support', result.error)
    } else {
      // Не доставлено: сообщение убираем, окно треда временно показывает причину и просит повторить.
      consumeMessage = true
      html = await getBotSupportThreadScreen(chatId, ticketId, `⚠️ ${result.error} Сообщение не доставлено — отправьте его ещё раз.`)
      const anchor = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { userBotMessageId: true } })
      editTarget = anchor?.userBotMessageId ? { ticketId, messageId: anchor.userBotMessageId, field: 'userBotMessageId' as const } : null
    }
    }
  } else if (state.startsWith('admin:reply:')) {
    const ticketId = state.slice('admin:reply:'.length)
    const { attachment, error: attachmentError } = await resolveBotSupportAttachment(media)
    if (attachmentError) {
      html = await getBotAdminThreadScreen(chatId, ticketId, attachmentError)
    } else {
    const result = await replyToTicketAsAdmin(userId, ticketId, text, attachment)
    if (result.ok) {
      consumeMessage = true
      html = await getBotAdminThreadScreen(chatId, ticketId, 'Ответ отправлен пользователю.')
      const anchor = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { adminBotMessageId: true } })
      editTarget = anchor?.adminBotMessageId ? { ticketId, messageId: anchor.adminBotMessageId, field: 'adminBotMessageId' as const } : null
    } else if (result.error.includes('закрыто') || result.error.includes('не найдено') || result.error.includes('доступен')) {
      await clearBotDialogState(userId)
      html = await getBotAdminTicketsScreen(chatId, result.error)
    } else {
      html = await getBotAdminThreadScreen(chatId, ticketId, result.error)
    }
    }
  } else if (state.startsWith('admin:note:')) {
    const ticketId = state.slice('admin:note:'.length)
    const result = await addTicketNoteAsAdmin(userId, ticketId, text)
    if (result.ok) {
      consumeMessage = true
      // Заметка сохранена — возвращаем живой режим переписки, если тикет ещё открыт.
      const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { status: true } })
      if (ticket && ticket.status !== 'CLOSED') await setBotDialogState(userId, `admin:reply:${ticketId}`)
      else await clearBotDialogState(userId)
      html = await getBotAdminThreadScreen(chatId, ticketId, '📝 Заметка сохранена. Её видит только команда в кабинете.')
      const anchor = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { adminBotMessageId: true } })
      editTarget = anchor?.adminBotMessageId ? { ticketId, messageId: anchor.adminBotMessageId, field: 'adminBotMessageId' as const } : null
    } else if (result.error.includes('доступен') || result.error.includes('не найдено')) {
      await clearBotDialogState(userId)
      html = await getBotAdminTicketsScreen(chatId, result.error)
    } else {
      html = await getBotAdminThreadScreen(chatId, ticketId, result.error)
    }
  } else {
    await clearBotDialogState(userId)
    html = await getBotScreen(chatId, 'support', 'Сессия устарела. Начните заново.')
  }
  if (consumeMessage) {
    await miniAppBotCall('deleteMessage', { chat_id: chatId, message_id: sourceMessageId }).catch(() => {})
  }
  if (editTarget) {
    const used = await displayCallbackScreen(chatId, editTarget.messageId, html)
    if (used) {
      await prisma.supportTicket.updateMany({ where: { id: editTarget.ticketId }, data: { [editTarget.field]: used } })
    }
    return
  }
  await showBotScreen(chatId, html, sourceMessageId)
}

function callbackUuid(salt: string, callbackId: string) {
  const hash = createHash('sha256').update(`${salt}:${callbackId}`).digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

async function sendStarsInvoiceFromBot(telegramId: number, callbackId: string, planId: string, promoCode?: string) {
  // Ошибки и статусы показываем в едином окне, а не отдельными сообщениями.
  const rich = process.env.TELEGRAM_RICH_MESSAGES_ENABLED === 'true'
  const fail = async (notice: string, screen: BotScreen = 'plans') => {
    if (rich) await showBotScreen(telegramId, await getBotScreen(telegramId, screen, notice))
    else await miniAppBotCall('sendMessage', { chat_id: telegramId, text: notice })
  }
  if (!starsEnabled()) return fail('Оплата Stars временно недоступна.')
  const account = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) }, select: { id: true } })
  if (!account) return fail('Войдите через Telegram в приложение AlekseevVP, затем выберите тариф.', 'home')
  const catalog = await buildPlanCatalog({ userId: account.id })
  const plan = catalog.plans.find(item => item.id === planId)
  if (!plan) return fail('Тариф больше недоступен. Откройте актуальный список.')
  const request = new Request(miniAppUrl(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    planId, purchaseType: 'SUBSCRIPTION', provider: 'TELEGRAM_STARS', deviceLimit: plan.initialDeviceLimit,
    idempotencyKey: checkoutUuid(callbackId),
    ...(promoCode ? { promoCode } : {}),
  }) })
  const limitKey = `bot-stars:${createHash('sha256').update(String(telegramId)).digest('hex')}`
  const limited = await rateLimitKey(limitKey, 10, 60_000)
  if (!limited.ok) return fail('Слишком много попыток оплаты. Попробуйте позже.')
  const locked = await withDistributedLock(`billing-operation:${account.id}`,
    () => createPaymentForUser(request, account.id, { telegramBot: true }), { timeoutMs: 30_000 })
  if (!locked.acquired) return fail('Другая операция оплаты ещё выполняется. Повторите позже.')
  const result = await locked.value.json() as { confirmationUrl?: string; localPaymentId?: string; starsAmount?: number; error?: string; redirectUrl?: string }
  if (result.error) return fail(result.error)
  if (result.redirectUrl) return fail('🎉 Доступ оформлен — подписка уже обновлена!', 'subscription')
  if (!result.confirmationUrl || !result.localPaymentId || typeof result.starsAmount !== 'number'
      || !Number.isInteger(result.starsAmount)) throw new Error('Stars invoice was not created')
  const durationLabel = plan.unlimitedDuration ? 'Бессрочная' : `${plan.durationDays} дней`
  if (rich) {
    // Окно показывает красивый экран счёта, сам инвойс — прямо под ним.
    await showBotScreen(telegramId, buildStarsInvoiceScreen({
      planName: plan.name, durationLabel, starsAmount: result.starsAmount, promoCode: promoCode ?? null }))
  }
  const invoice = await miniAppBotCall<{ message_id?: number }>('sendInvoice', { chat_id: telegramId, title: plan.name.slice(0, 32),
    description: plan.unlimitedDuration ? 'Бессрочная подписка AlekseevVP' : `Подписка AlekseevVP на ${plan.durationDays} дней`,
    payload: `avp:${result.localPaymentId}`, provider_token: '', currency: 'XTR',
    prices: [{ label: plan.name.slice(0, 32), amount: result.starsAmount }], protect_content: true })
  // Запоминаем сообщение-счёт: после оплаты удалим его, чат останется чистым.
  await prisma.payment.update({ where: { id: result.localPaymentId },
    data: { botInvoiceMessageId: typeof invoice?.message_id === 'number' ? invoice.message_id : null } }).catch(() => {})
}
