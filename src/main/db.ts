import { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'
import { prettyCab } from '../shared/cab'
import type {
  LibraryStats,
  PresetDetail,
  PresetSummary,
  SearchRequest,
  SearchResponse,
  UserData,
} from '../shared/types'

// Connessione primaria = userdata.db (scrivibile: preferiti/voti/tag/note).
// La libreria helix.db è ATTACH-ata in sola lettura come schema "lib":
// i nomi non qualificati (presets, blocks, presets_fts) si risolvono lì.
let db: DatabaseSync | null = null
let libAttached = false

export function openDb(libPath: string, userPath: string): void {
  db?.close()
  db = new DatabaseSync(userPath)
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS user_prefs (
      hash TEXT PRIMARY KEY,
      fav INTEGER NOT NULL DEFAULT 0,
      rating INTEGER NOT NULL DEFAULT 0,
      tags TEXT NOT NULL DEFAULT '[]',
      note TEXT
    );
  `)
  const uri = `${pathToFileURL(libPath).href}?mode=ro`
  const attach = () => {
    db!.exec(`ATTACH DATABASE '${uri.replaceAll("'", "''")}' AS lib`)
    db!.prepare('SELECT COUNT(*) FROM presets LIMIT 1').get() // verifica leggibilità
  }
  try {
    attach()
  } catch {
    // WAL "caldo" (import interrotto): il recovery richiede scrittura → apri
    // e chiudi la libreria in rw per ripristinarla, poi riprova in sola lettura
    new DatabaseSync(libPath).close()
    try {
      db.exec('DETACH DATABASE lib')
    } catch {
      /* mai agganciato */
    }
    attach()
  }
  libAttached = true
}

function need(): DatabaseSync {
  if (!db || !libAttached) throw new Error('Database non aperto')
  return db
}

export const isOpen = (): boolean => db !== null && libAttached

export function getSourceFile(id: number): string | null {
  const r = need().prepare('SELECT source_file f FROM presets WHERE id = ?').get(id) as
    | { f: string }
    | undefined
  return r?.f ?? null
}

export interface PresetFileInfo {
  file: string
  slot: number | null
  parentSetlist: string | null
  name: string
}

export function getPresetFileInfo(id: number): PresetFileInfo | null {
  const r = need()
    .prepare(
      'SELECT source_file f, slot, parent_setlist p, name FROM presets WHERE id = ?',
    )
    .get(id) as { f: string; slot: number | null; p: string | null; name: string } | undefined
  if (!r) return null
  return { file: r.f, slot: r.slot, parentSetlist: r.p, name: r.name }
}

/** Info necessarie all'export setlist (sorgente + tipo schema). */
export interface ExportInfo extends PresetFileInfo {
  id: number
  schemaType: string
}

export function getExportInfos(ids: number[]): ExportInfo[] {
  if (!ids.length) return []
  const rows = need()
    .prepare(
      `SELECT id, name, source_file f, slot, parent_setlist p, schema_type s
       FROM presets WHERE id IN (${ids.map(() => '?').join(',')})`,
    )
    .all(...ids) as {
    id: number
    name: string
    f: string
    slot: number | null
    p: string | null
    s: string
  }[]
  // preserva l'ordine di selezione
  const byId = new Map(rows.map((r) => [r.id, r]))
  return ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((r) => ({
      id: r!.id,
      name: r!.name,
      file: r!.f,
      slot: r!.slot,
      parentSetlist: r!.p,
      schemaType: r!.s,
    }))
}

