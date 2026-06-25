import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Remnashop cabinet account-link SQL', () => {
  const sql = readFileSync(join(process.cwd(), 'deploy/remnashop-cabinet-link.sql'), 'utf8')

  it('qualifies user_id references that conflict with the function output column', () => {
    expect(sql).toContain('WHERE subscription.user_id = email_user.id')
    expect(sql).toContain('WHERE transaction_row.user_id = email_user.id')
    expect(sql).toContain('WHERE reward.user_id = email_user.id')
    expect(sql).toContain('WHERE broadcast.user_id = email_user.id')
    expect(sql).toContain('WHERE activation.user_id = email_user.id')
    expect(sql).toContain('WHERE oauth.user_id = email_user.id')
    expect(sql).not.toMatch(/\bWHERE\s+user_id\s*=/)
  })
})
