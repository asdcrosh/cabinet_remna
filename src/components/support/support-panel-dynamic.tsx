'use client'

import dynamic from 'next/dynamic'

export const SupportPanelDynamic = dynamic(
  () => import('./support-panel').then((module) => module.SupportPanel),
  {
    ssr: false,
    loading: () => <div className="card p-5 text-sm text-slate-500">Загрузка поддержки...</div>,
  },
)
