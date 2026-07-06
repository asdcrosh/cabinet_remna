import { NextResponse } from 'next/server'

export function csvResponse(filename: string, rows: Array<Record<string, unknown>>) {
  const headers = rows[0] ? Object.keys(rows[0]) : []
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
  ].join('\n')

  return new NextResponse(`\uFEFF${csv}\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

function csvCell(value: unknown) {
  if (value == null) return ''
  const text = value instanceof Date ? value.toISOString() : String(value)
  return `"${text.replaceAll('"', '""')}"`
}
