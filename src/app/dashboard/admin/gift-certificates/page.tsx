import { requireAdminPage } from '@/lib/auth/admin-page'
import { prisma } from '@/lib/prisma'
import { GiftCertificatesAdmin } from '@/components/admin/gift-certificates-admin'

export const metadata = { title: 'Сертификаты — Админка' }

export default async function GiftCertificatesPage() {
  await requireAdminPage()
  const [certificates, plans] = await Promise.all([
    prisma.giftCertificate.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        plan: { select: { name: true } },
        redemptions: { select: { status: true } },
      },
    }),
    prisma.plan.findMany({
      where: { isActive: true, isPromo: false },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
  ])

  return (
    <div className="space-y-5">
      <header className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Администрирование</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Подарочные сертификаты</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
          Создавайте коды на 7, 30, 90 дней или свой срок. Пользователь вводит код и получает подписку.
        </p>
      </header>

      <GiftCertificatesAdmin
        certificates={certificates.map((item) => ({
          id: item.id,
          code: item.code,
          planName: item.plan.name,
          planId: item.planId,
          durationDays: item.durationDays,
          maxUses: item.maxUses,
          maxUsesPerUser: item.maxUsesPerUser,
          isActive: item.isActive,
          startsAt: item.startsAt?.toISOString() ?? null,
          expiresAt: item.expiresAt?.toISOString() ?? null,
          usedCount: item.redemptions.filter((redemption) => redemption.status === 'SUCCEEDED').length,
        }))}
        plans={plans}
      />
    </div>
  )
}
