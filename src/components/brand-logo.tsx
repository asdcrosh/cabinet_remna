import Image from 'next/image'
import { cn } from '@/lib/cn'

export function BrandLogo({
  className,
  priority = false,
}: {
  className?: string
  priority?: boolean
}) {
  return (
    <span className={cn('brand-logo relative block shrink-0 overflow-hidden', className)}>
      <Image
        src="/alekseev-vp-logo.jpg"
        alt=""
        fill
        priority={priority}
        sizes="64px"
        className="object-cover"
      />
    </span>
  )
}
