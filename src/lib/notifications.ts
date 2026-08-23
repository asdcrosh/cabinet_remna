import type { NotificationChannel, NotificationType } from '@prisma/client'
import { getAppUrl } from './app-url'
import { getBrandName } from './branding'
import { renderActionEmail } from './email-template'
import { prisma } from './prisma'
import { createAdminNotification } from './admin-notifications'
import { logError, logWarn } from './logger'
import { remnawave } from './remnawave'
import { readPlanPurchaseSnapshot, resolveEffectiveDeviceLimit } from './plan-purchase'
import {
  buildAdminPaymentStuckTelegramText,
  buildAdminPaymentTelegramText,
  buildAdminWhitelistAddonTelegramText,
} from './admin-telegram-notifications'
import { paymentProviderLabel } from './payment-provider-label'
import { readWhitelistAddonSnapshot } from './whitelist-addon'

const RENEW_PATH = '/dashboard/plans?intent=renew'
const SUBSCRIPTION_PATH = '/dashboard/subscription'
const DELIVERY_TIMEOUT_MS = 15_000

type NotifyUserInput = {
  userId: string
  type: NotificationType
  dedupeKey: string
  title: string
  body: string
  actionHref?: string
  actionLabel?: string
  telegramText?: string
  telegramImageUrl?: string
  telegramActionUrl?: string
  telegramActionLabel?: string
  telegramActionOpenInTelegram?: boolean
  emailSubject?: string
  emailText?: string
  emailHtml?: string
  emailDeliveryMode?: 'always' | 'fallback'
  inApp?: boolean
}

type NotifyResult = 'sent' | 'duplicate' | 'skipped' | 'failed'

export async function notifyUser(input: NotifyUserInput) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      email: true,
      emailVerifiedAt: true,
      name: true,
      telegramId: true,
      notificationPreference: {
        select: {
          inAppEnabled: true,
          telegramEnabled: true,
          emailEnabled: true,
          broadcastsEnabled: true,
        },
      },
    },
  })

  if (!user) {
    return { telegram: 'skipped' as NotifyResult, email: 'skipped' as NotifyResult }
  }

  const preferences = user.notificationPreference
  const broadcastsAllowed = input.type !== 'BROADCAST' || preferences?.broadcastsEnabled !== false

  if (broadcastsAllowed && input.inApp !== false && preferences?.inAppEnabled !== false) {
    await createInAppNotification({
      userId: user.id,
      type: input.type,
      dedupeKey: input.dedupeKey,
      title: input.title,
      body: input.body,
      actionHref: input.actionHref,
      actionLabel: input.actionLabel,
    })
  }

  const telegram = broadcastsAllowed && preferences?.telegramEnabled !== false && user.telegramId && input.telegramText
    ? await sendWithDedupe({
        userId: user.id,
        type: input.type,
        channel: 'TELEGRAM',
        dedupeKey: input.dedupeKey,
        send: () =>
          sendTelegramMessage({
            chatId: user.telegramId!,
            text: input.telegramText!,
            imageUrl: input.telegramImageUrl,
            actionUrl: input.telegramActionUrl,
            actionLabel: input.telegramActionLabel,
            actionOpenInTelegram: input.telegramActionOpenInTelegram,
          }),
      })
    : 'skipped' as NotifyResult

  const emailAllowed =
    broadcastsAllowed &&
    preferences?.emailEnabled !== false &&
    user.emailVerifiedAt &&
    isRealEmail(user.email) &&
    input.emailSubject &&
    input.emailText &&
    input.emailHtml
  const emailMode = input.emailDeliveryMode ?? 'always'
  const shouldSendEmail = Boolean(emailAllowed) && (
    emailMode === 'always' || telegram === 'skipped' || telegram === 'failed'
  )

  const email = shouldSendEmail
    ? await sendWithDedupe({
        userId: user.id,
        type: input.type,
        channel: 'EMAIL',
        dedupeKey: input.dedupeKey,
        send: () =>
          sendEmail({
            to: user.email,
            subject: input.emailSubject!,
            text: input.emailText!,
            html: input.emailHtml!,
          }),
      })
    : 'skipped' as NotifyResult

  return { telegram, email }
}

