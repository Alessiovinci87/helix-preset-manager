import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { join } from 'node:path'
import { app } from 'electron'

/**
 * Estrae un preset da un file setlist (L6Setlist) e lo materializza come
 * .hlx singolo in una cartella temporanea. Il formato replica quello dei
 * .hlx esportati da HX Edit: { schema, version, meta, data }.
 */
export function extractFromSetlist(
  setlistFile: string,
  slot: number,
  presetId: number,
  name: string,
): string {
  const j = JSON.parse(readFileSync(setlistFile, 'utf8'))
  if (j.schema !== 'L6Setlist') throw new Error(`${setlistFile} non è una setlist`)

  const inner = JSON.parse(inflateSync(Buffer.from(j.encoded_data, 'base64')).toString('utf8'))
  const preset = inner.presets?.[slot]
  if (!preset?.meta?.name) throw new Error(`Slot ${slot} vuoto nella setlist`)

  const hlx = {
    schema: 'L6Preset',
    version: 6,
    meta: { pbn: 0, premium: 0, original: 0 },
    data: preset,
  }

  const dir = join(app.getPath('temp'), 'helix-preset-manager', 'extracted')
  mkdirSync(dir, { recursive: true })
  const safe = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().slice(0, 60) || 'preset'
  const outPath = join(dir, `${safe} #${presetId}.hlx`)
  writeFileSync(outPath, JSON.stringify(hlx))
  return outPath
}
