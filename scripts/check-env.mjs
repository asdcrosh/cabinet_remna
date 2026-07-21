import { existsSync, readFileSync } from "node:fs";

const NODE_ENV = process.env.NODE_ENV || "development";
const isProduction = NODE_ENV === "production";

loadEnvFile(isProduction ? ".env.production" : ".env");

const requiredAlways = ["DATABASE_URL", "JWT_SECRET"];
const requiredProduction = [
  "APP_URL",
  "HEALTHCHECK_TOKEN",
  "EMAIL_VERIFICATION_WEBHOOK_URL",
  "REMNAWAVE_BASE_URL",
  "REMNAWAVE_TOKEN",
  "LEGAL_OPERATOR_NAME",
  "LEGAL_OPERATOR_TAX_ID",
  "LEGAL_SUPPORT_EMAIL",
];

const optionalPairs = [
  ["TELEGRAM_CLIENT_ID", "TELEGRAM_CLIENT_SECRET"],
  ["YANDEX_CLIENT_ID", "YANDEX_CLIENT_SECRET"],
  ["EMAIL_VERIFICATION_WEBHOOK_URL", "EMAIL_VERIFICATION_WEBHOOK_SECRET"],
  ["RESEND_API_KEY", "EMAIL_FROM"],
];

const optionalBooleans = [
  "TRUSTED_PROXY_HEADERS",
  "FEATURE_REFERRALS",
  "FEATURE_SUPPORT",
  "FEATURE_BROADCASTS",
  "BROADCAST_UPLOAD_ALLOW_UNSIGNED_LEGACY",
  "BONUS_BOX_ENABLED",
  "BONUS_BOX_WEEKLY_ENABLED",
  "BONUS_BOX_ECONOMY_GUARD_ENABLED",
  "BONUS_BOX_PITY_ENABLED",
  "BONUS_BOX_SHOW_BEST_RECENT_OPENING",
  "TELEGRAM_MINIAPP_AUTO_MERGE_TECHNICAL",
  "YOOKASSA_ENABLED",
  "PAYANYWAY_ENABLED",
  "PAYANYWAY_TEST_MODE",
  "PLATEGA_ENABLED",
];

const optionalNonNegativeIntegers = [
  "AUDIT_LOG_RETENTION_DAYS",
  "NOTIFICATION_LOG_RETENTION_DAYS",
  "SYNC_EVENT_RETENTION_DAYS",
  "BROADCAST_DELIVERY_RETENTION_DAYS",
  "BONUS_BOX_RUB_PER_ATTEMPT",
  "BONUS_BOX_MIN_ATTEMPTS_PER_PAYMENT",
  "BONUS_BOX_MAX_ATTEMPTS_PER_PAYMENT",
  "BONUS_BOX_ATTEMPT_TTL_DAYS",
  "BONUS_BOX_WEEKLY_DAY",
  "BONUS_BOX_WEEKLY_ATTEMPTS",
  "BONUS_BOX_WEEKLY_MAX_BALANCE",
  "BONUS_BOX_REFERRER_ATTEMPTS",
  "BONUS_BOX_REFERRED_ATTEMPTS",
  "BONUS_BOX_RARE_COOLDOWN_OPENINGS",
  "BONUS_BOX_EPIC_COOLDOWN_OPENINGS",
  "BONUS_BOX_LEGENDARY_COOLDOWN_OPENINGS",
  "BONUS_BOX_EPIC_MIN_OPENINGS",
  "BONUS_BOX_LEGENDARY_MIN_OPENINGS",
  "BONUS_BOX_ACTIVE_PROMO_REWARDS_LIMIT",
  "REFERRAL_BONUS_DAYS",
  "BROADCAST_WORKER_INTERVAL_SECONDS",
  "BROADCAST_WORKER_BATCH_SIZE",
  "BROADCAST_WORKER_MAX_ATTEMPTS",
  "PROVISIONING_RETRY_BATCH_SIZE",
];

const optionalPositiveIntegers = [
  "BONUS_BOX_PROMO_EXPIRES_IN_DAYS",
  "BONUS_BOX_PITY_OPENINGS",
  "RETENTION_CLEANUP_INTERVAL_SECONDS",
];

const optionalSampleRates = [
  "SENTRY_TRACES_SAMPLE_RATE",
  "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE",
  "NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE",
  "NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE",
];

const errors = [];
const warnings = [];

for (const key of requiredAlways) {
  if (!value(key)) errors.push(`${key} is required`);
}

