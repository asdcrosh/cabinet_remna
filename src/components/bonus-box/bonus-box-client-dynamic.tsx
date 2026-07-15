'use client'

import dynamic from 'next/dynamic'
import { LoadingPanel } from '@/components/ui/loading-panel'

export const BonusBoxClientDynamic = dynamic(
  () => import('./bonus-box-client').then((module) => module.BonusBoxClient),
  {
    ssr: false,
    loading: () => <LoadingPanel label="Загрузка бонусов" />,
  },
)
