import { readdir, stat } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { remnawave } from '@/lib/remnawave'

export type SystemHealthStatus = 'ok' | 'warn' | 'error'

export interface SystemHealthCheck {
  id: string
  title: string
  status: SystemHealthStatus
  message: string
  details?: string
  checkedAt: string
}

export interface SystemHealthReport {
  ok: boolean
  checkedAt: string
  checks: SystemHealthCheck[]
}

const CHECK_TIMEOUT_MS = 8_000

function nowIso() {
  return new Date().toISOString()
}

function check(
  id: string,
  title: string,
  status: SystemHealthStatus,
  message: string,
  details?: string
): SystemHealthCheck {
  return { id, title, status, message, details, checkedAt: nowIso() }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

function env(name: string) {
  return process.env[name]?.trim() || ''
}

async function checkDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return check('database', 'База кабинета', 'ok', 'PostgreSQL доступна')
  } catch (error) {
    return check('database', 'База кабинета', 'error', 'PostgreSQL недоступна', errorMessage(error))
  }
}

async function checkRemnawave() {
  if (!env('REMNAWAVE_BASE_URL') || !env('REMNAWAVE_TOKEN')) {
    return check('remnawave', 'Remnawave API', 'error', 'Не заполнены REMNAWAVE_BASE_URL или REMNAWAVE_TOKEN')
  }

  try {
    await remnawave.getInternalSquads()
    return check('remnawave', 'Remnawave API', 'ok', 'Панель отвечает')
  } catch (error) {
    return check('remnawave', 'Remnawave API', 'error', 'Не удалось подключиться к панели', errorMessage(error))
  }
}

