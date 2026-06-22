import { NextResponse } from 'next/server'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { remnawave, type InternalSquadResponse } from '@/lib/remnawave'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export interface AdminSquadRow {
  uuid: string
  name: string
  isActive: boolean
}

export const GET = withAuth(async () => {
  await requireAdmin()

  const raw = await remnawave.getInternalSquads()
  const squads = normalizeSquads(raw)

  return NextResponse.json({ squads })
})

function normalizeSquads(raw: unknown): AdminSquadRow[] {
  const rows = extractRows(raw)
  const seen = new Set<string>()

  return rows
    .map((row) => normalizeSquad(row))
    .filter((row): row is AdminSquadRow => Boolean(row?.uuid))
    .filter((row) => {
      if (seen.has(row.uuid)) return false
      seen.add(row.uuid)
      return true
    })
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, 'ru'))
}

function extractRows(raw: unknown): InternalSquadResponse[] {
  if (Array.isArray(raw)) return raw.filter(isObjectLike) as InternalSquadResponse[]
  if (!isObjectLike(raw)) return []

  const candidates = [
    raw.response,
    raw.response && isObjectLike(raw.response) ? raw.response.internalSquads : null,
    raw.response && isObjectLike(raw.response) ? raw.response.squads : null,
    raw.response && isObjectLike(raw.response) ? raw.response.items : null,
    raw.internalSquads,
    raw.squads,
    raw.items,
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter(isObjectLike) as InternalSquadResponse[]
  }

  return []
}

function normalizeSquad(row: InternalSquadResponse): AdminSquadRow | null {
  const uuid = typeof row.uuid === 'string' ? row.uuid : typeof row.id === 'string' ? row.id : null
  if (!uuid) return null

  const name =
    typeof row.name === 'string' && row.name.trim()
      ? row.name.trim()
      : typeof row.title === 'string' && row.title.trim()
        ? row.title.trim()
        : uuid

  return {
    uuid,
    name,
    isActive: row.isDisabled === true ? false : row.isActive ?? row.enabled ?? row.active ?? true,
  }
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
