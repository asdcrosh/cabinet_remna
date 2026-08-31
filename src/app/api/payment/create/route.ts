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
import { getFreshPendingPaymentCutoff, reconcileStalePendingPaymentsForUser } from '@/lib/payment-sync'
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
  WHITELIST_ADDON_RECEIPT_NAME,
} from '@/lib/whitelist-addon'
import {
  calculateDeviceLimitAddon,
  DEVICE_LIMIT_ADDON_RECEIPT_NAME,
  type DeviceLimitAddonSnapshot,
} from '@/lib/device-limit-addon'
import { hasRemnawaveUserReference, remnawave, remnawaveUserReference } from '@/lib/remnawave'
import {
  calculateUserDiscount,
  preferUserDiscount,
  restoreNextPurchaseDiscountBestEffort,
  type CalculatedUserDiscount,
} from '@/lib/user-discounts'
import { hasWhitelistAddonEntitlement } from '@/lib/whitelist-addon-policy'
import { upsertLocalSubscriptionFromRemnawave } from '@/lib/remnawave-local-sync'

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
  const isDeviceLimitAddon = purchaseType === 'DEVICE_LIMIT_ADDON'
  const isSubscriptionPurchase = purchaseType === 'SUBSCRIPTION'
  const plan = await prisma.plan.findUnique({ where: { id: planId } })
  if (!plan || (isSubscriptionPurchase && !plan.isActive)) {
    return NextResponse.json({ error: 'Тариф не найден' }, { status: 404 })
  }
  if (autoRenewalConsent && plan.unlimitedDuration) {
    return NextResponse.json(
      { error: 'Бессрочный тариф не требует автопродления' },
      { status: 422 }
    )
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
  const now = new Date()
  let activeSubscription = isWhitelistAddon
    ? await prisma.subscription.findFirst({
        where: {
          userId: user.id,
          planId: plan.id,
          status: { in: ['ACTIVE', 'LIMITED'] },
          expireAt: { gt: now },
        },
        orderBy: { expireAt: 'desc' },
      })
    : null
  let whitelistSubscriptionRefreshFailed = false
  if (isWhitelistAddon && !activeSubscription && hasRemnawaveUserReference(user)) {
    try {
      const remnawaveUser = (await remnawave.getUser(remnawaveUserReference(user))).response
      await upsertLocalSubscriptionFromRemnawave({
        localUserId: user.id,
        remnawaveUser,
      })
      activeSubscription = await prisma.subscription.findFirst({
        where: {
          userId: user.id,
          planId: plan.id,
          status: { in: ['ACTIVE', 'LIMITED'] },
          expireAt: { gt: now },
        },
        orderBy: { expireAt: 'desc' },
      })
    } catch (error) {
      whitelistSubscriptionRefreshFailed = true
      logError('payment.whitelist_addon.subscription_refresh_failed', error, { userId: user.id })
    }
  }
  const currentSubscription = !isWhitelistAddon
    ? await prisma.subscription.findFirst({
        where: {
          userId: user.id,
          status: { in: ['ACTIVE', 'LIMITED'] },
          expireAt: { gt: now },
        },
        orderBy: { expireAt: 'desc' },
        include: { plan: { select: { id: true, name: true } } },
      })
    : null

  if (isDeviceLimitAddon) {
    if (
      !plan.deviceAddonEnabled
      || plan.unlimitedDevices
      || plan.maxDeviceLimit <= plan.deviceLimit
      || plan.extraDevicePriceKopecks <= 0
    ) {
      return NextResponse.json(
        { error: 'Дополнительные устройства для этого тарифа недоступны' },
        { status: 404 }
      )
    }
    if (!currentSubscription || currentSubscription.planId !== plan.id) {
      return NextResponse.json({ error: 'Действующая подписка этого тарифа не найдена' }, { status: 409 })
    }
    if (deviceLimit == null) {
      return NextResponse.json({ error: 'Выберите новый лимит устройств' }, { status: 400 })
    }
    const pendingAddon = await prisma.payment.findFirst({
      where: {
        userId: user.id,
        subscriptionId: currentSubscription.id,
        purchaseType: 'DEVICE_LIMIT_ADDON',
        status: 'PENDING',
        createdAt: { gt: getFreshPendingPaymentCutoff() },
      },
      orderBy: { createdAt: 'desc' },
    })
    if (pendingAddon && pendingAddon.checkoutKey !== idempotencyKey) {
      return pendingCheckoutResponse(pendingAddon)
    }
  }

  if (isWhitelistAddon) {
    if (!activeSubscription) {
      if (whitelistSubscriptionRefreshFailed) {
        return NextResponse.json(
          { error: 'Не удалось проверить действующую подписку. Попробуйте ещё раз.' },
          { status: 503 }
        )
      }
      return NextResponse.json({ error: 'Для дополнения нужна действующая подписка этого тарифа' }, { status: 409 })
    }
    if (!plan.whitelistAddonEnabled || plan.whitelistAddonPriceKopecks <= 0) {
      return NextResponse.json({ error: 'Дополнение для этого тарифа недоступно' }, { status: 404 })
    }
    if (plan.whitelistAddonInternalSquads.length === 0) {
      return NextResponse.json({ error: 'Группы дополнения не настроены' }, { status: 503 })
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
      return pendingCheckoutResponse(pendingAddon)
    }
  }

  const includesBundledWhitelistAddon = isSubscriptionPurchase && whitelistAddon
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
    const whitelistAddonEntitlement = currentSubscription
      && hasWhitelistAddonEntitlement(currentSubscription, now)
      ? currentSubscription
      : await prisma.subscription.findFirst({
          where: {
            userId: user.id,
            OR: [
              { whitelistAddonActive: true },
              { whitelistAddonRemainingSeconds: { gt: 0n } },
            ],
          },
          orderBy: { updatedAt: 'desc' },
        })
    if (whitelistAddonEntitlement && hasWhitelistAddonEntitlement(whitelistAddonEntitlement, now)) {
      return NextResponse.json({
        error: 'БС уже подключены или стоят на паузе. После покупки тарифа они продолжат работать автоматически.',
        code: 'WHITELIST_ADDON_ALREADY_ACTIVE',
      }, { status: 409 })
    }
  }

  const audienceContext = await getPlanAudienceContext(user.id)
  if (isSubscriptionPurchase && (!audienceContext || !isPlanAvailableForUser(plan, audienceContext, { allowLink: plan.availability === 'LINK' }))) {
    return NextResponse.json({ error: 'Этот тариф недоступен для вашего аккаунта' }, { status: 403 })
  }
  if (isSubscriptionPurchase && plan.priceKopecks <= 0 && !plan.isPromo) {
    return NextResponse.json(
      { error: 'Бесплатный тариф должен быть настроен как ознакомительный.' },
      { status: 400 }
    )
  }
  if (isSubscriptionPurchase && !plan.isPromo && !plan.unlimitedDevices && deviceLimit == null) {
    return NextResponse.json(
      { error: 'Обновите страницу тарифа и выберите количество устройств', code: 'DEVICE_LIMIT_REQUIRED' },
      { status: 400 }
    )
  }
  if (isSubscriptionPurchase && !plan.isPromo && !plan.unlimitedDevices && !plan.deviceAddonEnabled && deviceLimit != null) {
    const allowedDeviceLimit = currentSubscription?.planId === plan.id
      ? currentSubscription.deviceLimit ?? plan.deviceLimit
      : plan.deviceLimit
    if (deviceLimit > allowedDeviceLimit) {
      return NextResponse.json(
        { error: 'Дополнительные устройства для этого тарифа недоступны' },
        { status: 422 }
      )
    }
  }
  if (isSubscriptionPurchase && plan.unlimitedDevices && deviceLimit != null && deviceLimit !== plan.deviceLimit) {
    return NextResponse.json(
      { error: 'В тарифе уже включён безлимит устройств' },
      { status: 422 }
    )
  }

  let deviceAddonExpireAt: Date | null = null
  if (isDeviceLimitAddon) {
    if (!hasRemnawaveUserReference(user)) {
      return NextResponse.json({ error: 'Профиль Remnawave не найден' }, { status: 409 })
    }
    try {
      const remoteUser = (await remnawave.getUser(remnawaveUserReference(user))).response
      deviceAddonExpireAt = new Date(remoteUser.expireAt)
      if (!Number.isFinite(deviceAddonExpireAt.getTime())) throw new Error('invalid Remnawave expiry')
    } catch {
      return NextResponse.json(
        { error: 'Не удалось проверить фактический срок подписки. Попробуйте ещё раз.' },
        { status: 503 }
      )
    }
  }

  let pricing: ReturnType<typeof calculatePlanPurchase>
  let deviceLimitAddonSnapshot: DeviceLimitAddonSnapshot | null = null
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
  } else if (isDeviceLimitAddon && currentSubscription && deviceLimit != null && deviceAddonExpireAt) {
    try {
      const currentLimit = currentSubscription.deviceLimit ?? plan.deviceLimit
      const addon = calculateDeviceLimitAddon({
        currentLimit,
        targetLimit: deviceLimit,
        maxLimit: plan.maxDeviceLimit,
        durationDays: plan.durationDays,
        extraDevicePriceKopecks: plan.extraDevicePriceKopecks,
        expireAt: deviceAddonExpireAt,
        now,
      })
      pricing = {
        baseDeviceLimit: currentLimit,
        maxDeviceLimit: plan.maxDeviceLimit,
        selectedDeviceLimit: deviceLimit,
        extraDeviceCount: addon.additionalDevices,
        extraDeviceAmountKopecks: addon.priceKopecks,
        originalAmountKopecks: addon.priceKopecks,
      }
      deviceLimitAddonSnapshot = {
        type: 'DEVICE_LIMIT_ADDON',
        subscriptionId: currentSubscription.id,
        fromLimit: currentLimit,
        toLimit: deviceLimit,
        additionalDevices: addon.additionalDevices,
        remainingDays: addon.remainingDays,
        priceKopecks: addon.priceKopecks,
      }
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Некорректный лимит устройств' }, { status: 400 })
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
  if (!promoCode) {
    const pendingPayment = await prisma.payment.findFirst({
      where: {
        userId: user.id,
        planId: plan.id,
        purchaseType,
        provider,
        status: 'PENDING',
        createdAt: { gt: getFreshPendingPaymentCutoff() },
        deviceLimit: pricing.selectedDeviceLimit,
        promoCodeId: null,
      },
      orderBy: { createdAt: 'desc' },
    })
    if (
      pendingPayment
      && Boolean(readBundledWhitelistAddonSnapshot(pendingPayment.addonSnapshot)) === includesBundledWhitelistAddon
      && Boolean(pendingPayment.autoRenewalConsentAcceptedAt) === autoRenewalConsent
    ) {
      return pendingCheckoutResponse(pendingPayment)
    }
  }
  const planSnapshot = isSubscriptionPurchase
    ? buildPlanPurchaseSnapshot(plan, pricing, currentSubscription?.plan ?? null)
    : null
  const addonSnapshot = isWhitelistAddon && activeSubscription
    ? buildWhitelistAddonSnapshot({
        planId: plan.id,
        subscriptionId: activeSubscription.id,
        subscriptionExpireAt: activeSubscription.expireAt,
        priceKopecks: plan.whitelistAddonPriceKopecks,
        internalSquads: plan.whitelistAddonInternalSquads,
      })
    : deviceLimitAddonSnapshot
      ? deviceLimitAddonSnapshot
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

  if (isSubscriptionPurchase && plan.isPromo) {
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
  let appliedUserDiscount: CalculatedUserDiscount | null = null
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const validatedPromo = isSubscriptionPurchase && promoCode
          ? await validatePromoCodeForPlan({
              prisma: tx,
              code: promoCode,
              userId: user.id,
              plan,
              originalAmountKopecks: pricing.originalAmountKopecks,
            })
          : null
        const discountProfile = isSubscriptionPurchase
          ? await tx.user.findUnique({
              where: { id: user.id },
              select: {
                personalDiscountPercent: true,
                nextPurchaseDiscountPercent: true,
              },
            })
          : null
        const automaticDiscount = discountProfile
          ? calculateUserDiscount(plan.priceKopecks, discountProfile)
          : null
        const selectedDiscount = preferUserDiscount(automaticDiscount, validatedPromo)
        const discount = selectedDiscount.promoDiscount
        const userDiscount = selectedDiscount.userDiscount

        if (userDiscount?.source === 'NEXT_PURCHASE') {
          const consumed = await tx.user.updateMany({
            where: {
              id: user.id,
              nextPurchaseDiscountPercent: userDiscount.discountPercent,
            },
            data: { nextPurchaseDiscountPercent: 0 },
          })
          if (consumed.count !== 1) throw new NextPurchaseDiscountConflictError()
        }

        const selectedPricing = discount ?? userDiscount
        const discountedPlanAmountKopecks = discount
          ? discount.finalAmountKopecks
          : userDiscount
            ? pricing.originalAmountKopecks - userDiscount.discountKopecks
            : pricing.originalAmountKopecks
        const payment = await tx.payment.create({
          data: {
            userId: user.id,
            planId: plan.id,
            subscriptionId: isWhitelistAddon ? activeSubscription?.id : isDeviceLimitAddon ? currentSubscription?.id : undefined,
            purchaseType,
            promoCodeId: discount?.promoCode.id,
            amountKopecks: discountedPlanAmountKopecks + bundledAddonPriceKopecks,
            originalAmountKopecks: pricing.originalAmountKopecks + bundledAddonPriceKopecks,
            discountPercent: selectedPricing?.discountPercent,
            discountKopecks: selectedPricing?.discountKopecks ?? 0,
            userDiscountType: userDiscount?.source,
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
              : validatedPromo
                ? {
                    code: validatedPromo.normalizedCode,
                    notApplied: true,
                    discountPercent: validatedPromo.discountPercent,
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

        return { payment, discount, userDiscount }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
    localPayment = result.payment
    appliedPromo = result.discount
    appliedUserDiscount = result.userDiscount
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
    if (e instanceof NextPurchaseDiscountConflictError) {
      return NextResponse.json({ error: e.message, code: 'DISCOUNT_STATE_CHANGED' }, { status: 409 })
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
      userDiscountType: appliedUserDiscount?.source ?? null,
    },
    dedupeKey: 'order-created',
  })

  const amountRub = localPayment.amountKopecks / 100
  const baseUrl = getAppUrl()
  const returnUrl = `${baseUrl}/dashboard/billing?paid=1&payment=${localPayment.id}`
  const description = isWhitelistAddon
    ? WHITELIST_ADDON_RECEIPT_NAME
    : isDeviceLimitAddon
      ? DEVICE_LIMIT_ADDON_RECEIPT_NAME
      : `${buildPaymentServiceName(plan.durationDays, plan.unlimitedDuration)}${includesBundledWhitelistAddon ? ` + ${WHITELIST_ADDON_RECEIPT_NAME}` : ''}`

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

  const savePaymentMethod = isSubscriptionPurchase && (
    autoRenewalConsent || await shouldSavePaymentMethodBestEffort(user.id, plan.id)
  )
  let payment
  try {
    payment = await createPayment({
      amount: amountRub,
      description,
      returnUrl,
      savePaymentMethod,
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
    const failure = yookassaCreateFailure(e, savePaymentMethod)
    await cancelFailedLocalPayment(localPayment.id, message)
    logError('payment.create.yookassa_failed', e, { localPaymentId: localPayment.id })
    return NextResponse.json(
      {
        error: failure.error,
        code: failure.code,
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
    purchaseType: 'SUBSCRIPTION' | 'WHITELIST_ADDON' | 'DEVICE_LIMIT_ADDON'
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

function pendingCheckoutResponse(payment: Payment) {
  if (!payment.confirmationUrl) {
    return NextResponse.json({
      error: 'Ссылка на оплату ещё создаётся. Повторите через несколько секунд.',
      code: 'PAYMENT_CREATION_IN_PROGRESS',
    }, { status: 409, headers: { 'Retry-After': '3' } })
  }
  return NextResponse.json({
    confirmationUrl: payment.confirmationUrl,
    paymentId: payment.externalPaymentId ?? payment.yookassaId ?? payment.id,
    localPaymentId: payment.id,
    provider: payment.provider,
    resumed: true,
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

function yookassaCreateFailure(error: unknown, savePaymentMethod: boolean) {
  const providerError = error && typeof error === 'object'
    ? error as {
        status?: unknown
        providerCode?: unknown
        providerDescription?: unknown
        providerParameter?: unknown
      }
    : null
  const status = typeof providerError?.status === 'number' ? providerError.status : null
  const code = typeof providerError?.providerCode === 'string' ? providerError.providerCode : null
  const description = typeof providerError?.providerDescription === 'string'
    ? providerError.providerDescription
    : null
  const parameter = typeof providerError?.providerParameter === 'string'
    ? providerError.providerParameter
    : null

  if (parameter === 'save_payment_method' || (status === 403 && savePaymentMethod)) {
    return {
      error: 'ЮKassa запретила сохранение карты. Для магазина нужно подключить автоплатежи у менеджера ЮKassa. Обычная оплата без автопродления продолжит работать.',
      code: 'YOOKASSA_AUTOPAYMENTS_UNAVAILABLE',
    }
  }
  if (status === 401) {
    return {
      error: 'ЮKassa отклонила авторизацию магазина. Проверьте Shop ID и секретный API-ключ.',
      code: 'YOOKASSA_AUTH_FAILED',
    }
  }
  if (status === 403) {
    return {
      error: 'ЮKassa запретила магазину выполнять эту операцию. Проверьте права и подключённые способы оплаты.',
      code: 'YOOKASSA_ACCESS_FORBIDDEN',
    }
  }
  if (status === 400 || status === 422) {
    const parameterLabel = parameter ? ` Параметр: ${parameter}.` : ''
    const descriptionLabel = description ? ` ${description}` : ''
    return {
      error: `ЮKassa отклонила параметры платежа.${parameterLabel}${descriptionLabel}`.trim(),
      code: code === 'invalid_request' ? 'YOOKASSA_INVALID_REQUEST' : 'YOOKASSA_REQUEST_REJECTED',
    }
  }
  return {
    error: 'ЮKassa временно не смогла создать платёж. Попробуйте ещё раз или выберите другой способ оплаты.',
    code: 'PAYMENT_PROVIDER_CREATE_FAILED',
  }
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
  await restoreNextPurchaseDiscountBestEffort(paymentId)
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

class NextPurchaseDiscountConflictError extends Error {
  constructor() {
    super('Скидка на следующую покупку уже изменилась. Обновите страницу и повторите оплату.')
    this.name = 'NextPurchaseDiscountConflictError'
  }
}

async function provisionPromoPayment(
  payment: Payment,
  user: { id: string; email: string },
  plan: {
    id: string
    name: string
    durationDays: number
    unlimitedDuration?: boolean
    trafficLimitGb: number | null
    deviceLimit: number
    unlimitedDevices?: boolean
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
        unlimitedDuration: plan.unlimitedDuration,
        trafficLimitGb: plan.trafficLimitGb,
        deviceLimit: plan.deviceLimit,
        unlimitedDevices: plan.unlimitedDevices,
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
