import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { inflateSync, inflateRawSync } from 'node:zlib'
import { join } from 'node:path'
import { app } from 'electron'
import type { PresetFileInfo } from './db'

// ── lettore ZIP minimale (speculare a core/ingest.mjs) ────────
interface ZipEntry {
  name: string
  method: number
  csize: number
  lho: number
}

function readZipEntries(buf: Buffer): ZipEntry[] {
  let i = buf.length - 22
  const min = Math.max(0, i - 65535)
  while (i >= min && buf.readUInt32LE(i) !== 0x06054b50) i--
  if (i < min) throw new Error('archivio ZIP non valido')
  const count = buf.readUInt16LE(i + 10)
  let off = buf.readUInt32LE(i + 16)
  const entries: ZipEntry[] = []
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break
    const method = buf.readUInt16LE(off + 10)
    const csize = buf.readUInt32LE(off + 20)
    const nameLen = buf.readUInt16LE(off + 28)
    const extraLen = buf.readUInt16LE(off + 30)
    const commentLen = buf.readUInt16LE(off + 32)
    const lho = buf.readUInt32LE(off + 42)
    const name = buf.subarray(off + 46, off + 46 + nameLen).toString('utf8')
    entries.push({ name, method, csize, lho })
    off += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

function zipEntryData(buf: Buffer, e: ZipEntry): Buffer {
  const nameLen = buf.readUInt16LE(e.lho + 26)
  const extraLen = buf.readUInt16LE(e.lho + 28)
  const start = e.lho + 30 + nameLen + extraLen
  const data = buf.subarray(start, start + e.csize)
  if (e.method === 0) return Buffer.from(data)
  if (e.method === 8) return inflateRawSync(data)
  throw new Error(`metodo ZIP ${e.method} non supportato`)
}

// ── percorsi virtuali "archivio.zip::entry" ───────────────────
const ZIP_RE = /^(.*\.zip)::(.+)$/i

/** Percorso fisico da controllare/mostrare: lo zip per le entry virtuali. */
export function physicalPath(sourceFile: string): string {
  const m = sourceFile.match(ZIP_RE)
  return m ? m[1] : sourceFile
}

/** Legge i byte grezzi del sorgente, dentro o fuori da uno ZIP. */
function readSourceBuffer(sourceFile: string): Buffer {
  const m = sourceFile.match(ZIP_RE)
  if (!m) return readFileSync(sourceFile)
  const zbuf = readFileSync(m[1])
  const entry = readZipEntries(zbuf).find((e) => e.name === m[2])
  if (!entry) throw new Error(`Entry "${m[2]}" non trovata nello ZIP`)
  return zipEntryData(zbuf, entry)
}

function tempDir(): string {
  const dir = join(app.getPath('temp'), 'helix-preset-manager', 'extracted')
  mkdirSync(dir, { recursive: true })
  return dir
}

const safeName = (name: string): string =>
  // eslint-disable-next-line no-control-regex
  name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().slice(0, 60) || 'preset'

/**
 * Restituisce un file .hlx/.hsp utilizzabile (apri in HX Edit, drag):
 * - file sciolto su disco → il file stesso;
 * - preset dentro una setlist (anche dentro ZIP) → estrae lo slot e lo
 *   avvolge nel formato L6Preset (verificato con round-trip);
 * - entry semplice dentro uno ZIP → la materializza in temp.
 */
export function materializePreset(info: PresetFileInfo, presetId: number): string {
  const isZip = ZIP_RE.test(info.file)
  if (!isZip && info.parentSetlist == null) return info.file

  if (info.parentSetlist != null) {
    const j = JSON.parse(readSourceBuffer(info.file).toString('utf8'))
    if (j.schema !== 'L6Setlist') throw new Error(`${info.file} non è una setlist`)
    const inner = JSON.parse(inflateSync(Buffer.from(j.encoded_data, 'base64')).toString('utf8'))
    const preset = inner.presets?.[info.slot ?? 0]
    if (!preset?.meta?.name) throw new Error(`Slot ${info.slot} vuoto nella setlist`)
    const hlx = { schema: 'L6Preset', version: 6, meta: { pbn: 0, premium: 0, original: 0 }, data: preset }
    const outPath = join(tempDir(), `${safeName(info.name)} #${presetId}.hlx`)
    writeFileSync(outPath, JSON.stringify(hlx))
    return outPath
  }

  // entry ZIP semplice: copia i byte con l'estensione giusta
  const ext = /\.hsp$/i.test(info.file) ? 'hsp' : 'hlx'
  const outPath = join(tempDir(), `${safeName(info.name)} #${presetId}.${ext}`)
  writeFileSync(outPath, readSourceBuffer(info.file))
  return outPath
}

export function sourceExists(sourceFile: string): boolean {
  return existsSync(physicalPath(sourceFile))
}
