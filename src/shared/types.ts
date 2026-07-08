// Tipi condivisi tra main, preload e renderer (contratto IPC)

export interface LibraryStats {
  total: number
  unique: number
  byGain: { gainClass: string; count: number }[]
  topBrands: { brand: string; count: number }[]
  topArtists: { artist: string; count: number }[]
}

export interface PresetSummary {
  id: number
  name: string
  author: string | null
  band: string | null
  song: string | null
  gainClass: string
  ampBrands: string[]
  ampModels: string[]
  fx: string[]
  artists: string[]
  usesIr: boolean
  dupOf: number | null
  parentSetlist: string | null
}

export interface PresetBlock {
  dsp: string
  position: number
  model: string
  enabled: boolean
}

export interface PresetDetail extends PresetSummary {
  tnid: number | null
  firmware: string | null
  schemaType: string
  slot: number | null
  irSlots: (number | null)[]
  tempo: number | null
  topology: string | null
  info: string | null
  sourceFile: string
  blocks: PresetBlock[]
}

export interface SearchRequest {
  query: string
  limit?: number
  offset?: number
  noDup?: boolean
}

export interface SearchResponse {
  rows: PresetSummary[]
  /** totale risultati per la query (per la paginazione) */
  total: number
}

export interface ImportProgress {
  files: number
  presets: number
}

export interface ImportResult {
  seconds: number
  files: number
  presets: number
  fromSetlists: number
  hsp: number
  dupFile: number
  dupContent: number
  errors: number
}

// Canale IPC → firma
export interface HelixApi {
  /** null se non esiste ancora nessuna libreria (primo avvio) */
  stats: () => Promise<LibraryStats | null>
  search: (req: SearchRequest) => Promise<SearchResponse>
  show: (id: number) => Promise<PresetDetail | null>
  /** apre il dialog di scelta cartella e lancia l'ingestione; null se annullato */
  importFolder: () => Promise<ImportResult | null>
  /** sottoscrive il progresso dell'import; ritorna la funzione di unsubscribe */
  onImportProgress: (cb: (p: ImportProgress) => void) => () => void
  /** mostra il file sorgente del preset in Esplora risorse */
  reveal: (id: number) => Promise<void>
  /** avvia il drag nativo del file .hlx (da rilasciare in HX Edit) */
  startDrag: (id: number) => void
  /** avvisi dal main process (es. file sorgente non trovato) */
  onNotice: (cb: (msg: string) => void) => () => void
}
