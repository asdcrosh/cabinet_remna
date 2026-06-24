interface RemnashopApiErrorBody {
  detail?: string
}

export class RemnashopApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = 'RemnashopApiError'
  }
}

function getBaseUrl() {
  return process.env.REMNASHOP_API_URL?.trim().replace(/\/+$/, '') || null
}

async function request(path: string, body: unknown) {
  const baseUrl = getBaseUrl()
  if (!baseUrl) return { configured: false as const }

  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  })
  const data = (await response.json().catch(() => null)) as RemnashopApiErrorBody | null
  if (!response.ok) {
    throw new RemnashopApiError(response.status, data?.detail || `Remnashop API error ${response.status}`)
  }
  return { configured: true as const }
}

export async function registerRemnashopEmailUser(input: {
  email: string
  password: string
  name?: string | null
  referralCode?: string | null
}) {
  try {
    return await request('/auth/register', {
      email: input.email,
      password: input.password,
      name: input.name || undefined,
      referral_code: input.referralCode || undefined,
    })
  } catch (error) {
    if (error instanceof RemnashopApiError && error.status === 409) {
      return { configured: true as const, alreadyExists: true as const }
    }
    throw error
  }
}

export async function authenticateRemnashopEmail(email: string, password: string) {
  try {
    const result = await request('/auth/login', { email, password })
    return result.configured
  } catch (error) {
    if (error instanceof RemnashopApiError && [401, 403, 404].includes(error.status)) return false
    throw error
  }
}

export async function ensureRemnashopTelegramUser(initData: string) {
  return request('/auth/telegram/webapp', { init_data: initData })
}
