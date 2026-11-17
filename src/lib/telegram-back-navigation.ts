// Кнопка «Назад» в Telegram ведёт «вверх» по разделам кабинета, как системная
// навигация Android: из вложенной страницы в родительский раздел, из раздела
// на главную. На главной кнопку прячем, тогда жест «назад» закрывает Mini App.

const DASHBOARD_HOME = '/dashboard'

export function getTelegramBackTarget(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === DASHBOARD_HOME || !path.startsWith(`${DASHBOARD_HOME}/`)) return null

  const parent = path.slice(0, path.lastIndexOf('/'))
  return parent.length >= DASHBOARD_HOME.length ? parent : DASHBOARD_HOME
}
