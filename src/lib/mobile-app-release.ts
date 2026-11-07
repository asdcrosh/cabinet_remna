// Выпуски Android-приложения StealthNet.
// APK и manifest.json лежат в папке на сервере (по умолчанию /app/app-releases,
// на хосте — /opt/remnawave-cabinet/app-releases, подключена только для чтения).
// manifest.json собирает scripts/build-release.sh в репозитории приложения.
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { z } from 'zod'

// Папка выпусков — вне проекта (том Docker), поэтому пути помечены turbopackIgnore:
// иначе сборка решит, что читаем файлы проекта, и потащит их все в трассировку.

export const APP_ABIS = ['arm64-v8a', 'armeabi-v7a', 'x86_64'] as const
export type AppAbi = (typeof APP_ABIS)[number]
export const DEFAULT_APP_ABI: AppAbi = 'arm64-v8a'

const fileSchema = z.object({
  // Только имя файла в папке выпусков: без каталогов и «..».
  // stealthnet-1.0.0-arm64-v8a.apk, stealthnet-1.0.0-x86_64.apk (в имени ABI бывает «_»).
  file: z.string().regex(/^stealthnet-[0-9A-Za-z._+-]+\.apk$/),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  size: z.number().int().positive(),
})

const manifestSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  build: z.number().int().positive(),
  // Сборки ниже minBuild обязаны обновиться.
  minBuild: z.number().int().nonnegative().default(0),
  notes: z.string().max(2000).default(''),
  files: z.partialRecord(z.enum(APP_ABIS), fileSchema),
})

export type AppReleaseManifest = z.infer<typeof manifestSchema>
export type AppReleaseFile = z.infer<typeof fileSchema>

export function getAppReleasesDir() {
  return process.env.MOBILE_APP_RELEASES_DIR?.trim() || '/app/app-releases'
}

export function isAppAbi(value: string | null | undefined): value is AppAbi {
  return Boolean(value) && (APP_ABIS as readonly string[]).includes(value as string)
}

/** Текущий выпуск или null, если выпуска нет или manifest.json испорчен. */
export async function getAppRelease(dir = getAppReleasesDir()): Promise<AppReleaseManifest | null> {
  let raw: string
  try {
    raw = await readFile(path.join(/*turbopackIgnore: true*/ dir, 'manifest.json'), 'utf8')
  } catch {
    return null
  }
  try {
    const parsed = manifestSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** APK выпуска для архитектуры: поток и размер; null — нет файла. */
export async function openAppReleaseFile(
  abi: AppAbi,
  dir = getAppReleasesDir()
): Promise<{ manifest: AppReleaseManifest; entry: AppReleaseFile; body: ReadableStream<Uint8Array> } | null> {
  const manifest = await getAppRelease(dir)
  const entry = manifest?.files[abi]
  if (!manifest || !entry) return null
  const filePath = path.join(/*turbopackIgnore: true*/ dir, entry.file)
  try {
    const info = await stat(/*turbopackIgnore: true*/ filePath)
    // Файл ещё заливается или не тот — не отдаём то, что не сверится по SHA-256.
    if (!info.isFile() || info.size !== entry.size) return null
  } catch {
    return null
  }
  const body = Readable.toWeb(createReadStream(/*turbopackIgnore: true*/ filePath)) as ReadableStream<Uint8Array>
  return { manifest, entry, body }
}

export function appDownloadPath(abi: AppAbi) {
  return `/download/android/${abi}`
}
