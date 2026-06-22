# Remnawave Cabinet

Красивый личный кабинет для продажи VPN без обязательного Telegram: пользователь регистрируется по email, выбирает тариф, оплачивает онлайн и получает ссылку доступа, QR-код, историю платежей и управление устройствами.

Проект рассчитан на связку:

- Remnawave Panel для VPN-профилей
- YooKassa для онлайн-оплаты
- PostgreSQL для данных кабинета
- Next.js 14 App Router для интерфейса и API

## Быстрый Старт На Сервере

Для чистого Ubuntu/Debian сервера достаточно одной команды:

```bash
curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/install-server.sh | sudo bash
```

Скрипт сам установит Docker, скачает только `docker-compose.yml`, создаст `.env`, сгенерирует пароль базы, `JWT_SECRET` и `HEALTHCHECK_TOKEN`.

После этого заполни реальные данные:

```bash
nano /opt/remnawave-cabinet/.env
```

Минимально нужно указать:

- `CABINET_DOMAIN`
- `EMAIL_VERIFICATION_WEBHOOK_URL`
- `EMAIL_VERIFICATION_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `REMNAWAVE_BASE_URL`
- `REMNAWAVE_TOKEN`
- `YOOKASSA_SHOP_ID`
- `YOOKASSA_SECRET_KEY`

Затем повторно запусти установщик. Он поднимет сервисы и спросит email/пароль первого администратора:

```bash
curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/install-server.sh | sudo bash
```

Для автоматического запуска без ручного ввода:

```bash
curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/install-server.sh | \
  sudo env SUPERUSER_EMAIL="admin@example.com" SUPERUSER_PASSWORD="strong-password" bash
```

Будет поднято:

- PostgreSQL
- Prisma migrations
- стартовые тарифы, если база пустая
- Next.js приложение
- worker для периодической проверки платежей
- Caddy с автоматическим HTTPS

После первого входа админ может менять тарифы в кабинете:

```text
https://ВСТАВЬ_СЮДА_ДОМЕН_КАБИНЕТА/dashboard/admin/plans
```

Подробный серверный чеклист: [deploy/RUNBOOK.md](./deploy/RUNBOOK.md).

## Что Умеет

- Регистрация и вход по email/паролю
- Подтверждение email перед покупкой
- Покупка и продление VPN через YooKassa
- Одноразовые промо-тарифы без YooKassa
- Выбор Remnawave squads прямо в настройках тарифа
- Автоматическая выдача доступа после оплаты
- Периодическая проверка ожидающих платежей
- QR-код и ссылка доступа в кабинете
- История платежей и состояние выдачи
- Промокоды и скидки
- Админское управление тарифами
- Управление устройствами
- Опциональный перенос старых Telegram-подписок
- Recovery для платежей, если внешний сервис временно не ответил

## Локальный Запуск

```bash
npm install
cp .env.example .env
npm run prisma:migrate
npm run db:seed
npm run dev
```

Открой:

```text
http://localhost:3000
```

## Основные Переменные

| Переменная | Для чего нужна |
| --- | --- |
| `CABINET_IMAGE` | Готовый Docker image кабинета, по умолчанию `ghcr.io/asdcrosh/cabinet_remna:latest` |
| `COMPOSE_PROFILES` | `caddy` для встроенного HTTPS, пусто если HTTPS уже делает внешний proxy |
| `DATABASE_URL` | PostgreSQL connection string |
| `CABINET_APP_PORT` | Локальный порт приложения при внешнем proxy, по умолчанию `3000` |
| `CABINET_EXTERNAL_NETWORK` | Docker-сеть Remnawave/Nginx/remnashop, обычно `remnawave-network` |
| `JWT_SECRET` | Секрет сессий, минимум 32 случайных символа |
| `APP_URL` | Публичный URL кабинета |
| `ALLOWED_ORIGINS` | Разрешенные origins для защиты запросов |
| `HEALTHCHECK_TOKEN` | Токен проверки `/api/health` |
| `EMAIL_VERIFICATION_WEBHOOK_URL` | Отправка писем подтверждения email |
| `EMAIL_VERIFICATION_WEBHOOK_SECRET` | Bearer secret для email webhook |
| `RESEND_API_KEY` | API key Resend для встроенной отправки email |
| `EMAIL_FROM` | От кого отправлять письма, например `VPN <noreply@domain.ru>` |
| `REMNAWAVE_BASE_URL` | URL Remnawave Panel |
| `REMNAWAVE_TOKEN` | API token Remnawave |
| `REMNAWAVE_INTERNAL_SQUAD_UUIDS` | Fallback UUID squads, если у тарифа не выбран свой список |
| `YOOKASSA_SHOP_ID` | ID магазина YooKassa |
| `YOOKASSA_SECRET_KEY` | Боевой secret key YooKassa |
| `YOOKASSA_WEBHOOK_URL` | Webhook оплаты |
| `PAYMENT_RECONCILE_INTERVAL_SECONDS` | Как часто worker проверяет ожидающие платежи |
| `PAYMENT_CANCEL_PENDING_AFTER_SECONDS` | Через сколько секунд отменять зависший ожидающий платёж |
| `TELEGRAM_CLIENT_ID` | Опционально, перенос старых Telegram-подписок |
| `TELEGRAM_CLIENT_SECRET` | Опционально, перенос старых Telegram-подписок |
| `REMNASHOP_DATABASE_URL` | Опционально, read-only подключение к старой БД remnashop |
| `REMNASHOP_DATABASE_SSL` | SSL для удалённой БД remnashop: `true`, `false`, `no-verify` |
| `REFERRAL_BONUS_DAYS` | Сколько дней добавить за первую платную покупку приглашенного |

Полный шаблон, который installer кладёт на сервер как `.env`: [deploy/env.production.example](./deploy/env.production.example).

Если кабинет ставится на сервер, где уже есть Caddy/Nginx на 80/443, укажи:

```env
COMPOSE_PROFILES=""
CABINET_APP_BIND="127.0.0.1"
CABINET_APP_PORT="3000"
CABINET_EXTERNAL_NETWORK="remnawave-network"
```

И настрой существующий reverse proxy на `http://127.0.0.1:3000`.

