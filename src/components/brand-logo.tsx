'use client'

import Image from 'next/image'
import { ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/cn'
import { useBranding } from '@/components/branding-provider'

export function BrandLogo({
  className,
  priority = false,
  src,
}: {
  className?: string
  priority?: boolean
  src?: string | null
}) {
  const { logoUrl: configuredLogoUrl } = useBranding()
  const logoUrl = src === undefined ? configuredLogoUrl : src
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  return (
    <span className={cn('brand-logo relative grid shrink-0 place-items-center overflow-hidden', className)}>
      {logoUrl && failedUrl !== logoUrl ? (
        <Image
          src={logoUrl}
          alt=""
          fill
          priority={priority}
          sizes="64px"
          className="object-cover"
          onError={() => setFailedUrl(logoUrl)}
        />
      ) : (
        <ShieldCheck className="h-[46%] w-[46%]" aria-hidden="true" />
      )}
    </span>
  )
}
