// Android App Links приложения StealthNet: https://<кабинет>/app/… открывает приложение,
// если Android подтвердил его по /.well-known/assetlinks.json (пакет + отпечаток ключа релиза).
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/

export function getAndroidAppLinkTargets() {
  const packageName = process.env.MOBILE_ANDROID_PACKAGE?.trim() || 'site.stealthnet.app'
  const fingerprints = (process.env.MOBILE_ANDROID_CERT_SHA256 ?? '')
    .split(',')
    .map((v) => v.trim().toUpperCase())
    .filter((v) => FINGERPRINT.test(v))
  if (fingerprints.length === 0) return []
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: packageName, sha256_cert_fingerprints: fingerprints },
    },
  ]
}