Если reverse proxy работает в Docker-сети Remnawave, проксируй на контейнер кабинета:

```text
http://remnawave-cabinet-app:3000
```

## YooKassa

В кабинете YooKassa добавь webhook:

```text
https://ВСТАВЬ_СЮДА_ДОМЕН_КАБИНЕТА/api/webhook/yookassa
```

События:

- `payment.succeeded`
- `payment.canceled`
- `payment.waiting_for_capture`

После возврата пользователя из оплаты кабинет дополнительно проверяет платеж сам, поэтому выдача доступа не зависит только от webhook.
Отдельный worker периодически сверяет ожидающие платежи с YooKassa и отменяет те, которые слишком долго не перешли в успешный статус.

## Email

В production нужен реальный отправщик писем, иначе пользователи не смогут подтвердить email.

Самый простой вариант уже встроен: отправка через Resend.

В `.env` укажи:

```env
EMAIL_VERIFICATION_WEBHOOK_URL="https://ВСТАВЬ_СЮДА_ДОМЕН_КАБИНЕТА/api/email/resend"
EMAIL_VERIFICATION_WEBHOOK_SECRET="ВСТАВЬ_СЮДА_ЛЮБОЙ_СЛУЧАЙНЫЙ_SECRET"
RESEND_API_KEY="ВСТАВЬ_СЮДА_RESEND_API_KEY"
EMAIL_FROM="VPN Cabinet <noreply@ВСТАВЬ_СЮДА_ТВОЙ_ДОМЕН_ПОЧТЫ>"
```

`EMAIL_VERIFICATION_WEBHOOK_SECRET` можно сгенерировать так:

```bash
openssl rand -hex 32
```

Если хочешь использовать свой отправщик, кабинет отправляет `POST` на `EMAIL_VERIFICATION_WEBHOOK_URL` с полями:

- `to`
- `subject`
- `text`
- `html`

И заголовком:

```text
Authorization: Bearer EMAIL_VERIFICATION_WEBHOOK_SECRET
```

В dev-режиме, если webhook не задан, ссылка подтверждения выводится в консоль сервера.

## Remnashop На Другом Сервере

Если старая база `remnashop` находится на другом сервере, подключай её только read-only пользователем.

На сервере с remnashop/PostgreSQL создай пользователя:

```sql
CREATE USER remnashop_readonly WITH PASSWORD 'ВСТАВЬ_СЮДА_СИЛЬНЫЙ_ПАРОЛЬ';
GRANT CONNECT ON DATABASE remnashop TO remnashop_readonly;
GRANT USAGE ON SCHEMA public TO remnashop_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO remnashop_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO remnashop_readonly;
```

Открой доступ к PostgreSQL только с IP сервера кабинета: firewall/security group на порт `5432`.

В `.env` кабинета:

```env
REMNASHOP_DATABASE_URL="postgresql://remnashop_readonly:ВСТАВЬ_СЮДА_ПАРОЛЬ@ВСТАВЬ_СЮДА_IP_ИЛИ_HOST_REMNASHOP:5432/remnashop?schema=public"
REMNASHOP_DATABASE_SSL="true"
```

Если у PostgreSQL нет SSL, временно можно поставить:

```env
REMNASHOP_DATABASE_SSL="false"
```

Но для сервера в интернете лучше включить SSL или держать соединение внутри приватной сети/VPN.

## Деплой И Обновления

Первый деплой:

```bash
curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/install-server.sh | sudo bash
```

После заполнения `.env` запусти эту же команду еще раз: установщик поднимет контейнеры и создаст первого администратора.

Обновление уже установленного сервера:

```bash
cd /opt/remnawave-cabinet
docker compose --env-file .env -f docker-compose.yml up -d
```

Логи:

```bash
docker compose --env-file .env -f docker-compose.yml logs -f app
```

Проверка после запуска:

```bash
source .env
curl -H "x-healthcheck-token: $HEALTHCHECK_TOKEN" "$APP_URL/api/health"
```

Бэкап БД кабинета:

```bash
docker compose --env-file .env -f docker-compose.yml exec -T db \
  sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges' \
  > cabinet.dump
```

Восстановление из бэкапа:

```bash
docker compose --env-file .env -f docker-compose.yml stop app worker
cat cabinet.dump | docker compose --env-file .env -f docker-compose.yml exec -T db \
  sh -lc 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges'
docker compose --env-file .env -f docker-compose.yml up -d
```

Подробности: [DEPLOYMENT.md](./DEPLOYMENT.md).

## Проверки Для Разработки

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Структура

```text
src/app              Next.js pages и API routes
src/components       UI-компоненты кабинета
src/lib              интеграции, auth, платежи, выдача подписок
prisma               схема, миграции, seed
deploy               production deploy scripts и compose
```

## Безопасность Перед Продом

Перед реальным запуском:

- используй только боевые ключи YooKassa;
- перевыпусти токены, которые использовались локально;
- проверь, что `.env` не попадает в Git;
- направь свой домен кабинета на IP сервера;
- проверь регистрацию, email, оплату и выдачу подписки тестовой покупкой.
