import Link from 'next/link'
import { getBrandName } from '@/lib/branding'
import { getLegalDetails } from '@/lib/legal'

export const metadata = { title: 'Правила возврата' }
export const dynamic = 'force-dynamic'

export default function RefundsPage() {
  const brandName = getBrandName()
  const legal = getLegalDetails()

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <Link href="/" className="text-sm text-brand-600 hover:underline">На главную</Link>
      <div className="card mt-6 space-y-7 text-sm leading-6 text-slate-600 dark:text-slate-300">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Правила возврата</h1>
          <p className="mt-2 text-slate-500">Сервис {brandName}. Редакция от 14 июля 2026 года.</p>
        </div>
        <Section title="Когда можно запросить возврат">
          <p>Запрос рассматривается, если оплата подтверждена, но доступ не был выдан по технической причине либо существенная неисправность сервиса не была устранена в разумный срок.</p>
        </Section>
        <Section title="Когда возврат может быть ограничен">
          <p>Возврат может быть отклонён полностью или частично, если доступ уже был выдан и использован, срок тарифа истёк, пользователь нарушил условия сервиса или проблема вызвана его устройством, сетью либо сторонним сервисом.</p>
        </Section>
        <Section title="Как подать запрос">
          <p>Напишите на <a className="text-brand-600 hover:underline" href={`mailto:${legal.supportEmail}`}>{legal.supportEmail}</a> с email аккаунта. Укажите идентификатор платежа, дату, сумму и описание проблемы. Не отправляйте реквизиты банковской карты.</p>
        </Section>
        <Section title="Срок и способ возврата">
          <p>После проверки решение сообщается по email. Одобренный возврат отправляется через исходный способ оплаты. Фактический срок зачисления зависит от платёжного провайдера и банка.</p>
        </Section>
        <Section title="Исполнитель">
          <p>{legal.operatorName}, ИНН {legal.taxId}. Адрес: {legal.address}.</p>
        </Section>
        <nav className="flex flex-wrap gap-4 border-t border-slate-200 pt-5 dark:border-white/10">
          <Link href="/terms" className="text-brand-600 hover:underline">Условия использования</Link>
          <Link href="/privacy" className="text-brand-600 hover:underline">Политика конфиденциальности</Link>
        </nav>
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-2"><h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>{children}</section>
}
