import { sanitizeDiagnosticText, sanitizeDiagnosticValue } from './error-diagnostics'

export type AdminErrorSource = 'api' | 'interface' | 'promise' | 'manual'

export interface AdminErrorReport {
  id: string
  source: AdminErrorSource
  title: string
  message: string
  explanation: string
  recommendations: string[]
  occurredAt: string
  method?: string
  endpoint?: string
  status?: number
  statusText?: string
  requestId?: string
  errorCode?: string
  technicalDetails?: unknown
}

type ApiReportInput = {
  method?: string
  endpoint: string
  status?: number
  statusText?: string
  data?: unknown
  requestId?: string | null
  networkError?: unknown
}

type ErrorListener = (report: AdminErrorReport) => void

let listeners: ErrorListener[] = []
let pending: AdminErrorReport[] = []
let lastPublishedAt = 0

export function publishAdminError(report: AdminErrorReport) {
  lastPublishedAt = Date.now()
  if (listeners.length === 0) {
    pending = [...pending.slice(-9), report]
    return
  }
  listeners.forEach((listener) => listener(report))
}

export function subscribeToAdminErrors(listener: ErrorListener) {
  listeners.push(listener)
  if (pending.length > 0) {
    const backlog = pending
    pending = []
    backlog.forEach(listener)
  }
  return () => {
    listeners = listeners.filter((current) => current !== listener)
  }
}

export function wasAdminErrorPublishedRecently(windowMs = 1_000) {
  return Date.now() - lastPublishedAt < windowMs
}

export function isAdminErrorPresentationActive() {
  return listeners.length > 0
}

export function createApiErrorReport(input: ApiReportInput): AdminErrorReport {
  const data = asRecord(input.data)
  const rawMessage = firstString(data?.error, data?.message)
    ?? (input.networkError instanceof Error ? input.networkError.message : undefined)
    ?? fallbackMessage(input.status)
  const message = humanizeError(rawMessage, input.status)
  const details = sanitizeDiagnosticValue(data?.details ?? input.data)
  const reason = findReason(data?.details) ?? findReason(input.data)
  const requestId = firstString(input.requestId, data?.requestId)
  const errorCode = firstString(data?.code, nestedString(data?.details, 'code'))
  const endpoint = normalizeEndpoint(input.endpoint)

  return {
    id: createId(),
    source: 'api',
    title: titleForStatus(input.status),
    message,
    explanation: buildExplanation(input.status, rawMessage, reason),
    recommendations: buildRecommendations(input.status, `${rawMessage} ${reason ?? ''}`.trim(), endpoint),
    occurredAt: new Date().toISOString(),
    method: (input.method || 'GET').toUpperCase(),
    endpoint,
    status: input.status,
    statusText: input.statusText,
    requestId: requestId ? sanitizeDiagnosticText(requestId) : undefined,
    errorCode: errorCode ? sanitizeDiagnosticText(errorCode) : undefined,
    technicalDetails: hasUsefulDetails(details) ? details : undefined,
  }
}

export function createRuntimeErrorReport(
  error: unknown,
  source: Extract<AdminErrorSource, 'interface' | 'promise'> = 'interface',
  context?: string,
): AdminErrorReport {
  const normalized = error instanceof Error ? error : new Error(String(error))
  return {
    id: createId(),
    source,
    title: source === 'promise' ? 'Ошибка фоновой операции' : 'Ошибка интерфейса',
    message: humanizeError(normalized.message),
    explanation: context
      ? `Сбой произошёл в разделе «${context}». Интерфейс не смог завершить операцию.`
      : 'Интерфейс не смог завершить операцию. Изменение могло не примениться.',
    recommendations: [
      'Закройте окно и повторите действие один раз.',
      'Если ошибка повторится, скопируйте диагностику и найдите событие в Sentry или серверных логах.',
    ],
    occurredAt: new Date().toISOString(),
    technicalDetails: sanitizeDiagnosticValue({
      type: normalized.name,
      reason: normalized.message,
      stack: normalized.stack,
    }),
  }
}

export function createManualErrorReport(message: string): AdminErrorReport {
  return {
    id: createId(),
    source: 'manual',
    title: 'Действие не выполнено',
    message: humanizeError(message),
    explanation: 'Проверка интерфейса остановила действие до отправки или завершения операции.',
    recommendations: ['Исправьте указанную причину и повторите действие.'],
    occurredAt: new Date().toISOString(),
  }
}

export function formatAdminErrorReport(report: AdminErrorReport) {
  const lines = [
    report.title,
    `Время: ${new Date(report.occurredAt).toLocaleString('ru-RU')}`,
    `Сообщение: ${report.message}`,
    `Объяснение: ${report.explanation}`,
  ]
  if (report.method || report.endpoint) lines.push(`Операция: ${[report.method, report.endpoint].filter(Boolean).join(' ')}`)
  if (report.status) lines.push(`HTTP: ${report.status}${report.statusText ? ` ${report.statusText}` : ''}`)
  if (report.requestId) lines.push(`ID запроса: ${report.requestId}`)
  if (report.errorCode) lines.push(`Код ошибки: ${report.errorCode}`)
  lines.push('Что проверить:', ...report.recommendations.map((item) => `- ${item}`))
  if (report.technicalDetails !== undefined) {
    lines.push('Технические данные:', JSON.stringify(report.technicalDetails, null, 2))
  }
  return lines.join('\n')
}

