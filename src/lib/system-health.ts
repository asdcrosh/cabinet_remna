import { readdir, stat } from 'fs/promises'
import { prisma } from '@/lib/prisma'
import { remnawave } from '@/lib/remnawave'
import { getProvisioningQueueHealth } from '@/lib/job-health'
import { getResolvedPaymentProviderSettings } from '@/lib/payment-settings'
import { checkPlategaConnection } from '@/lib/platega'
import { getRemnashopIntegrationStatus } from '@/lib/remnashop-sync'
import { getWatchConfig } from '@/lib/watch-config'
import { getWorkerHeartbeat, type WorkerHeartbeatName } from '@/lib/worker-health'
import { getDeploymentHealthSnapshot } from '@/lib/deployment-health'

export type SystemHealthStatus = 'ok' | 'warn' | 'error' | 'off'
export type SystemHealthCategory = 'deployment' | 'core' | 'payments' | 'sync' | 'workers' | 'communications' | 'watch' | 'backups'

export interface SystemHealthMetric {
  label: string
  value: string
  tone?: 'neutral' | 'positive' | 'warning' | 'negative'
}

export interface SystemHealthCheck {
  id: string
  title: string
  status: SystemHealthStatus
  message: string
  details?: string
  category: SystemHealthCategory
  actionHref?: string
  actionLabel?: string
  metrics?: SystemHealthMetric[]
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
  details?: string,
  extra: Partial<Pick<SystemHealthCheck, 'metrics' | 'actionHref' | 'actionLabel'>> = {}
): SystemHealthCheck {
  return {
    id,
    title,
    status,
    message,
    details,
    category: categoryForCheck(id),
    ...actionForCheck(id),
    ...extra,
    checkedAt: nowIso(),
  }
}

function categoryForCheck(id: string): SystemHealthCategory {
  if (id.startsWith('deployment-')) return 'deployment'
  if (['payment-overview', 'yookassa', 'payanyway', 'platega'].includes(id)) return 'payments'
  if (['remnawave', 'remnashop', 'provisioning-queue', 'sync-events'].includes(id)) return 'sync'
  if (id.endsWith('-worker') || id === 'broadcast-backlog') return 'workers'
  if (['telegram', 'email'].includes(id)) return 'communications'
  if (id === 'watch') return 'watch'
  if (['backup', 's3'].includes(id)) return 'backups'
  return 'core'
}

function shortRevision(revision: string | null | undefined) {
  return revision ? revision.slice(0, 7) : 'неизвестно'
}

