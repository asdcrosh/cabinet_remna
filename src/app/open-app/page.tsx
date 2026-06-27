import { Suspense } from 'react'
import { AppOpenBridge } from '@/components/open-app/app-open-bridge'

export default function OpenAppPage() {
  return (
    <Suspense fallback={null}>
      <AppOpenBridge />
    </Suspense>
  )
}
