# Remnawave Cabinet

Личный кабинет для продажи VPN без обязательного Telegram. Пользователь регистрируется по email, подтверждает почту, выбирает тариф, оплачивает онлайн и получает QR-код, ссылку подписки, историю платежей и управление устройствами.

## Возможности

- Email-регистрация, подтверждение почты и восстановление пароля.
- Покупка и продление VPN через YooKassa.
- Одноразовые промо-тарифы без оплаты.
- Промокоды, лимиты и привязка скидок к тарифам.
- Подарочный бокс с днями подписки, трафиком и скидочными промокодами.
- Автоматическая выдача доступа в Remnawave после оплаты.
- Выбор Remnawave squads в настройках тарифа.
- QR-код, ссылка подписки, трафик и устройства в кабинете.
- Worker для проверки ожидающих платежей и отмены зависших оплат.
- Реферальные бонусы за первую платную покупку приглашенного пользователя.
- Синхронизация тарифов, промокодов и старых Telegram-подписок из remnashop.
- Автоматический вход в Telegram Mini App с обязательным подтверждением email.
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

## Быстрый старт

### 1. Подготовьте сервер

Поддерживается чистый Ubuntu/Debian сервер с root-доступом. До установки подготовьте:

- домен или поддомен кабинета;
- API token Remnawave;
- YooKassa `shopId` и `secretKey`;
- Resend API key или собственный email webhook;
- Telegram bot token, если нужен Mini App;
- DNS-запись домена, направленную на IP сервера.

Remnawave и Remnashop могут уже работать на этом сервере. Консоль покажет их
состояние и установит кабинет рядом, не удаляя существующие контейнеры.

### 2. Установите управляющую консоль

На чистом сервере сначала устанавливается только `remnactl`:

```bash
curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/install-console.sh | sudo bash
```

После установки запустите:

```bash
remnactl
```

Консоль доступна даже до установки кабинета. Через неё можно:

- установить кабинет;
- восстановить весь сервер из полного бэкапа;
- проверить архив;
- увидеть состояние Remnawave, Remnashop, nginx и кабинета;
- после установки обновлять кабинет, менять `.env`, смотреть логи и создавать бэкапы.

### 3. Установите кабинет

В меню `remnactl` выберите:

```text
1. Установить кабинет
```

Мастер:

1. установит Docker, если его ещё нет;
2. создаст `/opt/remnawave-cabinet`;
3. подготовит `docker-compose.yml` и `.env`;
4. сгенерирует локальные секреты;
5. запросит production-настройки;
6. подключит локальный Remnashop, если он найден;
7. запустит БД, миграции, приложение и worker;
8. предложит создать первого главного администратора.

После установки снова запустите:

```bash
remnactl
```

Меню автоматически переключится в режим управления установленным кабинетом.

### 4. Проверьте запуск

В `remnactl` выберите `Проверить кабинет`, затем откройте:

```text
https://ВСТАВЬ_СЮДА_ДОМЕН_КАБИНЕТА
```

Если порты `80/443` уже заняты nginx Remnawave, выберите в консоли
`Настроить nginx и HTTPS`.

### Установка без меню

Прямой установщик сохранён для автоматизации:

```bash
curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/install-server.sh | sudo bash
```

С заранее заданным главным администратором:

```bash
curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/install-server.sh | \
  sudo env SUPERUSER_EMAIL="admin@example.com" SUPERUSER_PASSWORD="strong-password1" bash
```

## Роли и доступ

- `Пользователь` — личный кабинет и собственные обращения.
- `Модератор` — дополнительно видит и обрабатывает поддержку.
- `Администратор` — управляет кабинетом, тарифами, платежами и пользователями, но не назначает администраторов.
- `Главный администратор` — полный доступ, включая назначение ролей.

## Telegram Mini App

Чтобы кабинет автоматически авторизовал пользователя при открытии внутри Telegram:

