# Remnawave Cabinet

Личный кабинет для продажи VPN без обязательного Telegram. Пользователь регистрируется по email, подтверждает почту, выбирает тариф, оплачивает онлайн и получает QR-код, ссылку подписки, историю платежей и управление устройствами.

## Содержание

- [Возможности](#возможности)
- [Стек и требования](#стек-и-требования)
- [Локальная разработка](#локальная-разработка)
- [Production: первая установка](#production-первая-установка)
- [Production: обновление](#production-обновление)
- [Порядок запуска контейнеров](#порядок-запуска-контейнеров)
- [Конфигурация](#конфигурация)
- [Интеграции](#интеграции)
- [Sentry (опционально)](#sentry-опционально)
- [Управление сервером](#управление-сервером)
- [Бэкапы и перенос](#бэкапы-и-перенос)
- [Разработчикам](#разработчикам)
- [Дополнительная документация](#дополнительная-документация)

## Возможности

- Email-регистрация, подтверждение почты и восстановление пароля.
- Покупка и продление VPN через YooKassa.
- Одноразовые промо-тарифы без оплаты.
- Промокоды, лимиты и привязка скидок к тарифам.
- Подарочный бокс с днями подписки, трафиком и скидочными промокодами.
- Автоматическая выдача доступа в Remnawave после оплаты.
- QR-код, ссылка подписки, трафик и устройства в кабинете.
- Worker для проверки ожидающих платежей и отмены зависших оплат.
- Broadcast worker для асинхронной рассылки уведомлений.
- Реферальные бонусы за первую платную покупку приглашённого пользователя.
- Синхронизация тарифов, промокодов и пользователей с Remnashop.
- Telegram Mini App с автоматическим входом и подтверждением email.
- Админка: тарифы, промокоды, пользователи, платежи, рассылки, поддержка, аудит.

## Стек и требования

| Компонент | Версия |
| --- | --- |
| Node.js | **>= 20.9.0** (обязательно для Next.js 16) |
| Next.js | 16 App Router |
| React | 19 |
| PostgreSQL | 16 |
| Prisma | 5 |
| TypeScript | 5 |

В production используется Docker-образ `ghcr.io/asdcrosh/cabinet_remna:latest`.

---

## Локальная разработка

### Порядок действий

**1. Установите Node.js 20.9+**

```bash
node -v   # должно быть >= 20.9.0
```

**2. Клонируйте репозиторий и установите зависимости**

```bash
git clone git@github.com:asdcrosh/cabinet_remna.git
cd cabinet_remna
npm install
```

**3. Создайте `.env` из шаблона**

```bash
cp .env.example .env
```

Минимум для старта локально:

- `DATABASE_URL` — строка подключения к Postgres
- `JWT_SECRET` — не короче 32 символов (`openssl rand -hex 32`)

Остальные интеграции (YooKassa, Remnawave, email) можно заполнить позже.

**4. Поднимите PostgreSQL**

```bash
docker compose -f docker-compose.local.yml up -d
```

Проверка:

```bash
docker compose -f docker-compose.local.yml ps
```

**5. Примените миграции и seed**

```bash
npm run prisma:migrate   # интерактивно, создаёт/применяет миграции
npm run db:seed
```

Если `prisma:migrate` недоступен (CI, non-TTY), используйте:

```bash
npx prisma migrate deploy
npm run db:seed
```

**6. Запустите dev-сервер**

```bash
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000).

### Проверки перед коммитом

Одной командой:

```bash
npm run validate
```

Это запускает: `lint` → `typecheck` → `check:env` → `test`.

Отдельно:

```bash
npm run lint          # ESLint 9 (eslint.config.cjs)
npm run typecheck     # TypeScript
npm run test          # Vitest (205+ тестов)
npm run test:coverage # с порогами coverage
npm run build         # production build
```

### Локальные npm-скрипты

| Команда | Назначение |
| --- | --- |
| `npm run dev` | Dev-сервер Next.js |
| `npm run build` | Prisma generate + production build |
| `npm run start` | Запуск собранного приложения |
| `npm run validate` | lint + typecheck + check:env + test |
| `npm run prisma:migrate` | Создать/применить миграцию (dev) |
| `npm run prisma:deploy` | Применить миграции (prod/CI) |
| `npm run db:seed` | Начальные тарифы и настройки |
| `npm run worker:payments` | Локальный payment reconciler |
| `npm run worker:broadcasts` | Локальный broadcast worker |
| `npm run cleanup:retention` | Очистка старых audit/notification/sync logs |

---

## Production: первая установка

### Что подготовить заранее

- домен кабинета с DNS на IP сервера;
- API token Remnawave;
- YooKassa `shopId` и `secretKey` (боевые, не `test_...`);
- Resend API key или свой email webhook;
- Telegram bot token (если нужен Mini App);
- Ubuntu/Debian с root-доступом.

Remnawave и Remnashop могут уже работать на сервере — установщик ставит кабинет рядом, не удаляя существующие контейнеры.

### Порядок установки

**1. Установите управляющую консоль**

```bash
curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/install-console.sh | sudo bash
cabinetctl
```

**2. В меню выберите «Установить кабинет»**

Мастер по порядку:

1. установит Docker, если его нет;
2. создаст `/opt/remnawave-cabinet`;
3. подготовит `docker-compose.yml` и `.env`;
4. сгенерирует локальные секреты (`JWT_SECRET`, `HEALTHCHECK_TOKEN`, `BROADCAST_UPLOAD_SIGNING_SECRET`, пароль БД);
5. запросит production-настройки (домен, YooKassa, Remnawave, email);
6. подключит Remnashop, если найден на сервере;
7. запустит контейнеры (см. [порядок запуска](#порядок-запуска-контейнеров));
8. предложит создать первого главного администратора.

**3. Проверьте запуск**

```bash
cabinetctl health
```

Откройте `https://ВАШ_ДОМЕН`.

**4. Настройте reverse proxy** (если порты 80/443 заняты Remnawave nginx)

```bash
cabinetctl nginx
```

Или см. [Reverse Proxy](#reverse-proxy) ниже.

### Установка без меню

```bash
curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/install-server.sh | sudo bash
```

С заранее заданным администратором:

```bash
curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/install-server.sh | \
  sudo env SUPERUSER_EMAIL="admin@example.com" SUPERUSER_PASSWORD="strong-password1" bash
```

---

## Production: обновление

### Порядок действий

**1. Через консоль (рекомендуется)**

```bash
cabinetctl update
```

Скрипт:

1. скачает свежий `docker-compose.yml`;
2. подтянет новый образ `ghcr.io/asdcrosh/cabinet_remna:latest`;
3. запустит `check-env` → `migrate` → `seed` → перезапустит сервисы;
4. не удалит `.env` и volume базы.

**2. Вручную**

```bash
cd /opt/remnawave-cabinet
curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/update-server.sh | sudo bash
```

### После обновления: проверьте новые ENV

Если `check-env` падает с exit 1, посмотрите лог:

```bash
docker logs remnawave-cabinet-check-env
```

Частые причины после апгрейда — отсутствие новых переменных:

```env
# Обязательно в production:
BROADCAST_UPLOAD_SIGNING_SECRET="<openssl rand -hex 32>"
BROADCAST_UPLOAD_ALLOW_UNSIGNED_LEGACY="false"
RETENTION_CLEANUP_INTERVAL_SECONDS="86400"

# Рекомендуется в DATABASE_URL:
# ...&connection_limit=10&pool_timeout=20
```

Полный шаблон: [deploy/env.production.example](./deploy/env.production.example).

### Smoke check после деплоя

```bash
source /opt/remnawave-cabinet/.env
curl -H "x-healthcheck-token: $HEALTHCHECK_TOKEN" "$APP_URL/api/health"
```

---

## Порядок запуска контейнеров

При каждом `docker compose up` сервисы стартуют в такой цепочке:

```text
db (healthcheck)
  ↓
check-env (валидация .env, exit 0)
  ↓
migrate (prisma migrate deploy)
  ↓
seed (prisma db seed, идемпотентный)
  ↓
app + worker + broadcast-worker
```

| Контейнер | Назначение |
| --- | --- |
| `remnawave-cabinet-db` | PostgreSQL 16 |
| `remnawave-cabinet-check-env` | Проверка `.env` перед деплоем |
| `remnawave-cabinet-migrate` | Prisma migrations |
| `remnawave-cabinet-seed` | Начальные данные (тарифы, offers) |
| `remnawave-cabinet-app` | Next.js приложение (:3000) |
| `remnawave-cabinet-worker` | Payment reconciler + Remnashop sync |
| `remnawave-cabinet-broadcast-worker` | Очередь рассылок |
| `remnawave-cabinet-caddy` | HTTPS reverse proxy (profile `caddy`) |
| `remnawave-cabinet-retention-cleanup` | Очистка старых логов циклом (profile `maintenance`) |

Файл compose: [deploy/docker-compose.server.yml](./deploy/docker-compose.server.yml).

Обычный деплой должен показывать `app`, `worker`, `broadcast-worker` и `retention-cleanup` в `docker compose ps`.
Если cleanup не нужен, уберите `maintenance` из `COMPOSE_PROFILES`.

---

## Конфигурация

Production `.env` на сервере:

```text
/opt/remnawave-cabinet/.env
```

Редактировать через:

```bash
cabinetctl env
```

Проверить локально:

```bash
npm run check:env
NODE_ENV=production npm run check:env
```

### Обязательные переменные (production)

| Переменная | Назначение |
| --- | --- |
| `NODE_ENV` | `production` |
| `APP_URL` | Публичный HTTPS URL кабинета |
| `ALLOWED_ORIGINS` | Разрешённые origins через запятую, без путей (обычно = APP_URL; в production только HTTPS) |
| `TRUSTED_PROXY_HEADERS` | `true` за Caddy/Nginx, требуется стандартной production-конфигурацией |
| `CABINET_IMAGE` | Единый image приложения, workers и миграций (`release`) |
| `DATABASE_URL` | PostgreSQL с `connection_limit` и `pool_timeout` |
| `JWT_SECRET` | Секрет сессий (>= 32 символов) |
| `HEALTHCHECK_TOKEN` | Токен для `/api/health` |
| `REMNAWAVE_BASE_URL` | URL Remnawave Panel |
| `REMNAWAVE_TOKEN` | API token Remnawave |
| `EMAIL_VERIFICATION_WEBHOOK_URL` | Endpoint отправки email |
| `BROADCAST_UPLOAD_SIGNING_SECRET` | Подпись URL картинок рассылок (>= 32 символов) |
| `BROADCAST_UPLOAD_ALLOW_UNSIGNED_LEGACY` | Должно быть `false` |
| `LEGAL_OPERATOR_NAME` | ФИО самозанятого, наименование ИП или ООО |
| `LEGAL_OPERATOR_TAX_ID` | ИНН без слова «ИНН» |
| `LEGAL_SUPPORT_EMAIL` | Публичный email поддержки и возвратов |

Перед production-запуском пройдите [чек-лист по 152-ФЗ](deploy/152-fz-checklist.md). Публикация документов в интерфейсе не заменяет организационные меры оператора.

### Важные опциональные переменные

| Переменная | Назначение |
| --- | --- |
| `CABINET_DOMAIN` | Домен без `https://` |
| `CABINET_BRAND_NAME` | Название сервиса в UI и письмах |
| `YOOKASSA_ENABLED` | Включает YooKassa; настройки из админки имеют приоритет |
| `YOOKASSA_SHOP_ID` | ID магазина YooKassa |
| `YOOKASSA_SECRET_KEY` | Secret key YooKassa |
| `YOOKASSA_WEBHOOK_URL` | `https://домен/api/webhook/yookassa` |
| `YOOKASSA_WEBHOOK_ALLOWED_IPS` | IP/CIDR YooKassa |
| `PAYANYWAY_ENABLED` | Включает PayAnyWay как второй способ оплаты |
| `PAYANYWAY_MNT_ID` | Номер бизнес-счёта PayAnyWay |
| `PAYANYWAY_INTEGRITY_CODE` | Секрет проверки подписей PayAnyWay, минимум 32 символа |
| `PAYANYWAY_TEST_MODE` | `true` для demo.moneta.ru, иначе `false` |
| `PAYMENT_SETTINGS_ENCRYPTION_KEY` | Необязательный отдельный ключ шифрования секретов из админки; иначе используется `JWT_SECRET` |
| `LEGAL_OPERATOR_ADDRESS` | Необязательный адрес исполнителя; пустое значение не показывается |
| `LEGAL_SUPPORT_PHONE` | Необязательный публичный телефон поддержки |
| `LEGAL_SUPPORT_TELEGRAM` | Необязательный username или URL Telegram поддержки |
| `REMNASHOP_DATABASE_URL` | Read-only доступ к БД Remnashop |
| `REMNASHOP_API_URL` | Public API Remnashop |
| `TELEGRAM_BOT_TOKEN` | Mini App и Telegram-уведомления |
| `YANDEX_CLIENT_ID` / `YANDEX_CLIENT_SECRET` | Вход через Яндекс ID |
| `REFERRAL_BONUS_DAYS` | Бонус за реферала |
| `BONUS_BOX_*` | Настройки подарочного бокса |
| `BROADCAST_WORKER_*` | Параметры broadcast worker |
| `RETENTION_CLEANUP_INTERVAL_SECONDS` | Интервал cleanup-контейнера в секундах |
| `AUDIT_LOG_RETENTION_DAYS` | Срок хранения audit log |
| `APP_LOG_LEVEL` | `debug` / `info` / `warn` / `error` |
| `APP_REQUEST_LOGS` | `true` — JSON request-log в stdout |
| `SENTRY_DSN` | Error tracking (опционально) |

Полный шаблон со всеми переменными: [deploy/env.production.example](./deploy/env.production.example).

Локальный шаблон: [.env.example](./.env.example).

### Reverse Proxy

**Встроенный Caddy** (по умолчанию при установке):

```env
COMPOSE_PROFILES="caddy,maintenance"
```

**Внешний Nginx/Caddy** (если 80/443 заняты):

```env
COMPOSE_PROFILES="maintenance"
CABINET_APP_BIND="127.0.0.1"
CABINET_APP_PORT="3030"
```

Проксируйте домен на `http://127.0.0.1:3030` или `http://remnawave-cabinet-app:3000` в Docker-сети.

Автонастройка nginx рядом с Remnawave:

```bash
curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/setup-nginx-proxy.sh | sudo bash
```

---

## Интеграции

Провайдеры можно настроить двумя способами:

- через `.env`;
- в админке: `Система` → `Платёжные системы`.

Настройки из админки имеют приоритет. Кнопка «Взять из .env» удаляет переопределение из базы.
Секретные ключи в API не возвращаются и хранятся в базе в зашифрованном виде.

### YooKassa

Webhook URL:

```text
https://ВАШ_ДОМЕН/api/webhook/yookassa
```

События: `payment.succeeded`, `payment.canceled`, `payment.waiting_for_capture`.

Кабинет также проверяет платёж после возврата пользователя; worker периодически сверяет pending-платежи.

### PayAnyWay

В настройках бизнес-счёта укажите:

```text
Pay URL: https://ВАШ_ДОМЕН/api/webhook/payanyway
Метод отправки: POST
Подпись формы оплаты: обязательна
Замена URL: включена
```

`Check URL` оставьте пустым. Затем заполните `.env` или те же поля в разделе «Система»:

```env
PAYANYWAY_ENABLED="true"
PAYANYWAY_MNT_ID="НОМЕР_БИЗНЕС_СЧЁТА"
PAYANYWAY_INTEGRITY_CODE="СЕКРЕТ_ИЗ_НАСТРОЕК_СЧЁТА"
PAYANYWAY_TEST_MODE="false"
```

После оплаты PayAnyWay отправляет подписанный отчёт на Pay URL. Кабинет проверяет подпись, сумму,
номер счёта и заказ, выдаёт подписку и возвращает подписанный XML с номенклатурой услуги. Этот ответ
нужен Self.PayAnyWay для автоматической регистрации дохода самозанятого и формирования чека.

### Email

Встроенная отправка через Resend:

```env
EMAIL_VERIFICATION_WEBHOOK_URL="https://ВАШ_ДОМЕН/api/email/resend"
EMAIL_VERIFICATION_WEBHOOK_SECRET="<openssl rand -hex 32>"
RESEND_API_KEY="..."
EMAIL_FROM="Сервис <noreply@домен>"
```

Свой webhook: `POST` на `EMAIL_VERIFICATION_WEBHOOK_URL` с полями `to`, `subject`, `text`, `html` и заголовком `Authorization: Bearer SECRET`.

### Telegram Mini App

1. Укажите `TELEGRAM_BOT_TOKEN` в `.env`.
2. В BotFather настройте Mini App на URL кабинета.
3. При запуске из Telegram проверяется подписанный `initData`.

Подробный чеклист: [deploy/RUNBOOK.md](./deploy/RUNBOOK.md).

### Яндекс ID

Redirect URI в кабинете разработчика Яндекса:

```text
https://ВАШ_ДОМЕН/api/auth/yandex/callback
```

```env
YANDEX_CLIENT_ID="..."
YANDEX_CLIENT_SECRET="..."
```

Если ключи пустые, кнопка в интерфейсе скрыта.

### Remnashop

На том же сервере установщик автоматически:

- найдёт `remnashop-db`;
- создаст read-only роль;
- подключит кабinet к Docker-сети;
- заполнит `REMNASHOP_DATABASE_URL`.

Каталог синхронизируется по интервалу `REMNASHOP_CATALOG_SYNC_INTERVAL_SECONDS`. Пользователи — через payment worker (`REMNASHOP_USERS_SYNC_INTERVAL_SECONDS`).

---

## Sentry (опционально)

Без DSN Sentry не инициализируется — приложение работает как обычно.

```env
NEXT_PUBLIC_SENTRY_DSN="https://...@sentry.io/..."
SENTRY_DSN="https://...@sentry.io/..."
SENTRY_ENVIRONMENT="production"
SENTRY_TRACES_SAMPLE_RATE="0"
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE="0"
```

Для upload source maps в CI (не обязательно на сервере):

```env
SENTRY_ORG="..."
SENTRY_PROJECT="..."
SENTRY_AUTH_TOKEN="..."
```

---

## Управление сервером

```bash
cabinetctl
```

| Команда | Действие |
| --- | --- |
| `cabinetctl update` | Обновить образ, миграции, перезапуск |
| `cabinetctl restart` | Перезапустить приложение и воркеры без обновления |
| `cabinetctl env` | Редактировать `.env` |
| `cabinetctl config-check` | Проверить `.env` до перезапуска |
| `cabinetctl health` | Проверить систему |
| `cabinetctl status` | Краткий статус основных сервисов |
| `cabinetctl ps` | Полный статус Docker Compose |
| `cabinetctl logs [service]` | Меню логов или логи выбранного сервиса |
| `cabinetctl backups` | Бэкапы и восстановление |
| `cabinetctl check-update` | Проверить обновление кабинета |
| `cabinetctl self-update` | Обновить саму консоль |
| `cabinetctl version` | Показать версию консоли |
| `cabinetctl url` | Показать адрес кабинета |

Интерактивное меню само проверяет обновления и сразу показывает результат.
Проверка кешируется на 30 минут, поэтому GitHub не опрашивается при каждой
перерисовке. Отключить её можно через `CABINETCTL_CHECK_UPDATES_IN_MENU=0`.

При открытии `cabinetctl`, проверке конфигурации и обновлении сервера отсутствующие
переменные автоматически добавляются в `.env` из актуального production-шаблона.
Существующие значения не перезаписываются. Новые секреты генерируются, а значения,
которые нельзя определить автоматически, добавляются как явные плейсхолдеры.

Чтобы получать сообщение в Telegram после успешного обновления, заполните в
`/opt/remnawave-cabinet/.env` переменные `TELEGRAM_BOT_TOKEN` и
`TELEGRAM_NOTIFY_CHAT_ID`. `cabinetctl update` отправит сообщение только когда
запущенная ревизия прошла health-check и для неё ещё не было успешного
уведомления. Неудачную отправку можно повторить тем же `cabinetctl update`;
успешное сообщение второй раз не дублируется. Новый коммит или публикация
Docker-образа сами по себе уведомление не отправляют.

Логи вручную:

```bash
docker compose --env-file .env -f docker-compose.yml logs -f app
docker compose --env-file .env -f docker-compose.yml logs -f worker
docker compose --env-file .env -f docker-compose.yml logs -f broadcast-worker
```

### Роли

| Роль | Доступ |
| --- | --- |
| `USER` | Личный кабинет, свои тикеты |
| `MODERATOR` | + поддержка (admin/support) |
| `ADMIN` | + управление кабинетом, без назначения админов |
| `SUPER_ADMIN` | Полный доступ, назначение ролей, аудит |

---

## Бэкапы и перенос

Создание бэкапа:

```bash
cabinetctl backups
```

Полный архив включает Remnawave, Remnashop и кабинет (конфиги, `.env`, три PostgreSQL-дампа).

Путь по умолчанию:

```text
/opt/remnawave-backups/remna-full-backup-ДАТА-ВРЕМЯ.tar.gz
```

Восстановление на новом сервере:

```bash
curl -fsSL .../deploy/install-console.sh | sudo bash
cabinetctl   # → Бэкапы → RESTORE
```

Доступ к PostgreSQL кабинета (TablePlus через SSH):

```env
CABINET_DB_BIND="127.0.0.1"
CABINET_DB_PORT="5433"
```

---

## Разработчикам

### Структура репозитория

```text
src/app/           страницы и API routes (Next.js App Router)
src/components/    UI: admin, auth, dashboard, support, ui
src/lib/           бизнес-логика, интеграции, тесты
src/proxy.ts       security headers, auth redirect, request-id
prisma/            schema, migrations, seed
scripts/           check-env, workers, cleanup
deploy/            production compose, installer, runbook
.github/workflows/ CI: quality.yml, docker-image.yml
```

### CI/CD

На каждый pull request запускается [quality.yml](./.github/workflows/quality.yml):

1. `prisma validate`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test`
5. `npm run build`

При push в `main` запускается один [docker-image.yml](./.github/workflows/docker-image.yml):
сначала проверки и E2E, затем единственная production-сборка и публикация в GHCR.
CI собирает один target `release` (`CABINET_IMAGE`). Workers и seed заранее
собираются в компактные JavaScript-файлы, поэтому образ не содержит `src`,
`tsx` и полный `node_modules`.

### Технические правила

- Админские SSR-таблицы используют `?limit=N` с базовым шагом 25; при смене фильтров `limit` не передается и список возвращается к 25 строкам.
- JSON API для админских списков может использовать cursor, но размер страницы должен начинаться с 25 и не превращаться в выгрузку всей таблицы.
- Перед апгрейдом Prisma 7 отдельно проверить breaking changes, pooling в `DATABASE_URL`, enum-миграции для строковых статусов и миграционный diff на staging.

### Перед production-релизом

- [ ] DNS домена указывает на сервер
- [ ] Боевые ключи YooKassa (не test)
- [ ] Email отправляется, подтверждение почты работает
- [ ] Тестовая покупка → выдача Remnawave-подписки
- [ ] Webhook YooKassa отвечает 200
- [ ] `BROADCAST_UPLOAD_SIGNING_SECRET` задан
- [ ] `docker compose ps` показывает app, worker, broadcast-worker и retention-cleanup
- [ ] `npm run validate` проходит локально
- [ ] Первый бэкап после настройки

---

## Дополнительная документация

| Файл | Содержание |
| --- | --- |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Image-based deploy, GHCR, reverse proxy |
| [deploy/RUNBOOK.md](./deploy/RUNBOOK.md) | Операционный чеклист на сервере |
| [deploy/env.production.example](./deploy/env.production.example) | Полный шаблон production `.env` |
| [AGENTS.md](./AGENTS.md) | Guidelines для разработки и AI-агентов |
