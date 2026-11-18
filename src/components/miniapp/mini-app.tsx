'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Image from 'next/image'
import { ArrowRight, ArrowUpRight, Bell, CalendarDays, Check, Copy, CreditCard, Gift, Headphones, Home, LayoutGrid, LoaderCircle, Lock, MonitorSmartphone, RefreshCw, Settings as SettingsIcon, ShieldCheck, Smartphone, Users, Wallet, Wifi, Wrench, X } from 'lucide-react'
import { BonusBoxClientDynamic } from '@/components/bonus-box/bonus-box-client-dynamic'
import { BrandLogo } from '@/components/brand-logo'
import { DevicesList } from '@/components/dashboard/devices-list'
import { KeysCard } from '@/components/dashboard/keys-card'
import { SupportPanelDynamic } from '@/components/support/support-panel-dynamic'
import type { SupportTicket } from '@/components/support/support-panel-model'
import type { BonusBoxOverview } from '@/components/bonus-box/bonus-box-types'
import { getTelegramLaunchData, loadTelegramMiniAppSdk, telegramStarsInvoiceUrl } from '@/lib/telegram-miniapp-client'
import { miniAppDestination } from '@/lib/miniapp/destination'
import { miniAppDemo, type MiniAppOverview, type TelegramRubleMethod } from '@/lib/miniapp/model'
import { AUTO_RENEWAL_CONSENT_VERSION } from '@/lib/auto-renewal-consent'
import { formatSubscriptionDaysLeft } from '@/lib/subscription-time'
import { useTelegramBackButton } from '@/components/telegram/telegram-back-button'
import styles from './mini-app.module.css'

type Tab = 'home' | 'plans' | 'devices' | 'referrals' | 'support' | 'connect' | 'menu' | 'billing' | 'bonus' | 'notifications' | 'settings' | 'admin'
type Referrals = { url: string; condition: string; invited: number; claimed: number; enabled: boolean; channelUrl: string | null; eligible: boolean; claimedAt: string | null }
type PaymentItem = { id: string; status: string; amountKopecks: number; createdAt: string; provider: string; plan: { name: string } | null }
type NotificationItem = { id: string; title: string; body: string | null; actionHref: string | null; actionLabel: string | null; readAt: string | null; createdAt: string }
type Prefs = { inAppEnabled: boolean; telegramEnabled: boolean; emailEnabled: boolean; broadcastsEnabled: boolean }
type Me = { id: string; email: string; name: string | null; role: string; createdAt: string }
type AutoRenewalState = { id: string; status: string; paymentMethodTitle: string | null;
  plan: { id: string; name: string; priceKopecks: number; durationDays: number; unlimitedDuration: boolean } | null } | null
type AdminStats = { usersTotal: number; usersNew7d: number; activeSubscriptions: number; expiringSoon: number; recoveryCount: number; succeededPayments: number; succeededAmountKopecks: number }

const tabs = [{ id: 'home', label: 'Главная', icon: Home }, { id: 'plans', label: 'Подписка', icon: Wallet },
  { id: 'devices', label: 'Устройства', icon: Smartphone }, { id: 'bonus', label: 'Бонусы', icon: Gift }, { id: 'menu', label: 'Меню', icon: LayoutGrid }] as const
const knownTabs: Tab[] = ['home', 'plans', 'devices', 'referrals', 'support', 'connect', 'menu', 'billing', 'bonus', 'notifications', 'settings', 'admin']
const rub = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 })
const duration = new Intl.NumberFormat('ru-RU', { style: 'unit', unit: 'day', unitDisplay: 'long' })
const devicePlural = new Intl.PluralRules('ru-RU')
const renewalStatusLabel: Record<string, string> = {
  AWAITING_PAYMENT_METHOD: 'ждёт привязки карты', ACTIVE: 'включено', PROCESSING: 'списание в обработке',
  RETRYING: 'повторная попытка списания', PAUSED: 'на паузе', DISABLED: 'выключено',
}

async function request<T>(url: string, body?: unknown, method?: 'POST' | 'PATCH' | 'DELETE'): Promise<T> {
  const response = await fetch(url, { method: method ?? (body === undefined ? 'GET' : 'POST'), credentials: 'same-origin', cache: 'no-store',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(25000) })
  const data = await response.json()
  if (!response.ok || data.error) throw new Error(data.error || 'Не удалось получить данные')
  return data as T
}