async function checkDeployment() {
  const snapshot = await getDeploymentHealthSnapshot()
  const { build, remoteRevision, remoteError, deployment, migration } = snapshot
  const updateAvailable = Boolean(build.revision && remoteRevision && build.revision !== remoteRevision)
  const buildStatus: SystemHealthStatus = !build.revision ? 'warn' : updateAvailable ? 'warn' : 'ok'
  const buildMessage = !build.revision
    ? 'Версия запущенного образа не определена'
    : updateAvailable
      ? `Доступно обновление ${shortRevision(remoteRevision)}`
      : 'Запущена актуальная версия'
  const buildDetails = [
    build.image ? `Образ: ${build.image}` : undefined,
    build.createdAt ? `Сборка: ${build.createdAt}` : undefined,
    remoteError ? `Проверка latest: ${remoteError}` : undefined,
  ].filter(Boolean).join('. ')

  const buildCheck = check(
    'deployment-build',
    'Версия приложения',
    buildStatus,
    buildMessage,
    buildDetails || undefined,
    {
      metrics: [
        { label: 'Запущено', value: shortRevision(build.revision) },
        { label: 'Доступно', value: shortRevision(remoteRevision), tone: updateAvailable ? 'warning' : 'neutral' },
      ],
    }
  )

  const migrationStatus: SystemHealthStatus = migration.status === 'ok'
    ? 'ok'
    : migration.status === 'error'
      ? 'error'
      : 'warn'
  const migrationMessage = migration.status === 'ok'
    ? 'Схема базы актуальна'
    : migration.failed.length > 0
      ? `Не завершены миграции: ${migration.failed.length}`
      : migration.missing.length > 0
        ? `Не применены миграции: ${migration.missing.length}`
        : 'Статус миграций не определён'
  const migrationDetails = migration.details
    || (migration.failed.length > 0 ? `С ошибкой: ${migration.failed.join(', ')}` : undefined)
    || (migration.missing.length > 0 ? `Ожидают: ${migration.missing.join(', ')}` : undefined)
  const migrationCheck = check('deployment-migrations', 'Миграции базы', migrationStatus, migrationMessage, migrationDetails, {
    metrics: [
      { label: 'Применено', value: String(migration.applied), tone: migration.status === 'ok' ? 'positive' : 'neutral' },
      { label: 'В образе', value: String(migration.expected) },
    ],
  })

  let deploymentStatus: SystemHealthStatus = 'warn'
  let deploymentMessage = 'История обновлений ещё не записана'
  let deploymentDetails: string | undefined
  if (deployment) {
    deploymentStatus = deployment.status === 'success'
      ? 'ok'
      : deployment.status === 'deploying'
        ? 'warn'
        : 'error'
    deploymentMessage = deployment.status === 'success'
      ? `Последнее обновление успешно: ${shortRevision(deployment.deployedRevision)}`
      : deployment.status === 'deploying'
        ? `Обновление выполняется: ${shortRevision(deployment.targetRevision)}`
        : deployment.status === 'rolled_back'
          ? `Обновление отменено, восстановлена ${shortRevision(deployment.rollbackRevision)}`
          : 'Последнее обновление завершилось ошибкой'
    deploymentDetails = [
      deployment.message,
      deployment.finishedAt ? `Завершено: ${deployment.finishedAt}` : undefined,
      deployment.health?.local ? `Локальный health-check: ${deployment.health.local}` : undefined,
      deployment.health?.public ? `Публичный health-check: ${deployment.health.public}` : undefined,
    ].filter(Boolean).join('. ')
  }

  return [
    buildCheck,
    migrationCheck,
    check('deployment-result', 'Последнее развёртывание', deploymentStatus, deploymentMessage, deploymentDetails),
  ]
}

function actionForCheck(id: string) {
  if (id === 'payment-overview' || ['yookassa', 'payanyway', 'platega'].includes(id)) {
    return { actionHref: '/dashboard/admin/payments', actionLabel: 'Открыть платежи' }
  }
  if (id === 'remnashop' || id === 'sync-events') {
    return { actionHref: '/dashboard/admin/remnashop-sync', actionLabel: 'Открыть синхронизацию' }
  }
  if (id === 'watch' || id === 'watch-worker') {
    return { actionHref: '/dashboard/admin/watch', actionLabel: 'Открыть Watch' }
  }
  if (id === 'node-provisioning-worker') {
    return { actionHref: '/dashboard/admin/nodes', actionLabel: 'Открыть ноды' }
  }
  if (id === 'broadcast-backlog' || id === 'broadcast-worker') {
    return { actionHref: '/dashboard/admin/broadcasts', actionLabel: 'Открыть рассылки' }
  }
  if (id === 'provisioning-queue' || id === 'payment-worker') {
    return { actionHref: '/dashboard/admin/recovery', actionLabel: 'Открыть восстановление' }
  }
  return {}
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

function errorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
}

function env(name: string) {
  return process.env[name]?.trim() || ''
}

