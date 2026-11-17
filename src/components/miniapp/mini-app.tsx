'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Image from 'next/image'
import { ArrowUpRight, Bell, Check, Copy, CreditCard, Gift, Headphones, Home, LayoutGrid, LoaderCircle, Lock, RefreshCw, Settings as SettingsIcon, Shield, Smartphone, Sparkles, Trophy, Users, Wallet, Wifi, Wrench, X } from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'
import { DevicesList } from '@/components/dashboard/devices-list'
import { KeysCard } from '@/components/dashboard/keys-card'
import { SupportPanelDynamic } from '@/components/support/support-panel-dynamic'
import type { SupportTicket } from '@/components/support/support-panel-model'
import type { BonusBoxMissionView, BonusBoxOverview, OpenBoxResponse } from '@/components/bonus-box/bonus-box-types'
import { getTelegramLaunchData } from '@/lib/telegram-miniapp-client'
import { miniAppDestination } from '@/lib/miniapp/destination'
import { miniAppDemo, type MiniAppOverview, type TelegramRubleMethod } from '@/lib/miniapp/model'
import { AUTO_RENEWAL_CONSENT_VERSION } from '@/lib/auto-renewal-consent'
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
const rarityEmoji: Record<string, string> = { COMMON: '⚪', RARE: '🔵', EPIC: '🟣', LEGENDARY: '🟡' }
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
  const [checkoutPlanId, setCheckoutPlanId] = useState<string | null>(null)
  const [botCheckoutGrant, setBotCheckoutGrant] = useState<string | null>(null)
  const [autoRenewal, setAutoRenewal] = useState<AutoRenewalState>(null)
  const [renewalConsent, setRenewalConsent] = useState(false)
  const [bonusData, setBonusData] = useState<BonusBoxOverview | null>(null)
  const [bonusOff, setBonusOff] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [spinResult, setSpinResult] = useState<OpenBoxResponse | null>(null)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [inbox, setInbox] = useState<NotificationItem[] | null>(null)
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null)

  useEffect(() => {
    if (demo) return
    let cancelled = false
    async function boot() {
      try {
        let launch = getTelegramLaunchData(window.location, window.Telegram?.WebApp?.initData)
        if (!launch.isTelegram && window.location.href.includes('tgWebAppVersion=')) {
          await new Promise<void>(resolve => {
            const onReady = () => { clearTimeout(timeout); resolve() }
            const timeout = window.setTimeout(() => {
              window.removeEventListener('telegram-web-app-ready', onReady)
              resolve()
            }, 4000)
            window.addEventListener('telegram-web-app-ready', onReady, { once: true })
          })
          launch = getTelegramLaunchData(window.location, window.Telegram?.WebApp?.initData)
        }
        if (launch.isTelegram) {
          const launchParams = new URLSearchParams(launch.initData)
          const start = launchParams.get('start_param')?.match(/^ref_([A-Z0-9]{6,8})$/)?.[1]
          const referralCode = start || new URLSearchParams(window.location.search).get('ref')
          await request('/api/miniapp/auth', { initData: launch.initData, referralCode })
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
          if (knownTabs.includes(initial as Tab)) setTab(initial as Tab)
          else if (initial && initial !== 'home') window.location.replace(miniAppDestination(initial))
          // Возврат со страницы ЮKassa: оплата прошла внутри Telegram, подтверждаем здесь же.
          if (params.get('paid') === '1') setNotice('Проверяем оплату. Текущий статус можно посмотреть в разделе «Платежи».')
          const requestedPromo = params.get('promo')?.trim()
          if (requestedPlan && result.plans.some(item => item.id === requestedPlan && !item.isPromo)) {
            setTab('plans')
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
              if (e instanceof Error && e.message === 'Not found') setBonusOff(true)
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
  }, [tab, Boolean(data), demo]) // eslint-disable-line react-hooks/exhaustive-deps

  async function refresh() {
    if (demo) { setNotice('Это демонстрация. Данные вымышлены.'); return }
    setBusy(true); setError('')
    try { setData(await request<MiniAppOverview>('/api/miniapp/overview')) }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось обновить') }
    finally { setBusy(false) }
  }
  function navigate(next: Tab) { setTab(next); setError(''); setNotice(''); setCopied(false); setSpinResult(null) }
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
  async function copyCode(code: string) {
    try { await navigator.clipboard.writeText(code); setCopiedCode(code) }
    catch { setError('Не удалось скопировать промокод.') }
  }
  async function buyPlan(plan: MiniAppOverview['plans'][number]) {
    if (demo) { setNotice('Это демонстрация. Счёт не создаётся.'); return }
    const webApp = window.Telegram?.WebApp
    if (!webApp?.openInvoice) { setError('Откройте приложение внутри Telegram для оплаты Stars.'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await request<{ confirmationUrl?: string; starsAmount?: number; redirectUrl?: string }>('/api/miniapp/checkout', {
        planId: plan.id, purchaseType: 'SUBSCRIPTION', provider: 'TELEGRAM_STARS',
        deviceLimit: selectedLimits[plan.id] ?? plan.initialDevices, idempotencyKey: crypto.randomUUID(),
        ...(promoCodes[plan.id]?.trim() ? { promoCode: promoCodes[plan.id]!.trim() } : {}),
      })
      if (result.redirectUrl) { setNotice('Ознакомительный доступ оформлен. Обновите подписку.'); await refresh(); return }
      if (!result.confirmationUrl) throw new Error('Ссылка на счёт не получена')
      webApp.openInvoice(result.confirmationUrl, status => {
        if (status === 'paid') { setNotice('Оплата подтверждена. Подписка обновится после выдачи.'); void refresh() }
        else if (status === 'failed') setError('Оплата не завершилась. Попробуйте ещё раз.')
      })
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
  async function spin() {
    if (demo) { setNotice('Это демонстрация. Розыгрыш не выполняется.'); return }
    setSpinning(true); setError(''); setSpinResult(null)
    try {
      const result = await request<OpenBoxResponse>('/api/bonus-box', { spinId: crypto.randomUUID() })
      setSpinResult(result)
      setBonusData(await request<BonusBoxOverview>('/api/bonus-box'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Розыгрыш временно недоступен')
      try { setBonusData(await request<BonusBoxOverview>('/api/bonus-box')) } catch { /* обзор обновим при следующем открытии */ }
    }
    finally { setSpinning(false) }
  }
  async function claimMission(mission: BonusBoxMissionView) {
    if (demo) { setNotice('Это демонстрация. Награда не начисляется.'); return }
    setBusy(true); setError('')
    try {
      await request(`/api/bonus-box/missions/${mission.id}/claim`, {})
      setNotice(`Награда получена: +${mission.rewardAttempts} попыток.`)
      setBonusData(await request<BonusBoxOverview>('/api/bonus-box'))
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось получить награду') }
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
    <div className={styles.wrap}>
      <header className={styles.header}><div className={styles.brand}><BrandLogo className={styles.logo} /><span>{brandName}<small>Личный кабинет</small></span></div>
        <button aria-label="Обновить данные" className={styles.iconButton} onClick={() => void refresh()} disabled={busy}><RefreshCw size={19} /></button></header>
      {demo && <div className={styles.demo}>Предпросмотр · вымышленные данные</div>}
      {error && <div role="alert" className={styles.alert}>{error} {!data && <button onClick={() => window.location.reload()}>Повторить</button>}</div>}
      {notice && <div role="status" className={styles.notice}>{notice}</div>}
      {!data && !error && <div className={styles.empty}><LoaderCircle className="animate-spin" />Входим в ваш кабинет…</div>}
      {data && <>
        {data.warning && <div className={styles.alert}>{data.warning}</div>}
        {tab === 'home' && <>
          {bannerUrl && <Image className={styles.banner} src={bannerUrl} alt="" width={1200} height={450} unoptimized referrerPolicy="no-referrer" />}
          <div className={styles.intro}><span>Кабинет / {data.name}</span><h1>Ваш доступ<br /><em>в одном месте.</em></h1></div>
          <section className={styles.pass} aria-label="Моя подписка"><div className={styles.passTop}><span className={styles.pill}><span className={sub?.usable ? styles.dot : styles.offDot} />{sub?.title || 'Доступ ещё не подключён'}</span><Shield size={28} /></div>
            <div className={styles.passBody}><small>ВАШ ДОСТУП</small><h2>{sub?.planName || brandName}</h2><p>{sub ? `До ${date}` : 'Начните с выбора подписки'}</p></div>
            <div className={styles.passBottom}><div><strong>{sub?.daysLeft == null ? (sub ? '∞' : '0') : Math.max(0, sub.daysLeft)}</strong><span>дней доступа</span></div><div><strong>{data.deviceCount}<i> / {sub?.deviceLimit ?? '∞'}</i></strong><span>устройств в кабинете</span></div></div>
          </section>
          <button className={styles.primary} onClick={() => navigate(sub?.usable ? 'connect' : 'plans')}><Wifi size={20} />{sub?.usable ? 'Подключить VPN' : 'Посмотреть тарифы'}<ArrowUpRight size={20} /></button>
          <div className={styles.quick}><button onClick={() => navigate('plans')}><Wallet /><b>Тарифы</b><span>Условия из кабинета</span></button><button onClick={() => navigate('devices')}><Smartphone /><b>Устройства</b><span>Всё под контролем</span></button></div>
          {data.referrals && <button className={styles.invite} onClick={() => navigate('referrals')}><Gift size={27} /><span><b>Хорошим делятся</b><small>Приглашайте друзей и получайте дни VPN</small></span><ArrowUpRight size={20} /></button>}
          <p className={styles.footnote}>Подписка общая с вашим личным кабинетом.<br />Статус подключения проверяется в VPN-приложении.</p>
        </>}
        {tab === 'menu' && <section><Heading eyebrow="ВСЁ УПРАВЛЕНИЕ" title="Меню кабинета" description="Все разделы сервиса — как в личном кабинете на сайте." />
          <div className={styles.quick}>{menuItems.map(item => <button key={item.id} onClick={() => navigate(item.id)}>
            <item.icon /><b>{item.title}{item.badge ? ` · ${item.badge}` : ''}</b><span>{item.hint}</span></button>)}</div>
        </section>}
        {tab === 'plans' && <section><Heading eyebrow="ВАШ ДОСТУП" title="Тарифы и подписка" description="Тарифы и условия обновляются из личного кабинета." />
          {data.plans.length === 0 && <div className={styles.empty}>Для вашего аккаунта сейчас нет доступных тарифов.</div>}
          {data.plans.map(plan => <article className={styles.plan} key={plan.id}><div><small>{plan.current ? 'ВАШ ТАРИФ' : brandName}</small>
              <h2>{plan.name}</h2><p>{plan.unlimited ? 'Без ограничения срока' : `${plan.days} дней`} · {plan.unlimitedDevices ? 'безлимит устройств' : plan.deviceAddonEnabled ? `${plan.devices}–${plan.maxDevices} устройств` : `${plan.initialDevices} устройств`}{plan.trafficLimitGb == null ? ' · безлимит трафика' : ` · ${plan.trafficLimitGb} ГБ`}</p>
              {plan.description && <p>{plan.description}</p>}
              {plan.isPlanSwitch && <p className={styles.planNote}>При смене тарифа начнётся новый срок. Оставшиеся дни текущего тарифа не переносятся.</p>}
            </div>
            {!plan.isPromo && <div className={styles.rublePrice}><span>Стоимость в кабинете</span><strong>{rub.format(plan.priceKopecks / 100)}</strong></div>}
            {!plan.isPromo && <>
              <button className={styles.sitePay} onClick={() => openBrowserCheckout(plan)}>Открыть кабинет в браузере<ArrowUpRight size={18} /></button>
              {methodsForPlan(plan.id).length > 0 && <button className={styles.sitePay} onClick={() => setCheckoutPlanId(plan.id)}><CreditCard size={18} />Оплата в Telegram<ArrowUpRight size={18} /></button>}
            </>}
            {data.starsEnabled && data.starsRateKopecks && <div className={styles.planBuy}>
              {plan.deviceAddonEnabled && !plan.unlimitedDevices && <label>Количество устройств
                <select value={selectedLimits[plan.id] ?? plan.initialDevices} onChange={e => setSelectedLimits(previous => ({ ...previous, [plan.id]: Number(e.target.value) }))}>
                  {Array.from({ length: plan.maxDevices - plan.devices + 1 }, (_, index) => plan.devices + index).map(limit =>
                    <option key={limit} value={limit}>{limit}</option>)}
                </select></label>}
              <div className={styles.planPrice}>{plan.isPromo ? 'Бесплатно' : `${Math.ceil((plan.priceKopecks + Math.max(0, (selectedLimits[plan.id] ?? plan.initialDevices) - plan.devices) * plan.extraDevicePriceKopecks) / data.starsRateKopecks)} Stars`}</div>
              {!plan.isPromo && <input className={styles.linkInput} aria-label={`Промокод для ${plan.name}`} placeholder="Промокод, если есть" value={promoCodes[plan.id] ?? ''} onChange={e => setPromoCodes(previous => ({ ...previous, [plan.id]: e.target.value }))} />}
              <p>Курс: 1 Star = {(data.starsRateKopecks / 100).toLocaleString('ru-RU')} ₽. Это цена до скидки. Итоговая сумма появится в счёте; подписка продлится по правилам кабинета.</p>
              <button className={styles.primary} disabled={busy} onClick={() => void buyPlan(plan)}>{plan.isPromo ? 'Получить доступ' : 'Оплатить Stars'}<ArrowUpRight size={18} /></button>
            </div>}
            </article>)}
        </section>}
        {tab === 'billing' && <section><Heading eyebrow="ОПЛАТЫ" title="Платежи" description="История оплат и автопродление — как в кабинете на сайте." />
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
        {tab === 'bonus' && <section><Heading eyebrow="ПОДАРКИ" title="Бонусы" description="Колесо подарков, задания и промокоды — те же, что в кабинете." />
          {bonusOff && <div className={styles.empty}>Бонусная программа сейчас отключена. Загляните позже.</div>}
          {demo && <div className={styles.card}><div className={styles.bonusHero}><Sparkles size={40} /><h2>Колесо подарков</h2><p>2 попытки · демонстрация</p></div>
            <button className={styles.primary} onClick={() => setNotice('Это демонстрация. Розыгрыш не выполняется.')}>Крутить колесо<ArrowUpRight size={18} /></button></div>}
          {!demo && !bonusOff && !bonusData && !busy && <div className={styles.empty}>Не удалось загрузить бонусы.</div>}
          {!demo && bonusData && <>
            <article className={styles.plan}><div className={styles.bonusHero}><Sparkles size={40} />
              <h2>Колесо подарков</h2>
              <p>{bonusData.attemptsCount > 0 ? `Доступно попыток: ${bonusData.attemptsCount}` : bonusData.canOpenReason || 'Новые попытки — за покупки, задания и друзей'}</p></div>
              {spinResult && <div className={styles.prizeCard}><b>{rarityEmoji[spinResult.prize.rarity] ?? '🎁'} {spinResult.prize.title}</b>
                {spinResult.prize.description && <p>{spinResult.prize.description}</p>}
                {spinResult.promoCode && <button className={styles.secondary} onClick={() => void copyCode(spinResult.promoCode!)}>{copiedCode === spinResult.promoCode ? <Check size={17} /> : <Copy size={17} />}{copiedCode === spinResult.promoCode ? 'Промокод скопирован' : `Промокод: ${spinResult.promoCode}`}</button>}
                <small>Осталось попыток: {spinResult.remainingAttempts}</small></div>}
              <button className={styles.primary} disabled={spinning || bonusData.attemptsCount === 0} onClick={() => void spin()}>
                {spinning ? <LoaderCircle className="animate-spin" size={19} /> : <Trophy size={19} />}{spinning ? 'Крутим…' : bonusData.attemptsCount > 0 ? `Крутить колесо · ${bonusData.attemptsCount}` : 'Пока нет попыток'}<ArrowUpRight size={18} /></button>
            </article>
            {bonusData.activePromoRewards.length > 0 && <div className={styles.history}><h2>Ваши промокоды</h2>
              {bonusData.activePromoRewards.map(reward => <div className={styles.order} key={reward.id}><span><b>{reward.code}</b><small>{reward.prizeTitle}</small></span><span><b>−{reward.discountPercent}%</b><small>{reward.expiresAt ? `до ${new Date(reward.expiresAt).toLocaleDateString('ru-RU')}` : 'бессрочно'}</small></span></div>)}</div>}
            {bonusData.missions.length > 0 && <div className={styles.history}><h2>Задания</h2>
              {bonusData.missions.map(mission => <div className={styles.order} key={mission.id}><span><b>{mission.title}</b><small>{mission.completed ? 'Выполнено' : `Прогресс: ${Math.min(mission.value, mission.target)} из ${mission.target}`} · награда {mission.rewardAttempts} попыток</small></span>
                {mission.completed && !mission.claimed && <button className={styles.claimButton} disabled={busy} onClick={() => void claimMission(mission)}>Забрать</button>}
                {mission.claimed && <span><small>✅ Получено</small></span>}</div>)}</div>}
            {bonusData.openings.length > 0 && <div className={styles.history}><h2>Последние призы</h2>
              {bonusData.openings.slice(0, 5).map(opening => <div className={styles.order} key={opening.id}><span><b>{rarityEmoji[opening.prize.rarity] ?? '🎁'} {opening.prize.title}</b><small>{new Date(opening.createdAt).toLocaleDateString('ru-RU')}</small></span></div>)}</div>}
            {data.referrals && <button className={styles.invite} onClick={() => navigate('referrals')}><Users size={26} /><span><b>Попытки за друзей</b><small>Приглашайте друзей и получайте бонусы вместе</small></span><ArrowUpRight size={20} /></button>}
          </>}
        </section>}
        {tab === 'notifications' && <section><Heading eyebrow="СОБЫТИЯ" title="Уведомления" description="Важные события подписки и сообщения сервиса." />
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
        {tab === 'settings' && <section><Heading eyebrow="ВАШ ПРОФИЛЬ" title="Настройки" description="Каналы уведомлений и данные аккаунта." />
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
        {tab === 'admin' && <section><Heading eyebrow="СЕРВИС" title="Управление" description="Статистика сервиса и вход в панель администратора." />
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
        {tab === 'devices' && <section><Heading eyebrow="ПОДКЛЮЧЕНИЯ" title="Ваши устройства" description="Одно подключение для всех ваших экранов." />
          {demo ? <div className={styles.card}><div className={styles.device}><Smartphone /><span><b>iPhone</b><small>iOS · Rabbit Hole</small></span><Check /></div><div className={styles.device}><Smartphone /><span><b>MacBook</b><small>macOS · Rabbit Hole</small></span><Check /></div></div> : <DevicesList deviceLimit={sub?.deviceLimit} />}
          <button id="add-device-guide" className={styles.primary} onClick={() => navigate('connect')}>Подключить устройство<ArrowUpRight size={20} /></button></section>}
        {tab === 'connect' && <section><Heading eyebrow="БЫСТРЫЙ СТАРТ" title="Подключить VPN" description="Установите приложение, добавьте подписку и включите подключение." />
          {demo ? <div className={styles.card}><p>1. Установите VPN-клиент</p><p>2. Добавьте подписку {brandName}</p><p>3. Включите VPN в приложении</p><small>Персональная ссылка появится после входа.</small></div>
            : subscriptionUrl ? <KeysCard subscriptionUrl={subscriptionUrl} supportEnabled={data.support} deviceLimit={sub?.deviceLimit} /> : !busy && <div className={styles.empty}>Ссылка пока недоступна. Проверьте состояние подписки.</div>}</section>}
        {tab === 'referrals' && <section><Heading eyebrow="ПРИГЛАШАЙТЕ ДРУЗЕЙ" title="Больше дней вместе" description={referrals?.condition || 'Новый пользователь приходит по вашей ссылке и вступает в канал. Условия бонуса задаёт сервис.'} />
          <div className={styles.refHero}><Gift size={48} /><h2>Ваша рекомендация.<br />Наше спасибо.</h2><p>Бонусы поступают на ту же подписку, которой вы уже пользуетесь.</p></div>
          <div className={styles.quick}><div><strong>{referrals?.invited ?? 0}</strong><span>приглашено</span></div><div><strong>{referrals?.claimed ?? 0}</strong><span>бонусов подтверждено</span></div></div>
          {demo ? <div className={styles.notice}>Размер бонуса и канал ожидают настройки.</div> : referrals && <>
            <input className={styles.linkInput} aria-label="Реферальная ссылка" readOnly value={referrals.url} />
            <button className={styles.primary} disabled={!referrals.enabled} onClick={() => void copy()}>{copied ? <Check size={18} /> : <Copy size={18} />}{copied ? 'Ссылка скопирована' : 'Копировать приглашение'}</button>
            {referrals.channelUrl && <a className={styles.secondary} href={referrals.channelUrl} target="_blank" rel="noreferrer">Открыть канал<ArrowUpRight size={18} /></a>}
            {referrals.eligible && <button className={styles.secondary} disabled={busy || Boolean(referrals.claimedAt)} onClick={() => void claim()}>{referrals.claimedAt ? 'Бонус подтверждён' : 'Я вступил, проверить'}</button>}
          </>}
        </section>}
        {tab === 'support' && <section><Heading eyebrow="МЫ НА СВЯЗИ" title="Поможем разобраться" description="Опишите, что произошло. История обращений общая с кабинетом." />
          {demo ? <DemoSupport /> : tickets && <SupportPanelDynamic mode="user" initialTickets={tickets} />}</section>}
        {busy && <div role="status" className={styles.loading}><LoaderCircle className="animate-spin" size={18} />Загрузка…</div>}
        {checkoutPlan && methodsForPlan(checkoutPlan.id).length > 0 && <div className={styles.sheetBackdrop} onClick={() => setCheckoutPlanId(null)}>
          <section className={styles.sheet} role="dialog" aria-modal="true" aria-label="Оплата подписки" onClick={event => event.stopPropagation()}>
            <button className={styles.sheetClose} aria-label="Закрыть оплату" onClick={() => setCheckoutPlanId(null)}><X size={18} /></button>
            <small className={styles.sheetEyebrow}>{brandName} · Заказ</small>
            <h2>{checkoutPlan.name}</h2>
            <p className={styles.sheetSub}>{checkoutPlan.unlimited ? 'Без ограничения срока' : `${checkoutPlan.days} дней`} · {checkoutPlan.unlimitedDevices ? 'безлимит устройств' : `${checkoutLimit} устройств`}{checkoutPlan.trafficLimitGb == null ? ' · безлимит трафика' : ` · ${checkoutPlan.trafficLimitGb} ГБ`}</p>
            {checkoutPlan.deviceAddonEnabled && !checkoutPlan.unlimitedDevices && <label className={styles.sheetField}>Количество устройств
              <select value={checkoutLimit} onChange={e => setSelectedLimits(previous => ({ ...previous, [checkoutPlan.id]: Number(e.target.value) }))}>
                {Array.from({ length: checkoutPlan.maxDevices - checkoutPlan.devices + 1 }, (_, index) => checkoutPlan.devices + index).map(limit =>
                  <option key={limit} value={limit}>{limit}</option>)}
              </select></label>}
            <input className={styles.linkInput} aria-label="Промокод" placeholder="Промокод, если есть" value={promoCodes[checkoutPlan.id] ?? ''}
              onChange={e => setPromoCodes(previous => ({ ...previous, [checkoutPlan.id]: e.target.value }))} />
            <div className={styles.sheetLines}>
              <div className={styles.sheetLine}><span>{checkoutPlan.name} · {checkoutPlan.unlimited ? 'бессрочно' : `${checkoutPlan.days} дней`}</span><b>{rub.format(checkoutPlan.priceKopecks / 100)}</b></div>
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
        <nav className={styles.nav} aria-label="Разделы приложения">{tabs.map(item => <button key={item.id} aria-current={tab === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><item.icon size={21} /><span>{item.label}</span></button>)}</nav>
      </>}
    </div>
  </main>
}

function Heading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className={styles.heading}><small>{eyebrow}</small><h1>{title}</h1><p>{description}</p></div>
}
function DemoSupport() {
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  function submit(event: FormEvent) { event.preventDefault(); setSent(true) }
  return <form className={styles.card} onSubmit={submit}><label htmlFor="support-demo">Ваш вопрос</label><textarea id="support-demo" value={message} onChange={e => setMessage(e.target.value)} placeholder="Например, не подключается VPN на iPhone" minLength={5} required /><button className={styles.primary}>Проверить форму</button>{sent && <p role="status">Демо: обращение не отправлено.</p>}</form>
}
