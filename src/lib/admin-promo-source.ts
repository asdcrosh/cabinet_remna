// Промокоды в админке нового дизайна делятся по источнику: созданные вручную
// и выданные рулеткой (бонус-бокс). Коды из рулетки не смешиваются с созданными:
// фильтр работает на сервере, чтобы сотни кодов из рулетки не съедали страницу списка.

export type AdminPromoSource = 'created' | 'box'

export const ADMIN_PROMO_SOURCES: Array<{ value: AdminPromoSource; label: string }> = [
  { value: 'created', label: 'Созданные' },
  { value: 'box', label: 'Из рулетки' },
]

export function parseAdminPromoSource(value: string | null | undefined): AdminPromoSource {
  return value === 'box' ? 'box' : 'created'
}

/** Условие Prisma для источника. Тот же признак, что и у origin в строке: есть ли открытия бонус-бокса. */
export function adminPromoSourceWhere(source: AdminPromoSource) {
  return source === 'box'
    ? { bonusBoxOpenings: { some: {} } }
    : { bonusBoxOpenings: { none: {} } }
}

/**
 * Адрес списка с другим источником. Поиск сохраняется, размер подгруженного списка
 * сбрасывается: у другого источника своя первая страница.
 */
export function buildAdminPromoSourceHref(
  pathname: string,
  searchParams: URLSearchParams | string,
  source: AdminPromoSource
) {
  const next = new URLSearchParams(searchParams.toString())
  next.delete('limit')
  next.delete('new')
  if (source === 'box') next.set('source', 'box')
  else next.delete('source')
  const query = next.toString()
  return query ? `${pathname}?${query}` : pathname
}

/** «Новая скидка» и быстрые действия открывают форму промокода сразу, по ?new=1. */
export const ADMIN_NEW_PROMO_HREF = '/dashboard/admin/promo-codes?new=1'

export function shouldOpenPromoEditor(value: string | null | undefined) {
  return value === '1'
}
