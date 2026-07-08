import { DatabaseSync } from 'node:sqlite'
import type {
  LibraryStats,
  PresetDetail,
  PresetSummary,
  SearchRequest,
  SearchResponse,
} from '../shared/types'

let db: DatabaseSync | null = null

export function openDb(path: string): void {
  db = new DatabaseSync(path, { readOnly: true })
}

function need(): DatabaseSync {
  if (!db) throw new Error('Database non aperto')
  return db
}

export const isOpen = (): boolean => db !== null

export function getSourceFile(id: number): string | null {
  const r = need().prepare('SELECT source_file f FROM presets WHERE id = ?').get(id) as
    | { f: string }
    | undefined
  return r?.f ?? null
}

const parseJson = <T>(s: string | null, fallback: T): T => {
  if (!s) return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toSummary(r: any): PresetSummary {
  return {
    id: r.id,
    name: r.name,
    author: r.author,
    band: r.band,
    song: r.song,
    gainClass: r.gain_class,
    ampBrands: parseJson(r.amp_brands, []),
    ampModels: parseJson(r.amp_models, []),
    fx: parseJson(r.fx, []),
    artists: parseJson(r.artists, []),
    usesIr: !!r.uses_ir,
    dupOf: r.dup_of,
    parentSetlist: r.parent_setlist,
  }
}

export function getStats(): LibraryStats {
  const d = need()
  const total = (d.prepare('SELECT COUNT(*) c FROM presets').get() as { c: number }).c
  const unique = (
    d.prepare('SELECT COUNT(*) c FROM presets WHERE dup_of IS NULL').get() as { c: number }
  ).c
  const byGain = (
    d.prepare('SELECT gain_class g, COUNT(*) c FROM presets GROUP BY 1 ORDER BY c DESC').all() as {
      g: string
      c: number
    }[]
  ).map((r) => ({ gainClass: r.g, count: r.c }))

  const brandCounts = new Map<string, number>()
  const artistCounts = new Map<string, number>()
  for (const r of d
    .prepare("SELECT amp_brands, artists FROM presets")
    .all() as { amp_brands: string; artists: string }[]) {
    for (const b of parseJson<string[]>(r.amp_brands, []))
      brandCounts.set(b, (brandCounts.get(b) ?? 0) + 1)
    for (const a of parseJson<string[]>(r.artists, []))
      artistCounts.set(a, (artistCounts.get(a) ?? 0) + 1)
  }
  const top = (m: Map<string, number>, n: number) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)

  return {
    total,
    unique,
    byGain,
    topBrands: top(brandCounts, 10).map(([brand, count]) => ({ brand, count })),
    topArtists: top(artistCounts, 10).map(([artist, count]) => ({ artist, count })),
  }
}

/** Costruisce la MATCH expression FTS5 con prefix matching per token. */
const ftsQuery = (q: string): string =>
  q
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `"${w.replaceAll('"', '""')}"*`)
    .join(' ')

export function search(req: SearchRequest): SearchResponse {
  const d = need()
  const limit = Math.min(req.limit ?? 100, 500)
  const offset = req.offset ?? 0
  const noDup = req.noDup ? 'AND p.dup_of IS NULL' : ''
  const q = req.query.trim()

  if (!q) {
    const where = req.noDup ? 'WHERE dup_of IS NULL' : ''
    const total = (
      d.prepare(`SELECT COUNT(*) c FROM presets ${where}`).get() as { c: number }
    ).c
    const rows = d
      .prepare(`SELECT * FROM presets ${where} ORDER BY name COLLATE NOCASE LIMIT ? OFFSET ?`)
      .all(limit, offset)
    return { rows: rows.map(toSummary), total }
  }

  const match = ftsQuery(q)
  const total = (
    d
      .prepare(
        `SELECT COUNT(*) c FROM presets_fts f JOIN presets p ON p.id = f.rowid
         WHERE presets_fts MATCH ? ${noDup}`,
      )
      .get(match) as { c: number }
  ).c
  const rows = d
    .prepare(
      `SELECT p.* FROM presets_fts f JOIN presets p ON p.id = f.rowid
       WHERE presets_fts MATCH ? ${noDup} ORDER BY rank LIMIT ? OFFSET ?`,
    )
    .all(match, limit, offset)
  return { rows: rows.map(toSummary), total }
}

export function show(id: number): PresetDetail | null {
  const d = need()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = d.prepare('SELECT * FROM presets WHERE id = ?').get(id) as any
  if (!p) return null
  const blocks = (
    d
      .prepare(
        'SELECT dsp, position, model, enabled FROM blocks WHERE preset_id = ? ORDER BY dsp, position',
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .all(id) as any[]
  ).map((b) => ({ dsp: b.dsp, position: b.position, model: b.model, enabled: !!b.enabled }))

  return {
    ...toSummary(p),
    tnid: p.tnid,
    firmware: p.firmware,
    schemaType: p.schema_type,
    slot: p.slot,
    irSlots: parseJson(p.ir_slots, []),
    tempo: p.tempo,
    topology: p.topology,
    info: p.info,
    sourceFile: p.source_file,
    blocks,
  }
}
