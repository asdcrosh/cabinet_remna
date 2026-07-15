'use client'

import dynamic from 'next/dynamic'
import { LoadingPanel } from '@/components/ui/loading-panel'

export const SupportPanelDynamic = dynamic(
  () => import('./support-panel').then((module) => module.SupportPanel),
  {
    ssr: false,
    loading: () => <LoadingPanel label="Загрузка поддержки" />,
  },
)
