import { NextResponse } from 'next/server'

/** Keep BigInt values exact at the API boundary, including newly added nested fields. */
export function jsonResponse<JsonBody>(body: JsonBody, init?: ResponseInit): NextResponse<JsonBody> {
  const serialized = JSON.stringify(body, (_key, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value
  )
  if (serialized === undefined) {
    throw new TypeError('Value is not JSON serializable')
  }
  const headers = new Headers(init?.headers)
  if (!headers.has('content-type')) headers.set('content-type', 'application/json')
  return new NextResponse<JsonBody>(serialized, { ...init, headers })
}
