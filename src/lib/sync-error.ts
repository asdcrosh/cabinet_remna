import { RemnawaveError } from './remnawave'

export function describeSyncError(error: unknown) {
  if (error instanceof RemnawaveError) {
    if (error.status === 0) return 'Remnawave API не настроен или недоступен.'
    if (error.status === 401 || error.status === 403) return 'Remnawave API отклонил токен доступа.'
    if (error.status === 404) return 'Профиль не найден в Remnawave.'
    if (error.status >= 500) return 'Remnawave API временно недоступен.'
    return `Remnawave API вернул ошибку ${error.status}.`
  }

  const message = error instanceof Error ? error.message : String(error)
  if (/REMNASHOP_DATABASE_URL/i.test(message)) return 'Подключение к базе Remnashop не настроено.'
  if (/password authentication failed/i.test(message)) return 'База Remnashop отклонила логин или пароль.'
  if (/connection timeout|timeout/i.test(message)) return 'Не удалось дождаться ответа базы или API.'
  if (/getaddrinfo|ENOTFOUND/i.test(message)) return 'Не удалось найти хост базы или API.'
  if (/fetch failed/i.test(message)) return 'Не удалось подключиться к внешнему сервису.'

  return message || 'Неизвестная ошибка синхронизации.'
}
