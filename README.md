# Helix Preset Manager — Spike v0.1

Motore di ingestione e ricerca per preset Line 6 Helix. Zero dipendenze (richiede solo Node ≥ 22.5).

## Uso

```bash
# 1. Ingesta una cartella di preset (.hlx, setlist, .hsp) in SQLite
node core/ingest.mjs "/percorso/Line 6 HELIX Tones" helix.db

# 2. Interroga la libreria
node core/query.mjs stats                             # statistiche generali
node core/query.mjs search pink floyd wall            # ricerca full-text istantanea
node core/query.mjs filter gain=clean brand=Fender fx=delay nodup=1
node core/query.mjs artist "Van Halen"
node core/query.mjs show 12260                        # scheda completa con catena effetti
```

## Cosa fa

- **Parser registry**: L6Preset (.hlx), L6Setlist (esplode i bundle zlib+Base64, fino a 128 preset ciascuno), HSP (Helix Stadium, magic `rpshnosj`)
- **Classificazione**: marca amp reale (tabella editoriale ~65 modelli), classe di gain (euristica multi-segnale: carattere amp + Drive + pedali dist + lessico), artisti (dizionario alias)
- **Dedup a 3 livelli**: hash file, tnid CustomTone, hash del contenuto tone normalizzato (`dup_of`)
- **SQLite + FTS5**: ricerca full-text con prefix matching su nome/autore/song/band/amp/effetti/artisti/snapshot
- **Link CustomTone** ricostruito dal tnid

## Risultati sul corpus di test

15.513 preset indicizzati in ~19s (11.080 file, 0 errori) — 14.298 unici, 1.215 duplicati logici rilevati.

## Prossimi passi (→ v1.0)

Questo motore diventa il main process dell'app Electron: si aggiungono
watch folder (chokidar), import ZIP drag&drop, UI React virtualizzata,
scheda preset visuale, tag/preferiti/note utente.