function safeBackupPath(backupDir: string, entry: string) {
  if (!backupDir.startsWith('/')) return null
  if (entry.includes('/') || entry.includes('\\') || entry === '..') return null
  return `${backupDir.replace(/\/+$/, '')}/${entry}`
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

async function checkRemnashop() {
  const integration = await getRemnashopIntegrationStatus()
  if (integration.state === 'READY') {
    return check('remnashop', 'Remnashop', 'ok', integration.message)
  }
  if (integration.state === 'ERROR') {
    return check('remnashop', 'Remnashop', 'error', integration.message)
  }
  return check('remnashop', 'Remnashop', 'warn', integration.message)
}

async function checkWorker(worker: WorkerHeartbeatName, id: string, title: string) {
  try {
    const heartbeat = await getWorkerHeartbeat(worker)
    if (!heartbeat) {
      return check(id, title, 'warn', 'Воркер ещё не передавал сигнал', 'После обновления дождитесь первого рабочего цикла.')
    }
    if (heartbeat.resetAt <= new Date()) {
      return check(
        id,
        title,
        'error',
        'Воркер не отвечает',
        `Последний сигнал: ${heartbeat.updatedAt.toISOString()}`
      )
    }
    return check(id, title, 'ok', 'Воркер работает', `Последний сигнал: ${heartbeat.updatedAt.toISOString()}`)
  } catch (error) {
    return check(id, title, 'warn', 'Не удалось проверить воркер', errorMessage(error))
  }
}

async function checkPaymentOverview() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const cancelAfterSeconds = positiveInteger(env('PAYMENT_CANCEL_PENDING_AFTER_SECONDS'), 600)
  const staleBefore = new Date(Date.now() - cancelAfterSeconds * 1000)
  try {
    const [succeeded, pending, canceled, refunded, stale, unprovisioned, failedJobs, eventErrors] = await Promise.all([
      prisma.payment.count({ where: { status: 'SUCCEEDED', createdAt: { gte: since } } }),
      prisma.payment.count({ where: { status: 'PENDING', createdAt: { gte: since } } }),
      prisma.payment.count({ where: { status: 'CANCELED', createdAt: { gte: since } } }),
      prisma.payment.count({ where: { status: 'REFUNDED', createdAt: { gte: since } } }),
      prisma.payment.count({ where: { status: 'PENDING', createdAt: { lt: staleBefore } } }),
      prisma.payment.count({ where: { status: 'SUCCEEDED', subscriptionProvisionedAt: null } }),
      prisma.provisioningJob.count({ where: { status: 'FAILED' } }),
      prisma.paymentEvent.count({ where: { status: 'ERROR', updatedAt: { gte: since } } }),
    ])
    const status: SystemHealthStatus = unprovisioned > 0 || failedJobs > 0
      ? 'error'
      : stale > 0 || eventErrors > 0
        ? 'warn'
        : 'ok'
    const message = unprovisioned > 0 || failedJobs > 0
      ? `Нужна довыдача: ${Math.max(unprovisioned, failedJobs)}`
      : stale > 0 || eventErrors > 0
        ? `Требуют проверки: ${stale + eventErrors}`
        : 'Критичных операций нет'
    return check('payment-overview', 'Платежи за 24 часа', status, message, undefined, {
      metrics: [
        { label: 'Успешно', value: String(succeeded), tone: 'positive' },
        { label: 'Ожидают', value: String(pending), tone: pending > 0 ? 'warning' : 'neutral' },
        { label: 'Отменено', value: String(canceled) },
        { label: 'Возвраты', value: String(refunded) },
        { label: 'Довыдача', value: String(Math.max(unprovisioned, failedJobs)), tone: failedJobs > 0 ? 'negative' : 'neutral' },
        { label: 'Ошибки цепочки', value: String(eventErrors), tone: eventErrors > 0 ? 'warning' : 'neutral' },
      ],
    })
  } catch (error) {
    return check('payment-overview', 'Платежи за 24 часа', 'error', 'Не удалось собрать статистику', errorMessage(error))
  }
}