export async function notifyPaymentSucceeded(paymentId: string) {
  const { recordPaymentEvent } = await import('./payment-events')
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          telegramUsername: true,
          remnawaveUsername: true,
        },
      },
      plan: { select: { name: true, durationDays: true, trafficLimitGb: true, deviceLimit: true } },
      subscription: {
        select: {
          startAt: true,
          expireAt: true,
          deviceLimit: true,
          whitelistAddonExpireAt: true,
        },
      },
    },
  })
  if (!payment) return

  if (payment.purchaseType === 'WHITELIST_ADDON') {
    const snapshot = readWhitelistAddonSnapshot(payment.addonSnapshot)
    const amount = formatRubles(payment.amountKopecks)
    const expireAt = payment.subscription?.whitelistAddonExpireAt ?? null
    const expireText = expireAt ? ` до ${formatDate(expireAt)}` : ''
    await notifyUser({
      userId: payment.user.id,
      type: 'PAYMENT_SUCCESS',
      dedupeKey: `payment-success:${payment.id}`,
      title: 'Белые списки подключены',
      body: `Доплата ${amount} прошла успешно. Дополнительные серверы доступны${expireText}.`,
      actionHref: SUBSCRIPTION_PATH,
      actionLabel: 'Открыть подписку',
      telegramText: [
        '<b>Белые списки подключены</b>',
        '',
        `Оплата: <b>${amount}</b>`,
        snapshot?.name ? `Дополнение: ${snapshot.name}` : null,
        expireAt ? `Доступ: до ${formatDate(expireAt)}` : null,
      ].filter(Boolean).join('\n'),
      telegramActionUrl: `${getAppUrl()}${SUBSCRIPTION_PATH}`,
      telegramActionLabel: 'Открыть подписку',
      telegramActionOpenInTelegram: true,
      emailSubject: `Белые списки подключены в ${getBrandName()}`,
      emailText: `Доплата ${amount} прошла успешно. Дополнительные серверы доступны${expireText}.`,
      emailHtml: renderNotificationEmail({
        eyebrow: 'Оплата прошла',
        title: 'Белые списки подключены',
        lead: `Доплата ${amount} прошла успешно. Дополнительные серверы доступны${expireText}.`,
        ctaUrl: `${getAppUrl()}${SUBSCRIPTION_PATH}`,
        ctaLabel: 'Открыть подписку',
        greetingName: payment.user.name,
      }),
    })
    await createAdminNotification({
      type: 'payment',
      severity: 'SUCCESS',
      dedupeKey: `admin:payment-success:${payment.id}`,
      title: 'Куплены БС',
      body: `${payment.user.name || 'Пользователь'} оплатил ${amount} за расширенный доступ.${expireAt ? ` БС подключены до ${formatDate(expireAt)}.` : ''}`,
      entityType: 'payment',
      entityId: payment.id,
      actionHref: '/dashboard/admin/payments',
      actionLabel: 'Открыть платежи',
      telegram: {
        text: buildAdminWhitelistAddonTelegramText({
          amount,
          expireAt,
        }),
        actionHref: '/dashboard/admin/payments',
        actionLabel: 'Открыть платежи',
      },
    })
    await recordPaymentEvent({
      paymentId: payment.id,
      stage: 'NOTIFICATION',
      status: 'SUCCESS',
      source: 'notifications',
      message: 'Уведомление об активации дополнения обработано',
      dedupeKey: 'notification-payment-success',
    })
    return
  }

  const previousSucceededPayments = await prisma.payment.count({
    where: {
      userId: payment.userId,
      id: { not: payment.id },
      status: 'SUCCEEDED',
      subscriptionProvisionedAt: { not: null },
      createdAt: { lt: payment.createdAt },
    },
  })

  const appUrl = getAppUrl()
  const amount = formatRubles(payment.amountKopecks)
  const purchaseSnapshot = readPlanPurchaseSnapshot(payment.planSnapshot)
  const planName = purchaseSnapshot?.name ?? payment.plan?.name ?? 'тариф'
  const durationDays = purchaseSnapshot?.durationDays ?? payment.plan?.durationDays ?? null
  const trafficLimitGb = purchaseSnapshot?.trafficLimitGb ?? payment.plan?.trafficLimitGb ?? null
  const subscriptionUrl = await getSubscriptionUrl(payment.user.remnawaveUsername)
  const dashboardSubscriptionUrl = `${appUrl}${SUBSCRIPTION_PATH}`
  const qrUrl = subscriptionUrl ? `${appUrl}/api/qr?text=${encodeURIComponent(subscriptionUrl)}` : null
  const isPaid = payment.amountKopecks > 0
  const isRenewal = isPaid && previousSucceededPayments > 0
  const deviceLimit = payment.plan
    ? resolveEffectiveDeviceLimit({
        snapshot: payment.planSnapshot,
        paymentDeviceLimit: payment.deviceLimit,
        subscriptionDeviceLimit: payment.subscription?.deviceLimit,
        planDeviceLimit: payment.plan.deviceLimit,
      })
    : payment.deviceLimit ?? payment.subscription?.deviceLimit ?? null
  const expireText = payment.subscription?.expireAt ? `до ${formatDate(payment.subscription.expireAt)}` : null
  const title = isPaid ? (isRenewal ? 'Подписка продлена' : 'Подписка оплачена') : 'Пробный тариф активирован'
  const body = [
    isPaid
      ? `${isRenewal ? 'Продление' : 'Оплата'} ${amount} за ${planName} прошло успешно.`
      : `Тариф ${planName} активирован.`,
    expireText ? `Подписка действует ${expireText}.` : 'Подписка уже доступна в кабинете.',
  ].join(' ')
  const telegramText = buildPaymentSuccessTelegramText({
    title,
    userName: payment.user.name,
    planName,
    amount,
    durationDays,
    trafficLimitGb,
    deviceLimit,
    expireAt: payment.subscription?.expireAt ?? null,
    paidAt: payment.paidAt ?? payment.subscriptionProvisionedAt ?? payment.updatedAt,
    isPaid,
    isRenewal,
  })

  await notifyUser({
    userId: payment.user.id,
    type: 'PAYMENT_SUCCESS',
    dedupeKey: `payment-success:${payment.id}`,
    title,
    body,
    actionHref: SUBSCRIPTION_PATH,
    actionLabel: 'Открыть подписку',
    telegramText,
    telegramActionUrl: `${appUrl}${SUBSCRIPTION_PATH}`,
    telegramActionLabel: 'Открыть подписку',
    telegramActionOpenInTelegram: true,
    emailSubject: `${title} в ${getBrandName()}`,
    emailText: buildPaymentSuccessEmailText({
      title,
      body,
      planName,
      amount,
      durationDays,
      trafficLimitGb,
      deviceLimit,
      expireAt: payment.subscription?.expireAt ?? null,
      subscriptionUrl,
      dashboardSubscriptionUrl,
      qrUrl,
      appUrl,
    }),
    emailHtml: renderPaymentSuccessEmail({
      title,
      lead: body,
      greetingName: payment.user.name,
      planName,
      amount,
      durationDays,
      trafficLimitGb,
      deviceLimit,
      expireAt: payment.subscription?.expireAt ?? null,
      subscriptionUrl,
      dashboardSubscriptionUrl,
      qrUrl,
      appUrl,
    }),
    emailDeliveryMode: 'fallback',
  })

  await createAdminNotification({
    type: 'payment',
    severity: 'SUCCESS',
    dedupeKey: `admin:payment-success:${payment.id}`,
    title: 'Оплата прошла',
    body: `${payment.user.name || 'Пользователь'} оплатил ${amount} за ${planName}.`,
    entityType: 'payment',
    entityId: payment.id,
    actionHref: '/dashboard/admin/payments',
    actionLabel: 'Открыть платежи',
    telegram: {
      text: buildAdminPaymentTelegramText({
        amount,
        planName,
        durationDays: payment.plan?.durationDays ?? null,
        customerName: payment.user.name,
        customerEmail: payment.user.email,
        telegramUsername: payment.user.telegramUsername,
        provider: paymentProviderLabel(payment.provider),
        expireAt: payment.subscription?.expireAt ?? null,
        isPaid,
        isRenewal,
      }),
      actionHref: `/dashboard/admin/payments?q=${encodeURIComponent(payment.externalPaymentId ?? payment.id)}`,
      actionLabel: 'Открыть платёж',
    },
  })
  await recordPaymentEvent({
    paymentId,
    stage: 'NOTIFICATION',
    status: 'SUCCESS',
    source: 'notifications',
    message: 'Уведомления об успешной оплате обработаны',
    dedupeKey: 'notification-payment-success',
  })
}

