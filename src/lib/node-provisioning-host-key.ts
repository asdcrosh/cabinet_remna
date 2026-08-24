const sshHostKeyFingerprintPattern = /^SHA256:[A-Za-z0-9+/]{43}$/

export function isSshHostKeyFingerprint(value: unknown): value is string {
  return typeof value === 'string' && sshHostKeyFingerprintPattern.test(value)
}

export function isSshHostKeyChangedError(message: string | null | undefined) {
  return message?.includes('SSH host key изменился после предыдущего запуска') ?? false
}

export function sshHostKeyChangedError(expectedFingerprint: string, receivedFingerprint: string) {
  return new Error([
    'SSH host key изменился после предыдущего запуска.',
    `Сохранённый ключ: ${expectedFingerprint}`,
    `Новый ключ: ${receivedFingerprint}`,
    'Сверьте новый fingerprint на сервере и подтвердите его в кабинете.',
  ].join('\n'))
}