const parseJson = <T>(s: string | null, fallback: T): T => {
  if (!s) return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

// SELECT comune: preset + dati utente agganciati per content_hash
const SUMMARY_SELECT =
  'p.*, u.fav AS u_fav, u.rating AS u_rating, u.tags AS u_tags, u.note AS u_note'
const USER_JOIN = 'LEFT JOIN user_prefs u ON u.hash = p.content_hash'

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
    fav: !!r.u_fav,
    rating: r.u_rating ?? 0,
    tags: parseJson(r.u_tags, []),
    hasNote: !!r.u_note,
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
  const fxCounts = new Map<string, number>()
  const ampCounts = new Map<string, number>()
  for (const r of d
    .prepare("SELECT amp_brands, artists, fx, amp_models FROM presets")
    .all() as { amp_brands: string; artists: string; fx: string; amp_models: string }[]) {
    for (const b of parseJson<string[]>(r.amp_brands, []))
      brandCounts.set(b, (brandCounts.get(b) ?? 0) + 1)
    for (const a of parseJson<string[]>(r.artists, []))
      artistCounts.set(a, (artistCounts.get(a) ?? 0) + 1)
    for (const f of parseJson<string[]>(r.fx, []))
      fxCounts.set(f, (fxCounts.get(f) ?? 0) + 1)
    for (const m of new Set(parseJson<string[]>(r.amp_models, [])))
      ampCounts.set(m, (ampCounts.get(m) ?? 0) + 1)
  }
  const cabs = (
    d
      .prepare(
        `SELECT model m, COUNT(DISTINCT preset_id) c FROM blocks
         WHERE model LIKE 'HD2_Cab%' GROUP BY model ORDER BY c DESC`,
      )
      .all() as { m: string; c: number }[]
  )
    .map((r) => ({ cab: r.m, label: prettyCab(r.m), count: r.c }))
    .sort((a, b) => a.label.localeCompare(b.label, 'it', { sensitivity: 'base', numeric: true }))
  const irCount = (
    d.prepare('SELECT COUNT(*) c FROM presets WHERE uses_ir = 1').get() as { c: number }
  ).c

  // dati utente: conteggio preferiti e tag (solo su hash presenti in libreria)
  const favCount = (
    d
      .prepare(
        `SELECT COUNT(*) c FROM presets p JOIN user_prefs u ON u.hash = p.content_hash
         WHERE u.fav = 1 AND p.dup_of IS NULL`,
      )
      .get() as { c: number }
  ).c
  const tagCounts = new Map<string, number>()
  for (const r of d
    .prepare(
      `SELECT u.tags t FROM presets p JOIN user_prefs u ON u.hash = p.content_hash
       WHERE u.tags != '[]' AND p.dup_of IS NULL`,
    )
    .all() as { t: string }[])
    for (const t of parseJson<string[]>(r.t, [])) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)

  const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])
  // per i dropdown: ordine alfabetico (i "top" restano per frequenza)
  const alpha = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], 'it', { sensitivity: 'base', numeric: true }),
    )

  return {
    total,
    unique,
    byGain,
    topBrands: sorted(brandCounts).slice(0, 10).map(([brand, count]) => ({ brand, count })),
    topArtists: sorted(artistCounts).slice(0, 10).map(([artist, count]) => ({ artist, count })),
    brands: alpha(brandCounts).map(([brand, count]) => ({ brand, count })),
    fxs: alpha(fxCounts).map(([fx, count]) => ({ fx, count })),
    amps: alpha(ampCounts).map(([amp, count]) => ({ amp, count })),
    cabs,
    irCount,
    artists: alpha(artistCounts).map(([artist, count]) => ({ artist, count })),
    tags: alpha(tagCounts).map(([tag, count]) => ({ tag, count })),
    favCount,
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
  const q = req.query.trim()

  const conds: string[] = []
  const params: (string | number)[] = []
  if (req.noDup) conds.push('p.dup_of IS NULL')
  if (req.gains?.length) {
    conds.push(`p.gain_class IN (${req.gains.map(() => '?').join(',')})`)
    params.push(...req.gains)
  }
  if (req.brand) {
    conds.push('p.amp_brands LIKE ?')
    params.push(`%${JSON.stringify(req.brand)}%`)
  }
  if (req.fx) {
    conds.push('p.fx LIKE ?')
    params.push(`%"${req.fx}"%`)
  }
  if (req.amp) {
    conds.push('p.amp_models LIKE ?')
    params.push(`%${JSON.stringify(req.amp)}%`)
  }
  if (req.cab) {
    // IN non correlata: si materializza una volta sola via ix_blocks_model
    // (una EXISTS correlata scansiona blocks per ogni preset: minuti sul corpus reale)
    conds.push('p.id IN (SELECT preset_id FROM blocks WHERE model = ?)')
    params.push(req.cab)
  }
  if (req.ir) conds.push('p.uses_ir = 1')
  if (req.artist) {
    conds.push('p.artists LIKE ?')
    params.push(`%${JSON.stringify(req.artist)}%`)
  }
  if (req.favOnly) conds.push('u.fav = 1')
  if (req.tag) {
    conds.push('u.tags LIKE ?')
    params.push(`%${JSON.stringify(req.tag)}%`)
  }

  if (!q) {
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
    const total = (
      d
        .prepare(`SELECT COUNT(*) c FROM presets p ${USER_JOIN} ${where}`)
        .get(...params) as { c: number }
    ).c
    const rows = d
      .prepare(
        `SELECT ${SUMMARY_SELECT} FROM presets p ${USER_JOIN} ${where}
         ORDER BY p.name COLLATE NOCASE LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset)
    return { rows: rows.map(toSummary), total }
  }

  const match = ftsQuery(q)
  const extra = conds.length ? `AND ${conds.join(' AND ')}` : ''
  const total = (
    d
      .prepare(
        `SELECT COUNT(*) c FROM presets_fts f JOIN presets p ON p.id = f.rowid ${USER_JOIN}
         WHERE presets_fts MATCH ? ${extra}`,
      )
      .get(match, ...params) as { c: number }
  ).c
  const rows = d
    .prepare(
      `SELECT ${SUMMARY_SELECT} FROM presets_fts f JOIN presets p ON p.id = f.rowid ${USER_JOIN}
       WHERE presets_fts MATCH ? ${extra} ORDER BY rank LIMIT ? OFFSET ?`,
    )
    .all(match, ...params, limit, offset)
  return { rows: rows.map(toSummary), total }
}

export function show(id: number): PresetDetail | null {
  const d = need()
  const p = d
    .prepare(`SELECT ${SUMMARY_SELECT} FROM presets p ${USER_JOIN} WHERE p.id = ?`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .get(id) as any
  if (!p) return null
  const blocks = (
    d
      .prepare(
        'SELECT dsp, position, model, enabled, params_json FROM blocks WHERE preset_id = ? ORDER BY dsp, position',
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .all(id) as any[]
  ).map((b) => ({
    dsp: b.dsp,
    position: b.position,
    model: b.model,
    enabled: !!b.enabled,
    params: parseJson<Record<string, unknown>>(b.params_json, {}),
  }))

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
    note: p.u_note ?? null,
  }
}

// ── dati utente ────────────────────────────────────────────────
export function setUserData(id: number, patch: Partial<UserData>): UserData | null {
  const d = need()
  const r = d.prepare('SELECT content_hash h FROM presets WHERE id = ?').get(id) as
    | { h: string }
    | undefined
  if (!r) return null
  const cur = d
    .prepare('SELECT fav, rating, tags, note FROM user_prefs WHERE hash = ?')
    .get(r.h) as { fav: number; rating: number; tags: string; note: string | null } | undefined
  const next: UserData = {
    fav: patch.fav ?? !!cur?.fav,
    rating: patch.rating ?? cur?.rating ?? 0,
    tags: patch.tags ?? parseJson<string[]>(cur?.tags ?? null, []),
    note: patch.note !== undefined ? patch.note : (cur?.note ?? null),
  }
  d.prepare(
    `INSERT INTO user_prefs (hash, fav, rating, tags, note) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(hash) DO UPDATE SET fav = excluded.fav, rating = excluded.rating,
       tags = excluded.tags, note = excluded.note`,
  ).run(r.h, next.fav ? 1 : 0, next.rating, JSON.stringify(next.tags), next.note)
  return next
}
