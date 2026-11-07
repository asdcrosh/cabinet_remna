import { afterEach, describe, expect, it } from 'vitest'
import { getAndroidAppLinkTargets } from './mobile-app-links'

const FP = 'C6:5F:88:AF:F6:23:5B:AB:55:EE:6C:54:C4:BA:9D:F4:05:1B:9D:5E:29:E1:A8:69:92:22:34:7E:89:3C:95:C5'

describe('assetlinks', () => {
  afterEach(() => {
    delete process.env.MOBILE_ANDROID_CERT_SHA256
    delete process.env.MOBILE_ANDROID_PACKAGE
  })

  it('без отпечатка — пусто', () => {
    expect(getAndroidAppLinkTargets()).toEqual([])
    process.env.MOBILE_ANDROID_CERT_SHA256 = 'not-a-fingerprint'
    expect(getAndroidAppLinkTargets()).toEqual([])
  })

  it('пакет и отпечатки (регистр, пробелы, несколько)', () => {
    process.env.MOBILE_ANDROID_CERT_SHA256 = ` ${FP.toLowerCase()} , ${FP.replace('C6', 'AA')}`
    expect(getAndroidAppLinkTargets()).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: 'site.stealthnet.app', sha256_cert_fingerprints: [FP, FP.replace('C6', 'AA')] },
      },
    ])
  })
})
