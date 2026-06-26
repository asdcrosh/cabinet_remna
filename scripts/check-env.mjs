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
  "YOOKASSA_SHOP_ID",
  "YOOKASSA_SECRET_KEY",
  "YOOKASSA_WEBHOOK_URL",
];

const optionalPairs = [
  ["TELEGRAM_CLIENT_ID", "TELEGRAM_CLIENT_SECRET"],
  ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  ["EMAIL_VERIFICATION_WEBHOOK_URL", "EMAIL_VERIFICATION_WEBHOOK_SECRET"],
  ["RESEND_API_KEY", "EMAIL_FROM"],
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
}

if (value("JWT_SECRET") && value("JWT_SECRET").length < 32) {
  errors.push("JWT_SECRET must be at least 32 characters");
}

checkPublicUrl("APP_URL");
checkPublicUrl("NEXTAUTH_URL", { optional: true });
checkPublicUrl("REMNAWAVE_BASE_URL");
checkPublicUrl("YOOKASSA_WEBHOOK_URL", { pathPrefix: "/api/webhook/yookassa" });

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

for (const [left, right] of optionalPairs) {
  if (Boolean(value(left)) !== Boolean(value(right))) {
    warnings.push(`${left} and ${right} should be configured together`);
  }
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
