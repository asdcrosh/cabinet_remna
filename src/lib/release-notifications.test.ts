import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  createAdminNotification: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({ readFile: mocks.readFile }))
vi.mock('./admin-notifications', () => ({
  createAdminNotification: mocks.createAdminNotification,
}))

import { checkReleaseNotifications } from './release-notifications'

describe('release notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.APP_BUILD_REVISION = 'a'.repeat(40)
    delete process.env.CABINET_RELEASE_REPOSITORY
    delete process.env.CABINET_RELEASE_BRANCH
    delete process.env.CABINETCTL_BUNDLED_VERSION_FILE
    mocks.readFile.mockResolvedValue('1.9.11\n')
    mocks.createAdminNotification.mockResolvedValue({ id: 'notification-1' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.APP_BUILD_REVISION
  })

  it('queues cabinet and cabinetctl releases once their versions are newer', async () => {
    const remoteRevision = 'b'.repeat(40)
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/commits/main.atom')) {
        return new Response(`<id>tag:github.com,2008:Grit::Commit/${remoteRevision}</id>`)
      }
      if (url.startsWith('https://ghcr.io/token?')) {
        return Response.json({ token: 'registry-token' })
      }
      if (url.includes(`/manifests/sha-${remoteRevision}`)) {
        return new Response('{}', { status: 200 })
      }
      if (url.includes('/deploy/cabinetctl.sh')) {
        return new Response('VERSION="1.9.12"\n')
      }
      return new Response('not found', { status: 404 })
    }))

    await expect(checkReleaseNotifications()).resolves.toEqual({
      cabinet: 'created',
      console: 'created',
    })
    expect(mocks.createAdminNotification).toHaveBeenCalledWith(expect.objectContaining({
      dedupeKey: `admin:release:cabinet:${remoteRevision}`,
      title: 'Доступна новая версия кабинета',
      telegram: expect.objectContaining({ text: expect.stringContaining(remoteRevision.slice(0, 7)) }),
    }))
    expect(mocks.createAdminNotification).toHaveBeenCalledWith(expect.objectContaining({
      dedupeKey: 'admin:release:cabinetctl:1.9.12',
      title: 'Доступна новая версия cabinetctl 1.9.12',
      telegram: expect.objectContaining({ text: expect.stringContaining('cabinetctl v1.9.12') }),
    }))
  })

  it('does not queue notifications for installed versions', async () => {
    const installedRevision = 'a'.repeat(40)
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/commits/main.atom')) {
        return new Response(`<id>tag:github.com,2008:Grit::Commit/${installedRevision}</id>`)
      }
      if (url.includes('/deploy/cabinetctl.sh')) {
        return new Response('VERSION="1.9.11"\n')
      }
      return new Response('not found', { status: 404 })
    }))

    await expect(checkReleaseNotifications()).resolves.toEqual({
      cabinet: 'current',
      console: 'current',
    })
    expect(mocks.createAdminNotification).not.toHaveBeenCalled()
  })
})
