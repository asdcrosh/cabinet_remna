import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('reverse proxy client IP headers', () => {
  it.each(['deploy/nginx.conf', 'deploy/setup-nginx-proxy.sh'])(
    'replaces client-supplied X-Forwarded-For in %s',
    (relativePath) => {
      const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8')
      const normalized = source.replaceAll('\\$', '$')

      expect(normalized).toContain('proxy_set_header X-Forwarded-For $remote_addr;')
      expect(normalized).not.toContain('proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;')
      expect(normalized).toContain('add_header Referrer-Policy "no-referrer" always;')
    }
  )
})