async function checkYooKassa() {
  const { yookassa } = await getResolvedPaymentProviderSettings()
  if (!yookassa.enabled) return check('yookassa', 'YooKassa', 'off', 'Отключена')

  const { shopId, secretKey } = yookassa
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

async function checkPayAnyWay() {
  const { payAnyWay } = await getResolvedPaymentProviderSettings()
  if (!payAnyWay.enabled) return check('payanyway', 'PayAnyWay', 'off', 'Отключён')

  const { merchantId, integrityCode } = payAnyWay
  if (!merchantId || !integrityCode) {
    return check('payanyway', 'PayAnyWay', 'error', 'Не заполнены номер счёта или код проверки целостности')
  }
  if (!/^\d+$/.test(merchantId) || (integrityCode.length < 32 && integrityCode !== '12345')) {
    return check('payanyway', 'PayAnyWay', 'error', 'Проверьте номер счёта и задайте секрет длиной от 32 символов')
  }
  if (integrityCode === '12345') {
    return check('payanyway', 'PayAnyWay', 'warn', 'Используется legacy-код Self.PayAnyWay. Обратитесь в поддержку для синхронизации нового кода')
  }
  return check('payanyway', 'PayAnyWay', 'ok', 'Платёжная форма и Pay URL настроены')
}

async function checkPlatega() {
  const { platega } = await getResolvedPaymentProviderSettings()
  if (!platega.enabled) return check('platega', 'Platega', 'off', 'Отключена')
  if (!platega.merchantId || !platega.secret) {
    return check('platega', 'Platega', 'error', 'Не заполнены Merchant ID или API Secret')
  }

  try {
    await checkPlategaConnection()
    return check('platega', 'Platega', 'ok', 'Ключи приняты, API отвечает')
  } catch (error) {
    return check('platega', 'Platega', 'error', 'Не удалось проверить Platega', errorMessage(error))
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
      const chatId = env('TELEGRAM_NOTIFY_CHAT_ID')
      if (!chatId) {
        return check(
          'telegram',
          'Telegram бот',
          'warn',
          data.result?.username ? `Бот @${data.result.username} отвечает` : 'Бот отвечает',
          'TELEGRAM_NOTIFY_CHAT_ID не настроен: системные уведомления администратору не отправляются.'
        )
      }
      const chatResponse = await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(chatId)}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      })
      if (!chatResponse.ok) {
        const chatError = await chatResponse.text().catch(() => '')
        return check('telegram', 'Telegram бот', 'error', 'Бот отвечает, но чат уведомлений недоступен', chatError.slice(0, 300))
      }
      return check('telegram', 'Telegram бот', 'ok', data.result?.username ? `Бот @${data.result.username} и чат доступны` : 'Бот и чат доступны')
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
          const fullPath = safeBackupPath(backupDir, entry)
          if (!fullPath) return null
          const stats = await stat(fullPath)
          return { entry, fullPath, mtime: stats.mtime, size: stats.size }
        })
    )
    const validArchives = archives.filter((archive) => archive !== null)
    validArchives.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
    const latest = validArchives[0]
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
    const accessDenied = errorCode(error) === 'EACCES'
    return check(
      'backup',
      'Бэкапы',
      required ? 'warn' : 'ok',
      accessDenied ? 'Каталог бэкапов недоступен из веб-контейнера' : 'Проверяются в консоли cabinetctl',
      required
        ? errorMessage(error)
        : accessDenied
          ? 'Это нормально, если бэкапы настроены через cabinetctl или S3.'
          : 'Веб-контейнер не читает каталог бэкапов напрямую'
    )
  }
}

async function checkS3() {
  const bucket = env('SYSTEM_HEALTH_S3_BUCKET') || env('S3_BUCKET')
  const accessKey = env('SYSTEM_HEALTH_S3_ACCESS_KEY') || env('S3_ACCESS_KEY')
  const secretKey = env('SYSTEM_HEALTH_S3_SECRET_KEY') || env('S3_SECRET_KEY')

  if (!bucket || !accessKey || !secretKey) {
    return check('s3', 'S3', 'off', 'Не подключён к веб-проверке', 'Настройки host-level S3 проверяются командой cabinetctl backup-status.')
  }

  return check('s3', 'S3', 'ok', `S3 настроен для bucket ${bucket}`)
}

