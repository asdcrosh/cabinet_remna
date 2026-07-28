import Link from 'next/link'
import {
  ArrowUpRight,
  CalendarClock,
  CircleCheck,
  Gift,
  Sparkles,
  Tag,
  TicketPercent,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { AdminPageShell } from '@/components/admin/admin-page-shell'
import { AdminFilterBar, AdminFilterField } from '@/components/admin/admin-filter-bar'
import {
  filterAdminCampaigns,
  getAdminCampaignStatus,
  sortAdminCampaigns,
  type AdminCampaignRow,
  type AdminCampaignStatus,
  type AdminCampaignType,
} from '@/lib/admin-campaigns'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Кампании - Админка' }

const typeMeta: Record<AdminCampaignType, { label: string; icon: LucideIcon }> = {
  PROMO: { label: 'Промокод', icon: Tag },
  REFERRAL: { label: 'Рефералы', icon: UsersRound },
  WELCOME: { label: 'Приветственный бонус', icon: Gift },
  OFFER: { label: 'Оффер', icon: Sparkles },
  BONUS_EVENT: { label: 'Бонусное событие', icon: TicketPercent },
}

const statusMeta: Record<AdminCampaignStatus, { label: string; className: string }> = {
  ACTIVE: { label: 'Идёт сейчас', className: 'text-emerald-700 dark:text-emerald-300' },
  SCHEDULED: { label: 'Запланировано', className: 'text-cyan-700 dark:text-cyan-300' },
  ENDED: { label: 'Завершено', className: 'text-slate-500 dark:text-slate-400' },
  DISABLED: { label: 'Выключено', className: 'text-amber-700 dark:text-amber-300' },
}

export default async function AdminCampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string }>
}) {
  await requireAdminPage()
  const params = await searchParams
  const now = new Date()
  const [
    promoCodes,
    referralSettings,
    welcomeBonus,
    offers,
    bonusEvents,
    features,
  ] = await Promise.all([
    prisma.promoCode.findMany({
      orderBy: [{ isActive: 'desc' }, { startsAt: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        code: true,
        discountPercent: true,
        audience: true,
        isActive: true,
        startsAt: true,
        expiresAt: true,
        maxUses: true,
        _count: { select: { redemptions: true } },
      },
    }),
    prisma.referralSetting.findUnique({ where: { id: 'default' } }),
    prisma.welcomeBonusSetting.findUnique({
      where: { id: 'default' },
      include: {
        trialPlan: { select: { name: true, durationDays: true } },
        promoCode: { select: { code: true, discountPercent: true } },
      },
    }),
    prisma.personalOfferSetting.findMany({
      orderBy: [{ priority: 'asc' }, { scenario: 'asc' }],
      select: {
        id: true,
        scenario: true,
        enabled: true,
        title: true,
        description: true,
        priority: true,
      },
    }),
    prisma.bonusBoxEvent.findMany({
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        description: true,
        isActive: true,
        startsAt: true,
        endsAt: true,
        attemptsPerUser: true,
        maxClaims: true,
        claimsCount: true,
      },
    }),
    prisma.featureSetting.findUnique({ where: { id: 'default' } }),
  ])

  const campaigns: AdminCampaignRow[] = [
    ...promoCodes.map((promo): AdminCampaignRow => ({
      id: `promo:${promo.id}`,
      type: 'PROMO',
      title: promo.code,
      description: `${promo.discountPercent}% · ${promoAudienceLabel(promo.audience)}`,
      enabled: promo.isActive,
      startsAt: promo.startsAt,
      endsAt: promo.expiresAt,
      href: '/dashboard/admin/promo-codes',
      metric: promo.maxUses
        ? `${promo._count.redemptions}/${promo.maxUses} применений`
        : `${promo._count.redemptions} применений`,
    })),
    ...(referralSettings ? [
      {
        id: 'referral:default',
        type: 'REFERRAL' as const,
        title: 'Стандартная реферальная программа',
        description: '+7 дней пригласившему после оплаты приглашённого',
        enabled: features?.referrals ?? true,
        startsAt: null,
        endsAt: null,
        href: '/dashboard/admin/referrals',
        metric: referralSettings.promotionEndsAt
          ? 'Вернётся после акции'
          : 'Основные условия',
      },
      ...(referralSettings.promotionEndsAt ? [{
        id: 'referral:promotion',
        type: 'REFERRAL' as const,
        title: 'Акционные условия рефералов',
        description: `${referralSettings.referrerBonusDays} дн. пригласившему · ${referralSettings.referredBonusDays} дн. приглашённому`,
        enabled: features?.referrals ?? true,
        startsAt: null,
        endsAt: referralSettings.promotionEndsAt,
        href: '/dashboard/admin/referrals',
        metric: referralSettings.maxRewardsPerReferrer > 0
          ? `Лимит ${referralSettings.maxRewardsPerReferrer}`
          : 'Временные условия',
      }] : []),
    ] : []),
    ...(welcomeBonus ? [{
      id: 'welcome:default',
      type: 'WELCOME' as const,
      title: 'Приветственный бонус',
      description: welcomeBonusDescription(welcomeBonus),
      enabled: welcomeBonus.enabled,
      startsAt: null,
      endsAt: null,
      href: '/dashboard/admin/offers',
      metric: 'Один раз после регистрации',
    }] : []),
    ...offers.map((offer): AdminCampaignRow => ({
      id: `offer:${offer.id}`,
      type: 'OFFER',
      title: offer.title,
      description: `${offerScenarioLabel(offer.scenario)} · приоритет ${offer.priority}`,
      enabled: offer.enabled,
      startsAt: null,
      endsAt: null,
      href: '/dashboard/admin/offers',
      metric: offer.description,
    })),
    ...bonusEvents.map((event): AdminCampaignRow => ({
      id: `bonus-event:${event.id}`,
      type: 'BONUS_EVENT',
      title: event.title,
      description: event.description || `${event.attemptsPerUser} прокруток участнику`,
      enabled: event.isActive && (features?.bonusBox ?? true),
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      href: '/dashboard/admin/bonus-box?view=overview',
      metric: event.maxClaims
        ? `${event.claimsCount}/${event.maxClaims} участников`
        : `${event.claimsCount} участников`,
    })),
  ]

  const visibleCampaigns = sortAdminCampaigns(
    filterAdminCampaigns(campaigns, { type: params.type, status: params.status }, now),
    now
  )
  const counts = countStatuses(campaigns, now)
  const activeCampaigns = campaigns.filter((campaign) => getAdminCampaignStatus(campaign, now) === 'ACTIVE')
  const resetVisible = Boolean((params.type && params.type !== 'ALL') || (params.status && params.status !== 'ALL'))

  return (
    <AdminPageShell
      title="Кампании"
      description="Все акции и предложения в одном календаре"
      action={(
        <Link href="/dashboard/admin/promo-codes" className="btn-primary">
          Новая скидка
        </Link>
      )}
    >
      <section className="campaign-brief">
        <div className="campaign-brief-main">
          <span className="campaign-kicker">Сейчас</span>
          <strong>{counts.ACTIVE}</strong>
          <span>{campaignCountLabel(counts.ACTIVE)}</span>
        </div>
        <div className="campaign-brief-stat">
          <span>Дальше</span>
          <strong>{counts.SCHEDULED}</strong>
          <small>запланировано</small>
        </div>
        <div className="campaign-brief-stat">
          <span>Выключены</span>
          <strong>{counts.DISABLED}</strong>
          <small>не показываются</small>
        </div>
        <div className="campaign-brief-note">
          {activeCampaigns.length > 3
            ? `Одновременно работают ${activeCampaigns.length} механик. Проверьте, не конкурируют ли они за одно действие.`
            : 'Нагрузка на пользователя умеренная. Сроки и пересечения видны в списке ниже.'}
        </div>
      </section>

      <AdminFilterBar
        action="/dashboard/admin/campaigns"
        resetHref="/dashboard/admin/campaigns"
        resetVisible={resetVisible}
        count={{ shown: visibleCampaigns.length, total: campaigns.length }}
        className="md:grid-cols-2"
      >
        <AdminFilterField label="Механика">
          <select name="type" defaultValue={params.type || 'ALL'} className="input">
            <option value="ALL">Все механики</option>
            {Object.entries(typeMeta).map(([value, meta]) => (
              <option key={value} value={value}>{meta.label}</option>
            ))}
          </select>
        </AdminFilterField>
        <AdminFilterField label="Состояние">
          <select name="status" defaultValue={params.status || 'ALL'} className="input">
            <option value="ALL">Все состояния</option>
            {Object.entries(statusMeta).map(([value, meta]) => (
              <option key={value} value={value}>{meta.label}</option>
            ))}
          </select>
        </AdminFilterField>
      </AdminFilterBar>

      <section className="campaign-ledger" aria-label="Календарь кампаний">
        {visibleCampaigns.length ? visibleCampaigns.map((campaign) => (
          <CampaignRow key={campaign.id} campaign={campaign} now={now} />
        )) : (
          <div className="px-4 py-10 text-center text-sm text-slate-500">По выбранным условиям ничего нет</div>
        )}
      </section>

      <nav className="campaign-links" aria-label="Настройки механик">
        <CampaignLink href="/dashboard/admin/offers" title="Офферы и приветствие" text="Первый контакт и сценарии на главной" />
        <CampaignLink href="/dashboard/admin/referrals" title="Реферальная программа" text="Награды обеим сторонам" />
        <CampaignLink href="/dashboard/admin/bonus-box" title="Бонусные события" text="Прокрутки, задания и призы" />
      </nav>
    </AdminPageShell>
  )
}

