import Link from 'next/link'
import { getBrandName } from '@/lib/branding'
import { getLegalDetails } from '@/lib/legal'

export const metadata = { title: 'Политика конфиденциальности' }
export const dynamic = 'force-dynamic'

export default function PrivacyPage() {
  const brandName = getBrandName()
  const legal = getLegalDetails()

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <Link href="/" className="text-sm text-brand-600 hover:underline">На главную</Link>
      <div className="card mt-6 space-y-7 text-sm leading-6 text-slate-600 dark:text-slate-300">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Политика конфиденциальности</h1>
          <p className="mt-2 text-slate-500">Сервис {brandName}. Редакция от 14 июля 2026 года.</p>
        </div>
        <Section title="Какие данные обрабатываются">
          <p>Данные аккаунта и связи: email, имя, Telegram ID и имя пользователя при привязке. Также обрабатываются сведения о тарифах, платежах, подписках, обращениях в поддержку и технические данные запросов, включая IP-адрес и user-agent.</p>
          <p>Реквизиты банковской карты обрабатывает платёжный провайдер. Сервис не получает и не хранит полный номер карты и CVC/CVV.</p>
        </Section>
        <Section title="Цели и основания">
          <p>Данные нужны для регистрации и защиты аккаунта, исполнения оплаченной услуги, выдачи VPN-доступа, поддержки, предотвращения злоупотреблений, ведения обязательного учёта и отправки сервисных уведомлений.</p>
        </Section>
        <Section title="Передача и хранение">
          <p>В необходимом объёме данные могут передаваться платёжному провайдеру, сервисам email и Telegram, а также системам управления подпиской и VPN-инфраструктурой. Данные хранятся не дольше, чем требуют цели обработки, безопасность и применимые обязательства.</p>
        </Section>
        <Section title="Права пользователя">
          <p>Пользователь может запросить сведения об обработке, уточнение или удаление данных, если их хранение больше не требуется по закону или для исполнения договора. Запрос направляется на <a className="text-brand-600 hover:underline" href={`mailto:${legal.supportEmail}`}>{legal.supportEmail}</a>.</p>
        </Section>
        <Section title="Оператор">
          <p>{legal.operatorName}, ИНН {legal.taxId}. Адрес: {legal.address}.</p>
        </Section>
        <nav className="flex flex-wrap gap-4 border-t border-slate-200 pt-5 dark:border-white/10">
          <Link href="/terms" className="text-brand-600 hover:underline">Условия использования</Link>
          <Link href="/refunds" className="text-brand-600 hover:underline">Правила возврата</Link>
        </nav>
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-2"><h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>{children}</section>
}
