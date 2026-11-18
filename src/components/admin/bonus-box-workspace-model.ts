// Админские «Бонусы» в новом дизайне: один уровень вкладок вместо
// «вкладка → свёрнутый блок → подвкладка». Вкладка хранится в ?view=, чтобы
// фильтры истории, подгрузка списка и ссылки из «Кампаний» открывали нужное место.

export type BonusAdminTab = 'prizes' | 'engagement' | 'economy' | 'history'

export const BONUS_ADMIN_TABS: Array<{ id: BonusAdminTab; label: string }> = [
  { id: 'prizes', label: 'Призы' },
  { id: 'engagement', label: 'Задания и события' },
  { id: 'economy', label: 'Экономика' },
  { id: 'history', label: 'История' },
]

// Старые адреса (?view=overview из «Кампаний», ?view=prizes) продолжают работать.
const VIEW_ALIASES: Record<string, BonusAdminTab> = {
  prizes: 'prizes',
  catalog: 'prizes',
  engagement: 'engagement',
  overview: 'engagement',
  events: 'engagement',
  missions: 'engagement',
  economy: 'economy',
  history: 'history',
}

export function parseBonusAdminTab(view: string | null | undefined): BonusAdminTab {
  // hasOwn: ?view=constructor не должен доставать свойства Object.prototype.
  return (view && Object.hasOwn(VIEW_ALIASES, view) && VIEW_ALIASES[view]) || 'prizes'
}

/** Адрес вкладки: остальные параметры (фильтры истории, limit) сохраняются. */
export function buildBonusAdminTabHref(pathname: string, searchParams: URLSearchParams | string, tab: BonusAdminTab) {
  const next = new URLSearchParams(searchParams.toString())
  if (tab === 'prizes') next.delete('view')
  else next.set('view', tab)
  const query = next.toString()
  return query ? `${pathname}?${query}` : pathname
}
