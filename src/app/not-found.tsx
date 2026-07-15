import Link from 'next/link'
import { Home, SearchX } from 'lucide-react'
import { SystemState } from '@/components/ui/system-state'

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-8">
      <SystemState
        eyebrow="Ошибка 404"
        icon={<SearchX className="h-7 w-7" />}
        title="Страница не найдена"
        description="Возможно, ссылка устарела или адрес введён с ошибкой. Вернитесь в кабинет и продолжите работу."
        action={(
          <Link href="/" className="btn-primary w-full sm:w-auto">
            <Home className="h-4 w-4" />
            Вернуться в кабинет
          </Link>
        )}
      />
    </main>
  )
}
