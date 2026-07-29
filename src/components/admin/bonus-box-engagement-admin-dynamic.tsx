'use client'

import dynamic from 'next/dynamic'
import { LoadingPanel } from '@/components/ui/loading-panel'

export const BonusBoxEngagementAdminDynamic = dynamic(
  () => import('./bonus-box-engagement-admin').then((module) => module.BonusBoxEngagementAdmin),
  {
    ssr: false,
    loading: () => <LoadingPanel label="Загрузка аналитики подарков" />,
  },
)
