export const ADMIN_LIST_PAGE_SIZE = 25
export const ADMIN_LIST_MAX_SIZE = 5000

export function parseAdminListLimit(
  value: string | undefined,
  pageSize = ADMIN_LIST_PAGE_SIZE,
  maxSize = ADMIN_LIST_MAX_SIZE
) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < pageSize) return pageSize
  return Math.min(maxSize, Math.ceil(parsed / pageSize) * pageSize)
}
