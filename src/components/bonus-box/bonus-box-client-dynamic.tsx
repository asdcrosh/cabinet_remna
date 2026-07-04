'use client'

import dynamic from 'next/dynamic'

export const BonusBoxClientDynamic = dynamic(
  () => import('./bonus-box-client').then((module) => module.BonusBoxClient),
  {
    ssr: false,
    loading: () => <div className="card p-5 text-sm text-slate-500">Загрузка бонусов...</div>,
  },
)
