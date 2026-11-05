// /app/payment-return — сюда платёжная система возвращает пользователя после оплаты из приложения StealthNet.
// Страница открывает приложение (stealthnet://payment), а оно само проверяет статус платежа.
import { CircleCheck, Smartphone } from 'lucide-react'
import { SystemState } from '@/components/ui/system-state'
import { getBrandName } from '@/lib/branding'

export const dynamic = 'force-dynamic'

const PAYMENT_ID = /^[A-Za-z0-9_-]{1,64}$/

export default async function PaymentReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string | string[] }>
}) {
  const raw = (await searchParams).payment
  const paymentId = typeof raw === 'string' && PAYMENT_ID.test(raw) ? raw : null
  const appUrl = paymentId ? `stealthnet://payment?payment=${paymentId}` : 'stealthnet://payment'
  const brandName = getBrandName()

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-8">
      {/* Сразу пробуем открыть приложение; если браузер не дал — остаётся кнопка. */}
      <meta httpEquiv="refresh" content={`0;url=${appUrl}`} />
      <SystemState
        eyebrow={brandName}
        icon={<CircleCheck className="h-7 w-7" />}
        title="Возвращаемся в приложение"
        description="Оплата обработана платёжной системой. Приложение само проверит статус платежа и обновит подписку."
        action={(
          <a href={appUrl} className="btn-primary w-full sm:w-auto">
            <Smartphone className="h-4 w-4" />
            Открыть {brandName}
          </a>
        )}
      />
    </main>
  )
}
