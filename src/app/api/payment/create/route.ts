// POST /api/payment/create — создаёт платёж у выбранного провайдера и возвращает URL для редиректа.
// Вызывается из UI страницы /plans.

import { NextResponse } from 'next/server'
import { Prisma, type Payment } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { createPaymentSchema } from '@/lib/auth/validation'
import { createPayment } from '@/lib/yookassa'
import { createPlategaPayment } from '@/lib/platega'
import { isPaymentProviderAvailable } from '@/lib/payment-providers'
import { PromoCodeError, validatePromoCodeForPlan } from '@/lib/promo-codes'
import { getAppUrl } from '@/lib/app-url'
import { rateLimit } from '@/lib/rate-limit'
import { provisionPaymentSubscription } from '@/lib/provisioning'
import { getPlanAudienceContext, isPlanAvailableForUser } from '@/lib/plan-access'
import { reconcileStalePendingPaymentsForUser } from '@/lib/payment-sync'
import { logError } from '@/lib/logger'
import { buildPaymentServiceName } from '@/lib/payment-service-name'
import { paymentErrorDetails, recordPaymentEvent } from '@/lib/payment-events'
import { shouldSavePaymentMethodBestEffort } from '@/lib/auto-renewal'
import {
  buildPlanPurchaseSnapshot,
  calculatePlanPurchase,
  DeviceLimitSelectionError,
} from '@/lib/plan-purchase'
import {
  buildBundledWhitelistAddonSnapshot,
  buildWhitelistAddonSnapshot,
  readBundledWhitelistAddonSnapshot,
  WHITELIST_ADDON_NAME,
} from '@/lib/whitelist-addon'

export const runtime = 'nodejs'

