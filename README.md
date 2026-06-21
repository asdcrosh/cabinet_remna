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

Скрипт сам установит Docker, скачает проект, создаст `.env.production`, сгенерирует пароль базы, `JWT_SECRET` и `HEALTHCHECK_TOKEN`.

После этого заполни реальные данные:

```bash
nano /opt/remnawave-cabinet/.env.production
```

Минимально нужно указать:

- `EMAIL_VERIFICATION_WEBHOOK_URL`
- `REMNAWAVE_TOKEN`
- `YOOKASSA_SECRET_KEY`

Затем запусти боевой экземпляр:

```bash
cd /opt/remnawave-cabinet
./deploy/deploy.sh
```

Будет поднято:

- PostgreSQL
- Prisma migrations
- Next.js приложение
- Caddy с автоматическим HTTPS

Подробный серверный чеклист: [deploy/RUNBOOK.md](./deploy/RUNBOOK.md).

## Что Умеет

- Регистрация и вход по email/паролю
- Подтверждение email перед покупкой
- Покупка и продление VPN через YooKassa
- Автоматическая выдача доступа после оплаты
- QR-код и ссылка доступа в кабинете
- История платежей и состояние выдачи
- Промокоды и скидки
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
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Секрет сессий, минимум 32 случайных символа |
| `APP_URL` | Публичный URL кабинета |
| `ALLOWED_ORIGINS` | Разрешенные origins для защиты запросов |
| `HEALTHCHECK_TOKEN` | Токен проверки `/api/health` |
| `EMAIL_VERIFICATION_WEBHOOK_URL` | Отправка писем подтверждения email |
| `REMNAWAVE_BASE_URL` | URL Remnawave Panel |
| `REMNAWAVE_TOKEN` | API token Remnawave |
| `REMNAWAVE_INTERNAL_SQUAD_UUIDS` | UUID squads для новых подписок |
| `YOOKASSA_SHOP_ID` | ID магазина YooKassa |
| `YOOKASSA_SECRET_KEY` | Боевой secret key YooKassa |
| `YOOKASSA_WEBHOOK_URL` | Webhook оплаты |
| `TELEGRAM_CLIENT_ID` | Опционально, перенос старых Telegram-подписок |
| `TELEGRAM_CLIENT_SECRET` | Опционально, перенос старых Telegram-подписок |

Полный шаблон для сервера: [deploy/env.production.alekseevvp.example](./deploy/env.production.alekseevvp.example).

## YooKassa

В кабинете YooKassa добавь webhook:

```text
https://cabinet.alekseevvp.site/api/webhook/yookassa
```

События:

- `payment.succeeded`
- `payment.canceled`
- `payment.waiting_for_capture`

После возврата пользователя из оплаты кабинет дополнительно проверяет платеж сам, поэтому выдача доступа не зависит только от webhook.

## Email

В production нужен реальный отправщик писем. Кабинет отправляет `POST` на `EMAIL_VERIFICATION_WEBHOOK_URL` с полями:

- `to`
- `subject`
- `text`
- `html`

В dev-режиме, если webhook не задан, ссылка подтверждения выводится в консоль сервера.

## Деплой И Обновления

Первый деплой:

```bash
curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/install-server.sh | sudo bash
```

Обновление уже установленного сервера:

```bash
cd /opt/remnawave-cabinet
git pull
./deploy/deploy.sh
```

Логи:

```bash
docker compose -f deploy/docker-compose.server.yml logs -f app
```

Проверка после запуска:

```bash
export APP_URL="https://cabinet.alekseevvp.site"
export HEALTHCHECK_TOKEN="значение_из_env"
./deploy/smoke-check.sh
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
- проверь, что `.env.production` не попадает в Git;
- направь `cabinet.alekseevvp.site` на IP сервера;
- проверь регистрацию, email, оплату и выдачу подписки тестовой покупкой.