async function checkWatch() {
  const config = getWatchConfig()
  if (!config.enabled) return check('watch', 'Watch', 'off', 'Мониторинг отключён')

  try {
    const [runtime, openIncidents, downNodes, degradedNodes, totalNodes] = await Promise.all([
      prisma.watchRuntimeState.findUnique({ where: { id: 'default' } }),
      prisma.watchIncident.count({ where: { status: 'OPEN' } }),
      prisma.watchNodeState.count({ where: { status: 'DOWN' } }),
      prisma.watchNodeState.count({ where: { status: 'DEGRADED' } }),
      prisma.watchNodeState.count(),
    ])
    if (!runtime?.lastRunAt) {
      return check('watch', 'Watch', 'warn', 'Ожидается первая проверка')
    }
    const staleAfterMs = Math.max(180, config.intervalSeconds * 4) * 1000
    const stale = Date.now() - runtime.lastRunAt.getTime() > staleAfterMs
    const status: SystemHealthStatus = stale || downNodes > 0
      ? 'error'
      : degradedNodes > 0 || openIncidents > 0
        ? 'warn'
        : 'ok'
    const message = stale
      ? 'Проверки Watch остановились'
      : downNodes > 0
        ? `Недоступных нод: ${downNodes}`
        : degradedNodes > 0
          ? `Нод с деградацией: ${degradedNodes}`
          : 'Ноды проверяются штатно'
    return check('watch', 'Watch', status, message, `Последний цикл: ${runtime.lastRunAt.toISOString()}`, {
      metrics: [
        { label: 'Ноды', value: String(totalNodes) },
        { label: 'Недоступны', value: String(downNodes), tone: downNodes > 0 ? 'negative' : 'neutral' },
        { label: 'Деградация', value: String(degradedNodes), tone: degradedNodes > 0 ? 'warning' : 'neutral' },
        { label: 'Инциденты', value: String(openIncidents), tone: openIncidents > 0 ? 'warning' : 'neutral' },
      ],
    })
  } catch (error) {
    return check('watch', 'Watch', 'error', 'Не удалось прочитать состояние Watch', errorMessage(error))
  }
}

async function checkProvisioningQueue() {
  try {
    const queue = await getProvisioningQueueHealth()
    if (!queue.ok) {
      return check(
        'provisioning-queue',
        'Очередь выдачи',
        'warn',
        'Есть задачи, требующие внимания',
        `Ожидают: ${queue.pending}, ошибок: ${queue.failed}, зависли: ${queue.staleRunning}`
      )
    }
    return check(
      'provisioning-queue',
      'Очередь выдачи',
      'ok',
      queue.pending > 0 ? `Ожидают обработки: ${queue.pending}` : 'Очередь чистая'
    )
  } catch (error) {
    return check('provisioning-queue', 'Очередь выдачи', 'warn', 'Не удалось проверить очередь', errorMessage(error))
  }
}

async function checkBroadcastBacklog() {
  try {
    const [pending, processing, failed] = await Promise.all([
      prisma.broadcastDelivery.count({ where: { status: 'PENDING' } }),
      prisma.broadcastDelivery.count({ where: { status: 'PROCESSING' } }),
      prisma.broadcastDelivery.count({ where: { status: 'FAILED' } }),
    ])
    const total = pending + processing + failed
    if (failed > 0) {
      return check(
        'broadcast-backlog',
        'Очередь рассылок',
        'warn',
        'Есть ошибки доставки',
        `Ожидают: ${pending}, в работе: ${processing}, ошибок: ${failed}`
      )
    }
    return check(
      'broadcast-backlog',
      'Очередь рассылок',
      pending > 1000 || processing > 250 ? 'warn' : 'ok',
      total > 0 ? `В очереди: ${total}` : 'Очередь чистая',
      total > 0 ? `Ожидают: ${pending}, в работе: ${processing}` : undefined
    )
  } catch (error) {
    return check('broadcast-backlog', 'Очередь рассылок', 'warn', 'Не удалось проверить очередь', errorMessage(error))
  }
}