export async function notifyPaymentCanceled(paymentId: string, reason = 'Платёж отменён или не был завершён вовремя.') {
  const { recordPaymentEvent } = await import('./payment-events')
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      user: { select: { id: true, name: true } },
      plan: { select: { name: true } },
    },
  })
  if (!payment) return

  const body = `${reason} Тариф ${payment.plan?.name ?? 'выбранный тариф'} можно оплатить заново в кабинете.`
  await notifyUser({
    userId: payment.user.id,
    type: 'PAYMENT_FAILED',
    dedupeKey: `payment-canceled:${payment.id}`,
    title: 'Платёж не завершён',
    body,
    actionHref: RENEW_PATH,
    actionLabel: 'Оплатить заново',
    telegramText: [`<b>Платёж не завершён</b>`, escapeTelegram(body)].join('\n'),
    telegramActionUrl: `${getAppUrl()}${RENEW_PATH}`,
    telegramActionLabel: 'Оплатить заново',
    telegramActionOpenInTelegram: true,
    emailSubject: `Платёж не завершён — ${getBrandName()}`,
    emailText: `${body}\n\nОткрыть тарифы: ${getAppUrl()}${RENEW_PATH}`,
    emailHtml: renderNotificationEmail({
      eyebrow: 'Платёж',
      title: 'Платёж не завершён',
      lead: body,
      ctaLabel: 'Оплатить заново',
      ctaUrl: `${getAppUrl()}${RENEW_PATH}`,
      greetingName: payment.user.name,
    }),
  })

  await createAdminNotification({
    type: 'payment',
    severity: 'WARNING',
    dedupeKey: `admin:payment-canceled:${payment.id}`,
    title: 'Платёж не завершён',
    body: `${payment.user.name || 'Пользователь'} не завершил оплату тарифа ${payment.plan?.name ?? 'без названия'}.`,
    entityType: 'payment',
    entityId: payment.id,
    actionHref: '/dashboard/admin/payments',
    actionLabel: 'Открыть платежи',
  })
  await recordPaymentEvent({
    paymentId,
    stage: 'NOTIFICATION',
    status: 'SUCCESS',
    source: 'notifications',
    message: 'Уведомления об отмене платежа обработаны',
    dedupeKey: 'notification-payment-canceled',
  })
}

