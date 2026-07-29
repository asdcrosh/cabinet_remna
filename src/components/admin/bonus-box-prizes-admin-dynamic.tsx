'use client'

import dynamic from 'next/dynamic'
import { LoadingPanel } from '@/components/ui/loading-panel'

export const BonusBoxPrizesAdminDynamic = dynamic(
  () => import('./bonus-box-prizes-admin').then((module) => module.BonusBoxPrizesAdmin),
  {
    ssr: false,
    loading: () => <LoadingPanel label="Загрузка призов и истории" />,
  },
)
