import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const picomatchAdvisory = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf'

const parserChecksums = {
  '2.3.2': [
    '3a91656f440069aa8f8e15c9d695b9f6b2209df1eab2be8127c72cbcca45ff5f',
    '19f3224e5daddf7f11b5a3f09d1c5e55737c850914deb1c7e7662be8197117f3',
  ],
  '4.0.4': [
    'ce57c04e04994b83e2ca566170fa192e6fe19d710bea6da00ce2f76d01c0dea4',
    '874e243a180292e9b63af7a96b6bf9d131ca040d079b932b24df782498147da4',
  ],
  '4.0.5': [
    '73211a8ba85ce257b827abd8960e52c9750385b3fd18e8ef1080b114d774eb23',
    '5dbdf804b9150ac24e7cf344b62128981c3138cfdccf33d196e1db2a070dba7f',
  ],
  '4.0.7': [
    '4e1e05447668aa1e94366c5516a2bcd8f5fff800cc92b1d0cd7d77703b8618c4',
    '7d09107e0dac54a0770834d0bc7a067d9dd9d8d10a6d6425bc8b67b189f971dd',
  ],
}

const before = `    const analysis = analyzeRepeatedExtglob(body, opts);

    if ((token.type === 'plus' || token.type === 'star') && analysis.risky) {`

// Until upstream publishes a fix, use its existing literal fallback for
// single-branch repeats containing anything other than basic literal characters.
const after = `    const repeated = token.type === 'plus' || token.type === 'star';
    const singleBranch = repeated && splitTopLevel(body).length === 1;
    const analysis = singleBranch && !/^[A-Za-z0-9_-]+$/.test(body)
      ? { risky: true }
      : analyzeRepeatedExtglob(body, opts);

    if (repeated && analysis.risky) {`

const sha256 = (text) => createHash('sha256').update(text).digest('hex')

export function verifiedPicomatchBackports(lock, apply = false) {
  const verified = new Set()
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path.startsWith('node_modules/') || !path.endsWith('/picomatch')) continue
    const checksums = Object.hasOwn(parserChecksums, entry.version) && parserChecksums[entry.version]
    const parser = `${path}/lib/parse.js`
    if (!checksums || !existsSync(parser)) continue

    const [originalHash, patchedHash] = checksums
    const source = readFileSync(parser, 'utf8')
    const hash = sha256(source)
    if (hash === patchedHash) {
      verified.add(path)
      continue
    }
    if (!apply) continue
    if (hash !== originalHash) throw new Error(`Unexpected Picomatch parser at ${path}`)

    const backported = source.replace(before, after)
    if (sha256(backported) !== patchedHash) throw new Error(`Failed to backport Picomatch at ${path}`)
    writeFileSync(parser, backported)
    verified.add(path)
  }
  return verified
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
  const verified = verifiedPicomatchBackports(lock, true)
  console.log(`Verified Picomatch backport for ${verified.size} installed package copies`)
}