export async function notifyPaymentStuck(paymentId: string, reason = 'Платёж требует проверки.') {
  const { recordPaymentEvent } = await import('./payment-events')
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      userId: true,
      amountKopecks: true,
      provider: true,
      externalPaymentId: true,
      plan: { select: { name: true } },
      user: {
        select: {
          name: true,
          email: true,
          telegramUsername: true,
        },
      },
    },
  })
  if (!payment) return

  const body = `${reason} Если доступ не появился, напишите в поддержку из кабинета.`
  await notifyUser({
    userId: payment.userId,
    type: 'PAYMENT_STUCK',
    dedupeKey: `payment-stuck:${payment.id}`,
    title: 'Платёж в проверке',
    body,
    actionHref: '/dashboard/support',
    actionLabel: 'Написать в поддержку',
    telegramText: [`<b>Платёж в проверке</b>`, escapeTelegram(body)].join('\n'),
    emailSubject: `Платёж в проверке — ${getBrandName()}`,
    emailText: `${body}\n\nПоддержка: ${getAppUrl()}/dashboard/support`,
    emailHtml: renderNotificationEmail({
      eyebrow: 'Платёж',
      title: 'Платёж в проверке',
      lead: body,
      ctaLabel: 'Написать в поддержку',
      ctaUrl: `${getAppUrl()}/dashboard/support`,
      greetingName: payment.user.name,
    }),
  })

  await createAdminNotification({
    type: 'payment',
    severity: 'ERROR',
    dedupeKey: `admin:payment-stuck:${payment.id}`,
    title: 'Платёж требует проверки',
    body: `${payment.plan?.name ?? 'Тариф'}: ${reason}`,
    entityType: 'payment',
    entityId: payment.id,
    actionHref: '/dashboard/admin/payments',
    actionLabel: 'Проверить',
    telegram: {
      text: buildAdminPaymentStuckTelegramText({
        amount: formatRubles(payment.amountKopecks),
        planName: payment.plan?.name ?? 'Тариф',
        customerName: payment.user.name,
        customerEmail: payment.user.email,
        telegramUsername: payment.user.telegramUsername,
        provider: paymentProviderLabel(payment.provider),
        reason,
      }),
      actionHref: `/dashboard/admin/payments?q=${encodeURIComponent(payment.externalPaymentId ?? payment.id)}`,
      actionLabel: 'Проверить платёж',
    },
  })
  await recordPaymentEvent({
    paymentId,
    stage: 'NOTIFICATION',
    status: 'WARNING',
    source: 'notifications',
    message: 'Пользователь и администратор уведомлены о задержке выдачи',
    details: { reason },
    dedupeKey: 'notification-payment-stuck',
  })
}

export async function notifySupportReply(input: { ticketId: string; messageId: string }) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: input.ticketId },
    select: {
      id: true,
      subject: true,
      userId: true,
      user: { select: { name: true } },
    },
  })
  if (!ticket) return

  const body = `В обращении «${ticket.subject}» появился новый ответ.`
  await notifyUser({
    userId: ticket.userId,
    type: 'SUPPORT_REPLY',
    dedupeKey: `support-reply:${input.messageId}`,
    title: 'Ответ поддержки',
    body,
    actionHref: '/dashboard/support',
    actionLabel: 'Открыть чат',
    telegramText: [`<b>Ответ поддержки</b>`, escapeTelegram(body)].join('\n'),
    emailSubject: `Ответ поддержки — ${getBrandName()}`,
    emailText: `${body}\n\nОткрыть поддержку: ${getAppUrl()}/dashboard/support`,
    emailHtml: renderNotificationEmail({
      eyebrow: 'Поддержка',
      title: 'Ответ поддержки',
      lead: body,
      ctaLabel: 'Открыть чат',
      ctaUrl: `${getAppUrl()}/dashboard/support`,
      greetingName: ticket.user.name,
    }),
  })
}

