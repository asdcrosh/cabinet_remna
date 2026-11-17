import { describe, expect, it } from 'vitest'
import { evaluateAudit } from './check-dependency-audit.mjs'

const now = Date.parse('2026-10-07T00:00:00Z')
const fixture = () => ({
  report: {
    auditReportVersion: 2,
    vulnerabilities: {
      braces: {
        severity: 'high', nodes: ['node_modules/braces'],
        via: [{ severity: 'high', url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm' }],
      },
      tailwindcss: { severity: 'high', nodes: ['node_modules/tailwindcss'], via: ['braces'] },
    },
  },
  lock: { packages: {
    'node_modules/braces': { version: '3.0.3', dev: true },
    'node_modules/tailwindcss': { version: '3.4.19', dev: true },
  } },
})

describe('dependency audit gate', () => {
  it('only exempts the known dev-only advisory and its dependent packages', () => {
    const { report, lock } = fixture()
    expect(evaluateAudit(report, lock, now)).toEqual({ blocked: [], exempted: ['braces', 'tailwindcss'] })
  })

  it.each(['braces', 'tailwindcss'])('blocks when %s becomes a runtime dependency', (name) => {
    const { report, lock } = fixture()
    lock.packages[`node_modules/${name}`].dev = false
    expect(evaluateAudit(report, lock, now).blocked).toContain(name)
  })

  it('blocks another advisory on the same package', () => {
    const { report, lock } = fixture()
    report.vulnerabilities.braces.via.push({ severity: 'high', url: 'https://github.com/advisories/another' })
    expect(evaluateAudit(report, lock, now).blocked).toEqual(['braces', 'tailwindcss'])
  })

  it('blocks a changed package version until reviewed', () => {
    const { report, lock } = fixture()
    lock.packages['node_modules/braces'].version = '3.0.4'
    expect(evaluateAudit(report, lock, now).blocked).toContain('braces')
  })

  it('blocks after the exception expires', () => {
    const { report, lock } = fixture()
    expect(evaluateAudit(report, lock, Date.parse('2026-11-07T00:00:00Z')).blocked).toHaveLength(2)
  })

  it('blocks critical severity even for the known advisory', () => {
    const { report, lock } = fixture()
    report.vulnerabilities.braces.severity = 'critical'
    report.vulnerabilities.braces.via[0].severity = 'critical'
    expect(evaluateAudit(report, lock, now).blocked).toContain('braces')
  })

  it('blocks unknown dependency paths and cycles', () => {
    const { report, lock } = fixture()
    report.vulnerabilities.tailwindcss.via = ['unknown']
    expect(evaluateAudit(report, lock, now).blocked).toContain('tailwindcss')
    report.vulnerabilities.tailwindcss.via = ['tailwindcss']
    expect(evaluateAudit(report, lock, now).blocked).toContain('tailwindcss')
  })

  it('rejects missing lock entries and invalid audit responses', () => {
    const { report, lock } = fixture()
    delete lock.packages['node_modules/braces']
    expect(evaluateAudit(report, lock, now).blocked).toContain('braces')
    expect(() => evaluateAudit({ error: { code: 'ENETUNREACH' } }, lock, now)).toThrow()
  })
})

describe('Picomatch backport in the dependency audit', () => {
  const advisory = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf'
  const paths = ['node_modules/picomatch', 'node_modules/vite/node_modules/picomatch']
  const fixture = () => ({
    report: {
      auditReportVersion: 2,
      vulnerabilities: {
        picomatch: {
          severity: 'high', nodes: paths, via: [{ severity: 'high', url: advisory }],
        },
        vite: {
          severity: 'high', nodes: ['node_modules/vite'], via: ['picomatch'],
        },
      },
    },
    lock: { packages: {
      'node_modules/picomatch': { version: '2.3.2', dev: false },
      'node_modules/vite/node_modules/picomatch': { version: '4.0.7', dev: true },
      'node_modules/vite': { version: '8.3.5', dev: true },
    } },
  })

  it('requires every reported installation to match the backported source', () => {
    const { report, lock } = fixture()
    expect(evaluateAudit(report, lock, now, new Set([paths[0]])).blocked).toEqual(['picomatch', 'vite'])
    expect(evaluateAudit(report, lock, now, new Set(paths))).toEqual({
      blocked: [], exempted: ['picomatch', 'vite'],
    })
  })

  it('resolves a peer-dependency cycle only when its nodes lead to a covered advisory', () => {
    const { report, lock } = fixture()
    report.vulnerabilities.coverage = { severity: 'high', nodes: ['node_modules/coverage'], via: ['vite'] }
    lock.packages['node_modules/coverage'] = { version: '1.0.0', dev: true }
    report.vulnerabilities.vite.via.push('coverage')
    expect(evaluateAudit(report, lock, now, new Set(paths)).blocked).toEqual([])

    report.vulnerabilities.coverage.via = ['coverage']
    expect(evaluateAudit(report, lock, now, new Set(paths)).blocked).toEqual(['vite', 'coverage'])
  })

  it('still blocks an additional advisory on the same package', () => {
    const { report, lock } = fixture()
    report.vulnerabilities.picomatch.via.push({ severity: 'high', url: 'https://github.com/advisories/another' })
    expect(evaluateAudit(report, lock, now, new Set(paths)).blocked).toEqual(['picomatch', 'vite'])
  })
})