async function checkYooKassa() {
  const shopId = env('YOOKASSA_SHOP_ID')
  const secretKey = env('YOOKASSA_SECRET_KEY')
  if (!shopId || !secretKey) {
    return check('yookassa', 'YooKassa', 'error', 'Не заполнены YOOKASSA_SHOP_ID или YOOKASSA_SECRET_KEY')
  }

  try {
    const response = await fetch('https://api.yookassa.ru/v3/payments?limit=1', {
      headers: {
        Authorization: `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    })
    if (response.ok) {
      return check('yookassa', 'YooKassa', 'ok', 'Ключи приняты, API отвечает')
    }
    const details = await response.text().catch(() => '')
    return check('yookassa', 'YooKassa', 'error', `API вернул ${response.status}`, details.slice(0, 300))
  } catch (error) {
    return check('yookassa', 'YooKassa', 'error', 'Не удалось проверить YooKassa', errorMessage(error))
  }
}

async function checkTelegram() {
  const token = env('TELEGRAM_BOT_TOKEN')
  if (!token) {
    return check('telegram', 'Telegram бот', 'warn', 'TELEGRAM_BOT_TOKEN не заполнен')
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    })
    const data = await response.json().catch(() => null) as { ok?: boolean; result?: { username?: string } } | null
    if (response.ok && data?.ok) {
      return check('telegram', 'Telegram бот', 'ok', data.result?.username ? `Бот @${data.result.username} отвечает` : 'Бот отвечает')
    }
    return check('telegram', 'Telegram бот', 'error', `Telegram вернул ${response.status}`, JSON.stringify(data)?.slice(0, 300))
  } catch (error) {
    return check('telegram', 'Telegram бот', 'error', 'Не удалось проверить Telegram', errorMessage(error))
  }
}

async function checkEmail(sendEmail: boolean) {
  const webhookUrl = env('EMAIL_VERIFICATION_WEBHOOK_URL')
  const webhookSecret = env('EMAIL_VERIFICATION_WEBHOOK_SECRET')
  const resendKey = env('RESEND_API_KEY')
  const from = env('EMAIL_FROM')
  const testTo = env('SYSTEM_HEALTH_EMAIL_TO') || env('ADMIN_EMAIL')
  const usesBuiltInSender = webhookUrl.includes('/api/email/resend')

  if (!webhookUrl || !webhookSecret) {
    return check('email', 'Email', 'error', 'Email не настроен полностью')
  }
  if (usesBuiltInSender && (!resendKey || !from)) {
    return check('email', 'Email', 'error', 'Встроенный Resend-отправщик не настроен полностью')
  }

  if (!sendEmail) {
    return check('email', 'Email', 'ok', 'Отправка настроена')
  }

  if (!testTo) {
    return check('email', 'Email', 'warn', 'Нет адреса для тестовой отправки', 'Заполните SYSTEM_HEALTH_EMAIL_TO или ADMIN_EMAIL')
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${webhookSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: testTo,
        subject: 'Проверка отправки email',
        text: 'Проверка системы прошла: кабинет умеет отправлять email.',
        html: '<p>Проверка системы прошла: кабинет умеет отправлять email.</p>',
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    })
    if (response.ok) {
      return check('email', 'Email', 'ok', `Тестовое письмо отправлено на ${testTo}`)
    }
    const details = await response.text().catch(() => '')
    return check('email', 'Email', 'error', `Отправщик вернул ${response.status}`, details.slice(0, 300))
  } catch (error) {
    return check('email', 'Email', 'error', 'Не удалось отправить тестовое письмо', errorMessage(error))
  }
}

async function latestBackup() {
  const backupDir = env('SYSTEM_HEALTH_BACKUP_DIR') || env('FULL_BACKUP_DIR') || '/backups'
  const maxAgeHours = Number(env('SYSTEM_HEALTH_BACKUP_MAX_AGE_HOURS') || '48')
  const required = env('SYSTEM_HEALTH_BACKUP_REQUIRED') === 'true'

  try {
    const entries = await readdir(backupDir)
    const archives = await Promise.all(
      entries
        .filter((entry) => /^remna-full-backup-.*\.tar\.gz$/.test(entry))
        .map(async (entry) => {
          const fullPath = path.join(backupDir, entry)
          const stats = await stat(fullPath)
          return { entry, fullPath, mtime: stats.mtime, size: stats.size }
        })
    )
    archives.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
    const latest = archives[0]
    if (!latest) {
      return check('backup', 'Бэкапы', 'warn', 'Архивы не найдены', `Каталог: ${backupDir}`)
    }

    const ageHours = (Date.now() - latest.mtime.getTime()) / 3_600_000
    const ageText = ageHours < 1 ? 'меньше часа назад' : `${Math.round(ageHours)} ч назад`
    return check(
      'backup',
      'Бэкапы',
      ageHours <= maxAgeHours ? 'ok' : 'warn',
      `Последний бэкап: ${ageText}`,
      `${latest.entry}, ${(latest.size / 1024 / 1024).toFixed(1)} MB`
    )
  } catch (error) {
    return check(
      'backup',
      'Бэкапы',
      required ? 'warn' : 'ok',
      'Проверяются в консоли cabinetctl',
      required ? errorMessage(error) : 'Веб-контейнер не читает каталог бэкапов напрямую'
    )
  }
}

async function checkS3() {
  const bucket = env('SYSTEM_HEALTH_S3_BUCKET') || env('S3_BUCKET')
  const accessKey = env('SYSTEM_HEALTH_S3_ACCESS_KEY') || env('S3_ACCESS_KEY')
  const secretKey = env('SYSTEM_HEALTH_S3_SECRET_KEY') || env('S3_SECRET_KEY')

  if (!bucket || !accessKey || !secretKey) {
    return check('s3', 'S3', 'ok', 'Проверяется в консоли cabinetctl', 'Для проверки из веба можно заполнить SYSTEM_HEALTH_S3_*')
  }

  return check('s3', 'S3', 'ok', `S3 настроен для bucket ${bucket}`)
}

export async function getSystemHealth(options: { sendEmail?: boolean } = {}): Promise<SystemHealthReport> {
  const checkedAt = nowIso()
  const checks = await Promise.all([
    checkDatabase(),
    checkRemnawave(),
    checkYooKassa(),
    checkEmail(Boolean(options.sendEmail)),
    checkTelegram(),
    latestBackup(),
    checkS3(),
  ])

  return {
    ok: checks.every((item) => item.status !== 'error'),
    checkedAt,
    checks,
  }
}