export async function notifyBonusGranted(input: { userId: string; attemptsCount: number }) {
  void input
  return { telegram: 'skipped' as NotifyResult, email: 'skipped' as NotifyResult }
}

export async function notifyBonusGrantedInAppBulk(input: {
  userIds: string[]
  attemptsCount: number
  operationId: string
}) {
  void input
}

export async function notifySubscriptionExpiring(input: {
  userId: string
  subscriptionId: string
  expireAt: Date
  stage: '3d' | '1d' | 'grace_1d' | 'expired'
  planName?: string | null
}) {
  const plan = input.planName ? ` «${input.planName}»` : ''
  const expired = input.stage === 'expired'
  const graceEnding = input.stage === 'grace_1d'
  const title = graceEnding
    ? 'Льготный период закончится через сутки'
    : expired ? 'Подписка закончилась' : 'Подписка скоро закончится'
  const body = graceEnding
    ? `Льготный доступ для подписки${plan} закончится ${formatDate(input.expireAt)}. Продлите тариф, чтобы сохранить устройства и настройки.`
    : expired
    ? `Подписка${plan} закончилась ${formatDate(input.expireAt)}. Продлите её, чтобы вернуть доступ.`
    : `Подписка${plan} закончится ${input.stage === '3d' ? 'через 3 дня' : 'через сутки'}, ${formatDate(input.expireAt)}.`
  const expiryKey = input.expireAt.toISOString()
  await notifyUser({
    userId: input.userId,
    type: 'SUBSCRIPTION_EXPIRING',
    dedupeKey: `subscription-expiring:${input.subscriptionId}:${expiryKey}:${input.stage}`,
    title,
    body,
    actionHref: RENEW_PATH,
    actionLabel: 'Продлить',
    telegramText: [`<b>${title}</b>`, escapeTelegram(body)].join('\n'),
    telegramActionUrl: `${getAppUrl()}${RENEW_PATH}`,
    telegramActionLabel: 'Продлить',
    telegramActionOpenInTelegram: true,
    emailSubject: `${title} — ${getBrandName()}`,
    emailText: `${body}\n\nПродлить: ${getAppUrl()}${RENEW_PATH}`,
    emailHtml: renderNotificationEmail({
      eyebrow: graceEnding ? 'Льготный период' : 'Подписка',
      title,
      lead: body,
      ctaLabel: 'Продлить подписку',
      ctaUrl: `${getAppUrl()}${RENEW_PATH}`,
    }),
  })
}

export async function notifyWhitelistAddonExpiring(input: {
  userId: string
  subscriptionId: string
  expireAt: Date
}) {
  const title = 'Расширенный доступ скоро закончится'
  const body = `БС действуют до ${formatDate(input.expireAt)}. Продлите их, чтобы не потерять доступ к безграничному интернету в приложении INCY.`
  const actionHref = '/dashboard?whitelistAddon=renew'
  await notifyUser({
    userId: input.userId,
    type: 'WHITELIST_ADDON_EXPIRING',
    dedupeKey: `whitelist-addon-expiring:${input.subscriptionId}:${input.expireAt.toISOString()}:3d`,
    title,
    body,
    actionHref,
    actionLabel: 'Продлить БС',
    telegramText: [`<b>${title}</b>`, escapeTelegram(body)].join('\n'),
    telegramActionUrl: `${getAppUrl()}${actionHref}`,
    telegramActionLabel: 'Продлить БС',
    telegramActionOpenInTelegram: true,
  })
}