1. Укажите в `.env` токен бота:

```env
TELEGRAM_BOT_TOKEN="ВСТАВЬ_СЮДА_ТОКЕН_БОТА"
```

2. В BotFather настройте Mini App или кнопку меню на адрес кабинета:

```text
https://ВСТАВЬ_СЮДА_ДОМЕН_КАБИНЕТА
```

При запуске из Telegram кабинет проверяет подписанный `initData`. Новый пользователь указывает email и
подтверждает его по ссылке. При обычном открытии сайта остаётся стандартный вход по email и паролю.

Подробный серверный чеклист: [deploy/RUNBOOK.md](./deploy/RUNBOOK.md).

## Конфигурация

Файл production-настроек:

```text
/opt/remnawave-cabinet/.env
```

Открывать его удобнее через:

```bash
remnactl env
```

### Основные ENV

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
| `REMNASHOP_DATABASE_URL` | Подключение к Remnashop для чтения и вызова ограниченной функции объединения аккаунтов |
| `REMNASHOP_API_URL` | Public API remnashop для двусторонней регистрации |
| `REMNASHOP_CATALOG_SYNC_INTERVAL_SECONDS` | Интервал авто-синхронизации каталога |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Опциональный вход и регистрация через Google |
| `REFERRAL_BONUS_DAYS` | Бонус за реферала |
| `BONUS_BOX_RUB_PER_ATTEMPT` | Сколько рублей оплаты дают одно открытие бокса |
| `BONUS_BOX_MIN_ATTEMPTS_PER_PAYMENT` / `BONUS_BOX_MAX_ATTEMPTS_PER_PAYMENT` | Минимум и максимум открытий за одну оплату |
| `BONUS_BOX_WEEKLY_DAY` / `BONUS_BOX_WEEKLY_ATTEMPTS` | День старта недельного бонуса и количество еженедельных открытий. Если пользователь пропустил этот день, попытка выдаётся при следующем входе в этот недельный период |
| `BONUS_BOX_REFERRER_ATTEMPTS` / `BONUS_BOX_REFERRED_ATTEMPTS` | Открытия за реферальную покупку |
| `BONUS_BOX_PROMO_EXPIRES_IN_DAYS` | Срок жизни промокодов, выпавших из бокса |
| `BONUS_BOX_ECONOMY_GUARD_ENABLED` | Защита от подряд идущих дорогих подарков |
| `BONUS_BOX_RARE_COOLDOWN_OPENINGS` / `BONUS_BOX_EPIC_COOLDOWN_OPENINGS` / `BONUS_BOX_LEGENDARY_COOLDOWN_OPENINGS` | Паузы после редких, эпических и легендарных подарков; редкий и эпик не закрывают легенду |
| `BONUS_BOX_EPIC_MIN_OPENINGS` / `BONUS_BOX_LEGENDARY_MIN_OPENINGS` | Минимальная история открытий перед эпиком и легендой |
| `APP_LOG_LEVEL` | Уровень JSON-логов приложения: `debug`, `info`, `warn`, `error` |
| `APP_REQUEST_LOGS` | `true` включает request-log приложения в Docker stdout без cookie и секретов |
| `REMNASHOP_USER_SUBSCRIPTION_SYNC_STALE_SECONDS` | Как часто обновлять локальные подписки пользователей из Remnawave при Remnashop sync |

### Google OAuth

Google-вход опционален. Если ключи пустые, кнопка в интерфейсе не показывается.

В Google Cloud Console создай OAuth Client типа `Web application` и добавь redirect URI:

```text
https://ТВОЙ_ДОМЕН_КАБИНЕТА/api/auth/google/callback
```

После этого внеси в `.env`:

```env
GOOGLE_CLIENT_ID="ВСТАВЬ_СЮДА_GOOGLE_CLIENT_ID"
GOOGLE_CLIENT_SECRET="ВСТАВЬ_СЮДА_GOOGLE_CLIENT_SECRET"
```