export function MiniApp({ demo = false, brandName = 'VPN Cabinet', bannerUrl }: { demo?: boolean; brandName?: string; bannerUrl?: string }) {
  const [data, setData] = useState<MiniAppOverview | null>(demo ? miniAppDemo : null)
  const [tab, setTab] = useState<Tab>('home')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [referrals, setReferrals] = useState<Referrals | null>(null)
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null)
  const [payments, setPayments] = useState<PaymentItem[] | null>(demo ? [] : null)
  const [subscriptionUrl, setSubscriptionUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [selectedLimits, setSelectedLimits] = useState<Record<string, number>>({})
  const [promoCodes, setPromoCodes] = useState<Record<string, string>>({})
  const [verifiedTelegramLaunch, setVerifiedTelegramLaunch] = useState(false)
  const [starsInvoice, setStarsInvoice] = useState<{ planId: string; url: string } | null>(null)
  const [checkoutPlanId, setCheckoutPlanId] = useState<string | null>(null)
  const [requestedPlanId, setRequestedPlanId] = useState<string | null>(null)
  const [botCheckoutGrant, setBotCheckoutGrant] = useState<string | null>(null)
  const [autoRenewal, setAutoRenewal] = useState<AutoRenewalState>(null)
  const [renewalConsent, setRenewalConsent] = useState(false)
  const [bonusData, setBonusData] = useState<BonusBoxOverview | null>(null)
  const [bonusOff, setBonusOff] = useState(false)
  const [bonusReload, setBonusReload] = useState(0)
  const [inbox, setInbox] = useState<NotificationItem[] | null>(null)
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null)
  // Цепочка разделов для кнопки «Назад» Telegram: нижнее меню начинает её заново.
  const [tabHistory, setTabHistory] = useState<Tab[]>([])
  const backButton = useTelegramBackButton()

  useEffect(() => {
    if (demo) return
    let cancelled = false
    async function boot() {
      try {
        let launch = getTelegramLaunchData(window.location, window.Telegram?.WebApp?.initData)
        if (launch.isTelegram || window.location.href.includes('tgWebAppVersion=')) {
          await loadTelegramMiniAppSdk()
          launch = getTelegramLaunchData(window.location, window.Telegram?.WebApp?.initData)
        }
        if (launch.isTelegram) {
          const launchParams = new URLSearchParams(launch.initData)
          const start = launchParams.get('start_param')?.match(/^ref_([A-Z0-9]{6,8})$/)?.[1]
          const referralCode = start || new URLSearchParams(window.location.search).get('ref')
          await request('/api/miniapp/auth', { initData: launch.initData, referralCode })
          if (!cancelled) setVerifiedTelegramLaunch(true)
          // Never keep signed launch credentials in the URL/history after exchange.
          const clean = new URL(window.location.href)
          for (const key of Array.from(clean.searchParams.keys())) if (key.startsWith('tgWebApp') || key === 'ref') clean.searchParams.delete(key)
          history.replaceState(null, '', `${clean.pathname}${clean.search}`)
        }
        const params = new URLSearchParams(window.location.search)
        const requestedPlan = params.get('plan')
        const grant = params.get('botCheckout')
        const checkoutQuery = requestedPlan && grant ? new URLSearchParams({ plan: requestedPlan, botCheckout: grant }) : null
        const result = await request<MiniAppOverview>(checkoutQuery ? `/api/miniapp/overview?${checkoutQuery}` : '/api/miniapp/overview')
        if (!cancelled) {
          setData(result)
          if (result.botCheckout) setBotCheckoutGrant(grant)
          const initial = params.get('tab')
          if (knownTabs.includes(initial as Tab)) { setTab(initial as Tab); if (initial !== 'home') setTabHistory(['home']) }
          else if (initial && initial !== 'home') window.location.replace(miniAppDestination(initial))
          // Возврат со страницы ЮKassa: оплата прошла внутри Telegram, подтверждаем здесь же.
          if (params.get('paid') === '1') setNotice('Проверяем оплату. Текущий статус можно посмотреть в разделе «Платежи».')
          const requestedPromo = params.get('promo')?.trim()
          if (requestedPlan && result.plans.some(item => item.id === requestedPlan && !item.isPromo)) {
            setTab('plans'); setTabHistory(['home'])
            setRequestedPlanId(requestedPlan)
            if (params.get('browserCheckout') !== '1' && (result.botCheckout || result.rublePaymentMethods?.length)) setCheckoutPlanId(requestedPlan)
            // Ссылка из бота с применённым промокодом: предзаполняем поле, чтобы скидка применилась автоматически.
            if (requestedPromo) setPromoCodes(previous => ({ ...previous, [requestedPlan]: requestedPromo }))
          }
          if (params.get('paid') || requestedPlan) {
            for (const key of ['paid', 'payment', 'plan', 'promo', 'botCheckout', 'browserCheckout']) params.delete(key)
            const query = params.toString()
            history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
          }
        }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Откройте приложение из Telegram') }
    }
    void boot()
    return () => { cancelled = true }
  }, [demo])

  useEffect(() => {
    if (!data || demo) return
    let cancelled = false
    async function load() {
      setBusy(true); setError('')
      try {
        if (tab === 'referrals') { const value = await request<Referrals>('/api/miniapp/referrals'); if (!cancelled) setReferrals(value) }
        if (tab === 'support') { const value = await request<{ tickets: SupportTicket[] }>('/api/support/tickets'); if (!cancelled) setTickets(value.tickets) }
        if (tab === 'connect') { const value = await request<{ keys: { subscriptionUrl: string } | null }>('/api/subscription/keys'); if (!cancelled) setSubscriptionUrl(value.keys?.subscriptionUrl ?? null) }
        if (tab === 'billing') {
          const [history, renewal] = await Promise.all([
            request<{ payments: PaymentItem[] }>('/api/payment/history'),
            request<{ autoRenewal: AutoRenewalState }>('/api/auto-renewal'),
          ])
          if (!cancelled) { setPayments(history.payments); setAutoRenewal(renewal.autoRenewal) }
        }
        if (tab === 'bonus') {
          try {
            const value = await request<BonusBoxOverview>('/api/bonus-box')
            if (!cancelled) { setBonusData(value); setBonusOff(false) }
          } catch (e) {
            if (!cancelled) {
              if (e instanceof Error && e.message === 'Not found') { setBonusData(null); setBonusOff(true) }
              else throw e
            }
          }
        }
        if (tab === 'notifications') { const value = await request<{ notifications: NotificationItem[] }>('/api/notifications'); if (!cancelled) setInbox(value.notifications) }
        if (tab === 'settings') {
          const [prefValue, meValue] = await Promise.all([
            request<{ preferences: Prefs }>('/api/notifications/preferences'),
            request<{ user: Me | null }>('/api/me'),
          ])
          if (!cancelled) { setPrefs(prefValue.preferences); setMe(meValue.user) }
        }
        if (tab === 'admin' && data?.admin) { const value = await request<AdminStats>('/api/admin/stats'); if (!cancelled) setAdminStats(value) }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Не удалось загрузить раздел') }
      finally { if (!cancelled) setBusy(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [tab, Boolean(data), demo, bonusReload]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!backButton) return
    if (!checkoutPlanId && tabHistory.length === 0) { backButton.hide(); return }
    const goBack = () => {
      if (checkoutPlanId) { setCheckoutPlanId(null); return }
      setTabHistory(tabHistory.slice(0, -1))
      openTab(tabHistory.at(-1) ?? 'home')
    }
    backButton.onClick(goBack)
    backButton.show()
    return () => { backButton.offClick(goBack) }
  }, [backButton, checkoutPlanId, tabHistory])
  useEffect(() => () => backButton?.hide(), [backButton])

  async function refresh() {
    if (demo) { setNotice('Это демонстрация. Данные вымышлены.'); return }
    if (tab === 'bonus') { setBonusData(null); setBonusReload(value => value + 1) }
    setBusy(true); setError('')
    try { setData(await request<MiniAppOverview>('/api/miniapp/overview')) }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось обновить') }
    finally { setBusy(false) }
  }
  function openTab(next: Tab) { setTab(next); setError(''); setNotice(''); setCopied(false) }
  function navigate(next: Tab) {
    if (next === tab) return
    setTabHistory(previous => [...previous, tab])
    openTab(next)
  }
  function navigateRoot(next: Tab) {
    setTabHistory(next === 'home' ? [] : ['home'])
    openTab(next)
  }
  async function claim() {
    setBusy(true); setError('')
    try {
      await request('/api/miniapp/referrals/claim', {})
      setNotice('Бонус подтверждён и поставлен в очередь начисления.'); setReferrals(await request<Referrals>('/api/miniapp/referrals'))
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось проверить подписку на канал') }
    finally { setBusy(false) }
  }
  async function copy() {
    if (!referrals) return
    try { await navigator.clipboard.writeText(referrals.url); setCopied(true) }
    catch { setError('Не удалось скопировать. Выделите ссылку и скопируйте вручную.') }
  }
  async function buyPlan(plan: MiniAppOverview['plans'][number]) {
    if (demo) { setNotice('Это демонстрация. Счёт не создаётся.'); return }
    if (!verifiedTelegramLaunch && !window.Telegram?.WebApp?.initData) { setError('Откройте приложение внутри Telegram для оплаты Stars.'); return }
    setBusy(true); setError(''); setNotice(''); setStarsInvoice(null)
    try {
      const result = await request<{ confirmationUrl?: string; starsAmount?: number; redirectUrl?: string }>('/api/miniapp/checkout', {
        planId: plan.id, purchaseType: 'SUBSCRIPTION', provider: 'TELEGRAM_STARS',
        deviceLimit: selectedLimits[plan.id] ?? plan.initialDevices, idempotencyKey: crypto.randomUUID(),
        ...(promoCodes[plan.id]?.trim() ? { promoCode: promoCodes[plan.id]!.trim() } : {}),
      })
      if (result.redirectUrl) { setNotice('Ознакомительный доступ оформлен. Обновите подписку.'); await refresh(); return }
      const invoiceUrl = result.confirmationUrl && telegramStarsInvoiceUrl(result.confirmationUrl)
      if (!invoiceUrl) throw new Error('Ссылка на счёт не получена')
      const webApp = window.Telegram?.WebApp
      if (webApp?.openInvoice && webApp.isVersionAtLeast?.('6.1') !== false) {
        try {
          webApp.openInvoice(invoiceUrl, status => {
            if (status === 'paid') { setNotice('Оплата подтверждена. Подписка обновится после выдачи.'); void refresh() }
            else if (status === 'failed') setError('Оплата не завершилась. Попробуйте ещё раз.')
          })
          return
        } catch {
          // Some Telegram clients do not provide the invoice window.
        }
      }
      setStarsInvoice({ planId: plan.id, url: invoiceUrl })
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось создать счёт') }
    finally { setBusy(false) }
  }
  function openBrowserCheckout(plan: MiniAppOverview['plans'][number]) {
    const url = new URL('/dashboard/plans', window.location.origin)
    url.searchParams.set('plan', plan.id)
    if (plan.current) url.searchParams.set('intent', 'renew')
    const promo = promoCodes[plan.id]?.trim()
    if (promo) url.searchParams.set('promo', promo)
    const webApp = window.Telegram?.WebApp
    if (webApp?.openLink) webApp.openLink(url.toString())
    else if (!webApp?.initData) window.open(url.toString(), '_blank', 'noopener,noreferrer')
    else setError('Откройте сайт кабинета в обычном браузере.')
  }
  async function payInTelegram(plan: MiniAppOverview['plans'][number], method: TelegramRubleMethod) {
    if (demo) { setNotice('Это демонстрация. Счёт не создаётся.'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await request<{ confirmationUrl?: string; redirectUrl?: string }>('/api/miniapp/checkout', {
        planId: plan.id, purchaseType: 'SUBSCRIPTION', provider: 'YOOKASSA', paymentMethodType: method,
        ...(botCheckoutGrant && data?.botCheckout?.planId === plan.id ? { botCheckoutGrant } : {}),
        deviceLimit: selectedLimits[plan.id] ?? plan.initialDevices, idempotencyKey: crypto.randomUUID(),
        ...(promoCodes[plan.id]?.trim() ? { promoCode: promoCodes[plan.id]!.trim() } : {}),
      })
      if (result.redirectUrl) { setNotice('Подписка уже оформлена. Обновляем данные…'); setCheckoutPlanId(null); await refresh(); return }
      if (!result.confirmationUrl) throw new Error('Ссылка на оплату не получена')
      // Страница ЮKassa открывается в этом же окне Telegram — без внешнего браузера.
      window.location.href = result.confirmationUrl
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось создать счёт') }
    finally { setBusy(false) }
  }
  async function toggleAutoRenewal() {
    if (demo) { setNotice('Это демонстрация. Настройка не меняется.'); return }
    const currentPlan = data?.plans.find(plan => plan.current && !plan.isPromo)
    setBusy(true); setError(''); setNotice('')
    try {
      if (!autoRenewal || autoRenewal.status === 'DISABLED') {
        if (!currentPlan) throw new Error('Сначала оформите тариф')
        if (!renewalConsent) throw new Error('Подтвердите согласие на регулярные списания')
        const value = await request<{ autoRenewal: AutoRenewalState }>('/api/auto-renewal',
          { planId: currentPlan.id, consentAccepted: true, consentVersion: AUTO_RENEWAL_CONSENT_VERSION })
        setAutoRenewal(value.autoRenewal); setRenewalConsent(false)
        setNotice('Автопродление включено. Карта привяжется при следующей оплате.')
      } else {
        const value = await request<{ autoRenewal: AutoRenewalState }>('/api/auto-renewal', {}, 'DELETE')
        setAutoRenewal(value.autoRenewal)
        setNotice('Автопродление выключено. Оплаченный срок сохранится.')
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось изменить автопродление') }
    finally { setBusy(false) }
  }
  async function markAllRead() {
    if (demo) { setNotice('Это демонстрация. Уведомления не меняются.'); return }
    setBusy(true); setError('')
    try {
      await request('/api/notifications', {}, 'PATCH')
      const value = await request<{ notifications: NotificationItem[] }>('/api/notifications')
      setInbox(value.notifications); setNotice('Все уведомления прочитаны.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось обновить уведомления') }
    finally { setBusy(false) }
  }
  async function openInboxItem(item: NotificationItem) {
    if (demo || item.readAt) return
    setInbox(previous => previous?.map(entry => entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry) ?? null)
    try { await request('/api/notifications', { ids: [item.id] }, 'PATCH') } catch { /* прочтение отметим при следующем открытии */ }
  }
  async function togglePref(key: keyof Prefs) {
    if (demo) { setNotice('Это демонстрация. Настройки не меняются.'); return }
    if (!prefs) return
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    try {
      const value = await request<{ preferences: Prefs }>('/api/notifications/preferences', next, 'PATCH')
      setPrefs(value.preferences)
    } catch (e) { setPrefs(prefs); setError(e instanceof Error ? e.message : 'Не удалось сохранить настройки') }
  }
  const sub = data?.subscription
  const checkoutPlan = data?.plans.find(item => item.id === checkoutPlanId && !item.isPromo) ?? null
  const methodsForPlan = (planId: string) =>
    data?.botCheckout?.planId === planId ? data.botCheckout.methods : data?.rublePaymentMethods ?? []
  const checkoutLimit = checkoutPlan ? selectedLimits[checkoutPlan.id] ?? checkoutPlan.initialDevices : 0
  const checkoutExtraKopecks = checkoutPlan ? Math.max(0, checkoutLimit - checkoutPlan.devices) * checkoutPlan.extraDevicePriceKopecks : 0
  const checkoutTotalKopecks = checkoutPlan ? checkoutPlan.priceKopecks + checkoutExtraKopecks : 0
  const date = sub?.expiresAt ? new Date(sub.expiresAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : 'Без ограничения срока'
  const currentPlan = data?.plans.find(plan => plan.current && !plan.isPromo) ?? null
  const featuredPlan = data?.plans.find(plan => plan.id === requestedPlanId) ?? currentPlan
  const plans = featuredPlan && data ? [featuredPlan, ...data.plans.filter(plan => plan.id !== featuredPlan.id)] : data?.plans ?? []
  const unreadCount = inbox?.filter(item => !item.readAt).length ?? 0
  const renewalOn = Boolean(autoRenewal && autoRenewal.status !== 'DISABLED')
  const menuItems: Array<{ id: Tab; icon: typeof Wallet; title: string; hint: string; badge?: number }> = [
    { id: 'billing', icon: CreditCard, title: 'Платежи', hint: renewalOn ? `Автопродление: ${renewalStatusLabel[autoRenewal!.status] ?? autoRenewal!.status}` : 'История и автопродление' },
    { id: 'notifications', icon: Bell, title: 'Уведомления', hint: unreadCount > 0 ? `Непрочитанных: ${unreadCount}` : 'Все прочитаны', badge: unreadCount || undefined },
    ...(data?.referrals ? [{ id: 'referrals' as Tab, icon: Users, title: 'Друзья', hint: 'Бонус за приглашения' }] : []),
    ...(data?.support ? [{ id: 'support' as Tab, icon: Headphones, title: 'Поддержка', hint: 'Мы на связи' }] : []),
    { id: 'connect', icon: Wifi, title: 'Подключение', hint: 'Инструкция и ссылка' },
    { id: 'settings', icon: SettingsIcon, title: 'Настройки', hint: 'Уведомления и профиль' },
    ...(data?.admin ? [{ id: 'admin' as Tab, icon: Wrench, title: 'Управление', hint: 'Панель администратора' }] : []),
  ]
  return <main className={styles.app}>
    <div aria-hidden="true" className="telegram-safe-top-cap" />
    <div className={styles.wrap}>
      <header className={styles.header}><div className={styles.brand}><BrandLogo className={styles.logo} /><span>{brandName}<small>Личный кабинет</small></span></div>
        <button aria-label="Обновить данные" className={styles.iconButton} onClick={() => void refresh()} disabled={busy}><RefreshCw size={18} /></button></header>
      {demo && <div className={styles.demo}>Предпросмотр · вымышленные данные</div>}
      {error && <div role="alert" className={styles.alert}>{error} {!data && <button onClick={() => window.location.reload()}>Повторить</button>}</div>}
      {notice && <div role="status" className={styles.notice}>{notice}</div>}
      {!data && !error && <div className={styles.empty}><LoaderCircle className="animate-spin" />Входим в ваш кабинет…</div>}
      {data && <>
        {data.warning && <div className={styles.alert}>{data.warning}</div>}
        {tab === 'home' && <>
          {bannerUrl && <Image className={styles.banner} src={bannerUrl} alt="" width={1200} height={450} unoptimized referrerPolicy="no-referrer" />}
          <div className={styles.intro}><h1>Привет, {data.name}</h1></div>
          <section className={`${styles.pass} ${sub && !sub.usable ? styles.passOff : ''}`} aria-label="Моя подписка">
            <div className={styles.passTop}><span className={styles.eyebrow}>Ваша подписка</span>
              <span className={styles.pill}><span className={sub?.usable ? styles.dot : styles.offDot} />{sub?.title || 'Доступ ещё не подключён'}</span></div>
            <div className={styles.passBody}>
              <h2>{sub?.planName || brandName}</h2>
              {sub && <><small>{sub.daysLeft == null ? 'Доступ' : 'Осталось'}</small>
                <strong>{sub.daysLeft == null ? 'Бессрочно' : formatSubscriptionDaysLeft(sub.daysLeft)}</strong></>}
              <p>{sub ? (sub.expiresAt ? `Оплачено до ${date}` : 'Продление не требуется.') : 'Выберите тариф, чтобы подключить VPN.'}</p>
            </div>
            <button className={styles.passAction} onClick={() => navigate(sub?.usable ? 'connect' : 'plans')}>
              {sub?.usable ? <Wifi size={18} /> : <Wallet size={18} />}<span>{sub?.usable ? 'Подключить VPN' : 'Выбрать тариф'}</span><ArrowRight size={16} /></button>
            <div className={styles.orbit} aria-hidden="true"><span><span><ShieldCheck /></span></span></div>
          </section>
          <div className={styles.metrics}>
            <button className={styles.metric} onClick={() => navigate('devices')}><MonitorSmartphone />
              <span>Мои устройства</span><strong>{data.deviceCount}<i> / {sub?.deviceLimit ?? '∞'}</i></strong><small>Посмотреть и управлять</small></button>
            <button className={styles.metric} onClick={() => navigate('plans')}><CalendarDays />
              <span>{sub?.expiresAt ? 'Оплачено до' : 'Подписка'}</span><b>{sub?.expiresAt ? date : sub ? 'Без срока' : 'Не оформлена'}</b><small>Тарифы и продление</small></button>
          </div>
          {data.referrals && <button className={styles.invite} onClick={() => navigate('referrals')}><Gift /><span><b>Хорошим делятся</b><small>Приглашайте друзей и получайте дни VPN</small></span><ArrowRight /></button>}
          <p className={styles.footnote}>Подписка общая с вашим личным кабинетом. Статус подключения проверяется в VPN-приложении.</p>
        </>}
        {tab === 'menu' && <section><Heading title="Меню кабинета" description="Все разделы сервиса — как в личном кабинете на сайте." />
          <div className={styles.quick}>{menuItems.map(item => <button key={item.id} onClick={() => navigate(item.id)}>
            <item.icon /><b>{item.title}{item.badge ? ` · ${item.badge}` : ''}</b><span>{item.hint}</span></button>)}</div>
        </section>}
        {tab === 'plans' && <section><Heading title="Тарифы и подписка" description="Тарифы и условия обновляются из личного кабинета." />
          {data.starsEnabled && data.starsRateKopecks && <p className={styles.rate}>Курс Stars · 1 ⭐ = {(data.starsRateKopecks / 100).toLocaleString('ru-RU')} ₽</p>}
          {plans.length === 0 && <div className={styles.empty}>Для вашего аккаунта сейчас нет доступных тарифов.</div>}
          {plans.map(plan => <article className={styles.plan} key={plan.id}><div>
              <div className={styles.planHead}>
                <div>{plan.current && <span className={styles.currentPlan}>Ваш тариф</span>}<h2>{plan.name}</h2></div>
                <strong>{plan.isPromo ? '0 ₽' : rub.format(plan.priceKopecks / 100)}</strong>
              </div>
              <p className={styles.planMeta}>
                <span>{plan.unlimited ? 'Бессрочно' : duration.format(plan.days)}</span>
                <span>{plan.unlimitedDevices ? 'Безлимит устройств' : plan.deviceAddonEnabled ? `${plan.devices}–${plan.maxDevices} устройств` : formatDeviceCount(plan.initialDevices)}</span>
                <span>{plan.trafficLimitGb == null ? 'Безлимит трафика' : `${plan.trafficLimitGb} ГБ`}</span>
              </p>
              {plan.description && <p>{plan.description}</p>}
              {plan.isPlanSwitch && <p className={styles.planNote}>При смене тарифа начнётся новый срок. Оставшиеся дни текущего тарифа не переносятся.</p>}
            </div>
            {!plan.isPromo && <>
              <button className={styles.sitePay} onClick={() => openBrowserCheckout(plan)}>Открыть кабинет в браузере<ArrowUpRight size={18} /></button>
              {methodsForPlan(plan.id).length > 0 && <button className={styles.primary} onClick={() => setCheckoutPlanId(plan.id)}><CreditCard size={18} />Оплатить в Telegram</button>}
            </>}
            {data.starsEnabled && data.starsRateKopecks && <div className={styles.planBuy}>
              {plan.deviceAddonEnabled && !plan.unlimitedDevices && <label>Количество устройств
                <select value={selectedLimits[plan.id] ?? plan.initialDevices} onChange={e => setSelectedLimits(previous => ({ ...previous, [plan.id]: Number(e.target.value) }))}>
                  {Array.from({ length: plan.maxDevices - plan.devices + 1 }, (_, index) => plan.devices + index).map(limit =>
                    <option key={limit} value={limit}>{limit}</option>)}
                </select></label>}
              {!plan.isPromo && <>
                <div className={styles.starsPrice}><span>Стоимость в Stars{promoCodes[plan.id]?.trim() && ' до скидки'}</span><strong>{Math.ceil((plan.priceKopecks + Math.max(0, (selectedLimits[plan.id] ?? plan.initialDevices) - plan.devices) * plan.extraDevicePriceKopecks) / data.starsRateKopecks)} ⭐</strong></div>
                <details className={styles.promo} open={promoCodes[plan.id]?.trim() ? true : undefined}>
                  <summary>Промокод</summary>
                  <input className={styles.linkInput} aria-label={`Промокод для ${plan.name}`} placeholder="Введите промокод" value={promoCodes[plan.id] ?? ''} onChange={e => setPromoCodes(previous => ({ ...previous, [plan.id]: e.target.value }))} />
                </details>
              </>}
              {starsInvoice?.planId === plan.id
                ? <a className={styles.primary} href={starsInvoice.url} target="_blank" rel="noopener noreferrer">Открыть счёт Stars в Telegram<ArrowUpRight size={18} /></a>
                : <button className={styles.primary} disabled={busy} onClick={() => void buyPlan(plan)}>{plan.isPromo ? 'Получить доступ' : 'Оплатить Stars'}<ArrowUpRight size={18} /></button>}
            </div>}
            </article>)}
        </section>}
        {tab === 'billing' && <section><Heading title="Платежи" description="История оплат и автопродление — как в кабинете на сайте." />
          <article className={styles.plan}><div><small>АВТОПРОДЛЕНИЕ</small>
            <h2>{renewalOn ? '🟢 ' : '⚪ '}{renewalStatusLabel[autoRenewal?.status ?? 'DISABLED'] ?? autoRenewal?.status}</h2>
            {autoRenewal?.plan && <p>{autoRenewal.plan.name} · {rub.format(autoRenewal.plan.priceKopecks / 100)}{autoRenewal.plan.unlimitedDuration ? '' : ` / ${autoRenewal.plan.durationDays} дней`}</p>}
            {autoRenewal?.paymentMethodTitle && <p>Карта: {autoRenewal.paymentMethodTitle}</p>}
            {!renewalOn && <p>Подписка будет продлеваться автоматически, чтобы доступ не прерывался.</p>}
            {autoRenewal?.status === 'AWAITING_PAYMENT_METHOD' && <p>Карта привяжется автоматически при следующей оплате картой.</p>}
          </div>
            {!renewalOn && currentPlan && <>
              <label className={styles.consent}><input type="checkbox" checked={renewalConsent} onChange={e => setRenewalConsent(e.target.checked)} />
                <span>Разрешаю регулярные списания по тарифу «{currentPlan.name}» согласно условиям автопродления. Отключить можно в любой момент здесь же.</span></label>
              <button className={styles.primary} disabled={busy || !renewalConsent} onClick={() => void toggleAutoRenewal()}>Включить автопродление<ArrowUpRight size={18} /></button></>}
            {!renewalOn && !currentPlan && <p className={styles.planNote}>Сначала оформите тариф — автопродление появится после первой оплаты.</p>}
            {renewalOn && autoRenewal?.status !== 'PROCESSING' && autoRenewal?.status !== 'RETRYING' &&
              <button className={styles.secondary} disabled={busy} onClick={() => void toggleAutoRenewal()}>Выключить автопродление</button>}
          </article>
          <div className={styles.history}><h2>История платежей</h2>{payments === null && <p>Загружаем платежи…</p>}{payments?.length === 0 && <p>Платежей пока нет.</p>}{payments?.slice(0, 20).map(payment => <div className={styles.order} key={payment.id}><span><b>{payment.plan?.name || 'Подписка'}</b><small>{new Date(payment.createdAt).toLocaleDateString('ru-RU')} · {payment.provider}</small></span><span><b>{rub.format(payment.amountKopecks / 100)}</b><small>{payment.status === 'SUCCEEDED' ? 'Оплачено' : payment.status === 'PENDING' ? 'Ожидает оплаты' : payment.status === 'REFUNDED' ? 'Возврат' : 'Не оплачено'}</small></span></div>)}</div>
        </section>}
        {tab === 'bonus' && <section>
          <Heading title="Бонусы" description="Рулетка, задания и призы — те же, что в кабинете." />
          {demo ? <div className={styles.card}>В рабочем кабинете здесь доступны попытки, призы и задания.</div>
            : bonusOff ? <div className={styles.empty}>Рулетка временно отключена.</div>
            : bonusData ? <div className={styles.roulette}>
              <BonusBoxClientDynamic initialData={bonusData} referralsEnabled={data.referrals} embedded />
            </div>
            : busy ? <div className={styles.empty} role="status"><LoaderCircle className="animate-spin" />Загружаем рулетку…</div>
            : <button className={styles.secondary} onClick={() => setBonusReload(value => value + 1)}>Загрузить рулетку</button>}
        </section>}
        {tab === 'notifications' && <section><Heading title="Уведомления" description="Важные события подписки и сообщения сервиса." />
          {demo && <div className={styles.card}><p>🔔 Подписка продлена на 30 дней</p><small>01.11.2026 · демонстрация</small></div>}
          {!demo && <>
            {inbox === null && <div className={styles.empty}>Загружаем уведомления…</div>}
            {inbox?.length === 0 && <div className={styles.empty}>Уведомлений пока нет.</div>}
            {unreadCount > 0 && <button className={styles.secondary} disabled={busy} onClick={() => void markAllRead()}><Check size={17} />Прочитать все · {unreadCount}</button>}
            {inbox?.map(item => <button className={`${styles.notif} ${item.readAt ? '' : styles.notifUnread}`} key={item.id} onClick={() => void openInboxItem(item)}>
              <span className={styles.notifBody}><b>{item.title}</b>{item.body && <small>{item.body}</small>}
                <small>{new Date(item.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}{item.actionHref && item.actionLabel ? ` · ${item.actionLabel} →` : ''}</small></span>
              {!item.readAt && <span className={styles.dot} />}</button>)}
            {inbox?.some(item => item.actionHref) && <p className={styles.footnote}>Ссылки из уведомлений открывают разделы кабинета в этом же окне.</p>}
          </>}
        </section>}
        {tab === 'settings' && <section><Heading title="Настройки" description="Каналы уведомлений и данные аккаунта." />
          <article className={styles.plan}><div><small>АККАУНТ</small>
            <h2>{me?.name || data.name}</h2>
            <p>{demo ? 'demo@example.test' : me?.email || 'Загружаем…'}</p>
            <p>Telegram привязан — вход и уведомления работают через него.</p></div></article>
          <article className={styles.plan}><div><small>УВЕДОМЛЕНИЯ</small><h2>Каналы связи</h2></div>
            {([['inAppEnabled', 'В кабинете', 'Лента событий в разделе «Уведомления»'], ['telegramEnabled', 'Telegram', 'Сообщения от бота'], ['emailEnabled', 'Email', 'Письма на почту'], ['broadcastsEnabled', 'Рассылки', 'Новости и акции сервиса']] as Array<[keyof Prefs, string, string]>).map(([key, title, hint]) =>
              <div className={styles.prefRow} key={key}><span><b>{title}</b><small>{hint}</small></span>
                <button role="switch" aria-checked={demo ? key !== 'broadcastsEnabled' : Boolean(prefs?.[key])} className={styles.toggle} disabled={busy || (!demo && !prefs)} onClick={() => void togglePref(key)}><span /></button></div>)}
          </article>
          <a className={styles.secondary} href="/dashboard/settings">Профиль и безопасность в кабинете<ArrowUpRight size={18} /></a>
        </section>}
        {tab === 'admin' && <section><Heading title="Управление" description="Статистика сервиса и вход в панель администратора." />
          {!data.admin && <div className={styles.empty}>Раздел доступен администраторам.</div>}
          {data.admin && demo && <div className={styles.card}><p>Демонстрация: статистика недоступна.</p></div>}
          {data.admin && !demo && <>
            {adminStats === null && <div className={styles.empty}>Загружаем статистику…</div>}
            {adminStats && <div className={styles.quick}>
              <div><strong>{adminStats.usersTotal}</strong><span>пользователей · +{adminStats.usersNew7d} за 7 дней</span></div>
              <div><strong>{adminStats.activeSubscriptions}</strong><span>активных подписок</span></div>
              <div><strong>{adminStats.expiringSoon}</strong><span>истекают за 7 дней</span></div>
              <div><strong>{adminStats.recoveryCount}</strong><span>оплат к выдаче</span></div>
              <div><strong>{adminStats.succeededPayments}</strong><span>успешных оплат</span></div>
              <div><strong>{rub.format(adminStats.succeededAmountKopecks / 100)}</strong><span>сумма оплат</span></div>
            </div>}
            <a className={styles.primary} href="/dashboard/admin"><Wrench size={19} />Открыть панель управления<ArrowUpRight size={18} /></a>
          </>}
        </section>}
        {tab === 'devices' && <section><Heading title="Ваши устройства" description="Одно подключение для всех ваших экранов." />
          {demo ? <div className={styles.card}><div className={styles.device}><Smartphone /><span><b>iPhone</b><small>iOS · Rabbit Hole</small></span><Check /></div><div className={styles.device}><Smartphone /><span><b>MacBook</b><small>macOS · Rabbit Hole</small></span><Check /></div></div> : <DevicesList deviceLimit={sub?.deviceLimit} />}
          <button id="add-device-guide" className={styles.primary} onClick={() => navigate('connect')}>Подключить устройство<ArrowUpRight size={20} /></button></section>}
        {tab === 'connect' && <section><Heading title="Подключить VPN" description="Установите приложение, добавьте подписку и включите подключение." />
          {demo ? <div className={styles.card}><p>1. Установите VPN-клиент</p><p>2. Добавьте подписку {brandName}</p><p>3. Включите VPN в приложении</p><small>Персональная ссылка появится после входа.</small></div>
            : subscriptionUrl ? <KeysCard subscriptionUrl={subscriptionUrl} supportEnabled={data.support} deviceLimit={sub?.deviceLimit} /> : !busy && <div className={styles.empty}>Ссылка пока недоступна. Проверьте состояние подписки.</div>}</section>}
        {tab === 'referrals' && <section><Heading title="Больше дней вместе" description={referrals?.condition || 'Новый пользователь приходит по вашей ссылке и вступает в канал. Условия бонуса задаёт сервис.'} />
          <div className={styles.refHero}><Gift size={48} /><h2>Ваша рекомендация.<br />Наше спасибо.</h2><p>Бонусы поступают на ту же подписку, которой вы уже пользуетесь.</p></div>
          <div className={styles.quick}><div><strong>{referrals?.invited ?? 0}</strong><span>приглашено</span></div><div><strong>{referrals?.claimed ?? 0}</strong><span>бонусов подтверждено</span></div></div>
          {demo ? <div className={styles.notice}>Размер бонуса и канал ожидают настройки.</div> : referrals && <>
            <input className={styles.linkInput} aria-label="Реферальная ссылка" readOnly value={referrals.url} />
            <button className={styles.primary} disabled={!referrals.enabled} onClick={() => void copy()}>{copied ? <Check size={18} /> : <Copy size={18} />}{copied ? 'Ссылка скопирована' : 'Копировать приглашение'}</button>
            {referrals.channelUrl && <a className={styles.secondary} href={referrals.channelUrl} target="_blank" rel="noreferrer">Открыть канал<ArrowUpRight size={18} /></a>}
            {referrals.eligible && <button className={styles.secondary} disabled={busy || Boolean(referrals.claimedAt)} onClick={() => void claim()}>{referrals.claimedAt ? 'Бонус подтверждён' : 'Я вступил, проверить'}</button>}
          </>}
        </section>}
        {tab === 'support' && <section><Heading title="Поможем разобраться" description="Опишите, что произошло. История обращений общая с кабинетом." />
          {demo ? <DemoSupport /> : tickets && <SupportPanelDynamic mode="user" initialTickets={tickets} />}</section>}
        {busy && tab !== 'bonus' && <div role="status" className={styles.loading}><LoaderCircle className="animate-spin" size={18} />Загрузка…</div>}
        {checkoutPlan && methodsForPlan(checkoutPlan.id).length > 0 && <div className={styles.sheetBackdrop} onClick={() => setCheckoutPlanId(null)}>
          <section className={styles.sheet} role="dialog" aria-modal="true" aria-label="Оплата подписки" onClick={event => event.stopPropagation()}>
            <button className={styles.sheetClose} aria-label="Закрыть оплату" onClick={() => setCheckoutPlanId(null)}><X size={18} /></button>
            <small className={styles.sheetEyebrow}>{brandName} · Заказ</small>
            <h2>{checkoutPlan.name}</h2>
            <p className={styles.sheetSub}>{checkoutPlan.unlimited ? 'Бессрочно' : duration.format(checkoutPlan.days)} · {checkoutPlan.unlimitedDevices ? 'безлимит устройств' : formatDeviceCount(checkoutLimit)}{checkoutPlan.trafficLimitGb == null ? ' · безлимит трафика' : ` · ${checkoutPlan.trafficLimitGb} ГБ`}</p>
            {checkoutPlan.deviceAddonEnabled && !checkoutPlan.unlimitedDevices && <label className={styles.sheetField}>Количество устройств
              <select value={checkoutLimit} onChange={e => setSelectedLimits(previous => ({ ...previous, [checkoutPlan.id]: Number(e.target.value) }))}>
                {Array.from({ length: checkoutPlan.maxDevices - checkoutPlan.devices + 1 }, (_, index) => checkoutPlan.devices + index).map(limit =>
                  <option key={limit} value={limit}>{limit}</option>)}
              </select></label>}
            <input className={styles.linkInput} aria-label="Промокод" placeholder="Промокод, если есть" value={promoCodes[checkoutPlan.id] ?? ''}
              onChange={e => setPromoCodes(previous => ({ ...previous, [checkoutPlan.id]: e.target.value }))} />
            <div className={styles.sheetLines}>
              <div className={styles.sheetLine}><span>{checkoutPlan.name} · {checkoutPlan.unlimited ? 'бессрочно' : duration.format(checkoutPlan.days)}</span><b>{rub.format(checkoutPlan.priceKopecks / 100)}</b></div>
              {checkoutExtraKopecks > 0 && <div className={styles.sheetLine}><span>Дополнительные устройства · {checkoutLimit - checkoutPlan.devices}</span><b>+{rub.format(checkoutExtraKopecks / 100)}</b></div>}
            </div>
            <div className={styles.sheetTotal}><span>Итого{promoCodes[checkoutPlan.id]?.trim() ? ' до скидки' : ''}</span><strong>{rub.format(checkoutTotalKopecks / 100)}</strong></div>
            {methodsForPlan(checkoutPlan.id).map(method => (
              <button key={method} className={styles.primary} disabled={busy} onClick={() => void payInTelegram(checkoutPlan, method)}>
                <Lock size={18} />{method === 'bank_card' ? 'Оплатить картой' : 'Оплатить по СБП'}<ArrowUpRight size={18} />
              </button>
            ))}
            <p className={styles.sheetSecure}>ЮKassa покажет итоговую сумму с учётом скидок.</p>
          </section>
        </div>}
        <nav className={styles.nav} aria-label="Разделы приложения">{tabs.map(item => <button key={item.id} aria-current={tab === item.id ? 'page' : undefined} onClick={() => navigateRoot(item.id)}><item.icon /><span>{item.label}</span></button>)}</nav>
      </>}
    </div>
  </main>
}

function Heading({ title, description }: { title: string; description?: string }) {
  return <div className={styles.heading}><h1>{title}</h1>{description && <p>{description}</p>}</div>
}

function formatDeviceCount(count: number) {
  const plural = devicePlural.select(count)
  return `${count} ${plural === 'one' ? 'устройство' : plural === 'few' ? 'устройства' : 'устройств'}`
}
function DemoSupport() {
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  function submit(event: FormEvent) { event.preventDefault(); setSent(true) }
  return <form className={styles.card} onSubmit={submit}><label htmlFor="support-demo">Ваш вопрос</label><textarea id="support-demo" value={message} onChange={e => setMessage(e.target.value)} placeholder="Например, не подключается VPN на iPhone" minLength={5} required /><button className={styles.primary}>Проверить форму</button>{sent && <p role="status">Демо: обращение не отправлено.</p>}</form>
}