export async function notifySubscriptionTerminated(input: {
  userId: string
  source: 'USER_REQUEST' | 'ADMIN_REQUEST' | 'YOOKASSA_REFUND' | 'PLATEGA_CHARGEBACK' | 'REMNASHOP_REFUND'
  dedupeId: string
}) {
  const adminRemoval = input.source === 'ADMIN_REQUEST'
  const userRemoval = input.source === 'USER_REQUEST'
  const title = adminRemoval
    ? 'Подписка отключена администратором'
    : userRemoval
      ? 'Подписка отключена'
      : 'Подписка отключена после возврата'
  const body = adminRemoval
    ? 'Доступ остановлен на всех устройствах. Профиль сохранён, его можно активировать снова. Если это произошло неожиданно, напишите в поддержку.'
    : userRemoval
      ? 'Доступ остановлен на всех устройствах. Профиль сохранён, новый тариф можно выбрать в кабинете.'
      : input.source === 'PLATEGA_CHARGEBACK'
        ? 'Платёж был возвращён или оспорен, поэтому доступ остановлен. Профиль подключения сохранён.'
        : 'Возврат платежа подтверждён, поэтому доступ остановлен. Профиль подключения сохранён.'
  const actionHref = adminRemoval ? '/dashboard/support' : RENEW_PATH
  const actionLabel = adminRemoval ? 'Написать в поддержку' : 'Выбрать тариф'
  const actionUrl = `${getAppUrl()}${actionHref}`

  await notifyUser({
    userId: input.userId,
    type: 'SUBSCRIPTION_TERMINATED',
    dedupeKey: `subscription-terminated:${input.dedupeId}`,
    title,
    body,
    actionHref,
    actionLabel,
    telegramText: [`<b>${escapeTelegram(title)}</b>`, escapeTelegram(body)].join('\n'),
    telegramActionUrl: actionUrl,
    telegramActionLabel: actionLabel,
    telegramActionOpenInTelegram: true,
    emailSubject: `${title} — ${getBrandName()}`,
    emailText: `${body}\n\n${actionLabel}: ${actionUrl}`,
    emailHtml: renderNotificationEmail({
      eyebrow: 'Подписка',
      title,
      lead: body,
      ctaLabel: actionLabel,
      ctaUrl: actionUrl,
    }),
  })
}

export async function notifyTrafficLimit(input: {
  userId: string
  subscriptionId: string
  stage: '80' | '95' | '100'
  usedBytes: bigint
  limitBytes: bigint
}) {
  const body =
    input.stage === '100'
      ? `Трафик по подписке израсходован: ${formatBytes(input.usedBytes)} из ${formatBytes(input.limitBytes)}.`
      : `Использовано ${input.stage}% трафика: ${formatBytes(input.usedBytes)} из ${formatBytes(input.limitBytes)}.`

  await notifyUser({
    userId: input.userId,
    type: 'TRAFFIC_LIMIT',
    dedupeKey: `traffic-limit:${input.subscriptionId}:${input.stage}`,
    title: 'Трафик подходит к лимиту',
    body,
    actionHref: '/dashboard/subscription',
    actionLabel: 'Открыть подписку',
    telegramText: [`<b>Трафик подходит к лимиту</b>`, escapeTelegram(body)].join('\n'),
    emailSubject: `Трафик подходит к лимиту — ${getBrandName()}`,
    emailText: `${body}\n\nОткрыть подписку: ${getAppUrl()}/dashboard/subscription`,
    emailHtml: renderNotificationEmail({
      eyebrow: 'Трафик',
      title: 'Трафик подходит к лимиту',
      lead: body,
      ctaLabel: 'Открыть подписку',
      ctaUrl: `${getAppUrl()}/dashboard/subscription`,
    }),
  })
}

async function createInAppNotification(input: {
  userId: string
  type: NotificationType
  dedupeKey: string
  title: string
  body: string
  actionHref?: string
  actionLabel?: string
}) {
  await prisma.userNotification.createMany({
    data: {
      userId: input.userId,
      type: input.type,
      dedupeKey: `${input.type}:${input.dedupeKey}`,
      title: input.title,
      body: input.body,
      actionHref: input.actionHref,
      actionLabel: input.actionLabel,
    },
    skipDuplicates: true,
  })
}

async function sendWithDedupe(input: {
  userId: string
  type: NotificationType
  channel: NotificationChannel
  dedupeKey: string
  send: () => Promise<void>
}): Promise<NotifyResult> {
  const dedupeKey = `${input.type}:${input.dedupeKey}`
  const created = await prisma.notificationLog.createMany({
    data: {
      userId: input.userId,
      type: input.type,
      channel: input.channel,
      dedupeKey,
    },
    skipDuplicates: true,
  })

  if (created.count === 0) return 'duplicate'

  try {
    await input.send()
    return 'sent'
  } catch (error) {
    const message = error instanceof Error ? error.message : 'notification delivery failed'
    await prisma.notificationLog.updateMany({
      where: { channel: input.channel, dedupeKey },
      data: { error: message.slice(0, 1000) },
    })
    logError('notifications.delivery_failed', undefined, {
      userId: input.userId,
      type: input.type,
      channel: input.channel,
      message,
    })
    return 'failed'
  }
}

