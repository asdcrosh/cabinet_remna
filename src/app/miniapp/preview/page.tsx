import { notFound } from 'next/navigation'
import { MiniApp } from '@/components/miniapp/mini-app'

export default function MiniAppPreview() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <MiniApp demo />
}
