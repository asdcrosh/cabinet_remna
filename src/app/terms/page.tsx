import Link from 'next/link'

export const metadata = { title: 'Условия использования — Личный кабинет' }

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Link href="/register" className="text-sm text-brand-600 hover:underline">
        Назад к регистрации
      </Link>
      <div className="card mt-6 space-y-5">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Условия использования</h1>
          <p className="mt-2 text-sm text-slate-500">
            Базовый шаблон условий для личного кабинета. Перед публичным запуском замените текст на юридически
            утверждённую редакцию вашего сервиса.
          </p>
        </div>
        <section className="space-y-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">1. Аккаунт и доступ</h2>
          <p>
            Пользователь отвечает за сохранность логина, пароля и ключей подключения. Передача доступа третьим
            лицам может привести к ограничению сервиса.
          </p>
        </section>
        <section className="space-y-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">2. Оплата и подписка</h2>
          <p>
            Подписка активируется после подтверждения оплаты платёжным провайдером. Срок действия и лимиты зависят
            от выбранного тарифа.
          </p>
        </section>
        <section className="space-y-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">3. Ограничения</h2>
          <p>
            Запрещено использовать сервис для действий, нарушающих применимое законодательство, права третьих лиц
            или стабильность инфраструктуры.
          </p>
        </section>
      </div>
    </main>
  )
}