async function sendTelegramMessage(input: {
  chatId: bigint
  text: string
  imageUrl?: string
  actionUrl?: string
  actionLabel?: string
  actionOpenInTelegram?: boolean
}) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token) return

  const replyMarkup = input.actionUrl && input.actionLabel
    ? {
        inline_keyboard: [[
          input.actionOpenInTelegram
            ? { text: input.actionLabel, web_app: { url: input.actionUrl } }
            : { text: input.actionLabel, url: input.actionUrl },
        ]],
      }
    : undefined
  const method = input.imageUrl ? 'sendPhoto' : 'sendMessage'
  const payload = input.imageUrl
    ? {
        chat_id: input.chatId.toString(),
        photo: input.imageUrl,
        caption: input.text.slice(0, 1000),
        parse_mode: 'HTML',
        show_caption_above_media: true,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }
    : {
        chat_id: input.chatId.toString(),
        text: input.text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
  })

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    throw new Error(`Telegram failed: ${response.status} ${details}`.slice(0, 1000))
  }
}

async function sendEmail(input: { to: string; subject: string; text: string; html: string }) {
  const webhookUrl = process.env.EMAIL_VERIFICATION_WEBHOOK_URL?.trim()
  if (!webhookUrl) return

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.EMAIL_VERIFICATION_WEBHOOK_SECRET
        ? { Authorization: `Bearer ${process.env.EMAIL_VERIFICATION_WEBHOOK_SECRET}` }
        : {}),
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
  })

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    throw new Error(`Email failed: ${response.status} ${details}`.slice(0, 1000))
  }
}

function renderNotificationEmail(input: {
  eyebrow: string
  title: string
  lead: string
  ctaLabel: string
  ctaUrl: string
  greetingName?: string | null
}) {
  return renderActionEmail({
    eyebrow: input.eyebrow,
    title: input.title,
    lead: input.lead,
    greetingName: input.greetingName,
    body: input.lead,
    ctaLabel: input.ctaLabel,
    ctaUrl: input.ctaUrl,
    expiry: 'Уведомление отправлено автоматически.',
    securityNote: 'Если вопрос уже решён, дополнительных действий не требуется.',
  })
}

function renderPaymentSuccessEmail(input: {
  title: string
  lead: string
  greetingName?: string | null
  planName: string
  amount: string
  durationDays: number | null
  trafficLimitGb: number | null
  deviceLimit: number | null
  expireAt: Date | null
  subscriptionUrl: string | null
  dashboardSubscriptionUrl: string
  qrUrl: string | null
  appUrl: string
}) {
  const primaryUrl = input.subscriptionUrl ?? input.dashboardSubscriptionUrl
  const primaryLabel = input.subscriptionUrl ? 'Подключить VPN' : 'Открыть подписку'
  const rows: Array<[string, string]> = [
    ['Тариф', input.planName],
    ['Срок', input.durationDays ? formatDurationDays(input.durationDays) : 'активен'],
    ['Трафик', input.trafficLimitGb ? `${input.trafficLimitGb} ГБ` : 'без лимита'],
    ['Устройства', input.deviceLimit ? `до ${input.deviceLimit}` : 'по тарифу'],
    ['Оплачено', input.amount],
    ['Действует до', input.expireAt ? formatDate(input.expireAt) : 'уже доступна в кабинете'],
  ]
  const links = [
    `Подписка в кабинете: ${input.dashboardSubscriptionUrl}`,
    input.subscriptionUrl ? `Прямая ссылка подписки: ${input.subscriptionUrl}` : null,
    input.qrUrl ? `QR-код: ${input.qrUrl}` : null,
    `Устройства: ${input.appUrl}/dashboard/devices`,
    `Помощь с подключением: ${input.appUrl}/dashboard/support`,
  ].filter((item): item is string => Boolean(item))

  return renderActionEmail({
    eyebrow: 'Оплата прошла',
    title: input.title,
    lead: input.lead,
    greetingName: input.greetingName,
    body: [
      'Подписка активна. Ниже данные тарифа и ссылки для подключения.',
      '',
      ...rows.map(([label, value]) => `${label}: ${value}`),
      '',
      'Быстрые ссылки:',
      ...links.map((link) => `- ${link}`),
    ].join('\n'),
    ctaLabel: primaryLabel,
    ctaUrl: primaryUrl,
    expiry: input.expireAt
      ? `Подписка действует до ${formatDate(input.expireAt)}.`
      : 'Подписка уже доступна в личном кабинете.',
    securityNote: input.subscriptionUrl
      ? 'Ссылка подписки даёт доступ к подключению. Не пересылайте это письмо посторонним.'
      : 'Ссылка подписки появится в кабинете сразу после обновления данных Remnawave.',
  })
}

