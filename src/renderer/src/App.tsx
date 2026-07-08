import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ImportProgress,
  LibraryStats,
  PresetDetail,
  PresetSummary,
} from '../../shared/types'

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

function GainBadge({ gain }: { gain: string }) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${GAIN_COLORS[gain] ?? 'bg-zinc-500/15 text-zinc-400'}`}
    >
      {gain}
    </span>
  )
}

function PresetRow({
  p,
  selected,
  onClick,
}: {
  p: PresetSummary
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      draggable={!p.parentSetlist}
      onDragStart={(e) => {
        e.preventDefault()
        if (!p.parentSetlist) window.api.startDrag(p.id)
      }}
      title={p.parentSetlist ? undefined : 'Trascina il file .hlx in HX Edit per caricarlo'}
      className={`grid w-full grid-cols-[1fr_90px_150px_1fr] items-center gap-3 border-b border-zinc-800/60 px-4 py-2 text-left text-sm hover:bg-zinc-800/40 ${
        selected ? 'bg-zinc-800/60' : ''
      }`}
    >
      <span className="truncate font-medium text-zinc-100">
        {p.name}
        {p.dupOf && <span className="ml-2 text-xs text-zinc-500">dup</span>}
      </span>
      <GainBadge gain={p.gainClass} />
      <span className="truncate text-zinc-400">{p.ampBrands.join(', ') || '—'}</span>
      <span className="truncate text-zinc-500">
        {p.band || p.song || ''}
        {p.author && <span className="text-zinc-600"> · {p.author}</span>}
      </span>
    </button>
  )
}

function DetailPanel({ detail, onClose }: { detail: PresetDetail; onClose: () => void }) {
  return (
    <aside className="flex w-96 shrink-0 flex-col overflow-y-auto border-l border-zinc-800 bg-[#0b0e13]">
      <div className="flex items-start justify-between p-4 pb-2">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">{detail.name}</h2>
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

      <dl className="space-y-1.5 px-4 py-2 text-sm">
        {(
          [
            ['Autore', detail.author],
            ['Band', detail.band],
            ['Song', detail.song],
            ['Amp', detail.ampModels.join(', ')],
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

      <h3 className="px-4 pt-3 pb-1 text-xs font-semibold tracking-wider text-zinc-500 uppercase">
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
        <div className="flex gap-2">
          <button
            onClick={() => window.api.reveal(detail.id)}
            className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
          >
            Mostra in Esplora risorse
          </button>
          {!detail.parentSetlist && (
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
          )}
        </div>
        {detail.parentSetlist && (
          <p className="text-[11px] leading-snug text-zinc-500">
            Questo preset vive dentro la setlist "{detail.parentSetlist}": per usarlo in HX Edit
            importa il file setlist (l'estrazione del singolo .hlx arriva con la v2.0).
          </p>
        )}
        <p className="truncate text-[10px] text-zinc-600" title={detail.sourceFile}>
          {detail.sourceFile}
        </p>
      </div>
    </aside>
  )
}

export default function App() {
  const [stats, setStats] = useState<LibraryStats | null>(null)
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<PresetSummary[]>([])
  const [total, setTotal] = useState(0)
  const [noDup, setNoDup] = useState(true)
  const [detail, setDetail] = useState<PresetDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    window.api
      .stats()
      .then(setStats)
      .catch((e) => setError(String(e)))
  }, [])

  useEffect(() => window.api.onImportProgress(setProgress), [])
  useEffect(() => window.api.onNotice(setError), [])

  const doImport = useCallback(() => {
    setImporting(true)
    setProgress(null)
    setError(null)
    window.api
      .importFolder()
      .then((res) => {
        if (!res) return // annullato
        window.api.stats().then(setStats)
        runSearch(query, noDup)
        setProgress(null)
        if (res.errors > 0)
          setError(`Import completato con ${res.errors} file non riconosciuti`)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setImporting(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, noDup])

  const runSearch = useCallback((q: string, nd: boolean) => {
    const mySeq = ++seq.current
    window.api
      .search({ query: q, limit: 200, noDup: nd })
      .then((res) => {
        if (seq.current !== mySeq) return // risposta stantia
        setRows(res.rows)
        setTotal(res.total)
      })
      .catch((e) => setError(String(e)))
  }, [])

  useEffect(() => {
    const t = setTimeout(() => runSearch(query, noDup), 150)
    return () => clearTimeout(t)
  }, [query, noDup, runSearch])

  const openDetail = (id: number) =>
    window.api
      .show(id)
      .then(setDetail)
      .catch((e) => setError(String(e)))

  return (
    <div className="flex h-screen flex-col">
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
            <span className="text-xs whitespace-nowrap text-amber-400">
              {progress
                ? `Importazione… ${progress.files.toLocaleString('it-IT')} file, ${progress.presets.toLocaleString('it-IT')} preset`
                : 'Importazione…'}
            </span>
          )}
          {!importing && stats && (
            <span className="text-xs whitespace-nowrap text-zinc-500">
              {stats.unique.toLocaleString('it-IT')} preset unici
            </span>
          )}
          <button
            onClick={doImport}
            disabled={importing}
            className="rounded-md bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-600 disabled:opacity-50"
          >
            Importa cartella…
          </button>
        </div>
      </header>

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

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="grid grid-cols-[1fr_90px_150px_1fr] gap-3 border-b border-zinc-800 px-4 py-2 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">
            <span>Nome</span>
            <span>Gain</span>
            <span>Marche amp</span>
            <span>Band / Autore</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rows.map((p) => (
              <PresetRow
                key={p.id}
                p={p}
                selected={detail?.id === p.id}
                onClick={() => openDetail(p.id)}
              />
            ))}
            {rows.length === 0 &&
              (stats === null && !query ? (
                <div className="flex flex-col items-center gap-4 p-16 text-center">
                  <p className="text-lg font-medium text-zinc-300">
                    La tua libreria è ancora vuota
                  </p>
                  <p className="max-w-md text-sm text-zinc-500">
                    Importa la cartella dove tieni i tuoi preset (.hlx, setlist, .hsp): verranno
                    indicizzati, classificati e deduplicati. I file originali non vengono toccati.
                  </p>
                  <button
                    onClick={doImport}
                    disabled={importing}
                    className="rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
                  >
                    Importa cartella…
                  </button>
                </div>
              ) : (
                <p className="p-8 text-center text-sm text-zinc-600">Nessun risultato</p>
              ))}
          </div>
          <footer className="border-t border-zinc-800 px-4 py-1.5 text-xs text-zinc-600">
            {total.toLocaleString('it-IT')} risultati
            {rows.length < total && ` — mostrati i primi ${rows.length}`}
          </footer>
        </main>

        {detail && <DetailPanel detail={detail} onClose={() => setDetail(null)} />}
      </div>
    </div>
  )
}
