import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { picomatchAdvisory, verifiedPicomatchBackports } from './backport-picomatch.mjs'

// Upstream has no fix for GHSA-vfj7-8cjw-p6xm as of 2026-10-07.
// Braces only processes repository-owned Tailwind/ESLint patterns during builds.
// Recheck by 2026-11-07; never exempt a runtime dependency or another advisory.
const bracesAdvisory = 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm'
const reviewDeadline = Date.parse('2026-11-07T00:00:00Z')
const isHigh = (severity) => severity === 'high' || severity === 'critical'

export function evaluateAudit(report, lock, now = Date.now(), patchedPicomatch = new Set()) {
  if (report.auditReportVersion !== 2 || report.error || !report.vulnerabilities || !lock.packages) {
    throw new Error('Invalid npm audit report or package lock')
  }
  const vulnerabilities = report.vulnerabilities
  function addressedAdvisories(name) {
    const pending = [name]
    const seen = new Set()
    const corrected = new Set()
    const devOnly = new Set()
    const dependents = new Map()

    while (pending.length > 0) {
      const dependency = pending.pop()
      if (seen.has(dependency)) continue
      seen.add(dependency)

      const item = vulnerabilities[dependency]
      if (!item || item.severity !== 'high' || !item.via?.length) return false
      if (!item.nodes?.length || !item.nodes.every((node) => lock.packages[node])) return false

      for (const cause of item.via) {
        if (typeof cause === 'string') {
          if (!vulnerabilities[cause]) return false
          if (!isHigh(vulnerabilities[cause].severity)) continue
          if (!dependents.has(cause)) dependents.set(cause, new Set())
          dependents.get(cause).add(dependency)
          pending.push(cause)
          continue
        }
        if (!isHigh(cause.severity)) continue
        if (cause.severity !== 'high') return false

        if (dependency === 'braces' && cause.url === bracesAdvisory && now < reviewDeadline
          && item.nodes.every((node) => lock.packages[node].version === '3.0.3')) {
          devOnly.add(dependency)
        } else if (dependency !== 'picomatch' || cause.url !== picomatchAdvisory
          || !item.nodes.every((node) => patchedPicomatch.has(node))) {
          return false
        }
        corrected.add(dependency)
      }
    }

    // npm can report cycles through peer dependencies. Every visited node
    // still needs a path to an actual advisory covered by a mitigation.
    function includeDependents(nodes) {
      for (const dependency of nodes) {
        for (const dependent of dependents.get(dependency) ?? []) nodes.add(dependent)
      }
    }
    includeDependents(corrected)
    if (corrected.size !== seen.size) return false

    includeDependents(devOnly)
    return [...devOnly].every((dependency) =>
      vulnerabilities[dependency].nodes.every((node) => lock.packages[node].dev === true),
    )
  }

  const blocked = []
  const exempted = []
  for (const [name, item] of Object.entries(vulnerabilities)) {
    if (isHigh(item.severity)) (addressedAdvisories(name) ? exempted : blocked).push(name)
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
  const patchedPicomatch = verifiedPicomatchBackports(lock)
  const { blocked, exempted } = evaluateAudit(report, lock, Date.now(), patchedPicomatch)
  console.log('npm audit:', report.metadata?.vulnerabilities)
  if (exempted.length) {
    console.log(`Addressed audit findings: ${exempted.join(', ')}`)
    if (exempted.includes('picomatch')) console.log(`Verified Picomatch backport: ${picomatchAdvisory}`)
    if (exempted.includes('braces')) console.warn(`Temporary dev-only exception until 2026-11-07: ${bracesAdvisory}`)
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