function buildPaymentSuccessEmailText(input: {
  title: string
  body: string
  planName: string
  amount: string
  durationDays: number | null
  trafficLimitGb: number | null
  deviceLimit: number | null
  expireAt: Date | null
  subscriptionUrl: string | null
  dashboardSubscriptionUrl: string
  qrUrl: string | null
  appUrl: string
}) {
  return [
    input.title,
    '',
    input.body,
    '',
    `Тариф: ${input.planName}`,
    `Срок: ${input.durationDays ? formatDurationDays(input.durationDays) : 'активен'}`,
    `Трафик: ${input.trafficLimitGb ? `${input.trafficLimitGb} ГБ` : 'без лимита'}`,
    `Устройства: ${input.deviceLimit ? `до ${input.deviceLimit}` : 'по тарифу'}`,
    `Оплачено: ${input.amount}`,
    `Действует до: ${input.expireAt ? formatDate(input.expireAt) : 'уже доступна в кабинете'}`,
    '',
    `Подписка в кабинете: ${input.dashboardSubscriptionUrl}`,
    input.subscriptionUrl ? `Прямая ссылка подписки: ${input.subscriptionUrl}` : null,
    input.qrUrl ? `QR-код: ${input.qrUrl}` : null,
    `Устройства: ${input.appUrl}/dashboard/devices`,
    `Помощь с подключением: ${input.appUrl}/dashboard/support`,
  ].filter((line): line is string => line !== null).join('\n')
}

async function getSubscriptionUrl(remnawaveUsername: string | null) {
  if (!remnawaveUsername) return null

  try {
    const data = await remnawave.getSubscriptionByUsername(remnawaveUsername)
    return data.response.subscriptionUrl || null
  } catch (error) {
    logWarn('notifications.payment_success_subscription_url_failed', {
      remnawaveUsername,
      message: error instanceof Error ? error.message : 'unknown error',
    })
    return null
  }
}

function isRealEmail(email: string) {
  return !email.endsWith('@pending.invalid') && !email.endsWith('@pending.invalid.local')
}

function formatRubles(kopecks: number) {
  return `${(kopecks / 100).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₽`
}

function buildPaymentSuccessTelegramText(input: {
  title: string
  userName?: string | null
  planName: string
  amount: string
  durationDays: number | null
  trafficLimitGb: number | null
  deviceLimit: number | null
  expireAt: Date | null
  paidAt: Date
  isPaid: boolean
  isRenewal: boolean
}) {
  const greeting = input.userName?.trim()
    ? `${input.userName.trim()}, всё готово.`
    : 'Всё готово.'
  const action = input.isPaid
    ? input.isRenewal
      ? 'Продление подписки успешно применено.'
      : 'Оплата прошла успешно, подписка активна.'
    : 'Пробный тариф активирован, подписка уже доступна.'
  const rawDetails: Array<[string, string | null]> = [
    ['Тариф', input.planName],
    ['Срок', input.durationDays ? formatDurationDays(input.durationDays) : null],
    ['Трафик', input.trafficLimitGb ? `${input.trafficLimitGb} ГБ` : 'без лимита'],
    ['Устройства', input.deviceLimit ? `до ${input.deviceLimit}` : null],
    [input.isPaid ? 'Оплачено' : 'Стоимость', input.isPaid ? input.amount : 'бесплатно'],
    ['Действует до', input.expireAt ? formatDate(input.expireAt) : null],
    ['Дата операции', formatDate(input.paidAt)],
  ]
  const details = rawDetails.flatMap(([label, value]) =>
    value ? [`<b>${escapeTelegram(label)}:</b> ${escapeTelegram(value)}`] : []
  )

  return [
    `<b>${escapeTelegram(input.title)}</b>`,
    '',
    escapeTelegram(greeting),
    escapeTelegram(action),
    '',
    ...details,
    '',
    'Ключи и QR-код доступны в кабинете.',
  ].join('\n')
}

function formatDurationDays(days: number) {
  const mod10 = days % 10
  const mod100 = days % 100
  const suffix = mod10 === 1 && mod100 !== 11
    ? 'день'
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)
      ? 'дня'
      : 'дней'
  return `${days} ${suffix}`
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatBytes(bytes: bigint) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return '0 Б'
  const units = ['Б', 'KB', 'MB', 'GB', 'TB']
  let size = value
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size.toLocaleString('ru-RU', { maximumFractionDigits: unit === 0 ? 0 : 2 })} ${units[unit]}`
}

function escapeTelegram(value: string) {
  return value.replace(/[&<>"]/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return char
    }
  })
}