export const POST = withAuth(async (req: Request) => {
  const session = await requireAuth()
  const limited = await rateLimit(req, `payment-create:${session.uid}`, 10, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Слишком много попыток оплаты. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = createPaymentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const {
    planId,
    purchaseType,
    deviceLimit,
    promoCode,
    provider,
    idempotencyKey,
    autoRenewalConsent,
    autoRenewalConsentVersion,
    whitelistAddon,
  } = parsed.data

  if (autoRenewalConsent && provider !== 'YOOKASSA') {
    return NextResponse.json(
      { error: 'Автопродление доступно при оплате банковской картой через ЮKassa' },
      { status: 422 }
    )
  }

  const isWhitelistAddon = purchaseType === 'WHITELIST_ADDON'
  const plan = await prisma.plan.findUnique({ where: { id: planId } })
  if (!plan || (!isWhitelistAddon && !plan.isActive)) {
    return NextResponse.json({ error: 'Тариф не найден' }, { status: 404 })
  }
  const user = await prisma.user.findUnique({ where: { id: session.uid } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (!user.emailVerifiedAt || user.email.endsWith('@pending.invalid')) {
    return NextResponse.json(
      {
        error: 'Подтвердите email перед оплатой',
        code: 'EMAIL_VERIFICATION_REQUIRED',
        actionHref: user.telegramId ? '/telegram-email' : '/dashboard/settings',
      },
      { status: 403 }
    )
  }
  await reconcileStalePendingPaymentsForUser(user.id)
  const activeSubscription = isWhitelistAddon
    ? await prisma.subscription.findFirst({
        where: {
          userId: user.id,
          planId: plan.id,
          status: { in: ['ACTIVE', 'LIMITED'] },
          expireAt: { gt: new Date() },
        },
        orderBy: { expireAt: 'desc' },
      })
    : null

  if (isWhitelistAddon) {
    if (!activeSubscription) {
      return NextResponse.json({ error: 'Для дополнения нужна действующая подписка этого тарифа' }, { status: 409 })
    }
    if (!plan.whitelistAddonEnabled || plan.whitelistAddonPriceKopecks <= 0) {
      return NextResponse.json({ error: 'Дополнение для этого тарифа недоступно' }, { status: 404 })
    }
    if (plan.whitelistAddonInternalSquads.length === 0) {
      return NextResponse.json({ error: 'Группы дополнения не настроены' }, { status: 503 })
    }
    if (activeSubscription.whitelistAddonActive) {
      return NextResponse.json({ error: 'Дополнение уже подключено' }, { status: 409 })
    }
    const pendingAddon = await prisma.payment.findFirst({
      where: {
        userId: user.id,
        subscriptionId: activeSubscription.id,
        purchaseType: 'WHITELIST_ADDON',
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    })
    if (pendingAddon && pendingAddon.checkoutKey !== idempotencyKey) {
      return NextResponse.json({
        error: 'Оплата дополнения уже ожидает завершения',
        code: 'ADDON_PAYMENT_PENDING',
        confirmationUrl: pendingAddon.confirmationUrl,
      }, { status: 409 })
    }
  }

  const includesBundledWhitelistAddon = !isWhitelistAddon && whitelistAddon
  if (includesBundledWhitelistAddon) {
    if (plan.isPromo) {
      return NextResponse.json({ error: 'Дополнение недоступно для ознакомительного тарифа' }, { status: 422 })
    }
    if (
      !plan.whitelistAddonEnabled
      || plan.whitelistAddonPriceKopecks <= 0
      || plan.whitelistAddonInternalSquads.length === 0
    ) {
      return NextResponse.json({ error: 'Дополнение для этого тарифа не настроено' }, { status: 422 })
    }
  }

  const audienceContext = await getPlanAudienceContext(user.id)
  if (!isWhitelistAddon && (!audienceContext || !isPlanAvailableForUser(plan, audienceContext, { allowLink: plan.availability === 'LINK' }))) {
    return NextResponse.json({ error: 'Этот тариф недоступен для вашего аккаунта' }, { status: 403 })
  }
  if (!isWhitelistAddon && plan.priceKopecks <= 0 && !plan.isPromo) {
    return NextResponse.json(
      { error: 'Бесплатный тариф должен быть настроен как ознакомительный.' },
      { status: 400 }
    )
  }
  if (!isWhitelistAddon && !plan.isPromo && deviceLimit == null) {
    return NextResponse.json(
      { error: 'Обновите страницу тарифа и выберите количество устройств', code: 'DEVICE_LIMIT_REQUIRED' },
      { status: 400 }
    )
  }

  let pricing: ReturnType<typeof calculatePlanPurchase>
  if (isWhitelistAddon) {
    const selectedDeviceLimit = activeSubscription?.deviceLimit ?? plan.deviceLimit
    pricing = {
      baseDeviceLimit: selectedDeviceLimit,
      maxDeviceLimit: selectedDeviceLimit,
      selectedDeviceLimit,
      extraDeviceCount: 0,
      extraDeviceAmountKopecks: 0,
      originalAmountKopecks: plan.whitelistAddonPriceKopecks,
    }
  } else {
    try {
      pricing = calculatePlanPurchase(plan, plan.isPromo ? plan.deviceLimit : deviceLimit)
    } catch (error) {
      if (error instanceof DeviceLimitSelectionError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: 400 })
      }
      throw error
    }
  }
  const planSnapshot = isWhitelistAddon ? null : buildPlanPurchaseSnapshot(plan, pricing)
  const addonSnapshot = isWhitelistAddon && activeSubscription
    ? buildWhitelistAddonSnapshot({
        planId: plan.id,
        subscriptionId: activeSubscription.id,
        subscriptionExpireAt: activeSubscription.expireAt,
        priceKopecks: plan.whitelistAddonPriceKopecks,
        internalSquads: plan.whitelistAddonInternalSquads,
      })
    : includesBundledWhitelistAddon
      ? buildBundledWhitelistAddonSnapshot({
          planId: plan.id,
          priceKopecks: plan.whitelistAddonPriceKopecks,
          internalSquads: plan.whitelistAddonInternalSquads,
        })
      : null
  const bundledAddonPriceKopecks = includesBundledWhitelistAddon
    ? plan.whitelistAddonPriceKopecks
    : 0

  if (!isWhitelistAddon && plan.isPromo) {
    if (promoCode) {
      return NextResponse.json({ error: 'Промокод не нужен для этого тарифа' }, { status: 400 })
    }

    const hasAnySubscription = await prisma.subscription.count({
      where: { userId: user.id },
    })

    if (!user.telegramId) {
      return NextResponse.json(
        { error: 'Ознакомительный тариф доступен после привязки Telegram' },
        { status: 403 }
      )
    }

    if (!user.remnashopSyncedAt) {
      return NextResponse.json(
        { error: 'Сначала проверьте старую подписку через Telegram' },
        { status: 403 }
      )
    }

    if (
      user.remnashopUserId ||
      user.remnawaveId ||
      user.remnawaveUuid ||
      user.remnawaveUsername ||
      hasAnySubscription > 0
    ) {
      return NextResponse.json({ error: 'Ознакомительный тариф доступен только новым пользователям' }, { status: 409 })
    }

    const existingTrial = await prisma.trialPlanRedemption.findUnique({
      where: { userId_planId: { userId: user.id, planId: plan.id } },
      include: { payment: true },
    })

    if (existingTrial?.payment.subscriptionProvisionedAt) {
      return NextResponse.json({ error: 'Вы уже использовали этот ознакомительный тариф' }, { status: 409 })
    }

    if (existingTrial?.payment.status === 'SUCCEEDED') {
      return provisionPromoPayment(existingTrial.payment, user, plan)
    }

    let promoPayment: Payment
    try {
      promoPayment = await prisma.$transaction(
        async (tx) => {
          const payment = await tx.payment.create({
            data: {
              userId: user.id,
              planId: plan.id,
              amountKopecks: 0,
              originalAmountKopecks: plan.priceKopecks,
              discountKopecks: plan.priceKopecks,
              deviceLimit: pricing.selectedDeviceLimit,
              planSnapshot: planSnapshot as unknown as Prisma.InputJsonValue,
              provider: 'LOCAL',
              providerStatus: 'succeeded',
              checkoutKey: idempotencyKey,
              status: 'SUCCEEDED',
              paidAt: new Date(),
            },
          })

          await tx.trialPlanRedemption.create({
            data: {
              userId: user.id,
              planId: plan.id,
              paymentId: payment.id,
            },
          })

          return payment
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const claimedTrial = await prisma.trialPlanRedemption.findUnique({
          where: { userId_planId: { userId: user.id, planId: plan.id } },
          include: { payment: true },
        })
        if (claimedTrial) {
          return provisionPromoPayment(claimedTrial.payment, user, plan)
        }
        return NextResponse.json({ error: 'Вы уже использовали этот ознакомительный тариф' }, { status: 409 })
      }
      throw e
    }

    await recordPaymentEvent({
      paymentId: promoPayment.id,
      stage: 'ORDER',
      status: 'SUCCESS',
      source: 'payment-create',
      message: 'Бесплатный ознакомительный заказ создан',
      details: { provider: 'LOCAL', amountKopecks: 0, planId: plan.id },
      dedupeKey: 'order-created',
    })

    return provisionPromoPayment(promoPayment, user, plan)
  }

  const existingCheckout = await prisma.payment.findUnique({
    where: {
      userId_checkoutKey: {
        userId: user.id,
        checkoutKey: idempotencyKey,
      },
    },
  })
  if (existingCheckout) {
    return existingCheckoutResponse(existingCheckout, {
      planId,
      purchaseType,
      deviceLimit: pricing.selectedDeviceLimit,
      promoCode,
      provider,
      autoRenewalConsent,
      whitelistAddon: includesBundledWhitelistAddon,
    })
  }

  if (!(await isPaymentProviderAvailable(provider))) {
    return NextResponse.json(
      { error: paymentProviderUnavailableMessage(provider) },
      { status: 503 }
    )
  }

  let localPayment: Payment
  let appliedPromo: Awaited<ReturnType<typeof validatePromoCodeForPlan>> | null = null
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const discount = !isWhitelistAddon && promoCode
          ? await validatePromoCodeForPlan({
              prisma: tx,
              code: promoCode,
              userId: user.id,
              plan,
              originalAmountKopecks: pricing.originalAmountKopecks,
            })
          : null

        const discountedPlanAmountKopecks = discount?.finalAmountKopecks ?? pricing.originalAmountKopecks
        const payment = await tx.payment.create({
          data: {
            userId: user.id,
            planId: plan.id,
            subscriptionId: activeSubscription?.id,
            purchaseType,
            promoCodeId: discount?.promoCode.id,
            amountKopecks: discountedPlanAmountKopecks + bundledAddonPriceKopecks,
            originalAmountKopecks: pricing.originalAmountKopecks + bundledAddonPriceKopecks,
            discountPercent: discount?.discountPercent,
            discountKopecks: discount?.discountKopecks ?? 0,
            deviceLimit: pricing.selectedDeviceLimit,
            ...(planSnapshot
              ? { planSnapshot: planSnapshot as unknown as Prisma.InputJsonValue }
              : {}),
            ...(addonSnapshot
              ? { addonSnapshot: addonSnapshot as unknown as Prisma.InputJsonValue }
              : {}),
            promoCodeSnapshot: discount
              ? {
                  code: discount.normalizedCode,
                  purchaseScope: discount.promoCode.purchaseScope,
                  discountPercent: discount.discountPercent,
                  discountKopecks: discount.discountKopecks,
                  originalAmountKopecks: discount.originalAmountKopecks,
                  finalAmountKopecks: discount.finalAmountKopecks,
                }
              : undefined,
            provider,
            providerStatus: 'pending',
            checkoutKey: idempotencyKey,
            autoRenewalConsentAcceptedAt: autoRenewalConsent ? new Date() : null,
            autoRenewalConsentVersion: autoRenewalConsent ? autoRenewalConsentVersion : null,
            status: 'PENDING',
          },
        })

        if (discount) {
          await tx.promoCodeRedemption.create({
            data: {
              promoCodeId: discount.promoCode.id,
              userId: user.id,
              paymentId: payment.id,
              codeSnapshot: discount.normalizedCode,
              discountPercent: discount.discountPercent,
              discountKopecks: discount.discountKopecks,
              originalAmountKopecks: discount.originalAmountKopecks,
              finalAmountKopecks: discount.finalAmountKopecks,
            },
          })
        }

        return { payment, discount }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
    localPayment = result.payment
    appliedPromo = result.discount
  } catch (e) {
    const duplicateCheckout = await findDuplicateCheckout(user.id, idempotencyKey)
    if (duplicateCheckout) {
      return existingCheckoutResponse(duplicateCheckout, {
        planId,
        purchaseType,
        deviceLimit: pricing.selectedDeviceLimit,
        promoCode,
        provider,
        autoRenewalConsent,
        whitelistAddon: includesBundledWhitelistAddon,
      })
    }
    if (e instanceof PromoCodeError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status })
    }
    throw e
  }

  await recordPaymentEvent({
    paymentId: localPayment.id,
    stage: 'ORDER',
    status: 'SUCCESS',
    source: 'payment-create',
    message: 'Заказ создан и ожидает перехода к провайдеру',
    details: {
      provider,
      planId: plan.id,
      purchaseType,
      deviceLimit: pricing.selectedDeviceLimit,
      amountKopecks: localPayment.amountKopecks,
      discountKopecks: localPayment.discountKopecks,
    },
    dedupeKey: 'order-created',
  })

  const amountRub = localPayment.amountKopecks / 100
  const baseUrl = getAppUrl()
  const returnUrl = `${baseUrl}/dashboard/billing?paid=1&payment=${localPayment.id}`
  const description = isWhitelistAddon
    ? WHITELIST_ADDON_NAME
    : `${buildPaymentServiceName(plan.durationDays)}${includesBundledWhitelistAddon ? ' + белые списки' : ''}`

  if (provider === 'PAYANYWAY') {
    try {
      const confirmationUrl = `${baseUrl}/api/payment/payanyway/redirect?payment=${encodeURIComponent(localPayment.id)}`
      await prisma.payment.update({
        where: { id: localPayment.id },
        data: { confirmationUrl },
      })
      await recordPaymentEvent({
        paymentId: localPayment.id,
        stage: 'PROVIDER',
        status: 'SUCCESS',
        source: 'payment-create',
        message: 'Ссылка PayAnyWay подготовлена',
        details: { provider },
        dedupeKey: 'provider-checkout-created',
      })
      return NextResponse.json({
        confirmationUrl,
        paymentId: localPayment.id,
        localPaymentId: localPayment.id,
        provider,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'PayAnyWay create payment failed'
      await cancelFailedLocalPayment(localPayment.id, message)
      logError('payment.create.payanyway_failed', e, { localPaymentId: localPayment.id })
      return NextResponse.json(
        {
          error: 'PayAnyWay не удалось создать ссылку на оплату. Проверьте номер счёта и код проверки целостности.',
          code: 'PAYMENT_PROVIDER_CREATE_FAILED',
          details: process.env.NODE_ENV === 'development' ? message : undefined,
        },
        { status: 502 }
      )
    }
  }

  if (provider === 'PLATEGA') {
    try {
      const payment = await createPlategaPayment({
        amountKopecks: localPayment.amountKopecks,
        description,
        returnUrl,
        failedUrl: returnUrl,
        payload: localPayment.id,
        metadata: {
          userId: user.id,
          userName: user.email,
        },
      })
      await prisma.payment.update({
        where: { id: localPayment.id },
        data: {
          externalPaymentId: payment.transactionId,
          providerStatus: payment.status,
          confirmationUrl: payment.url,
        },
      })
      await recordPaymentEvent({
        paymentId: localPayment.id,
        stage: 'PROVIDER',
        status: 'SUCCESS',
        source: 'payment-create',
        message: 'Platega создала платёж и ссылку на оплату',
        details: { provider, providerStatus: payment.status, externalPaymentId: payment.transactionId },
        dedupeKey: 'provider-checkout-created',
      })
      return NextResponse.json({
        confirmationUrl: payment.url,
        paymentId: payment.transactionId,
        localPaymentId: localPayment.id,
        provider,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Platega create payment failed'
      await cancelFailedLocalPayment(localPayment.id, message)
      logError('payment.create.platega_failed', e, { localPaymentId: localPayment.id })
      return NextResponse.json(
        {
          error: 'Platega не удалось создать ссылку на оплату. Проверьте Merchant ID и API secret.',
          code: 'PAYMENT_PROVIDER_CREATE_FAILED',
          details: process.env.NODE_ENV === 'development' ? message : undefined,
        },
        { status: 502 }
      )
    }
  }

  let payment
  try {
    const savePaymentMethod = !isWhitelistAddon && (
      autoRenewalConsent || await shouldSavePaymentMethodBestEffort(user.id, plan.id)
    )
    payment = await createPayment({
      amount: amountRub,
      description,
      returnUrl,
      savePaymentMethod,
      paymentMethodType: savePaymentMethod ? 'bank_card' : undefined,
      metadata: {
        userId: user.id,
        planId: plan.id,
        purchaseType,
        localPaymentId: localPayment.id,
        ...(autoRenewalConsent ? { autoRenewalConsentVersion: autoRenewalConsentVersion! } : {}),
        ...(includesBundledWhitelistAddon ? { whitelistAddon: 'true' } : {}),
        deviceLimit: String(pricing.selectedDeviceLimit),
        ...(appliedPromo
          ? {
              promoCode: appliedPromo.normalizedCode,
              discountKopecks: String(appliedPromo.discountKopecks),
            }
          : {}),
      },
      idempotenceKey: localPayment.id,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'YooKassa createPayment failed'
    await cancelFailedLocalPayment(localPayment.id, message)
    logError('payment.create.yookassa_failed', e, { localPaymentId: localPayment.id })
    return NextResponse.json(
      {
        error:
          'ЮKassa не приняла shopId/secretKey. Проверьте, что в .env указаны API-ключи магазина, а не OAuth/токен другого типа.',
        code: 'PAYMENT_PROVIDER_CREATE_FAILED',
        details: process.env.NODE_ENV === 'development' ? message : undefined,
      },
      { status: 502 }
    )
  }

  await prisma.payment.update({
    where: { id: localPayment.id },
    data: {
      yookassaId: payment.id,
      yookassaStatus: payment.status,
      externalPaymentId: payment.id,
      providerStatus: payment.status,
      confirmationUrl: payment.confirmation?.confirmation_url ?? null,
    },
  })
  await recordPaymentEvent({
    paymentId: localPayment.id,
    stage: 'PROVIDER',
    status: 'SUCCESS',
    source: 'payment-create',
    message: 'ЮKassa создала платёж и ссылку на оплату',
    details: { provider, providerStatus: payment.status, externalPaymentId: payment.id },
    dedupeKey: 'provider-checkout-created',
  })

  return NextResponse.json({
    confirmationUrl: payment.confirmation?.confirmation_url,
    paymentId: payment.id,
    localPaymentId: localPayment.id,
    provider,
  })
})

async function findDuplicateCheckout(userId: string, checkoutKey: string) {
  return prisma.payment.findUnique({
    where: {
      userId_checkoutKey: {
        userId,
        checkoutKey,
      },
    },
  })
}

function existingCheckoutResponse(
  payment: Payment,
  input: {
    planId: string
    purchaseType: 'SUBSCRIPTION' | 'WHITELIST_ADDON'
    deviceLimit: number
    promoCode?: string
    provider: 'YOOKASSA' | 'PAYANYWAY' | 'PLATEGA'
    autoRenewalConsent: boolean
    whitelistAddon: boolean
  }
) {
  const requestedPromoCode = input.promoCode?.trim().toUpperCase() ?? null
  const storedPromoCode = promoCodeFromSnapshot(payment.promoCodeSnapshot)
  if (
    payment.planId !== input.planId
    || payment.purchaseType !== input.purchaseType
    || payment.deviceLimit !== input.deviceLimit
    || payment.provider !== input.provider
    || storedPromoCode !== requestedPromoCode
    || Boolean(payment.autoRenewalConsentAcceptedAt) !== input.autoRenewalConsent
    || Boolean(readBundledWhitelistAddonSnapshot(payment.addonSnapshot)) !== input.whitelistAddon
  ) {
    return NextResponse.json({
      error: 'Ключ оплаты уже использован для другого заказа',
      code: 'PAYMENT_IDEMPOTENCY_CONFLICT',
    }, { status: 409 })
  }

  if (payment.status === 'CANCELED') {
    return NextResponse.json({
      error: 'Предыдущая попытка оплаты завершилась ошибкой. Повторите ещё раз.',
      code: 'PAYMENT_ATTEMPT_CANCELED',
    }, { status: 409 })
  }

  if (payment.status === 'SUCCEEDED') {
    return NextResponse.json({
      redirectUrl: `/dashboard/billing?paid=1&payment=${payment.id}`,
      localPaymentId: payment.id,
      provider: payment.provider,
      idempotent: true,
    })
  }

  if (!payment.confirmationUrl) {
    return NextResponse.json({
      error: 'Ссылка на оплату ещё создаётся. Повторите через несколько секунд.',
      code: 'PAYMENT_CREATION_IN_PROGRESS',
    }, {
      status: 409,
      headers: { 'Retry-After': '2' },
    })
  }

  return NextResponse.json({
    confirmationUrl: payment.confirmationUrl,
    paymentId: payment.externalPaymentId ?? payment.yookassaId ?? payment.id,
    localPaymentId: payment.id,
    provider: payment.provider,
    idempotent: true,
  })
}

function promoCodeFromSnapshot(snapshot: Prisma.JsonValue | null) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null
  const code = snapshot.code
  return typeof code === 'string' ? code.trim().toUpperCase() : null
}

function paymentProviderUnavailableMessage(provider: 'YOOKASSA' | 'PAYANYWAY' | 'PLATEGA') {
  if (provider === 'PAYANYWAY') return 'PayAnyWay пока не настроен'
  if (provider === 'PLATEGA') return 'Platega пока не настроена'
  return 'ЮKassa пока не настроена'
}

async function cancelFailedLocalPayment(paymentId: string, message: string) {
  await prisma.$transaction([
    prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'CANCELED',
        providerStatus: 'failed',
        provisioningError: message.slice(0, 1000),
      },
    }),
    prisma.promoCodeRedemption.updateMany({
      where: { paymentId },
      data: { status: 'CANCELED' },
    }),
  ])
  await recordPaymentEvent({
    paymentId,
    stage: 'PROVIDER',
    status: 'ERROR',
    source: 'payment-create',
    message: 'Провайдер не создал платёж',
    details: paymentErrorDetails(message),
    dedupeKey: 'provider-checkout-failed',
  })
}

async function provisionPromoPayment(
  payment: Payment,
  user: { id: string; email: string },
  plan: {
    id: string
    name: string
    durationDays: number
    trafficLimitGb: number | null
    deviceLimit: number
    activeInternalSquads: string[]
  }
) {
  await recordPaymentEvent({
    paymentId: payment.id,
    stage: 'ORDER',
    status: 'SUCCESS',
    source: 'payment-create',
    message: 'Ознакомительный заказ принят в обработку',
    details: { provider: payment.provider, amountKopecks: payment.amountKopecks, planId: plan.id },
    dedupeKey: 'order-created',
  })
  try {
    await provisionPaymentSubscription({
      userId: user.id,
      email: user.email,
      paymentId: payment.id,
      plan: {
        id: plan.id,
        name: plan.name,
        durationDays: plan.durationDays,
        trafficLimitGb: plan.trafficLimitGb,
        deviceLimit: plan.deviceLimit,
        activeInternalSquads: plan.activeInternalSquads,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'subscription provisioning failed'
    await prisma.payment.update({
      where: { id: payment.id },
      data: { provisioningError: message.slice(0, 1000) },
    })
    logError('payment.create.promo_provisioning_failed', e, { paymentId: payment.id })
    return NextResponse.json({
      redirectUrl: `/dashboard/billing?paid=1&payment=${payment.id}`,
      localPaymentId: payment.id,
      provisioned: false,
    }, { status: 202 })
  }

  return NextResponse.json({
    redirectUrl: `/dashboard/subscription?activated=1`,
    localPaymentId: payment.id,
    provisioned: true,
  })
}