function buildExplanation(status: number | undefined, rawMessage: string, reason?: string) {
  if (reason && reason !== rawMessage) return sanitizeDiagnosticText(reason)
  if (/permission denied/i.test(rawMessage)) {
    return 'База данных отклонила операцию: у технической роли нет прав на нужную таблицу или последовательность.'
  }
  if (/no writable columns/i.test(rawMessage)) {
    return 'Интеграция нашла таблицу, но не нашла в ней совместимых полей для записи. Вероятно, схема внешнего сервиса отличается от ожидаемой.'
  }
  if (/unique constraint|duplicate key/i.test(rawMessage)) {
    return 'Такая запись уже существует, а операция попыталась создать её повторно.'
  }
  if (/foreign key/i.test(rawMessage)) {
    return 'Связанная запись отсутствует или уже была удалена, поэтому база данных отклонила изменение.'
  }
  if (/timeout|timed out|network|failed to fetch|load failed/i.test(rawMessage)) {
    return 'Клиент не получил ответ вовремя. Причиной может быть сеть, DNS, reverse proxy или недоступность сервиса.'
  }
  switch (status) {
    case 400: return 'Сервер отклонил запрос как некорректный. Обычно причина в формате или составе отправленных данных.'
    case 401: return 'Сессия отсутствует или истекла, поэтому сервер не выполнил операцию.'
    case 403: return 'Сервер распознал запрос, но запретил действие из-за роли, Origin или прав доступа.'
    case 404: return 'Сервер не нашёл запрошенную запись, маршрут или включённую функцию.'
    case 409: return 'Данные изменились или уже находятся в состоянии, несовместимом с этой операцией.'
    case 422: return 'Сервер получил запрос, но значения не прошли проверку.'
    case 429: return 'Сработало ограничение частоты запросов.'
    case 500: return 'На сервере возникло необработанное исключение. Изменение не считается применённым без дополнительной проверки.'
    case 502: return 'Cabinet не получил корректный ответ от внешнего сервиса или upstream.'
    case 503: return 'Сервис временно не готов принимать запросы.'
    default: return 'Операция завершилась ошибкой. Ниже сохранены ответ сервера и данные для поиска причины.'
  }
}

function buildRecommendations(status: number | undefined, message: string, endpoint: string) {
  const result: string[] = []
  if (/permission denied/i.test(message)) {
    result.push('Проверьте GRANT для роли интеграции на указанную таблицу и её sequence.')
  } else if (/no writable columns/i.test(message)) {
    result.push('Сверьте версию и фактические названия колонок внешней базы с адаптером интеграции.')
  } else if (/unique constraint|duplicate key/i.test(message)) {
    result.push('Проверьте существующую запись и идемпотентность повторного запуска.')
  } else if (status === 401) {
    result.push('Войдите в кабинет заново и повторите действие.')
  } else if (status === 403) {
    result.push('Проверьте роль администратора и разрешённый домен запроса.')
  } else if (status === 404) {
    result.push('Убедитесь, что запись ещё существует и нужная функция включена в настройках.')
  } else if (status === 409) {
    result.push('Обновите страницу, проверьте текущее состояние записи и повторите действие.')
  } else if (status === 422 || status === 400) {
    result.push('Проверьте заполненные поля и технические данные ответа ниже.')
  } else if (status === 429) {
    result.push('Подождите до снятия ограничения и не запускайте массовый повтор сразу.')
  } else if (!status || status >= 500) {
    result.push('Проверьте доступность базы данных, Remnawave, Remnashop и платёжного провайдера, связанного с операцией.')
    result.push('Найдите полный ID запроса в логах app или worker и проверьте исходное исключение.')
  }
  if (/remnawave/i.test(message + endpoint)) result.push('Проверьте REMNAWAVE_API_URL, API-токен и доступность панели из контейнера Cabinet.')
  if (/remnashop/i.test(message + endpoint)) result.push('Проверьте REMNASHOP_API_URL, REMNASHOP_DATABASE_URL и права роли remnashop_cabinet.')
  return [...new Set(result)].slice(0, 4)
}

function humanizeError(message: string, status?: number) {
  const normalized = sanitizeDiagnosticText(message.trim())
  const known: Record<string, string> = {
    'Invalid JSON': 'Сервер не смог прочитать отправленные данные.',
    Unauthorized: 'Сессия истекла. Нужно войти заново.',
    Forbidden: 'Недостаточно прав для этого действия.',
    'Not found': 'Запрошенные данные или функция не найдены.',
    'Failed to fetch': 'Не удалось связаться с сервером.',
    'Load failed': 'Не удалось связаться с сервером.',
  }
  return known[normalized] ?? (normalized || fallbackMessage(status))
}

function fallbackMessage(status?: number) {
  return status ? `Сервер вернул ошибку HTTP ${status}.` : 'Не удалось связаться с сервером.'
}

function titleForStatus(status?: number) {
  if (!status) return 'Нет ответа от сервера'
  if (status === 401) return 'Требуется повторный вход'
  if (status === 403) return 'Доступ запрещён'
  if (status === 404) return 'Данные не найдены'
  if (status === 409) return 'Конфликт данных'
  if (status === 422 || status === 400) return 'Запрос не прошёл проверку'
  if (status === 429) return 'Слишком много запросов'
  if (status >= 500) return 'Ошибка сервера или интеграции'
  return 'Действие не выполнено'
}

function normalizeEndpoint(value: string) {
  try {
    const url = new URL(value, 'http://cabinet.local')
    return url.pathname
  } catch {
    return sanitizeDiagnosticText(value.split('?')[0] || value)
  }
}

function firstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim()
}

function nestedString(value: unknown, key: string) {
  const record = asRecord(value)
  return record ? firstString(record[key]) : undefined
}

function findReason(value: unknown): string | undefined {
  const record = asRecord(value)
  return record ? firstString(record.reason, record.message, nestedString(record.cause, 'reason')) : undefined
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function hasUsefulDetails(value: unknown) {
  if (value === undefined || value === null) return false
  if (typeof value === 'object' && !Array.isArray(value)) return Object.keys(value as object).length > 0
  return true
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}
