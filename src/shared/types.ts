// Tipi condivisi tra main, preload e renderer (contratto IPC)

/** Dati personali dell'utente su un preset (persistono nei re-import, chiave = content_hash) */
export interface UserData {
  fav: boolean
  /** 0 = nessun voto, 1-5 stelle */
  rating: number
  tags: string[]
  note: string | null
}

export interface LibraryStats {
  total: number
  unique: number
  byGain: { gainClass: string; count: number }[]
  topBrands: { brand: string; count: number }[]
  topArtists: { artist: string; count: number }[]
  /** tutte le marche amp, ordinate per frequenza */
  brands: { brand: string; count: number }[]
  /** tutte le categorie effetti, ordinate per frequenza */
  fxs: { fx: string; count: number }[]
  /** tutti i modelli amp (nome Helix), ordinati per frequenza */
  amps: { amp: string; count: number }[]
  /** tutti i modelli cab: value = modello raw (HD2_Cab…), label = nome leggibile */
  cabs: { cab: string; label: string; count: number }[]
  /** preset che richiedono un file IR */
  irCount: number
  /** tutti gli artisti rilevati, in ordine alfabetico */
  artists: { artist: string; count: number }[]
  /** tutti i tag utente, in ordine alfabetico */
  tags: { tag: string; count: number }[]
  /** preset marcati preferiti */
  favCount: number
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
  fav: boolean
  rating: number
  tags: string[]
  hasNote: boolean
}

export interface PresetBlock {
  dsp: string
  position: number
  model: string
  enabled: boolean
  /** parametri del blocco (per il confronto preset) */
  params: Record<string, unknown>
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
  note: string | null
}

export interface SearchRequest {
  query: string
  limit?: number
  offset?: number
  noDup?: boolean
  /** filtra per classi di gain (clean, crunch, …); vuoto/assente = tutte */
  gains?: string[]
  /** filtra per marca amp esatta (es. Fender) */
  brand?: string
  /** filtra per categoria effetto (es. delay) */
  fx?: string
  /** filtra per modello amp esatto (nome Helix, es. Brit Plexi Brt) */
  amp?: string
  /** filtra per modello cab raw (es. HD2_Cab4x12Greenback25) */
  cab?: string
  /** true = solo preset che usano un blocco IR */
  ir?: boolean
  /** filtra per artista rilevato (es. Pink Floyd) */
  artist?: string
  /** true = solo preferiti */
  favOnly?: boolean
  /** filtra per tag utente */
  tag?: string
}

export interface SearchResponse {
  rows: PresetSummary[]
  /** totale risultati per la query (per la paginazione) */
  total: number
}

export interface ImportProgress {
  files: number
  presets: number
  /** totale file da processare (noto dopo la scansione iniziale) */
  totalFiles?: number
  /** 'finalize' = scrittura/ottimizzazione indice in corso */
  phase?: 'finalize'
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
  /** apre il dialog di scelta (cartella o archivio ZIP) e lancia l'ingestione; null se annullato */
  importFolder: (mode?: 'folder' | 'zip') => Promise<ImportResult | null>
  /** sottoscrive il progresso dell'import; ritorna la funzione di unsubscribe */
  onImportProgress: (cb: (p: ImportProgress) => void) => () => void
  /** mostra il file sorgente del preset in Esplora risorse */
  reveal: (id: number) => Promise<void>
  /** avvia il drag nativo del file .hlx (da rilasciare in HX Edit) */
  startDrag: (id: number) => void
  /** apre il .hlx in HX Edit tramite l'associazione file di sistema */
  openInHxEdit: (id: number) => Promise<void>
  /** avvisi dal main process (es. file sorgente non trovato) */
  onNotice: (cb: (msg: string) => void) => () => void
  /** aggiorna preferito/voto/tag/nota; ritorna lo stato aggiornato */
  setUserData: (id: number, patch: Partial<UserData>) => Promise<UserData | null>
  /** percorso assoluto di un File del drag&drop (webUtils) */
  pathForFile: (f: File) => string
  /** importa percorsi rilasciati nella finestra (cartelle, ZIP, .hlx) */
  importPaths: (paths: string[]) => Promise<ImportResult | null>
  /** esporta i preset scelti come setlist .hls; null se annullato */
  exportSetlist: (
    ids: number[],
    name: string,
  ) => Promise<{ file: string; written: number; skipped: string[] } | null>
}
