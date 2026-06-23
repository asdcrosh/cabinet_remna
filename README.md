# Remnawave Cabinet

Личный кабинет для продажи VPN без обязательного Telegram. Пользователь регистрируется по email, подтверждает почту, выбирает тариф, оплачивает онлайн и получает QR-код, ссылку подписки, историю платежей и управление устройствами.

## Возможности

- Email-регистрация, подтверждение почты и восстановление пароля.
- Покупка и продление VPN через YooKassa.
- Одноразовые промо-тарифы без оплаты.
- Промокоды, лимиты и привязка скидок к тарифам.
- Автоматическая выдача доступа в Remnawave после оплаты.
- Выбор Remnawave squads в настройках тарифа.
- QR-код, ссылка подписки, трафик и устройства в кабинете.
- Worker для проверки ожидающих платежей и отмены зависших оплат.
- Реферальные бонусы за первую платную покупку приглашенного пользователя.
- Синхронизация тарифов, промокодов и старых Telegram-подписок из remnashop.
- Админские страницы для тарифов, промокодов, пользователей, платежей и восстановления выдачи.
- Аудитории тарифов как в Remnashop: все, новые, действующие, приглашенные, разрешенные и доступ по ссылке.

## Архитектура

Проект использует:

- `Next.js 14 App Router` для интерфейса и API.
- `PostgreSQL` для данных кабинета.
- `Prisma` для миграций и доступа к БД.
- `Remnawave Panel API` для VPN-профилей.
- `YooKassa` для платежей.
- `Resend` или внешний webhook для email.
- `Docker Compose` для production-деплоя.

## Быстрый Старт

На чистом Ubuntu/Debian сервере:

```bash
curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/install-server.sh | sudo bash
```

Установщик:

- установит Docker, если его нет;
- создаст `/opt/remnawave-cabinet`;
- скачает `docker-compose.yml` и `.env`;
- сгенерирует локальные секреты;
- спросит недостающие production-значения;
- поднимет БД, миграции, seed, приложение и worker;
- попросит email и пароль первого главного администратора.

Без интерактивного ввода администратора:

```bash
curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/install-server.sh | \
  sudo env SUPERUSER_EMAIL="admin@example.com" SUPERUSER_PASSWORD="strong-password1" bash
```

После запуска открой:

```text
https://ВСТАВЬ_СЮДА_ДОМЕН_КАБИНЕТА
```

Обновление уже установленного кабинета:

```bash
curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/update-server.sh | sudo bash
```

Обновление не пересоздает `.env`, не удаляет базу и не создает администратора заново.

### Роли

- `Пользователь` — личный кабинет и собственные обращения.
- `Модератор` — дополнительно видит и обрабатывает поддержку.
- `Администратор` — управляет кабинетом, тарифами, платежами и пользователями, но не назначает администраторов.
- `Главный администратор` — полный доступ, включая назначение ролей.

Подробный серверный чеклист: [deploy/RUNBOOK.md](./deploy/RUNBOOK.md).

## Что Нужно Подготовить

Перед установкой нужны:

- домен или поддомен для кабинета;
- API token Remnawave;
- YooKassa `shopId` и `secretKey`;
- Resend API key или свой email webhook;
- доступ к серверу с Docker.

Если кабинет ставится на тот же сервер, где уже есть `remnashop-db`, установщик сам найдет контейнер, создаст read-only пользователя и заполнит подключение к remnashop.

## Основные ENV

Полный шаблон лежит в [deploy/env.production.example](./deploy/env.production.example). В обычной установке мастер заполняет главное сам.

| Переменная | Назначение |
| --- | --- |
| `CABINET_DOMAIN` | Домен кабинета без `https://` |
| `CABINET_BRAND_NAME` | Название сервиса в интерфейсе, письмах и заголовках |
| `APP_URL` | Публичный URL кабинета |
| `DATABASE_URL` | PostgreSQL кабинета |
| `JWT_SECRET` | Секрет сессий |
| `HEALTHCHECK_TOKEN` | Токен `/api/health` |
| `REMNAWAVE_BASE_URL` | URL Remnawave Panel |
| `REMNAWAVE_TOKEN` | API token Remnawave |
| `YOOKASSA_SHOP_ID` | ID магазина YooKassa |
| `YOOKASSA_SECRET_KEY` | Secret key YooKassa |
| `EMAIL_VERIFICATION_WEBHOOK_URL` | Endpoint отправки email |
| `EMAIL_VERIFICATION_WEBHOOK_SECRET` | Bearer secret email webhook |
| `RESEND_API_KEY` | API key Resend |
| `EMAIL_FROM` | Отправитель писем |
| `REMNASHOP_DATABASE_URL` | Read-only подключение к remnashop |
| `REMNASHOP_CATALOG_SYNC_INTERVAL_SECONDS` | Интервал авто-синхронизации каталога |
| `REFERRAL_BONUS_DAYS` | Бонус за реферала |

## Reverse Proxy

Если на сервере нет своего Nginx/Caddy, оставь:

```env
COMPOSE_PROFILES="caddy"
```

Встроенный Caddy сам выпустит HTTPS-сертификат.
Если `80/443` уже заняты Remnawave, установщик отключит встроенный Caddy сам.

Если HTTPS уже делает внешний Nginx/Caddy:

```env
COMPOSE_PROFILES=""
CABINET_APP_BIND="127.0.0.1"
CABINET_APP_PORT="3030"
```

Проксируй домен кабинета на:

