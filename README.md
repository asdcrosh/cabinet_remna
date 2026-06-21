# Remnawave Cabinet

Личный кабинет для VPN-сервиса на базе Remnawave Panel: регистрация, покупка тарифа через ЮKassa, выдача/продление подписки, ключи подключения, трафик, платежи и устройства.

## Стек

- Next.js 14 App Router
- PostgreSQL + Prisma
- JWT в httpOnly cookie
- YooKassa payments/webhooks
- Remnawave Panel API
- Tailwind CSS

## Быстрый старт

```bash
npm install
cp .env.example .env
npm run prisma:migrate
npm run db:seed
npm run dev
```

Открой `http://localhost:3000`.

## Переменные окружения

| Переменная | Назначение |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Секрет JWT, минимум 32 случайных байта |
| `APP_URL` | Публичный URL кабинета, например `https://cabinet.example.com` |
| `ALLOWED_ORIGINS` | Дополнительные origins для CSRF-check, через запятую |
| `HEALTHCHECK_TOKEN` | Токен для `/api/health`; в production обязателен |
| `EMAIL_VERIFICATION_WEBHOOK_URL` | Webhook для отправки письма подтверждения email; в production обязателен |
| `EMAIL_VERIFICATION_WEBHOOK_SECRET` | Опциональный Bearer token для email webhook |
| `REMNAWAVE_BASE_URL` | URL Remnawave Panel без trailing slash |
| `REMNAWAVE_TOKEN` | API token Remnawave |
| `REMNAWAVE_INTERNAL_SQUAD_UUIDS` | UUID внутренних squads Remnawave для новых/продлеваемых подписок, через запятую |
| `REMNASHOP_DATABASE_URL` | Read-only PostgreSQL connection string к базе remnashop для dry-run sync |
| `REMNASHOP_DATABASE_SSL` | SSL режим для remnashop: `false`, `true` или `no-verify` |
| `TELEGRAM_CLIENT_ID` | Client ID из BotFather Web Login для привязки Telegram |
| `TELEGRAM_CLIENT_SECRET` | Client Secret из BotFather Web Login для обмена OAuth code |
| `TELEGRAM_BOT_USERNAME` | Username бота без `@` для legacy Telegram Login Widget fallback |
| `TELEGRAM_BOT_TOKEN` | Bot token для проверки подписи legacy Telegram Login payload |
| `YOOKASSA_SHOP_ID` | ID магазина ЮKassa |
| `YOOKASSA_SECRET_KEY` | Secret key ЮKassa |
| `YOOKASSA_WEBHOOK_URL` | URL webhook для настройки в ЮKassa |
| `YOOKASSA_WEBHOOK_ALLOWED_IPS` | Опциональный allowlist IP/CIDR ЮKassa через запятую |

## ЮKassa webhook

В кабинете ЮKassa добавь webhook:

```text
POST {APP_URL}/api/webhook/yookassa
```

Включи события:

- `payment.succeeded`
- `payment.canceled`
- `payment.waiting_for_capture`

Для локальной разработки используй публичный tunnel, например ngrok, и укажи полученный URL в `YOOKASSA_WEBHOOK_URL`.

## Подтверждение email

После регистрации пользователь получает ссылку подтверждения и сможет войти только после перехода по ней.

Если `EMAIL_VERIFICATION_WEBHOOK_URL` задан, кабинет отправит на него `POST` с JSON-полями `to`, `subject`, `text`, `html`. Если переменная пустая, в dev-режиме ссылка подтверждения выводится в консоль сервера.

## Деплой

Подробный чеклист: [DEPLOYMENT.md](./DEPLOYMENT.md).

Минимальный порядок:

```bash
npm ci
NODE_ENV=production npm run check:env
npm run prisma:deploy
npm run build
NODE_ENV=production npm run start
```

Перед продакшеном проверь:

- `NODE_ENV=production`
- `JWT_SECRET` сгенерирован случайно
- `APP_URL` совпадает с публичным доменом
- Remnawave API token имеет нужные права
- webhook ЮKassa доступен из интернета
- email webhook реально отправляет письма
- `YOOKASSA_WEBHOOK_ALLOWED_IPS` заполнен, если нужен строгий allowlist

## Проверки

```bash
npm run validate
npm run test
npm run build
```

## Recovery

Если платёж стал успешным, но Remnawave временно не ответил, webhook можно повторить, а администратор может довыдать подписку через recovery endpoint. В истории платежей сохраняется `provisioningError`, чтобы видеть причину сбоя.

## Remnashop sync

Для первичной проверки миграции из remnashop задай `REMNASHOP_DATABASE_URL` и вызови админский endpoint:

```text
GET /api/admin/remnashop-sync
```

Сейчас endpoint работает только в `dryRun` режиме: читает remnashop, сопоставляет данные с cabinet и возвращает отчёт без записи в БД.

## Telegram привязка

Пользователь регистрируется по email, подтверждает email, затем в `/dashboard/settings` может привязать Telegram. После привязки кабинет:

- проверяет подпись Telegram через `TELEGRAM_BOT_TOKEN`;
- ищет пользователя в remnashop по `telegram_id`;
- если найден `current_subscription_id`, берёт `user_remna_id`;
- подтягивает Remnawave-профиль по UUID и обновляет локальную подписку.

Если пользователь в remnashop не найден, Telegram всё равно привязывается к текущему email-аккаунту, а Remnawave-профиль будет создан обычным платёжным сценарием при покупке.