if (isProduction) {
  for (const key of requiredProduction) {
    if (!value(key)) errors.push(`${key} is required in production`);
  }

  if (/(ВСТАВЬ|Оператор сервиса|example\.com)/i.test(value("LEGAL_OPERATOR_NAME"))) {
    errors.push("LEGAL_OPERATOR_NAME must contain the real operator name");
  }
  if (!/^\d{10}(\d{2})?$/.test(value("LEGAL_OPERATOR_TAX_ID"))) {
    errors.push("LEGAL_OPERATOR_TAX_ID must contain a 10 or 12 digit INN");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value("LEGAL_SUPPORT_EMAIL"))) {
    errors.push("LEGAL_SUPPORT_EMAIL must be a valid public email address");
  }
}

if (value("JWT_SECRET") && value("JWT_SECRET").length < 32) {
  errors.push("JWT_SECRET must be at least 32 characters");
}

checkPublicUrl("APP_URL");
checkPublicUrl("NEXTAUTH_URL", { optional: true });
checkPublicUrl("REMNAWAVE_BASE_URL");
checkPublicUrl("YOOKASSA_WEBHOOK_URL", { optional: true, pathPrefix: "/api/webhook/yookassa" });
checkPublicUrl("PLATEGA_WEBHOOK_URL", { optional: true, pathPrefix: "/api/webhook/platega" });
checkAllowedOrigins();

if (
  isProduction &&
  value("EMAIL_VERIFICATION_WEBHOOK_URL").includes("/api/email/resend")
) {
  if (!value("EMAIL_VERIFICATION_WEBHOOK_SECRET")) {
    errors.push(
      "EMAIL_VERIFICATION_WEBHOOK_SECRET is required for built-in Resend webhook",
    );
  }
  if (!value("RESEND_API_KEY"))
    errors.push("RESEND_API_KEY is required for built-in Resend webhook");
  if (!value("EMAIL_FROM"))
    errors.push("EMAIL_FROM is required for built-in Resend webhook");
}

if (isProduction && value("REMNASHOP_DATABASE_SSL") === "no-verify") {
  warnings.push("REMNASHOP_DATABASE_SSL=no-verify disables TLS verification");
}

if (isProduction && value("DATABASE_URL")) {
  try {
    const databaseUrl = new URL(value("DATABASE_URL"));
    const hasPoolOptions =
      databaseUrl.searchParams.has("connection_limit") ||
      databaseUrl.searchParams.has("pool_timeout") ||
      databaseUrl.searchParams.get("pgbouncer") === "true";
    if (!hasPoolOptions) {
      warnings.push("DATABASE_URL should set connection_limit/pool_timeout or use pgbouncer=true in production");
    }
  } catch {
    errors.push("DATABASE_URL must be a valid URL");
  }
}

for (const [left, right] of optionalPairs) {
  if (Boolean(value(left)) !== Boolean(value(right))) {
    warnings.push(`${left} and ${right} should be configured together`);
  }
}

if (value("TELEGRAM_NOTIFY_CHAT_ID") && !value("TELEGRAM_BOT_TOKEN")) {
  warnings.push("TELEGRAM_BOT_TOKEN is required for Telegram deploy notifications");
}

if (["1", "true", "yes", "on"].includes(value("PAYANYWAY_ENABLED").toLowerCase())) {
  if (!value("PAYANYWAY_MNT_ID")) errors.push("PAYANYWAY_MNT_ID is required when PayAnyWay is enabled");
  if (!value("PAYANYWAY_INTEGRITY_CODE")) {
    errors.push("PAYANYWAY_INTEGRITY_CODE is required when PayAnyWay is enabled");
  } else if (value("PAYANYWAY_INTEGRITY_CODE").length < 32 && value("PAYANYWAY_INTEGRITY_CODE") !== "12345") {
    errors.push("PAYANYWAY_INTEGRITY_CODE must be at least 32 characters or the Self.PayAnyWay legacy code");
  } else if (value("PAYANYWAY_INTEGRITY_CODE") === "12345") {
    warnings.push("PAYANYWAY_INTEGRITY_CODE uses the insecure Self.PayAnyWay legacy code; ask provider support to synchronize a new code");
  }
  if (value("PAYANYWAY_MNT_ID") && !/^\d+$/.test(value("PAYANYWAY_MNT_ID"))) {
    errors.push("PAYANYWAY_MNT_ID must contain only digits");
  }
}

if (["1", "true", "yes", "on"].includes(value("PLATEGA_ENABLED").toLowerCase())) {
  if (!value("PLATEGA_MERCHANT_ID")) {
    errors.push("PLATEGA_MERCHANT_ID is required when Platega is enabled");
  }
  if (!value("PLATEGA_SECRET")) {
    errors.push("PLATEGA_SECRET is required when Platega is enabled");
  }
  if (isProduction && !value("PLATEGA_WEBHOOK_URL")) {
    errors.push("PLATEGA_WEBHOOK_URL is required when Platega is enabled in production");
  }
}

