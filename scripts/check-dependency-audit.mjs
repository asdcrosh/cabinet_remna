import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Upstream has no fix for GHSA-vfj7-8cjw-p6xm as of 2026-10-07.
// Braces only processes repository-owned Tailwind/ESLint patterns during builds.
// Recheck by 2026-11-07; never exempt a runtime dependency or another advisory.
const bracesAdvisory = 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm'
const reviewDeadline = Date.parse('2026-11-07T00:00:00Z')
const isHigh = (severity) => severity === 'high' || severity === 'critical'

export function evaluateAudit(report, lock, now = Date.now()) {
  if (report.auditReportVersion !== 2 || report.error || !report.vulnerabilities || !lock.packages) {
    throw new Error('Invalid npm audit report or package lock')
  }
  const vulnerabilities = report.vulnerabilities
  const isExempt = (name, visited = new Set()) => {
    const item = vulnerabilities[name]
    if (!item || item.severity !== 'high' || visited.has(name) || now >= reviewDeadline) return false
    if (!item.nodes?.length || !item.nodes.every((node) => lock.packages[node]?.dev === true)) return false
    if (!item.via?.length) return false
    const nextVisited = new Set([...visited, name])
    let hasExemptAdvisory = false
    const onlyExemptCauses = item.via.every((cause) => {
      if (typeof cause === 'string') {
        if (!vulnerabilities[cause]) return false
        if (!isHigh(vulnerabilities[cause].severity)) return true
        const exempt = isExempt(cause, nextVisited)
        hasExemptAdvisory ||= exempt
        return exempt
      }
      if (!isHigh(cause.severity)) return true
      const exempt = name === 'braces' && cause.url === bracesAdvisory && cause.severity === 'high'
        && item.nodes.every((node) => lock.packages[node].version === '3.0.3')
      hasExemptAdvisory ||= exempt
      return exempt
    })
    return onlyExemptCauses && hasExemptAdvisory
  }
  const blocked = []
  const exempted = []
  for (const [name, item] of Object.entries(vulnerabilities)) {
    if (isHigh(item.severity)) (isExempt(name) ? exempted : blocked).push(name)
  }
  return { blocked, exempted }
}

function main() {
  const audit = spawnSync('npm', ['audit', '--json'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  if (audit.error || ![0, 1].includes(audit.status)) {
    throw new Error('npm audit failed to complete')
  }
  const report = JSON.parse(audit.stdout)
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
  const { blocked, exempted } = evaluateAudit(report, lock)
  console.log('npm audit:', report.metadata?.vulnerabilities)
  if (exempted.length) {
    console.warn(`Temporary dev-only exception until 2026-11-07: ${bracesAdvisory} (${exempted.join(', ')})`)
  }
  if (blocked.length) {
    console.error(`Blocking high/critical vulnerabilities: ${blocked.join(', ')}`)
    process.exitCode = 1
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
