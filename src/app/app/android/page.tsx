// /app/android — скачать приложение StealthNet для Android.
// Страница открыта без входа: на время пилота ссылку получают участники.
// На телефоне — кнопка скачивания и три шага, на компьютере ещё QR-код этой страницы.
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import QRCode from 'qrcode'
import { Download, ShieldCheck, Smartphone } from 'lucide-react'
import { getAppUrl } from '@/lib/app-url'
import { getBrandName } from '@/lib/branding'
import { getAndroidDownloadInfo, isAndroidUserAgent, MOBILE_APP_PAGE_PATH } from '@/lib/mobile-app-page'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Приложение для Android' }

const STEPS = [
  { title: 'Откройте файл', text: 'Если Android спросит — разрешите установку из браузера.' },
  { title: 'Установите', text: 'Дальше приложение обновляется само.' },
  { title: 'Войдите', text: 'Тем же аккаунтом, что в личном кабинете.' },
]

export default async function AndroidAppPage() {
  const brandName = getBrandName()
  const [info, requestHeaders] = await Promise.all([getAndroidDownloadInfo(), headers()])
  const onAndroid = isAndroidUserAgent(requestHeaders.get('user-agent'))
  const qr = !onAndroid && info ? await pageQr() : null

  return (
    <main className="relative isolate grid min-h-dvh place-items-center overflow-hidden bg-slate-50 px-4 py-8 text-slate-950 dark:bg-slate-950 dark:text-white sm:p-8">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        <div className="absolute left-1/2 top-[-12rem] h-80 w-80 -translate-x-1/2 rounded-full bg-cyan-200/35 blur-3xl dark:bg-cyan-500/10" />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-4 flex min-w-0 items-center justify-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-cyan-600 shadow-sm ring-1 ring-slate-200/80 dark:bg-white/[0.06] dark:text-cyan-300 dark:ring-white/10">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="truncate">{brandName}</span>
        </div>

        <section className="rounded-[2rem] border border-slate-200/80 bg-white/95 px-5 py-8 shadow-[0_24px_70px_-32px_rgba(15,23,42,0.35)] dark:border-white/[0.1] dark:bg-slate-900/95 sm:px-7">
          <div className="text-center">
            <Smartphone className="mx-auto h-8 w-8 text-cyan-600 dark:text-cyan-300" aria-hidden="true" />
            <h1 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">{brandName} для Android</h1>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              {info ? `Версия ${info.version} · ${info.sizeLabel}` : 'Скоро появится'}
            </p>
          </div>

          {info ? (
            <>
              {qr ? (
                <div className="mt-6 text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element -- QR-код готовым data URL */}
                  <img src={qr} alt="QR-код страницы скачивания" width={176} height={176} className="mx-auto rounded-xl bg-white p-2 ring-1 ring-slate-200 dark:ring-white/10" />
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Наведите камеру телефона</p>
                </div>
              ) : null}

              <a href={info.url} className="btn-primary mt-6 min-h-12 w-full justify-center" download>
                <Download className="h-4 w-4" aria-hidden="true" />
                Скачать APK
              </a>
              {info.legacyUrl ? (
                <a href={info.legacyUrl} className="mt-2 flex min-h-11 items-center justify-center text-sm text-slate-500 hover:underline dark:text-slate-400" download>
                  Для старых телефонов (32-бит)
                </a>
              ) : null}

              <ol className="mt-5 space-y-3 border-t border-slate-200 pt-5 dark:border-white/10">
                {STEPS.map((step, index) => (
                  <li key={step.title} className="flex gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-cyan-50 text-sm font-semibold text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-200">
                      {index + 1}
                    </span>
                    <span className="text-sm leading-6">
                      <strong className="font-semibold">{step.title}.</strong>{' '}
                      <span className="text-slate-600 dark:text-slate-300">{step.text}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : null}
        </section>
      </div>
    </main>
  )
}

async function pageQr() {
  try {
    return await QRCode.toDataURL(`${getAppUrl()}${MOBILE_APP_PAGE_PATH}`, { errorCorrectionLevel: 'M', margin: 1, width: 352 })
  } catch {
    return null
  }
}
