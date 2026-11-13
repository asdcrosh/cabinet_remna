'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { ArrowUpRight, Check, Copy, CreditCard, Gift, Headphones, Home, LoaderCircle, Lock, RefreshCw, Shield, Smartphone, Wallet, Wifi, X } from 'lucide-react'
import { DevicesList } from '@/components/dashboard/devices-list'
import { KeysCard } from '@/components/dashboard/keys-card'
import { SupportPanelDynamic } from '@/components/support/support-panel-dynamic'
import type { SupportTicket } from '@/components/support/support-panel-model'
import { getTelegramLaunchData } from '@/lib/telegram-miniapp-client'
import { miniAppDestination } from '@/lib/miniapp/destination'
import { miniAppDemo, type MiniAppOverview } from '@/lib/miniapp/model'
import styles from './mini-app.module.css'

type Tab = 'home' | 'plans' | 'devices' | 'referrals' | 'support' | 'connect'
type Referrals = { url: string; condition: string; invited: number; claimed: number; enabled: boolean; channelUrl: string | null; eligible: boolean; claimedAt: string | null }
type PaymentItem = { id: string; status: string; amountKopecks: number; createdAt: string; provider: string; plan: { name: string } | null }
const tabs = [{ id: 'home', label: 'Главная', icon: Home }, { id: 'plans', label: 'Подписка', icon: Wallet },
  { id: 'devices', label: 'Устройства', icon: Smartphone }, { id: 'referrals', label: 'Друзья', icon: Gift }, { id: 'support', label: 'Помощь', icon: Headphones }] as const
const rub = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 })

async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(25000) })
  const data = await response.json()
  if (!response.ok || data.error) throw new Error(data.error || 'Не удалось получить данные')
  return data as T
}

