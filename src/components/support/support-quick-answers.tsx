// Быстрые ответы на частые вопросы над чатом поддержки (новый дизайн).
// Каждый ответ ведёт туда, где проблему можно решить самому, и в чат с уже выбранной темой.

import Link from 'next/link'
import { ChevronDown, Lightbulb } from 'lucide-react'
import type { SupportCategoryValue } from '@/lib/support'

type QuickAnswer = {
  question: string
  answer: string
  action?: { href: string; label: string }
  category: SupportCategoryValue
}

export const supportQuickAnswers: QuickAnswer[] = [
  {
    question: 'Не подключается VPN',
    answer: 'Проверьте, что подписка активна и VPN включён в приложении. Смените сервер и перезапустите приложение. Если вы меняли ссылку подключения, добавьте новую ссылку в приложение заново.',
    action: { href: '/dashboard/subscription', label: 'Открыть VPN' },
    category: 'connection',
  },
  {
    question: 'Оплатил, а доступа нет',
    answer: 'Обычно доступ появляется в течение минуты. В разделе «Подписка» у платежа есть кнопка «Проверить статус». Повторно оплачивать не нужно.',
    action: { href: '/dashboard/billing', label: 'Открыть Подписку' },
    category: 'payment',
  },
  {
    question: 'Как подключить ещё одно устройство',
    answer: 'Откройте этот кабинет на новом устройстве, войдите в тот же аккаунт и пройдите три шага в разделе «VPN». Если устройств не хватает, их можно докупить в «Подписке».',
    action: { href: '/dashboard/subscription#devices', label: 'Мои устройства' },
    category: 'devices',
  },
  {
    question: 'Как отключить автопродление',
    answer: 'В разделе «Подписка» в блоке «Автопродление» нажмите «Отключить и отвязать карту». Уже оплаченный доступ продолжит работать до конца срока.',
    action: { href: '/dashboard/billing#auto-renewal', label: 'Автопродление' },
    category: 'payment',
  },
  {
    question: 'Как сменить ссылку подключения',
    answer: 'Если ссылка попала к чужим людям, откройте «VPN» → «Ссылка подключения» → «Сменить ссылку». Старая перестанет работать, новую нужно добавить в приложение на каждом устройстве.',
    action: { href: '/dashboard/subscription#connection-link', label: 'Ссылка подключения' },
    category: 'devices',
  },
  {
    question: 'VPN работает медленно',
    answer: 'Выберите в приложении ближайший сервер и перезапустите приложение. Если скорость низкая на всех серверах, напишите нам и приложите результат проверки скорости.',
    category: 'speed',
  },
]

export function SupportQuickAnswers() {
  return (
    <section aria-labelledby="quick-answers-title" className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.025] sm:p-5">
      <h2 id="quick-answers-title" className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white">
        <Lightbulb className="h-4 w-4 text-amber-500" />
        Быстрые ответы
      </h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Частые вопросы. Не нашли ответ — напишите нам в чат ниже.</p>
      <div className="mt-3 divide-y divide-slate-200 dark:divide-white/10">
        {supportQuickAnswers.map((item) => (
          <details key={item.question} className="group py-1">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-900 dark:text-white [&::-webkit-details-marker]:hidden">
              {item.question}
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
            </summary>
            <p className="pb-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.answer}</p>
            <div className="flex flex-wrap gap-2 pb-3">
              {item.action ? (
                <Link href={item.action.href} className="btn-secondary min-h-10 px-3 py-2 text-sm">{item.action.label}</Link>
              ) : null}
              <Link href={`/dashboard/support?category=${item.category}`} className="btn-secondary min-h-10 px-3 py-2 text-sm">
                Не помогло — написать
              </Link>
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}
