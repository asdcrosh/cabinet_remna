import { getBrandName } from './branding'

type ActionEmailInput = {
  eyebrow: string
  title: string
  lead: string
  greetingName?: string | null
  body: string
  ctaLabel: string
  ctaUrl: string
  imageUrl?: string | null
  expiry: string
  securityNote: string
}

export function renderActionEmail(input: ActionEmailInput) {
  const brandName = getBrandName()
  const greeting = input.greetingName
    ? `Здравствуйте, ${escapeHtml(input.greetingName)}.`
    : 'Здравствуйте.'
  const ctaUrl = escapeAttribute(input.ctaUrl)

  return `
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f6fb;color:#0f172a;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${escapeHtml(input.lead)}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f3f6fb;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;">
            <tr>
              <td align="center" style="padding:0 0 18px;">
                <div style="display:inline-block;border-radius:999px;background:#ffffff;border:1px solid #dbe5f2;padding:8px 14px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;letter-spacing:0;color:#0f172a;text-transform:uppercase;">
                  ${escapeHtml(brandName)}
                </div>
              </td>
            </tr>
            <tr>
              <td style="overflow:hidden;border-radius:24px;background:#ffffff;border:1px solid #dbe5f2;box-shadow:0 24px 60px rgba(15,23,42,.12);">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="height:6px;background:#22c55e;font-size:0;line-height:0;">&nbsp;</td>
                  </tr>
                  <tr>
                    <td style="background:#0f172a;padding:34px 34px 30px;font-family:Arial,Helvetica,sans-serif;">
                      <div style="font-size:12px;font-weight:800;letter-spacing:0;text-transform:uppercase;color:#67e8f9;">
                        ${escapeHtml(input.eyebrow)}
                      </div>
                      <h1 style="margin:14px 0 0;font-size:30px;line-height:1.15;font-weight:800;color:#ffffff;">
                        ${escapeHtml(input.title)}
                      </h1>
                      <p style="margin:14px 0 0;font-size:16px;line-height:1.65;color:#cbd5e1;">
                        ${escapeHtml(input.lead)}
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:32px 34px 34px;font-family:Arial,Helvetica,sans-serif;">
                      ${
                        input.imageUrl
                          ? `<img src="${escapeAttribute(input.imageUrl)}" alt="" width="572" style="display:block;width:100%;max-width:572px;max-height:320px;object-fit:cover;border-radius:18px;margin:0 0 24px;border:1px solid #e2e8f0;">`
                          : ''
                      }
                      <p style="margin:0;font-size:16px;line-height:1.7;color:#0f172a;">${greeting}</p>
                      <div style="margin:12px 0 0;font-size:16px;line-height:1.7;color:#334155;">
                        ${formatMultilineHtml(input.body)}
                      </div>

                      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0 24px;">
                        <tr>
                          <td align="center" bgcolor="#2563eb" style="border-radius:14px;box-shadow:0 12px 28px rgba(37,99,235,.28);">
                            <a href="${ctaUrl}" style="display:inline-block;padding:15px 22px;font-size:16px;line-height:1;font-weight:800;color:#ffffff;text-decoration:none;border-radius:14px;">
                              ${escapeHtml(input.ctaLabel)}
                            </a>
                          </td>
                        </tr>
                      </table>

                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:18px;">
                        <tr>
                          <td style="padding:16px 18px;font-family:Arial,Helvetica,sans-serif;">
                            <div style="font-size:12px;font-weight:800;letter-spacing:0;text-transform:uppercase;color:#64748b;">
                              Срок действия
                            </div>
                            <div style="margin-top:6px;font-size:15px;line-height:1.6;color:#0f172a;">
                              ${escapeHtml(input.expiry)}
                            </div>
                          </td>
                        </tr>
                      </table>

                      <p style="margin:0;font-size:13px;line-height:1.65;color:#64748b;">
                        Если кнопка не открывается, скопируйте ссылку в браузер:
                      </p>
                      <p style="margin:8px 0 0;font-size:13px;line-height:1.6;word-break:break-all;color:#2563eb;">
                        <a href="${ctaUrl}" style="color:#2563eb;text-decoration:none;">${escapeHtml(input.ctaUrl)}</a>
                      </p>

                      <p style="margin:22px 0 0;font-size:13px;line-height:1.65;color:#64748b;">
                        ${escapeHtml(input.securityNote)}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:18px 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#94a3b8;">
                Это автоматическое письмо от ${escapeHtml(brandName)}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim()
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case "'":
        return '&#039;'
      default:
        return char
    }
  })
}

function escapeAttribute(value: string) {
  return escapeHtml(value)
}

function formatMultilineHtml(value: string) {
  return escapeHtml(value)
    .split('\n')
    .map((line) => line || '&nbsp;')
    .join('<br>')
}
