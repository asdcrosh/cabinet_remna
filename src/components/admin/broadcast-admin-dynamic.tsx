'use client'

import dynamic from 'next/dynamic'

export const BroadcastAdminDynamic = dynamic(
  () => import('./broadcast-admin').then((module) => module.BroadcastAdmin),
  {
    ssr: false,
    loading: () => <div className="card p-5 text-sm text-slate-500">Загрузка рассылок...</div>,
  },
)