Если пользователь уже зарегистрирован по email, вход через Google привяжется к этому же аккаунту при совпадении подтверждённого email.

### Reverse Proxy

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

### YooKassa

В YooKassa добавь webhook:

```text
https://ВСТАВЬ_СЮДА_ДОМЕН_КАБИНЕТА/api/webhook/yookassa
```

События:

- `payment.succeeded`
- `payment.canceled`
- `payment.waiting_for_capture`

Кабинет также сам проверяет платеж после возврата пользователя, а worker периодически сверяет ожидающие платежи с YooKassa.

### Email

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

### Remnashop

Если `remnashop-db` на том же сервере, ничего вручную настраивать не нужно. Установщик:

- найдет контейнер `remnashop-db`;
- создаст/обновит роль `remnashop_readonly`;
- установит ограниченную SQL-функцию для связи существующего Telegram-пользователя с подтверждённым email;
- выдаст только `SELECT`;
- подключит кабинет к нужной Docker-сети;
- заполнит `REMNASHOP_DATABASE_URL`;
- отключит SSL для внутреннего Docker-соединения.

Каталог remnashop автоматически синхронизируется при входе в кабинет с интервалом `REMNASHOP_CATALOG_SYNC_INTERVAL_SECONDS`.

Пользователи синхронизируются в обе стороны:

- регистрация и Telegram Mini App в кабинете создают пользователя через официальный API remnashop;
- пользователи remnashop импортируются в кабинет по `telegram_id` или email;
- при первом email-входе кабинет проверяет пароль через remnashop и сохраняет собственный хеш;
- прямой доступ на запись к базе remnashop не используется.

Для записи из кабинета в remnashop должна быть включена его web-часть:

```env
WEB_ENABLED="true"
APP_API_KEY="ВСТАВЬ_СЮДА_СЛУЧАЙНЫЙ_СЕКРЕТ"
APP_JWT_SECRET="ВСТАВЬ_СЮДА_СЛУЧАЙНЫЙ_СЕКРЕТ_НЕ_КОРОЧЕ_32_СИМВОЛОВ"
```

После изменения перезапустите контейнеры remnashop. `APP_API_KEY` не передаётся
пользователям кабинета: публичная регистрация защищается собственными правилами
remnashop, а ключ нужен самому сервису для включения web-режима.

Для remnashop на другом сервере создай read-only пользователя:

```sql
CREATE USER remnashop_readonly WITH PASSWORD 'ВСТАВЬ_СЮДА_СИЛЬНЫЙ_ПАРОЛЬ';
GRANT CONNECT ON DATABASE remnashop TO remnashop_readonly;
GRANT USAGE ON SCHEMA public TO remnashop_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO remnashop_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO remnashop_readonly;
```

Для объединения email и Telegram установите функцию:

