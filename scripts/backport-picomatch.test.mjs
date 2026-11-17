import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { verifiedPicomatchBackports } from './backport-picomatch.mjs'

const require = createRequire(import.meta.url)
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
const versions = new Set(['2.3.2', '4.0.4', '4.0.5', '4.0.7'])
const patchedPaths = Object.keys(lock.packages).filter(path =>
  path.endsWith('/picomatch') && versions.has(lock.packages[path].version),
)

describe('Picomatch backport', () => {
  it('verifies the installed parser for every locked affected copy', () => {
    expect(verifiedPicomatchBackports(lock)).toEqual(new Set(patchedPaths))
  })

  it.each(patchedPaths)('keeps ordinary globs and literalizes complex single-branch repetitions (%s)', (path) => {
    const match = require(resolve(path))
    expect(match('src/**/*.ts')('src/app/page.ts')).toBe(true)
    expect(match('+(draft)')('draftdraft')).toBe(true)
    expect(match('+(draft|final)')('draftfinal')).toBe(true)
    const pattern = '+(draft[12])'
    expect(match(pattern, { maxExtglobRecursion: false })(pattern)).toBe(true)
    expect(match(pattern, { maxExtglobRecursion: false })('draft1draft2')).toBe(false)
  })
})
