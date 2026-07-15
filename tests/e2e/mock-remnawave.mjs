import { createServer } from 'node:http'

const port = Number(process.env.E2E_REMNAWAVE_PORT || 4010)
const expireAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()

const user = {
  uuid: 'e2e-expired-uuid',
  shortUuid: 'e2e-expired-short',
  username: 'e2e-expired',
  status: 'EXPIRED',
  usedTrafficBytes: '0',
  lifetimeUsedTrafficBytes: '0',
  trafficLimitBytes: '0',
  trafficLimitStrategy: 'NO_RESET',
  expireAt,
  createdAt: new Date(Date.now() - 32 * 24 * 60 * 60 * 1000).toISOString(),
  vlessUuid: '00000000-0000-4000-8000-000000000001',
  trojanPassword: 'e2e-trojan-password',
  ssPassword: 'e2e-ss-password',
}

const server = createServer((request, response) => {
  if (request.url === '/health') return json(response, 200, { ok: true })

  if (request.headers.authorization !== 'Bearer e2e-token') {
    return json(response, 401, { error: 'unauthorized' })
  }

  if (request.method === 'GET' && request.url === '/api/users/e2e-expired-uuid') {
    return json(response, 200, { response: user })
  }

  if (request.method === 'GET' && request.url === '/api/subscriptions/by-username/e2e-expired') {
    return json(response, 200, {
      response: {
        isFound: true,
        user: {
          shortUuid: user.shortUuid,
          username: user.username,
          daysLeft: -2,
          trafficUsed: '0 B',
          trafficLimit: '0 B',
          lifetimeTrafficUsed: '0 B',
          trafficUsedBytes: '0',
          trafficLimitBytes: '0',
          lifetimeTrafficUsedBytes: '0',
          expiresAt: expireAt,
          isActive: false,
          userStatus: 'EXPIRED',
          trafficLimitStrategy: 'NO_RESET',
        },
        links: [],
        subscriptionUrl: 'https://subscription.example.test/e2e-expired-short',
      },
    })
  }

  if (
    request.method === 'GET' &&
    request.url?.startsWith('/api/bandwidth-stats/users/e2e-expired-uuid?')
  ) {
    return json(response, 200, {
      response: {
        categories: [],
        sparklineData: [],
        series: [],
      },
    })
  }

  return json(response, 404, { error: 'not found' })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`E2E Remnawave mock listening on http://127.0.0.1:${port}`)
})

function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}
