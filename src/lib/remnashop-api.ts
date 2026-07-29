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

export async function changeRemnashopPassword(input: {
  email: string
  currentPassword: string
  newPassword: string
}) {
  const baseUrl = getBaseUrl()
  if (!baseUrl) return { configured: false as const }

  const loginResponse = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: input.email,
      password: input.currentPassword,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  })
  const loginData = (await loginResponse.json().catch(() => null)) as RemnashopApiErrorBody | null
  if (!loginResponse.ok) {
    return {
      configured: true as const,
      changed: false as const,
      reason: 'current_password_mismatch' as const,
      detail: loginData?.detail,
    }
  }

  const cookie = getResponseCookieHeader(loginResponse.headers)
  if (!cookie) {
    throw new RemnashopApiError(502, 'Remnashop did not return an authenticated session')
  }

  const changeResponse = await fetch(`${baseUrl}/auth/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify({
      current_password: input.currentPassword,
      new_password: input.newPassword,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  })
  const changeData = (await changeResponse.json().catch(() => null)) as RemnashopApiErrorBody | null
  if (!changeResponse.ok) {
    throw new RemnashopApiError(
      changeResponse.status,
      changeData?.detail || `Remnashop API error ${changeResponse.status}`
    )
  }

  return { configured: true as const, changed: true as const }
}

function getResponseCookieHeader(headers: Headers) {
  const cookieHeaders =
    (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ??
    (headers.get('set-cookie') ? [headers.get('set-cookie') as string] : [])

  return cookieHeaders
    .map((value) => value.split(';', 1)[0]?.trim())
    .filter(Boolean)
    .join('; ')
}
