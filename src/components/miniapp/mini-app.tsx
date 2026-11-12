'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { ArrowUpRight, Check, Copy, Gift, Headphones, Home, LoaderCircle, RefreshCw, Shield, Smartphone, Wallet, Wifi } from 'lucide-react'
import { DevicesList } from '@/components/dashboard/devices-list'
import { KeysCard } from '@/components/dashboard/keys-card'
import { SupportPanelDynamic } from '@/components/support/support-panel-dynamic'
import type { SupportTicket } from '@/components/support/support-panel-model'
import { getTelegramLaunchData } from '@/lib/telegram-miniapp-client'
import { miniAppDemo, type MiniAppOverview } from '@/lib/miniapp/model'
import styles from './mini-app.module.css'

type Tab = 'home' | 'plans' | 'devices' | 'referrals' | 'support' | 'connect'
type Referrals = { url: string; condition: string; invited: number; claimed: number; enabled: boolean; channelUrl: string | null; eligible: boolean; claimedAt: string | null }
const tabs = [{ id: 'home', label: 'Главная', icon: Home }, { id: 'plans', label: 'Подписка', icon: Wallet },
  { id: 'devices', label: 'Устройства', icon: Smartphone }, { id: 'referrals', label: 'Друзья', icon: Gift }, { id: 'support', label: 'Помощь', icon: Headphones }] as const

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
  const [subscriptionUrl, setSubscriptionUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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
          const initial = new URLSearchParams(window.location.search).get('tab')
          if (tabs.some(item => item.id === initial) || initial === 'connect') setTab(initial as Tab)
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
  const sub = data?.subscription
  const date = sub?.expiresAt ? new Date(sub.expiresAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : 'Без ограничения срока'
  const visibleTabs = tabs.filter(item => (item.id !== 'support' || data?.support) && (item.id !== 'referrals' || data?.referrals))
  return <main className={styles.app}>
    <div className={styles.wrap}>
      <header className={styles.header}><div className={styles.brand}><span className={styles.logo}><Shield size={22} /></span><span>Alekseev<span className={styles.brandAccent}>VP</span><small>Личный доступ</small></span></div>
        <button aria-label="Обновить данные" className={styles.iconButton} onClick={() => void refresh()} disabled={busy}><RefreshCw size={19} /></button></header>
      {demo && <div className={styles.demo}>Предпросмотр · вымышленные данные</div>}
      {error && <div role="alert" className={styles.alert}>{error} {!data && <button onClick={() => window.location.reload()}>Повторить</button>}</div>}
      {notice && <div role="status" className={styles.notice}>{notice}</div>}
      {!data && !error && <div className={styles.empty}><LoaderCircle className="animate-spin" />Входим в ваш кабинет…</div>}
      {data && <>
        {data.warning && <div className={styles.alert}>{data.warning}</div>}
        {tab === 'home' && <>
          <div className={styles.intro}><span>Рады видеть, {data.name}</span><h1>Интернет.<br /><em>Без лишних границ.</em></h1></div>
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
            </article>)}
          <p className={styles.footnote}>Раздел показывает условия без оформления заказа. Оплата в рублях через ЮKassa работает на самостоятельном сайте кабинета. После изменения подписки обновите данные здесь.</p>
        </section>}
        {tab === 'devices' && <section><Heading eyebrow="ПОДКЛЮЧЕНИЯ" title="Ваши устройства" description="Одно подключение для всех ваших экранов." />
          {demo ? <div className={styles.card}><div className={styles.device}><Smartphone /><span><b>iPhone</b><small>iOS · Rabbit Hole</small></span><Check /></div><div className={styles.device}><Smartphone /><span><b>MacBook</b><small>macOS · Rabbit Hole</small></span><Check /></div></div> : <DevicesList embedded deviceLimit={sub?.deviceLimit} />}
          <button className={styles.primary} onClick={() => navigate('connect')}>Подключить устройство<ArrowUpRight size={20} /></button></section>}
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
