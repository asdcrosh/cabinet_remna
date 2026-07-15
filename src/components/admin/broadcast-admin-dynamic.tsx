'use client'

import dynamic from 'next/dynamic'
import { LoadingPanel } from '@/components/ui/loading-panel'

export const BroadcastAdminDynamic = dynamic(
  () => import('./broadcast-admin').then((module) => module.BroadcastAdmin),
  {
    ssr: false,
    loading: () => <LoadingPanel label="Загрузка рассылок" />,
  },
)