```bash
curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/remnashop-cabinet-link.sql \
  | docker compose exec -T remnashop-db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Она не выдаёт кабинету общих прав записи: разрешён только вызов операции объединения аккаунтов.

И укажи:

```env
REMNASHOP_DATABASE_URL="postgresql://remnashop_readonly:ВСТАВЬ_СЮДА_ПАРОЛЬ@ВСТАВЬ_СЮДА_HOST:5432/remnashop?schema=public"
REMNASHOP_DATABASE_SSL="true"
REMNASHOP_API_URL="https://ВСТАВЬ_СЮДА_ДОМЕН_REMNASHOP/api/v1/public"
```

## Управление сервером

```bash
remnactl
```

Основные команды:

```bash
remnactl status
remnactl update
remnactl env
remnactl restart
remnactl logs
remnactl worker
remnactl health
remnactl nginx
remnactl backup
remnactl backups
remnactl self-update
```

`remnactl update` скачивает свежий compose и image, применяет миграции,
проверяет запуск и не удаляет `.env` или volume базы.

`cabinetctl` остаётся доступен для совместимости и низкоуровневого управления
только кабинетом:

```bash
cabinetctl update
cabinetctl env
cabinetctl status
cabinetctl logs
cabinetctl restart
cabinetctl health
cabinetctl backup
cabinetctl backup-full
cabinetctl transfer
```

## Полный бэкап и перенос сервера

Бэкап можно создать из консоли:

```bash
remnactl backup
```

Или открыть отдельное меню:

```bash
remnactl backups
```

Полный архив включает:

- `/opt/remnawave` и база `remnawave-db`;
- `/opt/remnashop` и база `remnashop-db`;
- `/opt/remnawave-cabinet` и база `remnawave-cabinet-db`.

Архив содержит конфигурацию, `.env`, compose-файлы, сертификаты внутри каталогов,
три согласованных PostgreSQL-дампа, манифест и SHA-256 для каждого файла.
Redis не переносится: его данные являются временным кэшем.

По умолчанию архив появится в:

```text
/opt/remnawave-backups/remna-full-backup-ДАТА-ВРЕМЯ.tar.gz
```

Проверить архив:

```bash
remnactl verify /opt/remnawave-backups/remna-full-backup-ДАТА-ВРЕМЯ.tar.gz
```

Передать на новый сервер можно через `scp`, SFTP или объектное хранилище. Пример:

```bash
scp /opt/remnawave-backups/remna-full-backup-ДАТА-ВРЕМЯ.tar.gz root@НОВЫЙ_IP:/root/
```

На новом сервере установите только консоль:

```bash
curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/install-console.sh | sudo bash
remnactl
```

Откройте `Резервные копии и восстановление`, выберите локальный архив или S3
по номеру и подтвердите операцию словом `RESTORE`. Вручную вводить путь к
архиву не требуется. Консоль при необходимости установит Docker и AWS CLI.

Восстановление:

1. проверит контрольные суммы;
2. остановит существующие контейнеры, если они есть;
3. сохранит прежние каталоги в `/opt/remna-pre-restore-ДАТА-ВРЕМЯ`;
4. восстановит файлы и базы;
5. запустит Remnawave, Remnashop, кабинет и nginx.

После переноса измените DNS на IP нового сервера и проверьте:

```bash
docker ps
curl -I https://ДОМЕН_КАБИНЕТА
```

Если IP сервера изменился, обновите разрешённый IP панели на внешних узлах
Remnawave и проверьте firewall. Старый сервер выключайте только после проверки
авторизации, подписок, оплаты и Telegram.

Настройки хранения:

```bash
FULL_BACKUP_DIR=/mnt/backups FULL_BACKUP_KEEP_DAYS=30 remnactl backup
```

Для S3 откройте:

```bash
remnactl
```

Затем выберите `Резервные копии и S3` → `Настроить S3`. Поддерживаются AWS S3
и S3-совместимые хранилища с собственным endpoint. Доступы сохраняются только
на сервере в `/etc/remna-backup-s3.conf` с правами `600`. Можно включить
автоматическую загрузку каждого нового полного бэкапа.

### Доступ к PostgreSQL кабинета

Порт базы задаётся в `/opt/remnawave-cabinet/.env` и не перезаписывается при
обновлении:

```env
CABINET_DB_BIND="127.0.0.1"
CABINET_DB_PORT="5433"
```

База остаётся доступной только локально. Для TablePlus подключайтесь через SSH:
host `127.0.0.1`, порт из `CABINET_DB_PORT`, пользователь и база из
`POSTGRES_USER`/`POSTGRES_DB`.

Сценарий создан по той же идее, что и
[distillium/remnawave-backup-restore](https://github.com/distillium/remnawave-backup-restore),
но отдельно адаптирован под совместный перенос Remnawave, Remnashop и кабинета.

### Бэкап только базы кабинета

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
