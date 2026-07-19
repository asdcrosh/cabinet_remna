const baseUrl = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')
const paths = ['/', '/login', '/register', '/offer', '/terms', '/privacy', '/consent', '/contacts', '/refunds', '/api/plans']
const deadline = Date.now() + 30_000
const healthHeaders = process.env.HEALTHCHECK_TOKEN
  ? { 'x-healthcheck-token': process.env.HEALTHCHECK_TOKEN }
  : undefined
if (healthHeaders) paths.push('/api/health')

while (Date.now() < deadline) {
  try {
    const response = await fetch(`${baseUrl}/login`, {
      signal: AbortSignal.timeout(2_000),
    })
    if (response.ok) break
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 500))
}

const failures = []
for (const path of paths) {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: path === '/api/health' ? healthHeaders : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(5_000),
    })
    if (response.status >= 400) failures.push(`${path}: ${response.status}`)
  } catch (error) {
    failures.push(`${path}: ${error instanceof Error ? error.message : 'request failed'}`)
  }
}

if (failures.length > 0) {
  console.error(`Smoke checks failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`)
  process.exit(1)
}

console.log(`Smoke checks passed for ${paths.length} routes`)
