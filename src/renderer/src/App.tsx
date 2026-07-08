import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { prettyCab } from '../../shared/cab'
import type {
  ImportProgress,
  LibraryStats,
  PresetDetail,
  PresetSummary,
  UserData,
} from '../../shared/types'

const GAIN_ORDER = ['clean', 'edge', 'crunch', 'lead', 'highgain', 'acoustic', 'ambient', 'fx-only']

const GAIN_COLORS: Record<string, string> = {
  clean: 'bg-sky-500/15 text-sky-400',
  edge: 'bg-teal-500/15 text-teal-400',
  crunch: 'bg-amber-500/15 text-amber-400',
  lead: 'bg-orange-500/15 text-orange-400',
  highgain: 'bg-red-500/15 text-red-400',
  acoustic: 'bg-lime-500/15 text-lime-400',
  ambient: 'bg-violet-500/15 text-violet-400',
  'fx-only': 'bg-zinc-500/15 text-zinc-400',
}

const PAGE = 200
const ROW_H = 40
const GRID = 'grid-cols-[28px_28px_1fr_90px_150px_1fr]'

// filtri persistiti tra le sessioni
interface SavedFilters {
  query: string
  noDup: boolean
  gains: string[]
  brand: string
  fx: string
  amp: string
  cab: string
  ir: boolean
  artist: string
  favOnly: boolean
  tag: string
}
const FILTER_KEY = 'hpm.filters'
function loadFilters(): SavedFilters {
  const def: SavedFilters = {
    query: '', noDup: true, gains: [], brand: '', fx: '', amp: '', cab: '',
    ir: false, artist: '', favOnly: false, tag: '',
  }
  try {
    return { ...def, ...JSON.parse(localStorage.getItem(FILTER_KEY) ?? '{}') }
  } catch {
    return def
  }
}

function GainBadge({ gain }: { gain: string }) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${GAIN_COLORS[gain] ?? 'bg-zinc-500/15 text-zinc-400'}`}
    >
      {gain}
    </span>
  )
}

function Star({ on, onClick, title }: { on: boolean; onClick: () => void; title?: string }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      title={title ?? (on ? 'Togli dai preferiti' : 'Aggiungi ai preferiti')}
      className={`text-base leading-none ${on ? 'text-amber-400' : 'text-zinc-700 hover:text-zinc-400'}`}
    >
      {on ? '★' : '☆'}
    </button>
  )
}

function PresetRow({
  p,
  selected,
  checked,
  onClick,
  onCheck,
  onFav,
}: {
  p: PresetSummary
  selected: boolean
  checked: boolean
  onClick: () => void
  onCheck: (v: boolean) => void
  onFav: () => void
}) {
  return (
    <div
      onClick={onClick}
      onDoubleClick={() => window.api.openInHxEdit(p.id)}
      draggable
      onDragStart={(e) => {
        e.preventDefault()
        window.api.startDrag(p.id)
      }}
      title="Doppio click: apri in HX Edit — oppure trascina il file dentro HX Edit"
      className={`grid h-full w-full cursor-pointer ${GRID} items-center gap-3 border-b border-zinc-800/60 px-4 text-left text-sm hover:bg-zinc-800/40 ${
        selected ? 'bg-zinc-800/60' : ''
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onCheck(e.target.checked)}
        title="Seleziona per setlist / confronto"
        className="accent-sky-600"
      />
      <Star on={p.fav} onClick={onFav} />
      <span className="truncate font-medium text-zinc-100">
        {p.name}
        {p.rating > 0 && (
          <span className="ml-2 text-[10px] text-amber-500/80">{'★'.repeat(p.rating)}</span>
        )}
        {p.tags.slice(0, 3).map((t) => (
          <span
            key={t}
            className="ml-1.5 rounded bg-sky-500/10 px-1 py-px text-[10px] text-sky-400"
          >
            {t}
          </span>
        ))}
        {p.hasNote && <span className="ml-1.5 text-[10px] text-zinc-500">✎</span>}
        {p.dupOf && <span className="ml-2 text-xs text-zinc-500">dup</span>}
        {p.parentSetlist && <span className="ml-2 text-[10px] text-zinc-600">setlist</span>}
      </span>
      <GainBadge gain={p.gainClass} />
      <span className="truncate text-zinc-400">{p.ampBrands.join(', ') || '—'}</span>
      <span className="truncate text-zinc-500">
        {p.band || p.song || ''}
        {p.author && <span className="text-zinc-600"> · {p.author}</span>}
      </span>
    </div>
  )
}