if (value("PAYMENT_SETTINGS_ENCRYPTION_KEY") && value("PAYMENT_SETTINGS_ENCRYPTION_KEY").length < 32) {
  errors.push("PAYMENT_SETTINGS_ENCRYPTION_KEY must be at least 32 characters");
}

for (const key of optionalBooleans) {
  if (!value(key)) continue;
  if (!["1", "true", "yes", "on", "0", "false", "no", "off"].includes(value(key).toLowerCase())) {
    errors.push(`${key} must be a boolean`);
  }
}

for (const key of optionalNonNegativeIntegers) {
  if (!value(key)) continue;
  const numeric = Number(value(key));
  if (!Number.isInteger(numeric) || numeric < 0) {
    errors.push(`${key} must be a non-negative integer`);
  }
}

for (const key of optionalPositiveIntegers) {
  if (!value(key)) continue;
  const numeric = Number(value(key));
  if (!Number.isInteger(numeric) || numeric < 1) {
    errors.push(`${key} must be a positive integer`);
  }
}

for (const key of optionalSampleRates) {
  if (!value(key)) continue;
  const numeric = Number(value(key));
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
    errors.push(`${key} must be between 0 and 1`);
  }
}

if (value("BONUS_BOX_WEEKLY_DAY")) {
  const weeklyDay = Number(value("BONUS_BOX_WEEKLY_DAY"));
  if (!Number.isInteger(weeklyDay) || weeklyDay < 0 || weeklyDay > 6) {
    errors.push("BONUS_BOX_WEEKLY_DAY must be between 0 and 6");
  }
}

if (value("TELEGRAM_BOT_TOKEN") && value("TELEGRAM_BOT_TOKEN").length < 20) {
  warnings.push("TELEGRAM_BOT_TOKEN looks too short");
}

if (value("BROADCAST_UPLOAD_SIGNING_SECRET") && value("BROADCAST_UPLOAD_SIGNING_SECRET").length < 32) {
  errors.push("BROADCAST_UPLOAD_SIGNING_SECRET must be at least 32 characters");
}

if (isProduction && !value("BROADCAST_UPLOAD_SIGNING_SECRET")) {
  errors.push("BROADCAST_UPLOAD_SIGNING_SECRET is required in production");
}

if (isProduction && value("BROADCAST_UPLOAD_ALLOW_UNSIGNED_LEGACY") !== "false") {
  errors.push("BROADCAST_UPLOAD_ALLOW_UNSIGNED_LEGACY must be false in production");
}

if (isProduction && value("TRUSTED_PROXY_HEADERS").toLowerCase() !== "true") {
  errors.push("TRUSTED_PROXY_HEADERS must be true in production");
}

if (errors.length > 0) {
  console.error("Environment check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn("Environment check warnings:");
  for (const warning of warnings) console.warn(`- ${warning}`);
}

console.log("Environment check passed");

function value(key) {
  return (process.env[key] || "").trim();
}

function loadEnvFile(file) {
  if (!existsSync(file)) return;

  const content = readFileSync(file, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const index = trimmed.indexOf("=");
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) process.env[key] = value;
  }
}

function checkPublicUrl(key, options = {}) {
  const raw = value(key);
  if (!raw) {
    if (!options.optional && isProduction)
      errors.push(`${key} is required in production`);
    return;
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    errors.push(`${key} must be a valid URL`);
    return;
  }

  if (!isProduction) return;

  if (url.protocol !== "https:")
    errors.push(`${key} must use https in production`);
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    errors.push(`${key} must not point to localhost in production`);
  }
  if (options.pathPrefix && !url.pathname.startsWith(options.pathPrefix)) {
    errors.push(`${key} must point to ${options.pathPrefix}`);
  }
}

function checkAllowedOrigins() {
  const origins = value("ALLOWED_ORIGINS")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  for (const origin of origins) {
    let url;
    try {
      url = new URL(origin);
    } catch {
      errors.push(`ALLOWED_ORIGINS contains an invalid URL: ${origin}`);
      continue;
    }

    if (!["http:", "https:"].includes(url.protocol)) {
      errors.push(`ALLOWED_ORIGINS must contain only http/https origins: ${origin}`);
    }
    if (url.username || url.password) {
      errors.push(`ALLOWED_ORIGINS must not contain credentials: ${origin}`);
    }
    if (url.pathname !== "/" || url.search || url.hash) {
      errors.push(`ALLOWED_ORIGINS must contain origins without paths: ${origin}`);
    }
    if (isProduction && url.protocol !== "https:") {
      errors.push(`ALLOWED_ORIGINS must use https in production: ${origin}`);
    }
  }
}
