# CLAUDE.md — Helix Preset Manager

## Cos'è questo progetto

Desktop app Windows (Electron + React) per organizzare, cercare e filtrare librerie di preset Line 6 Helix (.hlx/.hsp). "Spotify dei preset Helix": l'utente importa i **propri** file e ottiene una libreria catalogata con ricerca istantanea.

**Modello legale (vincolo di prodotto, non negoziabile):** l'app organizza file che l'utente già possiede. Non ridistribuisce mai preset. Nessun preset, .hlx, .hsp o .db va MAI committato nella repo (vedi .gitignore). Naming: "preset manager *per* Line 6 Helix", nessun logo Line 6, disclaimer non-affiliazione.

## Stato attuale

- ✅ **Spike v0.1 completato e testato**: `core/ingest.mjs` (motore ingestione) + `core/query.mjs` (CLI query). Zero dipendenze, solo Node ≥ 22.5 (`node:sqlite` nativo con FTS5).
- Testato su corpus reale: 15.513 preset da 11.080 file in ~19s, 0 errori di parsing.
- ✅ **v1.0 in corso** — shell Electron + React + Vite + Tailwind funzionante: library view **virtualizzata a pagine** (tutti i risultati scorrevoli, fetch 200 per pagina con cache), FTS while-typing, filtri gain (chip) + marca + effetto, scheda preset con catena effetti, import cartella dalla UI (ingestione idempotente in `utilityProcess`, progresso live), apri-in-HX-Edit (doppio click, via associazione .hlx di sistema) e drag-out nativo. `node:sqlite` funziona dentro Electron 38 (solo warning experimental, niente better-sqlite3).
- ✅ **Estrazione preset da setlist** (anticipata dalla v2.0): `src/main/extract.ts` materializza il singolo .hlx in temp (`{schema, version:6, meta, data}` — formato verificato con round-trip: content_hash identico dopo re-ingestione). Apri/trascina funzionano quindi su TUTTI i preset, anche quelli dentro le setlist.
- Hook di verifica automatica nel main process: `HELIX_CAPTURE=<png>` (screenshot e quit), `HELIX_IMPORT=<cartella>` (import all'avvio senza dialog), `HELIX_DB=<db>` (override percorso DB).
- ⚠️ Il DB dev'essere generato sulla macchina dell'utente: i `source_file` sono percorsi assoluti locali (un helix.db copiato da un'altra macchina rompe apri/trascina).
- 🔜 Manca per chiudere la v1.0: import ZIP drag&drop, preferiti/tag/note/rating, i18n, packaging (electron-builder).

## Fatti tecnici chiave sui formati (verificati sul corpus reale)

- **.hlx** = JSON puro. `schema: "L6Preset"`. Struttura: `data.meta` (name, author, song, band, tnid, modifieddate), `data.device`, `data.device_version`, `data.tone` (dsp0/dsp1 con block0…block15, snapshot0…7, controller, footswitch, global).
- **Setlist** = `schema: "L6Setlist"`, campo `encoded_data` = Base64 → zlib → JSON con array `presets` di 128 slot completi. Vanno esplose in preset figli (skip degli slot "New Preset"). CRC32 in `compression.crc32`.
- **.hsp** (Helix Stadium) = 8 byte magic `rpshnosj` + JSON. Struttura diversa: `preset.flow[]`, parametri wrappati `{value}`, prefissi modello `P35_*`, campo `meta.info` (descrizione ricca).
- **Firmware**: decodifica hex di `device_version`: `0x03800000` → "3.80".
- **tnid** = ID CustomTone → link `https://line6.com/customtone/tone/{tnid}`.
- **Limite IR**: i blocchi `HD2_ImpulseResponse*` salvano solo `Index` (slot 1–128), MAI il nome file .wav. L'app deve segnalare "richiede IR nello slot N", non può risolvere il file.
- Ogni blocco: `@model`, `@position`, `@path`, `@enabled`, `@stereo` + tutti i parametri con valori reali (amp: Drive, Bass, Mid, Treble, Presence, Master, ChVol, Sag, Bias…).

## Architettura target (v1.0)

```
Electron main process            Renderer (React + Vite + Tailwind)
  core/scanner    (chokidar)       Library view (lista virtualizzata)
  core/parsers/   (registry)       Sidebar filtri con conteggi live
  core/classifier                  Search bar FTS while-typing
  core/db         (node:sqlite)    Scheda preset (signal-chain visuale)
  core/dedup                       Tag / preferiti / note / rating
  IPC tipizzato main↔renderer      Tema scuro (stile Spotify/VS Code)
```

Principi: parser registry per schema (aggiungere un device = aggiungere un parser); modello canonico interno indipendente dal formato; parsing tollerante (mai far fallire l'import, record in stato error); ingestione in worker thread a batch transazionali; UI sempre virtualizzata (15k+ record), mai caricare tutto in memoria nel renderer.

## Schema DB (SQLite + FTS5, già implementato nello spike)

- `presets`: name, author, song, band, tnid, schema_type, device, firmware, source_file, parent_setlist, slot, file_hash, content_hash, dup_of, num_blocks, num_amps, uses_ir, ir_slots(json), num_named_snapshots, tempo, topology, gain_class, gain_conf, amp_models(json), amp_brands(json), fx(json), artists(json), info
- `blocks`: preset_id, dsp, position, model, enabled, params_json
- `presets_fts` (FTS5): name, author, song, band, amps, brands, fx, artists, snapshots, info
- Dedup a 3 livelli: sha256 file → skip; tnid uguale → alias; sha256 del tone normalizzato → `dup_of`.

## Classificazione (implementata in ingest.mjs)

- **Marca amp**: tabella statica `AMP_MAP` (model → nome Helix, ampli reale, marca, carattere). ~65 modelli mappati, da estendere verso i 111 del corpus. È contenuto editoriale: curarla a mano, mai inventare mappature.
- **Gain class** (clean/edge/crunch/lead/highgain/acoustic/ambient/fx-only): euristica = bias carattere amp (65%) + Drive normalizzato (35%) + boost se pedale dist attivo + segnali lessicali da name/song/band. Soglie da raffinare col feedback utente.
- **Artisti**: dizionario alias → nome canonico (`ARTISTS`), match su name+song+band+filename.

## Convenzioni

- TypeScript per il codice nuovo della v1.0 (lo spike .mjs resta JS finché non viene portato).
- `better-sqlite3` NON serve: usare `node:sqlite` nativo (attenzione se si passa a Electron: verificare compatibilità della versione Node embedded; in caso, fallback a better-sqlite3 + electron-rebuild).
- Commit in inglese, conventional commits (feat/fix/chore/docs).
- Nessuna telemetria, nessun account, tutto locale (il cloud è roadmap v3, solo metadati).
- Lingua UI: italiano + inglese (i18n fin dall'inizio, l'utenza Helix è globale).

## Roadmap

- **v1.0**: Electron shell, import cartelle/ZIP drag&drop, lista virtualizzata + FTS, filtri (marca/gain/fx/autore/IR), scheda preset con catena visuale, preferiti/tag/note/rating, apri-in-HX-Edit + drag-out del file.
- **v1.5**: dedup UI, famiglie di versioni, vista Problemi, dizionario artisti con revisione, badge firmware, IR Library (mappatura slot→file).
- **v2.0**: parser .hsp completo (P35), profili dispositivo (Floor/LT/Stomp/POD Go), export setlist ricostruite (repack zlib+Base64) ← feature killer.
- **v2.5**: ricerca semantica OpenAI (embeddings text-embedding-3-small + GPT query→filtri), confronto preset, collezioni smart.
- **v3.0**: commerciale — installer firmato, auto-update, freemium, eventuale partnership Line 6/Yamaha (contattare solo dopo trazione).

## Documento di riferimento

L'analisi tecnica completa (corpus, formati campo per campo, criticità) è in `docs/Helix_Preset_Manager_Analisi_Tecnica.md`.