function RatingStars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onClick={() => onChange(n === value ? 0 : n)}
          title={`${n} stelle${n === value ? ' (clicca per azzerare)' : ''}`}
          className={`text-lg leading-none ${n <= value ? 'text-amber-400' : 'text-zinc-700 hover:text-zinc-500'}`}
        >
          ★
        </button>
      ))}
    </span>
  )
}

function DetailPanel({
  detail,
  onClose,
  onUserData,
}: {
  detail: PresetDetail
  onClose: () => void
  onUserData: (id: number, patch: Partial<UserData>) => void
}) {
  const [tagInput, setTagInput] = useState('')
  const [noteDraft, setNoteDraft] = useState(detail.note ?? '')
  useEffect(() => {
    setNoteDraft(detail.note ?? '')
    setTagInput('')
  }, [detail.id, detail.note])

  const addTag = () => {
    const t = tagInput.trim()
    if (!t || detail.tags.includes(t)) return
    onUserData(detail.id, { tags: [...detail.tags, t] })
    setTagInput('')
  }

  const cabs = [
    ...new Set(
      detail.blocks.filter((b) => b.model.startsWith('HD2_Cab')).map((b) => prettyCab(b.model)),
    ),
  ]

  return (
    <aside className="flex w-96 shrink-0 flex-col overflow-y-auto border-l border-zinc-800 bg-[#0b0e13]">
      <div className="flex items-start justify-between p-4 pb-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
            <Star on={detail.fav} onClick={() => onUserData(detail.id, { fav: !detail.fav })} />
            {detail.name}
          </h2>
          <div className="mt-1 flex items-center gap-2">
            <GainBadge gain={detail.gainClass} />
            {detail.usesIr && (
              <span className="rounded bg-fuchsia-500/15 px-1.5 py-0.5 text-[11px] font-medium text-fuchsia-400">
                IR slot {detail.irSlots.filter((s) => s != null).join(', ') || '?'}
              </span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200" title="Chiudi">
          ✕
        </button>
      </div>

      <div className="flex items-center gap-3 px-4 py-1">
        <span className="text-sm text-zinc-500">Voto</span>
        <RatingStars
          value={detail.rating}
          onChange={(v) => onUserData(detail.id, { rating: v })}
        />
      </div>

      <div className="px-4 py-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {detail.tags.map((t) => (
            <span
              key={t}
              className="flex items-center gap-1 rounded bg-sky-500/10 px-1.5 py-0.5 text-[11px] text-sky-300"
            >
              {t}
              <button
                onClick={() =>
                  onUserData(detail.id, { tags: detail.tags.filter((x) => x !== t) })
                }
                className="text-sky-500 hover:text-sky-200"
                title="Rimuovi tag"
              >
                ×
              </button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTag()}
            placeholder="+ tag"
            className="w-20 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-300 placeholder-zinc-600 outline-none focus:border-sky-700"
          />
        </div>
      </div>

      <dl className="space-y-1.5 px-4 py-2 text-sm">
        {(
          [
            ['Autore', detail.author],
            ['Band', detail.band],
            ['Song', detail.song],
            ['Amp', detail.ampModels.join(', ')],
            ['Cab', cabs.join(', ')],
            ['FX', detail.fx.join(', ')],
            ['Firmware', detail.firmware],
            ['Setlist', detail.parentSetlist && `${detail.parentSetlist} (slot ${detail.slot})`],
            ['Tempo', detail.tempo && `${Math.round(detail.tempo)} BPM`],
          ] as [string, string | null | false][]
        )
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="grid grid-cols-[80px_1fr] gap-2">
              <dt className="text-zinc-500">{k}</dt>
              <dd className="text-zinc-300">{v}</dd>
            </div>
          ))}
        {detail.tnid && (
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <dt className="text-zinc-500">CustomTone</dt>
            <dd>
              <a
                href={`https://line6.com/customtone/tone/${detail.tnid}`}
                target="_blank"
                rel="noreferrer"
                className="text-sky-400 hover:underline"
              >
                #{detail.tnid}
              </a>
            </dd>
          </div>
        )}
      </dl>

      {detail.info && (
        <p className="mx-4 my-2 rounded bg-zinc-800/40 p-3 text-xs leading-relaxed text-zinc-400">
          {detail.info}
        </p>
      )}

      <div className="px-4 py-2">
        <textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={() => {
            if (noteDraft !== (detail.note ?? ''))
              onUserData(detail.id, { note: noteDraft.trim() || null })
          }}
          placeholder="Le tue note su questo preset…"
          rows={2}
          className="w-full resize-y rounded border border-zinc-800 bg-zinc-900/60 p-2 text-xs text-zinc-300 placeholder-zinc-600 outline-none focus:border-sky-700"
        />
      </div>

      <h3 className="px-4 pt-1 pb-1 text-xs font-semibold tracking-wider text-zinc-500 uppercase">
        Catena effetti
      </h3>
      <ol className="px-4 pb-4">
        {detail.blocks.map((b, i) => (
          <li
            key={i}
            className={`flex items-center gap-2 border-l-2 py-1 pl-3 text-sm ${
              b.enabled ? 'border-emerald-500/50 text-zinc-300' : 'border-zinc-700 text-zinc-600'
            }`}
          >
            <span className="w-10 text-[10px] text-zinc-600">{b.dsp}</span>
            <span>{b.model.replace(/^HD2_/, '')}</span>
            {!b.enabled && <span className="text-[10px]">(off)</span>}
          </li>
        ))}
      </ol>

      <div className="mt-auto space-y-2 border-t border-zinc-800 p-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => window.api.openInHxEdit(detail.id)}
            className="rounded bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-600"
            title="Apre il file .hlx con HX Edit (associazione di sistema)"
          >
            ▶ Apri in HX Edit
          </button>
          <button
            onClick={() => window.api.reveal(detail.id)}
            className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
          >
            Mostra in Esplora risorse
          </button>
          <span
            draggable
            onDragStart={(e) => {
              e.preventDefault()
              window.api.startDrag(detail.id)
            }}
            className="cursor-grab rounded border border-sky-800 bg-sky-950/40 px-3 py-1.5 text-xs text-sky-300 select-none active:cursor-grabbing"
            title="Tieni premuto e trascina dentro HX Edit"
          >
            ⠿ Trascina in HX Edit
          </span>
        </div>
        {detail.parentSetlist && (
          <p className="text-[11px] leading-snug text-zinc-500">
            Questo preset vive nella setlist "{detail.parentSetlist}" (slot {detail.slot}): il
            file .hlx viene estratto al volo quando lo apri o lo trascini.
          </p>
        )}
        <p className="truncate text-[10px] text-zinc-600" title={detail.sourceFile}>
          {detail.sourceFile}
        </p>
      </div>
    </aside>
  )
}