```text
http://127.0.0.1:3030
```

Если reverse proxy работает в Docker-сети Remnawave, можно проксировать на:

```text
http://remnawave-cabinet-app:3000
```

Установщик сам оставит `3000` на чистом сервере или переключит кабинет на
`3030`, если `3000` уже занят Remnawave.

Если кабинет ставится на сервер, где уже работает Remnawave nginx, можно
автоматически добавить proxy-конфиг и сертификат:

```bash
curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/setup-nginx-proxy.sh | sudo bash
```

Скрипт делает backup nginx-конфига, выпускает сертификат для `CABINET_DOMAIN`,
добавляет HTTPS server block кабинета, HTTP→HTTPS редирект, публикацию порта
`80` в compose Remnawave nginx, проверяет `nginx -t` и откатывает изменения,
если проверка не прошла.

## YooKassa

В YooKassa добавь webhook:

```text
https://ВСТАВЬ_СЮДА_ДОМЕН_КАБИНЕТА/api/webhook/yookassa
```

События:

- `payment.succeeded`
- `payment.canceled`
- `payment.waiting_for_capture`

Кабинет также сам проверяет платеж после возврата пользователя, а worker периодически сверяет ожидающие платежи с YooKassa.

## Email

Для встроенной отправки через Resend:

```env
EMAIL_VERIFICATION_WEBHOOK_URL="https://ВСТАВЬ_СЮДА_ДОМЕН_КАБИНЕТА/api/email/resend"
EMAIL_VERIFICATION_WEBHOOK_SECRET="ВСТАВЬ_СЮДА_СЛУЧАЙНЫЙ_SECRET"
RESEND_API_KEY="ВСТАВЬ_СЮДА_RESEND_API_KEY"
EMAIL_FROM="ВСТАВЬ_СЮДА_НАЗВАНИЕ_СЕРВИСА <noreply@ВСТАВЬ_СЮДА_ДОМЕН_ПОЧТЫ>"
```

Секрет можно сгенерировать:

```bash
openssl rand -hex 32
```

Если используется свой отправщик, кабинет отправляет `POST` на `EMAIL_VERIFICATION_WEBHOOK_URL` с полями `to`, `subject`, `text`, `html` и заголовком:

```text
Authorization: Bearer EMAIL_VERIFICATION_WEBHOOK_SECRET
```

## Remnashop

Если `remnashop-db` на том же сервере, ничего вручную настраивать не нужно. Установщик:

- найдет контейнер `remnashop-db`;
- создаст/обновит роль `remnashop_readonly`;
- выдаст только `SELECT`;
- подключит кабинет к нужной Docker-сети;
- заполнит `REMNASHOP_DATABASE_URL`;
- отключит SSL для внутреннего Docker-соединения.

Каталог remnashop автоматически синхронизируется при входе в кабинет с интервалом `REMNASHOP_CATALOG_SYNC_INTERVAL_SECONDS`.

Для remnashop на другом сервере создай read-only пользователя:

```sql
CREATE USER remnashop_readonly WITH PASSWORD 'ВСТАВЬ_СЮДА_СИЛЬНЫЙ_ПАРОЛЬ';
GRANT CONNECT ON DATABASE remnashop TO remnashop_readonly;
GRANT USAGE ON SCHEMA public TO remnashop_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO remnashop_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO remnashop_readonly;
```

И укажи:

```env
REMNASHOP_DATABASE_URL="postgresql://remnashop_readonly:ВСТАВЬ_СЮДА_ПАРОЛЬ@ВСТАВЬ_СЮДА_HOST:5432/remnashop?schema=public"
REMNASHOP_DATABASE_SSL="true"
```

## Обновление

```bash
curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/update-server.sh | sudo bash
```

Скрипт скачает свежий compose, подтянет опубликованный image, применит миграции,
проверит healthcheck и после успешного запуска удалит завершённые one-shot
контейнеры, старые локальные compose-build images этого проекта и dangling
Docker images. Volumes с базой не удаляются.

Логи:

```bash
docker compose --env-file .env -f docker-compose.yml logs -f app
docker compose --env-file .env -f docker-compose.yml logs -f worker
```

Проверка:

```bash
source .env
curl -H "x-healthcheck-token: $HEALTHCHECK_TOKEN" "$APP_URL/api/health"
```

## Бэкап

Создать бэкап:

```bash
cd /opt/remnawave-cabinet
docker compose --env-file .env -f docker-compose.yml exec -T db \
  sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges' \
  > cabinet.dump
```

Восстановить:

```bash
cd /opt/remnawave-cabinet
docker compose --env-file .env -f docker-compose.yml stop app worker
cat cabinet.dump | docker compose --env-file .env -f docker-compose.yml exec -T db \
  sh -lc 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges'
docker compose --env-file .env -f docker-compose.yml up -d
```

## Локальная Разработка

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

Проверки:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Структура

```text
src/app              страницы и API routes
src/components       UI кабинета
src/lib              auth, платежи, Remnawave, remnashop, безопасность
prisma               схема, миграции, seed
deploy               production compose, installer, runbook
```

## Перед Продом

- Проверь DNS домена кабинета.
- Используй только боевые ключи YooKassa.
- Проверь отправку email и подтверждение почты.
- Проверь тестовую покупку и выдачу Remnawave-подписки.
- Проверь webhook YooKassa.
- Убедись, что `.env` не попадает в Git.
- Сделай первый бэкап после успешной настройки.
