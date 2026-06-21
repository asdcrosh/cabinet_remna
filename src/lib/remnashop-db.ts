import { Pool, type QueryResultRow } from 'pg'

let pool: Pool | null = null

export function getRemnashopPool() {
  const connectionString = process.env.REMNASHOP_DATABASE_URL
  if (!connectionString) {
    throw new Error('REMNASHOP_DATABASE_URL is not configured')
  }

  pool ??= new Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    ssl: parseSslMode(),
  })

  return pool
}

export async function remnashopQuery<T extends QueryResultRow>(text: string, values: unknown[] = []) {
  return getRemnashopPool().query<T>(text, values)
}

function parseSslMode() {
  const value = process.env.REMNASHOP_DATABASE_SSL
  if (!value || value === 'false' || value === '0') return undefined
  if (value === 'true' || value === '1') return { rejectUnauthorized: true }
  if (value === 'no-verify') return { rejectUnauthorized: false }
  return undefined
}