/** parametri (non strutturali) che differiscono tra due blocchi con lo stesso modello */
function diffParams(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): [string, string, string][] {
  const fmt = (v: unknown) =>
    typeof v === 'number' ? String(Math.round(v * 100) / 100) : JSON.stringify(v)
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((k) => !k.startsWith('@'))
    .sort()
  const out: [string, string, string][] = []
  for (const k of keys)
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push([k, fmt(a[k]), fmt(b[k])])
  return out
}

function CompareModal({ pair, onClose }: { pair: [PresetDetail, PresetDetail]; onClose: () => void }) {
  const [l, r] = pair
  const modelsL = new Set(l.blocks.map((b) => b.model))
  const modelsR = new Set(r.blocks.map((b) => b.model))

  // blocchi con lo stesso modello in entrambi: confronto parametri (primo match)
  const commonDiffs: { model: string; diffs: [string, string, string][] }[] = []
  const usedR = new Set<number>()
  for (const bl of l.blocks) {
    const ri = r.blocks.findIndex((br, i) => !usedR.has(i) && br.model === bl.model)
    if (ri < 0) continue
    usedR.add(ri)
    const diffs = diffParams(bl.params, r.blocks[ri].params)
    if (diffs.length) commonDiffs.push({ model: bl.model.replace(/^HD2_/, ''), diffs })
  }

  const chain = (d: PresetDetail, other: Set<string>) => (
    <div className="min-w-0 flex-1">
      <h3 className="mb-1 flex items-center gap-2 truncate text-sm font-semibold text-zinc-100">
        {d.name} <GainBadge gain={d.gainClass} />
      </h3>
      <ol className="space-y-0.5">
        {d.blocks.map((b, i) => (
          <li
            key={i}
            className={`flex items-center gap-2 text-xs ${
              other.has(b.model) ? 'text-zinc-300' : 'text-amber-400'
            } ${b.enabled ? '' : 'opacity-50'}`}
            title={other.has(b.model) ? '' : "Presente solo in questo preset"}
          >
            <span className="w-8 shrink-0 text-[10px] text-zinc-600">{b.dsp}</span>
            <span className="truncate">{b.model.replace(/^HD2_/, '')}</span>
          </li>
        ))}
      </ol>
    </div>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-zinc-700 bg-[#0b0e13] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <h2 className="text-sm font-semibold tracking-wider text-zinc-300 uppercase">
            Confronto preset
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200">
            ✕
          </button>
        </div>
        <div className="overflow-y-auto p-5">
          <div className="flex gap-6">
            {chain(l, modelsR)}
            {chain(r, modelsL)}
          </div>
          <p className="mt-2 text-[11px] text-zinc-600">
            In <span className="text-amber-400">ambra</span>: blocchi presenti solo in uno dei due
            preset.
          </p>
          {commonDiffs.length > 0 && (
            <>
              <h3 className="mt-4 mb-2 text-xs font-semibold tracking-wider text-zinc-500 uppercase">
                Parametri diversi (blocchi in comune)
              </h3>
              {commonDiffs.map(({ model, diffs }) => (
                <div key={model} className="mb-3">
                  <p className="mb-1 text-xs font-medium text-zinc-300">{model}</p>
                  <table className="w-full text-left text-[11px]">
                    <tbody>
                      {diffs.slice(0, 12).map(([k, va, vb]) => (
                        <tr key={k} className="border-t border-zinc-800/60">
                          <td className="py-0.5 pr-2 text-zinc-500">{k}</td>
                          <td className="py-0.5 pr-2 text-sky-300">{va}</td>
                          <td className="py-0.5 text-amber-300">{vb}</td>
                        </tr>
                      ))}
                      {diffs.length > 12 && (
                        <tr>
                          <td colSpan={3} className="py-0.5 text-zinc-600">
                            … e altri {diffs.length - 12} parametri
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const saved = useRef(loadFilters()).current
  const [stats, setStats] = useState<LibraryStats | null>(null)
  const [query, setQuery] = useState(saved.query)
  const [noDup, setNoDup] = useState(saved.noDup)
  const [gains, setGains] = useState<Set<string>>(new Set(saved.gains))
  const [brand, setBrand] = useState(saved.brand)
  const [fx, setFx] = useState(saved.fx)
  const [amp, setAmp] = useState(saved.amp)
  const [cab, setCab] = useState(saved.cab)
  const [ir, setIr] = useState(saved.ir)
  const [artist, setArtist] = useState(saved.artist)
  const [favOnly, setFavOnly] = useState(saved.favOnly)
  const [tag, setTag] = useState(saved.tag)
  const [total, setTotal] = useState(0)
  const [detail, setDetail] = useState<PresetDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [compare, setCompare] = useState<[PresetDetail, PresetDetail] | null>(null)
  const [exportName, setExportName] = useState<string | null>(null) // != null → modal aperta
  const [dragOver, setDragOver] = useState(false)
  const dragDepth = useRef(0)

  // persisti i filtri tra le sessioni
  useEffect(() => {
    localStorage.setItem(
      FILTER_KEY,
      JSON.stringify({
        query, noDup, gains: [...gains], brand, fx, amp, cab, ir, artist, favOnly, tag,
      } satisfies SavedFilters),
    )
  }, [query, noDup, gains, brand, fx, amp, cab, ir, artist, favOnly, tag])

  // ── lista virtualizzata a pagine ───────────────────────────
  const seq = useRef(0)
  const cache = useRef(new Map<number, PresetSummary[]>())
  const inflight = useRef(new Set<number>())
  const viewportRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewH, setViewH] = useState(600)
  const [, force] = useReducer((x: number) => x + 1, 0)

  const fetchPage = useCallback(
    (pi: number) => {
      if (cache.current.has(pi) || inflight.current.has(pi)) return
      inflight.current.add(pi)
      const mySeq = seq.current
      window.api
        .search({
          query,
          limit: PAGE,
          offset: pi * PAGE,
          noDup,
          gains: [...gains],
          brand: brand || undefined,
          fx: fx || undefined,
          amp: amp || undefined,
          cab: cab || undefined,
          ir: ir || undefined,
          artist: artist || undefined,
          favOnly: favOnly || undefined,
          tag: tag || undefined,
        })
        .then((res) => {
          if (seq.current !== mySeq) return // risposta stantia
          cache.current.set(pi, res.rows)
          setTotal(res.total)
          force()
        })
        .catch((e) => setError(String(e)))
        .finally(() => inflight.current.delete(pi))
    },
    [query, noDup, gains, brand, fx, amp, cab, ir, artist, favOnly, tag],
  )

  // reset e prima pagina quando cambiano i filtri (debounced)
  useEffect(() => {
    const t = setTimeout(() => {
      seq.current++
      cache.current.clear()
      inflight.current.clear()
      viewportRef.current?.scrollTo({ top: 0 })
      setScrollTop(0)
      fetchPage(0)
    }, 150)
    return () => clearTimeout(t)
  }, [fetchPage])

  // misura l'altezza del viewport
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewH(el.clientHeight))
    ro.observe(el)
    setViewH(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - 5)
  const last = Math.min(total, Math.ceil((scrollTop + viewH) / ROW_H) + 5)

  // assicura le pagine visibili
  useEffect(() => {
    if (!total) return
    for (let pi = Math.floor(first / PAGE); pi <= Math.floor(Math.max(last - 1, 0) / PAGE); pi++)
      fetchPage(pi)
  }, [first, last, total, fetchPage])

  // ── stats, import, notice ──────────────────────────────────
  useEffect(() => {
    window.api
      .stats()
      .then(setStats)
      .catch((e) => setError(String(e)))
  }, [])

  useEffect(() => window.api.onImportProgress(setProgress), [])
  useEffect(() => window.api.onNotice(setError), [])

  const refreshAll = useCallback(() => {
    window.api.stats().then(setStats)
    seq.current++
    cache.current.clear()
    inflight.current.clear()
    fetchPage(0)
  }, [fetchPage])

  const afterImport = useCallback(
    (res: { errors: number } | null) => {
      if (!res) return // annullato
      refreshAll()
      setProgress(null)
      if (res.errors > 0) setError(`Import completato con ${res.errors} file non riconosciuti`)
    },
    [refreshAll],
  )

  const doImport = useCallback(
    (mode: 'folder' | 'zip' = 'folder') => {
      setImporting(true)
      setProgress(null)
      setError(null)
      window.api
        .importFolder(mode)
        .then(afterImport)
        .catch((e) => setError(String(e)))
        .finally(() => setImporting(false))
    },
    [afterImport],
  )

  const doImportPaths = useCallback(
    (paths: string[]) => {
      if (!paths.length || importing) return
      setImporting(true)
      setProgress(null)
      setError(null)
      window.api
        .importPaths(paths)
        .then(afterImport)
        .catch((e) => setError(String(e)))
        .finally(() => setImporting(false))
    },
    [afterImport, importing],
  )

  const openDetail = (id: number) =>
    window.api
      .show(id)
      .then(setDetail)
      .catch((e) => setError(String(e)))

  // aggiorna i dati utente e propaga a riga in cache + pannello + stats
  const applyUserData = useCallback(
    (id: number, patch: Partial<UserData>) => {
      window.api
        .setUserData(id, patch)
        .then((ud) => {
          if (!ud) return
          for (const rows of cache.current.values()) {
            const row = rows.find((r) => r.id === id)
            if (row) {
              row.fav = ud.fav
              row.rating = ud.rating
              row.tags = ud.tags
              row.hasNote = !!ud.note
            }
          }
          setDetail((d) =>
            d && d.id === id
              ? { ...d, fav: ud.fav, rating: ud.rating, tags: ud.tags, note: ud.note, hasNote: !!ud.note }
              : d,
          )
          force()
          // i conteggi di preferiti/tag nei filtri cambiano: aggiorna le stats
          if (patch.fav !== undefined || patch.tags !== undefined)
            window.api.stats().then(setStats)
        })
        .catch((e) => setError(String(e)))
    },
    [],
  )

  const toggleSel = (id: number, v: boolean) => {
    const next = new Set(sel)
    if (v) next.add(id)
    else next.delete(id)
    setSel(next)
  }

  const doCompare = () => {
    const [a, b] = [...sel]
    Promise.all([window.api.show(a), window.api.show(b)]).then(([da, db]) => {
      if (da && db) setCompare([da, db])
    })
  }

  const doExport = () => {
    const name = (exportName ?? '').trim() || 'La mia setlist'
    setExportName(null)
    window.api
      .exportSetlist([...sel], name)
      .then((r) => {
        if (!r) return
        setFlash(
          `Setlist "${name}" salvata (${r.written} preset): ${r.file}` +
            (r.skipped.length ? ` — saltati: ${r.skipped.join('; ')}` : ''),
        )
      })
      .catch((e) => setError(String(e)))
  }

  // ── drag&drop di cartelle/ZIP/.hlx per importare ───────────
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current = 0
    setDragOver(false)
    const paths = [...e.dataTransfer.files]
      .map((f) => {
        try {
          return window.api.pathForFile(f)
        } catch {
          return ''
        }
      })
      .filter(Boolean)
    doImportPaths(paths)
  }

  // righe visibili
  const visible: { index: number; row: PresetSummary | undefined }[] = []
  for (let i = first; i < last; i++)
    visible.push({ index: i, row: cache.current.get(Math.floor(i / PAGE))?.[i % PAGE] })

  const anyFilter =
    gains.size > 0 || brand || fx || amp || cab || ir || artist || favOnly || tag

  return (
    <div
      className="relative flex h-screen flex-col"
      onDragEnter={(e) => {
        if (![...e.dataTransfer.types].includes('Files')) return
        dragDepth.current++
        setDragOver(true)
      }}
      onDragLeave={() => {
        if (--dragDepth.current <= 0) {
          dragDepth.current = 0
          setDragOver(false)
        }
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-4 border-dashed border-sky-500 bg-sky-950/40">
          <p className="rounded-lg bg-zinc-900 px-6 py-3 text-lg font-medium text-sky-300 shadow-xl">
            Rilascia qui per importare (cartelle, ZIP, .hlx)
          </p>
        </div>
      )}

      <header className="flex items-center gap-4 border-b border-zinc-800 px-4 py-3">
        <h1 className="text-sm font-semibold whitespace-nowrap text-zinc-100">
          Helix Preset Manager
        </h1>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca per nome, autore, song, band, amp, effetto, artista…"
          className="w-full max-w-xl rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-sky-600"
        />
        <label className="flex items-center gap-1.5 text-xs whitespace-nowrap text-zinc-400 select-none">
          <input
            type="checkbox"
            checked={noDup}
            onChange={(e) => setNoDup(e.target.checked)}
            className="accent-sky-600"
          />
          nascondi duplicati
        </label>
        <div className="ml-auto flex items-center gap-3">
          {importing && (
            <span className="flex items-center gap-2 text-xs whitespace-nowrap text-amber-400">
              <span className="relative h-1.5 w-28 overflow-hidden rounded-full bg-zinc-800">
                {progress?.phase === 'finalize' || !progress?.totalFiles ? (
                  <span className="absolute inset-0 animate-pulse rounded-full bg-amber-500/70" />
                ) : (
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-amber-500 transition-[width] duration-200"
                    style={{
                      width: `${Math.min(100, (progress.files / progress.totalFiles) * 100)}%`,
                    }}
                  />
                )}
              </span>
              {progress?.phase === 'finalize'
                ? 'Finalizzazione indice…'
                : progress?.totalFiles
                  ? `${Math.round((progress.files / progress.totalFiles) * 100)}% — ${progress.files.toLocaleString('it-IT')}/${progress.totalFiles.toLocaleString('it-IT')} file · ${progress.presets.toLocaleString('it-IT')} preset`
                  : 'Scansione cartella…'}
            </span>
          )}
          {!importing && stats && (
            <span className="text-xs whitespace-nowrap text-zinc-500">
              {stats.unique.toLocaleString('it-IT')} preset unici
            </span>
          )}
          <button
            onClick={() => doImport('folder')}
            disabled={importing}
            className="rounded-md bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-600 disabled:opacity-50"
          >
            Importa cartella…
          </button>
          <button
            onClick={() => doImport('zip')}
            disabled={importing}
            title="Importa i preset direttamente da un archivio ZIP, senza estrarlo"
            className="rounded-md border border-sky-800 px-3 py-1.5 text-xs font-medium text-sky-300 hover:border-sky-600 disabled:opacity-50"
          >
            ZIP…
          </button>
        </div>
      </header>

      {stats && (
        <div className="flex items-center gap-2 overflow-x-auto border-b border-zinc-800 px-4 py-2">
          <span className="text-[11px] font-semibold tracking-wider text-zinc-600 uppercase">
            Suono
          </span>
          {GAIN_ORDER.map((g) => {
            const count = stats.byGain.find((r) => r.gainClass === g)?.count
            if (!count) return null
            const active = gains.has(g)
            return (
              <button
                key={g}
                onClick={() => {
                  const next = new Set(gains)
                  if (active) next.delete(g)
                  else next.add(g)
                  setGains(next)
                }}
                className={`rounded-full border px-3 py-1 text-xs whitespace-nowrap select-none ${
                  active
                    ? `border-transparent ${GAIN_COLORS[g]}`
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                }`}
              >
                {g} <span className="opacity-50">{count.toLocaleString('it-IT')}</span>
              </button>
            )
          })}
          <span className="mx-1 h-4 w-px shrink-0 bg-zinc-800" />
          {stats.favCount > 0 && (
            <button
              onClick={() => setFavOnly(!favOnly)}
              className={`rounded-full border px-3 py-1 text-xs whitespace-nowrap select-none ${
                favOnly
                  ? 'border-transparent bg-amber-500/15 text-amber-400'
                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
              }`}
            >
              ★ preferiti <span className="opacity-50">{stats.favCount.toLocaleString('it-IT')}</span>
            </button>
          )}
          {stats.tags.length > 0 && (
            <select
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              className="max-w-36 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 outline-none focus:border-sky-600"
            >
              <option value="">Tag: tutti</option>
              {stats.tags.map((t) => (
                <option key={t.tag} value={t.tag}>
                  {t.tag} ({t.count.toLocaleString('it-IT')})
                </option>
              ))}
            </select>
          )}
          <select
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 outline-none focus:border-sky-600"
          >
            <option value="">Marca: tutte</option>
            {stats.brands.map((b) => (
              <option key={b.brand} value={b.brand}>
                {b.brand} ({b.count.toLocaleString('it-IT')})
              </option>
            ))}
          </select>
          <select
            value={amp}
            onChange={(e) => setAmp(e.target.value)}
            className="max-w-44 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 outline-none focus:border-sky-600"
          >
            <option value="">Ampli: tutti</option>
            {stats.amps.map((a) => (
              <option key={a.amp} value={a.amp}>
                {a.amp} ({a.count.toLocaleString('it-IT')})
              </option>
            ))}
          </select>
          <select
            value={cab}
            onChange={(e) => setCab(e.target.value)}
            className="max-w-44 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 outline-none focus:border-sky-600"
          >
            <option value="">Cab: tutti</option>
            {stats.cabs.map((c) => (
              <option key={c.cab} value={c.cab}>
                {c.label} ({c.count.toLocaleString('it-IT')})
              </option>
            ))}
          </select>
          <select
            value={fx}
            onChange={(e) => setFx(e.target.value)}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 outline-none focus:border-sky-600"
          >
            <option value="">Effetto: tutti</option>
            {stats.fxs
              .filter((f) => !['amp', 'cab', 'preamp'].includes(f.fx))
              .map((f) => (
                <option key={f.fx} value={f.fx}>
                  {f.fx} ({f.count.toLocaleString('it-IT')})
                </option>
              ))}
          </select>
          {stats.artists.length > 0 && (
            <select
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              className="max-w-40 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 outline-none focus:border-sky-600"
            >
              <option value="">Artista: tutti</option>
              {stats.artists.map((a) => (
                <option key={a.artist} value={a.artist}>
                  {a.artist} ({a.count.toLocaleString('it-IT')})
                </option>
              ))}
            </select>
          )}
          {stats.irCount > 0 && (
            <button
              onClick={() => setIr(!ir)}
              title="Solo preset che usano un blocco IR (richiedono il file .wav nello slot indicato)"
              className={`rounded-full border px-3 py-1 text-xs whitespace-nowrap select-none ${
                ir
                  ? 'border-transparent bg-fuchsia-500/15 text-fuchsia-400'
                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
              }`}
            >
              usa IR <span className="opacity-50">{stats.irCount.toLocaleString('it-IT')}</span>
            </button>
          )}
          {anyFilter && (
            <button
              onClick={() => {
                setGains(new Set())
                setBrand('')
                setFx('')
                setAmp('')
                setCab('')
                setIr(false)
                setArtist('')
                setFavOnly(false)
                setTag('')
              }}
              className="text-xs whitespace-nowrap text-zinc-500 underline hover:text-zinc-300"
            >
              azzera filtri
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 border-b border-red-900 bg-red-950/50 px-4 py-2 text-sm text-red-300">
          <span className="min-w-0 flex-1 truncate" title={error}>
            {error}
          </span>
          <button onClick={() => setError(null)} className="shrink-0 hover:text-red-100">
            ✕
          </button>
        </div>
      )}
      {flash && (
        <div className="flex items-center gap-3 border-b border-emerald-900 bg-emerald-950/50 px-4 py-2 text-sm text-emerald-300">
          <span className="min-w-0 flex-1 truncate" title={flash}>
            {flash}
          </span>
          <button onClick={() => setFlash(null)} className="shrink-0 hover:text-emerald-100">
            ✕
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <div
            className={`grid ${GRID} gap-3 border-b border-zinc-800 px-4 py-2 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase`}
          >
            <span />
            <span>★</span>
            <span>Nome</span>
            <span>Gain</span>
            <span>Marche amp</span>
            <span>Band / Autore</span>
          </div>
          <div
            ref={viewportRef}
            onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
            className="min-h-0 flex-1 overflow-y-auto"
          >
            {total > 0 ? (
              <div style={{ position: 'relative', height: total * ROW_H }}>
                {visible.map(({ index, row }) => (
                  <div
                    key={index}
                    style={{
                      position: 'absolute',
                      top: index * ROW_H,
                      left: 0,
                      right: 0,
                      height: ROW_H,
                    }}
                  >
                    {row ? (
                      <PresetRow
                        p={row}
                        selected={detail?.id === row.id}
                        checked={sel.has(row.id)}
                        onClick={() => openDetail(row.id)}
                        onCheck={(v) => toggleSel(row.id, v)}
                        onFav={() => applyUserData(row.id, { fav: !row.fav })}
                      />
                    ) : (
                      <div className="h-full border-b border-zinc-800/40 px-4 py-3">
                        <div className="h-3 w-1/3 animate-pulse rounded bg-zinc-800/60" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : stats === null && !query ? (
              <div className="flex flex-col items-center gap-4 p-16 text-center">
                <p className="text-lg font-medium text-zinc-300">La tua libreria è ancora vuota</p>
                <p className="max-w-md text-sm text-zinc-500">
                  Importa la cartella dove tieni i tuoi preset (.hlx, setlist, .hsp), oppure
                  trascina qui cartelle e archivi ZIP: verranno indicizzati, classificati e
                  deduplicati. I file originali non vengono toccati.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => doImport('folder')}
                    disabled={importing}
                    className="rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
                  >
                    Importa cartella…
                  </button>
                  <button
                    onClick={() => doImport('zip')}
                    disabled={importing}
                    className="rounded-md border border-sky-800 px-4 py-2 text-sm font-medium text-sky-300 hover:border-sky-600 disabled:opacity-50"
                  >
                    Importa ZIP…
                  </button>
                </div>
              </div>
            ) : (
              <p className="p-8 text-center text-sm text-zinc-600">Nessun risultato</p>
            )}
          </div>

          {sel.size > 0 && (
            <div className="flex items-center gap-3 border-t border-sky-900 bg-sky-950/30 px-4 py-2 text-xs">
              <span className="font-medium text-sky-300">
                {sel.size} selezionat{sel.size === 1 ? 'o' : 'i'}
              </span>
              <button
                onClick={() => setExportName('La mia setlist')}
                disabled={sel.size > 128}
                title={
                  sel.size > 128
                    ? 'Una setlist può contenere al massimo 128 preset'
                    : 'Crea una setlist .hls da importare in HX Edit'
                }
                className="rounded bg-sky-700 px-3 py-1 font-medium text-white hover:bg-sky-600 disabled:opacity-50"
              >
                Esporta setlist…
              </button>
              <button
                onClick={doCompare}
                disabled={sel.size !== 2}
                title="Confronta due preset (selezionane esattamente 2)"
                className="rounded border border-zinc-700 px-3 py-1 text-zinc-300 hover:border-zinc-500 disabled:opacity-40"
              >
                Confronta
              </button>
              {sel.size > 128 && (
                <span className="text-amber-400">max 128 preset per setlist</span>
              )}
              <button
                onClick={() => setSel(new Set())}
                className="ml-auto text-zinc-500 underline hover:text-zinc-300"
              >
                deseleziona tutto
              </button>
            </div>
          )}

          <footer className="border-t border-zinc-800 px-4 py-1.5 text-xs text-zinc-600">
            {total.toLocaleString('it-IT')} risultati
          </footer>
        </main>

        {detail && (
          <DetailPanel detail={detail} onClose={() => setDetail(null)} onUserData={applyUserData} />
        )}
      </div>

      {compare && <CompareModal pair={compare} onClose={() => setCompare(null)} />}

      {exportName !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setExportName(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-96 rounded-lg border border-zinc-700 bg-[#0b0e13] p-5 shadow-2xl"
          >
            <h2 className="mb-3 text-sm font-semibold text-zinc-100">
              Esporta setlist ({sel.size} preset)
            </h2>
            <input
              autoFocus
              value={exportName}
              onChange={(e) => setExportName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doExport()}
              placeholder="Nome della setlist"
              className="mb-3 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-sky-600"
            />
            <p className="mb-4 text-[11px] leading-snug text-zinc-500">
              Verrà creato un file .hls da importare in HX Edit. Gli slot oltre i preset scelti
              restano vuoti ("New Preset").
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setExportName(null)}
                className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500"
              >
                Annulla
              </button>
              <button
                onClick={doExport}
                className="rounded bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-600"
              >
                Esporta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