function CampaignRow({ campaign, now }: { campaign: AdminCampaignRow; now: Date }) {
  const meta = typeMeta[campaign.type]
  const status = getAdminCampaignStatus(campaign, now)
  const statusInfo = statusMeta[status]
  const Icon = meta.icon

  return (
    <Link href={campaign.href} className="campaign-row">
      <span className="campaign-row-icon"><Icon className="h-4 w-4" /></span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <strong className="truncate text-sm text-slate-950 dark:text-white">{campaign.title}</strong>
          <span className="text-[11px] font-medium text-slate-400">{meta.label}</span>
        </span>
        <span className="mt-1 block truncate text-xs text-slate-500 dark:text-slate-400">{campaign.description}</span>
      </span>
      <span className="hidden min-w-0 sm:block">
        <span className="block text-xs font-medium text-slate-700 dark:text-slate-200">{formatCampaignRange(campaign)}</span>
        {campaign.metric ? <span className="mt-1 block truncate text-[11px] text-slate-400">{campaign.metric}</span> : null}
      </span>
      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusInfo.className}`}>
        {status === 'ACTIVE' ? <CircleCheck className="h-3.5 w-3.5" /> : <CalendarClock className="h-3.5 w-3.5" />}
        {statusInfo.label}
      </span>
      <ArrowUpRight className="h-4 w-4 text-slate-400" />
    </Link>
  )
}

function CampaignLink({ href, title, text }: { href: string; title: string; text: string }) {
  return (
    <Link href={href} className="group min-w-0 border-l border-slate-200 pl-3 first:border-l-0 first:pl-0 dark:border-white/10">
      <span className="flex items-center gap-1 text-sm font-semibold text-slate-900 group-hover:text-cyan-700 dark:text-white dark:group-hover:text-cyan-300">
        {title}
        <ArrowUpRight className="h-3.5 w-3.5" />
      </span>
      <span className="mt-1 block text-xs text-slate-500">{text}</span>
    </Link>
  )
}

function countStatuses(campaigns: AdminCampaignRow[], now: Date) {
  const counts: Record<AdminCampaignStatus, number> = { ACTIVE: 0, SCHEDULED: 0, ENDED: 0, DISABLED: 0 }
  for (const campaign of campaigns) counts[getAdminCampaignStatus(campaign, now)] += 1
  return counts
}

function formatCampaignRange(campaign: AdminCampaignRow) {
  if (!campaign.startsAt && !campaign.endsAt) return 'Без срока'
  if (!campaign.startsAt) return `до ${formatDate(campaign.endsAt)}`
  if (!campaign.endsAt) return `с ${formatDate(campaign.startsAt)}`
  return `${formatDate(campaign.startsAt)} - ${formatDate(campaign.endsAt)}`
}

function formatDate(value: Date | null) {
  if (!value) return 'без срока'
  return value.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' })
}

function promoAudienceLabel(value: string) {
  if (value === 'NEW_USERS') return 'новые пользователи'
  if (value === 'NO_ACTIVE_SUBSCRIPTION') return 'без активной подписки'
  if (value === 'PERSONAL') return 'персонально'
  return 'для всех'
}

function offerScenarioLabel(value: string) {
  const labels: Record<string, string> = {
    NO_SUBSCRIPTION: 'Нет подписки',
    RETURN_PROMO: 'Возвращение',
    RENEWAL_SOON: 'Скоро продление',
    CONNECT_DEVICE: 'Подключение устройства',
    REFERRAL: 'Реферальный сценарий',
  }
  return labels[value] || value
}

function welcomeBonusDescription(setting: {
  trialEnabled: boolean
  bonusAttemptsEnabled: boolean
  bonusAttempts: number
  promoCodeEnabled: boolean
  trialPlan: { name: string; durationDays: number } | null
  promoCode: { code: string; discountPercent: number } | null
}) {
  const parts: string[] = []
  if (setting.trialEnabled) parts.push(setting.trialPlan ? `${setting.trialPlan.name} на ${setting.trialPlan.durationDays} дн.` : 'Пробный период')
  if (setting.promoCodeEnabled) parts.push(setting.promoCode ? `${setting.promoCode.code} · ${setting.promoCode.discountPercent}%` : 'Промокод')
  if (setting.bonusAttemptsEnabled) parts.push(`${setting.bonusAttempts} прокруток`)
  return parts.length ? parts.join(' · ') : 'Варианты не настроены'
}

function campaignCountLabel(value: number) {
  const lastTwo = value % 100
  const last = value % 10
  if (lastTwo >= 11 && lastTwo <= 14) return 'активных кампаний'
  if (last === 1) return 'активная кампания'
  if (last >= 2 && last <= 4) return 'активные кампании'
  return 'активных кампаний'
}