async function checkSyncEventsBacklog() {
  try {
    const [pending, failed, skipped] = await Promise.all([
      prisma.syncEvent.count({ where: { status: 'PENDING' } }),
      prisma.syncEvent.count({ where: { status: 'FAILED' } }),
      prisma.syncEvent.count({ where: { status: 'SKIPPED' } }),
    ])
    if (failed > 0) {
      return check(
        'sync-events',
        'События синхронизации',
        'warn',
        'Есть события с ошибками',
        `Ожидают: ${pending}, ошибок: ${failed}, пропущено: ${skipped}`
      )
    }
    return check(
      'sync-events',
      'События синхронизации',
      pending > 250 || skipped > 0 ? 'warn' : 'ok',
      pending > 0 ? `Ожидают обработки: ${pending}` : 'Backlog чистый',
      skipped > 0 ? `Пропущено: ${skipped}` : undefined
    )
  } catch (error) {
    return check('sync-events', 'События синхронизации', 'warn', 'Не удалось проверить sync events', errorMessage(error))
  }
}

async function checkSubscriptionHealth() {
  try {
    const staleBefore = new Date(Date.now() - 30 * 60 * 1000)
    const [errors, warnings, stale, tracked, eligible] = await Promise.all([
      prisma.subscriptionHealth.count({ where: { status: 'ERROR' } }),
      prisma.subscriptionHealth.count({ where: { status: 'WARNING' } }),
      prisma.subscriptionHealth.count({ where: { checkedAt: { lt: staleBefore } } }),
      prisma.subscriptionHealth.count(),
      prisma.user.count({
        where: {
          role: 'USER',
          OR: [
            { remnawaveId: { not: null } },
            { remnawaveUuid: { not: null } },
            { remnawaveUsername: { not: null } },
            { subscriptions: { some: {} } },
          ],
        },
      }),
    ])
    const unchecked = Math.max(eligible - tracked, 0)
    if (errors > 0) {
      return check(
        'subscription-health',
        'Целостность подписок',
        'error',
        `Критических расхождений: ${errors}`,
        `Предупреждений: ${warnings}, не проверено: ${unchecked}, устаревших: ${stale}`
      )
    }
    return check(
      'subscription-health',
      'Целостность подписок',
      warnings > 0 || unchecked > 0 || stale > 25 ? 'warn' : 'ok',
      warnings > 0 ? `Требуют внимания: ${warnings}` : unchecked > 0 ? `Ожидают первой проверки: ${unchecked}` : 'Расхождений не найдено',
      stale > 0 ? `Устаревших проверок: ${stale}` : undefined
    )
  } catch (error) {
    return check('subscription-health', 'Целостность подписок', 'warn', 'Проверка ещё не готова', errorMessage(error))
  }
}

export async function getSystemHealth(options: { sendEmail?: boolean } = {}): Promise<SystemHealthReport> {
  const checkedAt = nowIso()
  const [deploymentChecks, ...operationalChecks] = await Promise.all([
    checkDeployment(),
    checkDatabase(),
    checkPaymentOverview(),
    checkRemnawave(),
    checkRemnashop(),
    checkWorker('payment', 'payment-worker', 'Обработка платежей'),
    checkWorker('broadcast', 'broadcast-worker', 'Рассылки'),
    checkWorker('watch', 'watch-worker', 'Watch worker'),
    checkWorker('node-provisioning', 'node-provisioning-worker', 'Установка нод'),
    checkYooKassa(),
    checkPayAnyWay(),
    checkPlatega(),
    checkEmail(Boolean(options.sendEmail)),
    checkTelegram(),
    checkWatch(),
    latestBackup(),
    checkS3(),
    checkProvisioningQueue(),
    checkBroadcastBacklog(),
    checkSyncEventsBacklog(),
    checkSubscriptionHealth(),
  ])
  const checks = [...deploymentChecks, ...operationalChecks]

  return {
    ok: checks.every((item) => item.status !== 'error'),
    checkedAt,
    checks,
  }
}

function positiveInteger(raw: string, fallback: number) {
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : fallback
}