export function MiniApp({ demo = false }: { demo?: boolean }) {
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
        const result = await request<MiniAppOverview>('/api/miniapp/overview')
        if (!cancelled) {
          setData(result)
          const params = new URLSearchParams(window.location.search)
          const initial = params.get('tab')
          if (tabs.some(item => item.id === initial) || initial === 'connect') setTab(initial as Tab)
          else if (initial && initial !== 'home') window.location.replace(miniAppDestination(initial))
          // Возврат со страницы ЮKassa: оплата прошла внутри Telegram, подтверждаем здесь же.
          if (params.get('paid') === '1') setNotice('Оплата получена. Подписка обновится автоматически — обычно это занимает меньше минуты.')
          const requestedPlan = params.get('plan')
          if (requestedPlan && result.plans.some(item => item.id === requestedPlan && !item.isPromo)) setCheckoutPlanId(requestedPlan)
          if (params.get('paid') || requestedPlan) {
            for (const key of ['paid', 'payment', 'plan']) params.delete(key)
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
        if (tab === 'plans') { const value = await request<{ payments: PaymentItem[] }>('/api/payment/history'); if (!cancelled) setPayments(value.payments) }
        if (tab === 'connect') { const value = await request<{ keys: { subscriptionUrl: string } | null }>('/api/subscription/keys'); if (!cancelled) setSubscriptionUrl(value.keys?.subscriptionUrl ?? null) }
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
  function navigate(next: Tab) { setTab(next); setError(''); setNotice(''); setCopied(false) }
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
  async function payByCard(plan: MiniAppOverview['plans'][number]) {
    if (demo) { setNotice('Это демонстрация. Счёт не создаётся.'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await request<{ confirmationUrl?: string; redirectUrl?: string }>('/api/miniapp/checkout', {
        planId: plan.id, purchaseType: 'SUBSCRIPTION', provider: 'YOOKASSA',
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
  const sub = data?.subscription
  const checkoutPlan = data?.plans.find(item => item.id === checkoutPlanId && !item.isPromo) ?? null
  const checkoutLimit = checkoutPlan ? selectedLimits[checkoutPlan.id] ?? checkoutPlan.initialDevices : 0
  const checkoutExtraKopecks = checkoutPlan ? Math.max(0, checkoutLimit - checkoutPlan.devices) * checkoutPlan.extraDevicePriceKopecks : 0
  const checkoutTotalKopecks = checkoutPlan ? checkoutPlan.priceKopecks + checkoutExtraKopecks : 0
  const date = sub?.expiresAt ? new Date(sub.expiresAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : 'Без ограничения срока'
  const visibleTabs = tabs.filter(item => (item.id !== 'support' || data?.support) && (item.id !== 'referrals' || data?.referrals))
  return <main className={styles.app}>
    <div className={styles.wrap}>
      <header className={styles.header}><div className={styles.brand}><span className={styles.logo}>VP</span><span>Alekseev<span className={styles.brandAccent}>VP</span><small>Личный кабинет</small></span></div>
        <button aria-label="Обновить данные" className={styles.iconButton} onClick={() => void refresh()} disabled={busy}><RefreshCw size={19} /></button></header>
      {demo && <div className={styles.demo}>Предпросмотр · вымышленные данные</div>}
      {error && <div role="alert" className={styles.alert}>{error} {!data && <button onClick={() => window.location.reload()}>Повторить</button>}</div>}
      {notice && <div role="status" className={styles.notice}>{notice}</div>}
      {!data && !error && <div className={styles.empty}><LoaderCircle className="animate-spin" />Входим в ваш кабинет…</div>}
      {data && <>
        {data.warning && <div className={styles.alert}>{data.warning}</div>}
        {tab === 'home' && <>
          <div className={styles.banner} aria-hidden="true" />
          <div className={styles.intro}><span>Кабинет / {data.name}</span><h1>Ваш доступ<br /><em>в одном месте.</em></h1></div>
          <section className={styles.pass} aria-label="Моя подписка"><div className={styles.passTop}><span className={styles.pill}><span className={sub?.usable ? styles.dot : styles.offDot} />{sub?.title || 'Доступ ещё не подключён'}</span><Shield size={28} /></div>
            <div className={styles.passBody}><small>ВАШ ДОСТУП</small><h2>{sub?.planName || 'AlekseevVP'}</h2><p>{sub ? `До ${date}` : 'Начните с выбора подписки'}</p></div>
            <div className={styles.passBottom}><div><strong>{sub?.daysLeft == null ? (sub ? '∞' : '0') : Math.max(0, sub.daysLeft)}</strong><span>дней доступа</span></div><div><strong>{data.deviceCount}<i> / {sub?.deviceLimit ?? '∞'}</i></strong><span>устройств в кабинете</span></div></div>
          </section>
          <button className={styles.primary} onClick={() => navigate(sub?.usable ? 'connect' : 'plans')}><Wifi size={20} />{sub?.usable ? 'Подключить VPN' : 'Посмотреть тарифы'}<ArrowUpRight size={20} /></button>
          <div className={styles.quick}><button onClick={() => navigate('plans')}><Wallet /><b>Тарифы</b><span>Условия из кабинета</span></button><button onClick={() => navigate('devices')}><Smartphone /><b>Устройства</b><span>Всё под контролем</span></button></div>
          {data.referrals && <button className={styles.invite} onClick={() => navigate('referrals')}><Gift size={27} /><span><b>Хорошим делятся</b><small>Приглашайте друзей и получайте дни VPN</small></span><ArrowUpRight size={20} /></button>}
          <p className={styles.footnote}>Подписка общая с вашим личным кабинетом.<br />Статус подключения проверяется в VPN-приложении.</p>
        </>}
        {tab === 'plans' && <section><Heading eyebrow="ВАШ ДОСТУП" title="Тарифы и подписка" description="Тарифы и условия обновляются из личного кабинета." />
          {data.plans.length === 0 && <div className={styles.empty}>Для вашего аккаунта сейчас нет доступных тарифов.</div>}
          {data.plans.map(plan => <article className={styles.plan} key={plan.id}><div><small>{plan.current ? 'ВАШ ТАРИФ' : 'ALEKSEEVVP'}</small>
              <h2>{plan.name}</h2><p>{plan.unlimited ? 'Без ограничения срока' : `${plan.days} дней`} · {plan.unlimitedDevices ? 'безлимит устройств' : plan.deviceAddonEnabled ? `${plan.devices}–${plan.maxDevices} устройств` : `${plan.initialDevices} устройств`}{plan.trafficLimitGb == null ? ' · безлимит трафика' : ` · ${plan.trafficLimitGb} ГБ`}</p>
              {plan.description && <p>{plan.description}</p>}
              {plan.isPlanSwitch && <p className={styles.planNote}>При смене тарифа начнётся новый срок. Оставшиеся дни текущего тарифа не переносятся.</p>}
            </div>
            {!plan.isPromo && <div className={styles.rublePrice}><span>Стоимость в кабинете</span><strong>{rub.format(plan.priceKopecks / 100)}</strong></div>}
            {!plan.isPromo && <button className={styles.sitePay} onClick={() => setCheckoutPlanId(plan.id)}><CreditCard size={18} />Оплатить картой или СБП<ArrowUpRight size={18} /></button>}
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
          <p className={styles.footnote}>Оплата картой и по СБП проходит внутри Telegram на защищённой странице ЮKassa. Итоговая сумма со скидками появится до оплаты.</p>
          <div className={styles.history}><h2>История платежей</h2>{payments === null && <p>Загружаем платежи…</p>}{payments?.length === 0 && <p>Платежей пока нет.</p>}{payments?.slice(0, 5).map(payment => <div className={styles.order} key={payment.id}><span><b>{payment.plan?.name || 'Подписка'}</b><small>{new Date(payment.createdAt).toLocaleDateString('ru-RU')} · {payment.provider}</small></span><span><b>{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(payment.amountKopecks / 100)}</b><small>{payment.status === 'SUCCEEDED' ? 'Оплачено' : payment.status === 'PENDING' ? 'Ожидает оплаты' : 'Не оплачено'}</small></span></div>)}</div>
        </section>}
        {tab === 'devices' && <section><Heading eyebrow="ПОДКЛЮЧЕНИЯ" title="Ваши устройства" description="Одно подключение для всех ваших экранов." />
          {demo ? <div className={styles.card}><div className={styles.device}><Smartphone /><span><b>iPhone</b><small>iOS · Rabbit Hole</small></span><Check /></div><div className={styles.device}><Smartphone /><span><b>MacBook</b><small>macOS · Rabbit Hole</small></span><Check /></div></div> : <DevicesList deviceLimit={sub?.deviceLimit} />}
          <button id="add-device-guide" className={styles.primary} onClick={() => navigate('connect')}>Подключить устройство<ArrowUpRight size={20} /></button></section>}
        {tab === 'connect' && <section><Heading eyebrow="БЫСТРЫЙ СТАРТ" title="Подключить VPN" description="Установите приложение, добавьте подписку и включите подключение." />
          {demo ? <div className={styles.card}><p>1. Установите VPN-клиент</p><p>2. Добавьте подписку AlekseevVP</p><p>3. Включите VPN в приложении</p><small>Персональная ссылка появится после входа.</small></div>
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
        {checkoutPlan && <div className={styles.sheetBackdrop} onClick={() => setCheckoutPlanId(null)}>
          <section className={styles.sheet} role="dialog" aria-modal="true" aria-label="Оплата подписки" onClick={event => event.stopPropagation()}>
            <button className={styles.sheetClose} aria-label="Закрыть оплату" onClick={() => setCheckoutPlanId(null)}><X size={18} /></button>
            <small className={styles.sheetEyebrow}>AlekseevVP · Заказ</small>
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
            <button className={styles.primary} disabled={busy} onClick={() => void payByCard(checkoutPlan)}><Lock size={18} />Перейти к оплате<ArrowUpRight size={18} /></button>
            <p className={styles.sheetSecure}>Откроется защищённая страница ЮKassa прямо здесь, в Telegram — картой или по СБП. Промокод и скидки применятся автоматически перед оплатой.</p>
          </section>
        </div>}
        <nav className={styles.nav} aria-label="Разделы приложения">{visibleTabs.map(item => <button key={item.id} aria-current={tab === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><item.icon size={21} /><span>{item.label}</span></button>)}</nav>
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
