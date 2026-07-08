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

// Canale IPC → firma
export interface HelixApi {
  stats: () => Promise<LibraryStats>
  search: (req: SearchRequest) => Promise<SearchResponse>
  show: (id: number) => Promise<PresetDetail | null>
}
