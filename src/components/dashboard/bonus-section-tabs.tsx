// Вкладки раздела «Бонусы» нового дизайна: рулетка и приглашения друзей — одно место.

import Link from 'next/link'
import { Gift, UsersRound } from 'lucide-react'
import { cn } from '@/lib/cn'

export function BonusSectionTabs({ active }: { active: 'bonuses' | 'invite' }) {
  const tabs = [
    { id: 'bonuses' as const, href: '/dashboard/bonus-box', label: 'Рулетка и задания', icon: Gift },
    { id: 'invite' as const, href: '/dashboard/referrals', label: 'Пригласить друга', icon: UsersRound },
  ]
  return (
    <nav aria-label="Разделы бонусов" className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-white/[0.03] sm:w-fit">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const current = tab.id === active
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'flex min-h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-sm font-semibold transition-colors sm:flex-none',
              current
                ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white'
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
