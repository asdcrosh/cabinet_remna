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
  if (/permission denied/i.test(message)) return 'У пользователя базы Remnashop не хватает прав на чтение или запись.'
  if (/remnashop promo code table is not writable/i.test(message)) return 'У пользователя базы Remnashop нет прав на запись промокодов.'
  if (/remnashop promo code schema is not recognized/i.test(message)) return 'Кабинет не понял структуру таблицы промокодов Remnashop.'
  if (/remnashop promo code table not found/i.test(message)) return 'Таблица промокодов Remnashop не найдена.'
  if (/internal_squads/i.test(message)) return 'Remnashop не принял подписку: не заполнены internal squads тарифа.'
  if (/is_trial/i.test(message)) return 'Remnashop не принял подписку: не заполнен признак пробного тарифа.'
  if (/remnashop user not found/i.test(message)) return 'Пользователь ещё не найден в Remnashop.'
  if (/subscription is missing/i.test(message)) return 'Подписка ещё не выдана.'
  if (/remnawave user is missing/i.test(message)) return 'Профиль Remnawave ещё не создан.'
  if (/Remnawave .* 404|Профиль не найден/i.test(message)) return 'Профиль из Remnashop не найден в Remnawave.'
  if (/connection timeout|timeout/i.test(message)) return 'Не удалось дождаться ответа базы или API.'
  if (/getaddrinfo|ENOTFOUND/i.test(message)) return 'Не удалось найти хост базы или API.'
  if (/fetch failed/i.test(message)) return 'Не удалось подключиться к внешнему сервису.'

  return message || 'Неизвестная ошибка синхронизации.'
}
