#!/usr/bin/env node
/**
 * Helix Preset Manager — Spike v0.1
 * Ingestione di preset Line 6 (.hlx / setlist / .hsp) in SQLite + FTS5.
 * Zero dipendenze: richiede solo Node >= 22.5 (node:sqlite nativo).
 *
 * Uso:  node ingest.mjs <cartella-preset> [db-output]
 */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

// ─────────────────────────────────────────────────────────────
// 1. TABELLA EDITORIALE MODELLI AMP  (estendibile — v0.1: i più diffusi)
//    model → [nome Helix, ampli reale, marca, carattere base]
// ─────────────────────────────────────────────────────────────
const AMP_MAP = {
  AmpJazzRivet120:   ['Jazz Rivet 120', 'Roland JC-120', 'Roland', 'clean'],
  AmpUSDoubleNrm:    ['US Double Nrm', 'Fender Twin Reverb', 'Fender', 'clean'],
  AmpUSDoubleVib:    ['US Double Vib', 'Fender Twin Reverb (Vib)', 'Fender', 'clean'],
  AmpUSDeluxeNrm:    ['US Deluxe Nrm', 'Fender Deluxe Reverb', 'Fender', 'clean'],
  AmpUSDeluxeVib:    ['US Deluxe Vib', 'Fender Deluxe Reverb (Vib)', 'Fender', 'clean'],
  AmpUSPrincess:     ['US Princess', 'Fender Princeton', 'Fender', 'clean'],
  AmpUSSmallTweed:   ['US Small Tweed', 'Fender Champ', 'Fender', 'edge'],
  AmpTweedBluesNrm:  ['Tweed Blues Nrm', 'Fender Bassman', 'Fender', 'edge'],
  AmpTweedBluesBrt:  ['Tweed Blues Brt', 'Fender Bassman (Brt)', 'Fender', 'edge'],
  AmpEssexA15:       ['Essex A15', 'Vox AC15', 'Vox', 'edge'],
  AmpEssexA30:       ['Essex A30', 'Vox AC30', 'Vox', 'edge'],
  AmpA30FawnNrm:     ['A30 Fawn Nrm', 'Vox AC30 Fawn', 'Vox', 'edge'],
  AmpA30FawnBrt:     ['A30 Fawn Brt', 'Vox AC30 Fawn (Brt)', 'Vox', 'edge'],
  AmpMatchstickCh1:  ['Matchstick Ch1', 'Matchless DC30 Ch1', 'Matchless', 'edge'],
  AmpMatchstickCh2:  ['Matchstick Ch2', 'Matchless DC30 Ch2', 'Matchless', 'edge'],
  AmpMatchstickJump: ['Matchstick Jump', 'Matchless DC30 Jump', 'Matchless', 'edge'],
  AmpBritJ45Nrm:     ['Brit J45 Nrm', 'Marshall JTM-45', 'Marshall', 'crunch'],
  AmpBritJ45Brt:     ['Brit J45 Brt', 'Marshall JTM-45 (Brt)', 'Marshall', 'crunch'],
  AmpBritPlexiNrm:   ['Brit Plexi Nrm', 'Marshall Super Lead 100', 'Marshall', 'crunch'],
  AmpBritPlexiBrt:   ['Brit Plexi Brt', 'Marshall Super Lead 100 (Brt)', 'Marshall', 'crunch'],
  AmpBritPlexiJump:  ['Brit Plexi Jump', 'Marshall Super Lead 100 (Jump)', 'Marshall', 'crunch'],
  AmpBrit2204:       ['Brit 2204', 'Marshall JCM800 2204', 'Marshall', 'crunch'],
  AmpLine62204Mod:   ['2204 Mod', 'Marshall JCM800 mod (Line 6)', 'Marshall', 'highgain'],
  AmpBritP75Nrm:     ['Brit P75 Nrm', 'Park 75', 'Park/Marshall', 'crunch'],
  AmpBritP75Brt:     ['Brit P75 Brt', 'Park 75 (Brt)', 'Park/Marshall', 'crunch'],
  AmpBritTrem:       ['Brit Trem', 'Marshall JTM-50', 'Marshall', 'crunch'],
  AmpWhoWatt100:     ['WhoWatt 100', 'Hiwatt DR103', 'Hiwatt', 'crunch'],
  AmpInterstateZed:  ['Interstate Zed', 'Dr. Z Route 66', 'Dr. Z', 'edge'],
  AmpDividedDuo:     ['Divided Duo', '÷13 JRT 9/15', 'Divided by 13', 'edge'],
  AmpGrammatico:     ['Grammatico', 'Grammatico LaGrange', 'Grammatico', 'clean'],
  AmpGrammaticoBrt:  ['Grammatico Brt', 'Grammatico LaGrange (Brt)', 'Grammatico', 'clean'],
  AmpLine6Litigator: ['Litigator', 'Dumble-style (Line 6)', 'Dumble-style', 'clean'],
  AmpCaliTexasCh1:   ['Cali Texas Ch1', 'Mesa Lone Star Clean', 'Mesa/Boogie', 'clean'],
  AmpCaliTexasCh2:   ['Cali Texas Ch2', 'Mesa Lone Star Drive', 'Mesa/Boogie', 'lead'],
  AmpCaliIVR1:       ['Cali IV R1', 'Mesa Mark IV Rhythm 1', 'Mesa/Boogie', 'clean'],
  AmpCaliIVR2:       ['Cali IV R2', 'Mesa Mark IV Rhythm 2', 'Mesa/Boogie', 'crunch'],
  AmpCaliIVLead:     ['Cali IV Lead', 'Mesa Mark IV Lead', 'Mesa/Boogie', 'lead'],
  AmpCaliRectifire:  ['Cali Rectifire', 'Mesa Dual Rectifier', 'Mesa/Boogie', 'highgain'],
  AmpArchetypeClean: ['Archetype Clean', 'Paul Reed Smith Archon Clean', 'PRS', 'clean'],
  AmpArchetypeLead:  ['Archetype Lead', 'Paul Reed Smith Archon Lead', 'PRS', 'highgain'],
  AmpPlacaterClean:  ['Placater Clean', 'Friedman BE-100 Clean', 'Friedman', 'clean'],
  AmpPlacaterDirty:  ['Placater Dirty', 'Friedman BE-100 BE/HBE', 'Friedman', 'highgain'],
  AmpSoloLeadClean:  ['Solo Lead Clean', 'Soldano SLO-100 Clean', 'Soldano', 'clean'],
  AmpSoloLeadCrunch: ['Solo Lead Crunch', 'Soldano SLO-100 Crunch', 'Soldano', 'crunch'],
  AmpSoloLeadOD:     ['Solo Lead OD', 'Soldano SLO-100 Overdrive', 'Soldano', 'lead'],
  AmpPVPanama:       ['PV Panama', 'Peavey 5150', 'Peavey/EVH', 'highgain'],
  AmpANGLMeteor:     ['ANGL Meteor', 'ENGL Fireball 100', 'ENGL', 'highgain'],
  AmpGermanMahadeva: ['German Mahadeva', 'Bogner Shiva', 'Bogner', 'crunch'],
  AmpGermanUbersonic:['German Ubersonic', 'Bogner Überschall', 'Bogner', 'highgain'],
  AmpRevvGenRed:     ['Revv Gen Red', 'Revv Generator 120 Red', 'Revv', 'highgain'],
  AmpRevvGenPurple:  ['Revv Gen Purple', 'Revv Generator 120 Purple', 'Revv', 'highgain'],
  AmpLine6Badonk:    ['Badonk', 'Line 6 Big Bottom', 'Line 6', 'highgain'],
  AmpLine6Elektrik:  ['Elektrik', 'Line 6 Elektrik', 'Line 6', 'highgain'],
  AmpLine6Epic:      ['Epic', 'Line 6 Epic', 'Line 6', 'crunch'],
  AmpLine6Doom:      ['Doom', 'Line 6 Doom', 'Line 6', 'highgain'],
  AmpDasBenzinMega:  ['Das Benzin Mega', 'Diezel VH4 Mega', 'Diezel', 'highgain'],
  AmpDasBenzinLead:  ['Das Benzin Lead', 'Diezel VH4 Lead', 'Diezel', 'lead'],
  AmpMandarinRocker: ['Mandarin Rocker', 'Orange Rockerverb', 'Orange', 'crunch'],
  AmpMandarin80:     ['Mandarin 80', 'Orange OR80', 'Orange', 'crunch'],
  AmpVoltageQueen:   ['Voltage Queen', 'Victoria Electro King', 'Victoria', 'edge'],
  AmpStoneAge185:    ['Stone Age 185', 'Gibson EH-185', 'Gibson', 'edge'],
  AmpFullertonNrm:   ['Fullerton Nrm', "Fender 5C3 Tweed Deluxe", 'Fender', 'edge'],
  AmpFullertonBrt:   ['Fullerton Brt', "Fender 5C3 Tweed Deluxe (Brt)", 'Fender', 'edge'],
  AmpFullertonJump:  ['Fullerton Jump', "Fender 5C3 (Jump)", 'Fender', 'edge'],
};
// carattere → bias numerico per il classificatore di gain
const CHAR_BIAS = { clean: 0.0, edge: 0.25, crunch: 0.5, lead: 0.7, highgain: 0.85 };

// categorie effetti da prefisso modello
const FX_RULES = [
  ['delay',      /^HD2_(Delay|DL4)/],
  ['reverb',     /^(HD2_Reverb|VIC_Reverb)/],
  ['compressor', /^HD2_Compressor/],
  ['chorus',     /^HD2_(Chorus|MM4Dimension|MM4Analog)/],
  ['phaser',     /^HD2_Phaser/],
  ['flanger',    /^HD2_Flanger/],
  ['tremolo',    /^HD2_(Tremolo|Vibrato)/],
  ['rotary',     /^HD2_Rotary/],
  ['wah',        /^HD2_Wah/],
  ['pitch',      /^HD2_Pitch/],
  ['synth',      /^HD2_Synth/],
  ['eq',         /^HD2_EQ/],
  ['dist',       /^HD2_(Dist|DM4)/],
  ['looper',     /^HD2_Looper/],
  ['ir',         /^HD2_ImpulseResponse/],
  ['cab',        /^HD2_Cab/],
  ['amp',        /^HD2_Amp/],
  ['preamp',     /^HD2_Preamp/],
];

// dizionario artisti (alias → nome canonico) — v0.1: i principali
const ARTISTS = {
  'pink floyd': 'Pink Floyd', 'gilmour': 'Pink Floyd', 'comfortably numb': 'Pink Floyd',
  'another brick': 'Pink Floyd', 'shine on you': 'Pink Floyd',
  'u2': 'U2', 'the edge': 'U2', 'metallica': 'Metallica', 'van halen': 'Van Halen',
  'evh': 'Van Halen', 'eddie van': 'Van Halen', 'queen': 'Queen', 'brian may': 'Queen',
  'muse': 'Muse', 'zeppelin': 'Led Zeppelin', 'led zep': 'Led Zeppelin', 'jimmy page': 'Led Zeppelin',
  'ac/dc': 'AC/DC', 'acdc': 'AC/DC', 'angus': 'AC/DC', 'beatles': 'The Beatles',
  'mayer': 'John Mayer', 'nirvana': 'Nirvana', 'cobain': 'Nirvana',
  'hendrix': 'Jimi Hendrix', 'srv': 'Stevie Ray Vaughan', 'stevie ray': 'Stevie Ray Vaughan',
  'bonamassa': 'Joe Bonamassa', 'pearl jam': 'Pearl Jam', 'satriani': 'Joe Satriani',
  'timmons': 'Andy Timmons', 'slash': 'Guns N\u2019 Roses', 'guns n': 'Guns N\u2019 Roses',
  'santana': 'Santana', 'petrucci': 'Dream Theater', 'dream theater': 'Dream Theater',
  'steve vai': 'Steve Vai', 'radiohead': 'Radiohead', 'clapton': 'Eric Clapton',
  'frusciante': 'Red Hot Chili Peppers', 'rhcp': 'Red Hot Chili Peppers', 'red hot chili': 'Red Hot Chili Peppers',
  'soundgarden': 'Soundgarden', 'knopfler': 'Dire Straits', 'dire straits': 'Dire Straits',
  'foo fighters': 'Foo Fighters', 'green day': 'Green Day', 'cranberries': 'The Cranberries',
  'no doubt': 'No Doubt', 'journey': 'Journey', 'toto': 'Toto', 'boston': 'Boston',
  'iron maiden': 'Iron Maiden', 'megadeth': 'Megadeth', 'pantera': 'Pantera',
  'tool ': 'Tool', 'rush': 'Rush', 'alex lifeson': 'Rush', 'kiss': 'KISS',
  'bethel': 'Bethel Music', 'hillsong': 'Hillsong', 'elevation': 'Elevation Worship',
};

// ─────────────────────────────────────────────────────────────
// 2. PARSER REGISTRY → modello canonico
// ─────────────────────────────────────────────────────────────
const fwString = v => v == null ? null :
  `${(v >>> 24) & 0xff}.${((v >>> 16) & 0xff).toString(16).padStart(2, '0')}`;

function extractCanonical(meta, data, tone) {
  const blocks = [];
  for (const dsp of ['dsp0', 'dsp1']) {
    const d = tone?.[dsp] || {};
    for (const [k, v] of Object.entries(d)) {
      if (!k.startsWith('block') || typeof v !== 'object' || !v) continue;
      blocks.push({
        dsp, key: k, model: v['@model'] || '?',
        position: v['@position'] ?? 0, path: v['@path'] ?? 0,
        enabled: v['@enabled'] !== false, stereo: !!v['@stereo'],
        params: v,
      });
    }
  }
  blocks.sort((a, b) => a.dsp.localeCompare(b.dsp) || a.path - b.path || a.position - b.position);

  const fx = new Set();
  for (const b of blocks)
    for (const [cat, re] of FX_RULES) if (re.test(b.model)) { fx.add(cat); break; }

  const amps = blocks.filter(b => /^HD2_(Amp|Preamp)/.test(b.model));
  const irBlocks = blocks.filter(b => b.model.includes('ImpulseResponse'));

  const snapshots = [];
  for (let i = 0; i < 8; i++) {
    const s = tone?.[`snapshot${i}`];
    if (!s) continue;
    const name = s['@name'] || '';
    const isDefault = new RegExp(`^snapshot ${i + 1}$`, 'i').test(name.trim());
    if (name && !isDefault) snapshots.push({ index: i, name, tempo: s['@tempo'] ?? null });
  }

  return { meta, blocks, fx: [...fx], amps, irBlocks, snapshots,
           tempo: tone?.global?.['@tempo'] ?? null,
           topology: [tone?.global?.['@topology0'], tone?.global?.['@topology1']].filter(Boolean).join('+') || null };
}

const parsers = [
  { // L6Preset (.hlx singolo)
    name: 'L6Preset',
    canParse: (buf, j) => j?.schema === 'L6Preset',
    parse: (buf, j, file) => [{
      schema: 'L6Preset',
      device: j.data?.device ?? null,
      firmware: fwString(j.data?.device_version),
      ...extractCanonical(j.data?.meta || {}, j.data, j.data?.tone),
      sourceFile: file, slot: null, parentSetlist: null,
    }],
  },
  { // L6Setlist → esplode fino a 128 preset figli
    name: 'L6Setlist',
    canParse: (buf, j) => j?.schema === 'L6Setlist',
    parse: (buf, j, file) => {
      const raw = inflateSync(Buffer.from(j.encoded_data, 'base64'));
      const inner = JSON.parse(raw.toString('utf8'));
      const out = [];
      (inner.presets || []).forEach((p, slot) => {
        const name = p?.meta?.name?.trim();
        if (!name || name === 'New Preset') return;
        out.push({
          schema: 'L6Preset', device: p.device ?? null,
          firmware: fwString(p.device_version),
          ...extractCanonical(p.meta || {}, p, p.tone),
          sourceFile: file, slot, parentSetlist: j.meta?.name || basename(file),
        });
      });
      return out;
    },
  },
  { // .hsp Helix Stadium — magic 'rpshnosj' + JSON (indicizzazione base v0.1)
    name: 'HSP',
    canParse: buf => buf.subarray(0, 8).toString('latin1') === 'rpshnosj',
    parse: (buf, _j, file) => {
      const j = JSON.parse(buf.subarray(8).toString('utf8'));
      const models = [];
      for (const flow of j.preset?.flow || [])
        for (const v of Object.values(flow))
          if (v && typeof v === 'object' && Array.isArray(v.slot))
            for (const s of v.slot) if (s?.model) models.push(s.model);
      return [{
        schema: 'HSP', device: j.meta?.device_id ?? null, firmware: null,
        meta: { name: j.meta?.name, author: null, song: null, band: null, tnid: null,
                info: j.meta?.info || null },
        blocks: models.map((m, i) => ({ dsp: 'flow', key: `s${i}`, model: m,
                position: i, path: 0, enabled: true, stereo: false, params: {} })),
        fx: [], amps: [], irBlocks: [], snapshots: [], tempo: null, topology: null,
        sourceFile: file, slot: null, parentSetlist: null,
      }];
    },
  },
];

// ─────────────────────────────────────────────────────────────
// 3. CLASSIFICATORE
// ─────────────────────────────────────────────────────────────
function classifyGain(c) {
  if (!c.amps.length) {
    const hasDist = c.fx.includes('dist');
    const txt = `${c.meta.name || ''} ${c.meta.song || ''}`.toLowerCase();
    if (/acoustic|acustic/.test(txt) || !hasDist && c.fx.includes('reverb') && /ambient|swell|pad/.test(txt))
      return [/acoustic|acustic/.test(txt) ? 'acoustic' : 'ambient', 0.6];
    return [hasDist ? 'crunch' : 'fx-only', 0.4];
  }
  let score = 0, n = 0;
  for (const a of c.amps) {
    const short = a.model.replace(/^HD2_(Preamp|Amp)/, 'Amp');
    const info = AMP_MAP[short];
    const bias = info ? CHAR_BIAS[info[3]] : 0.5;
    const drive = typeof a.params.Drive === 'number' ? a.params.Drive : 0.5;
    score += bias * 0.65 + drive * 0.35; n++;
  }
  score /= n;
  const distOn = c.blocks.some(b => /^HD2_(Dist|DM4)/.test(b.model) && b.enabled);
  if (distOn) score = Math.min(1, score + 0.12);
  const txt = `${c.meta.name || ''} ${c.meta.song || ''} ${c.meta.band || ''}`.toLowerCase();
  if (/\bclean\b/.test(txt)) score -= 0.15;
  if (/metal|djent|brutal|thrash/.test(txt)) score += 0.15;
  if (/\blead\b|solo/.test(txt)) score = Math.max(score, 0.6);
  const cls = score < 0.18 ? 'clean' : score < 0.38 ? 'edge' : score < 0.58 ? 'crunch'
            : score < 0.75 ? 'lead' : 'highgain';
  return [cls, 0.5 + Math.abs(score - 0.5)]; // confidenza grezza
}

function detectArtists(c, filename) {
  const blob = `${c.meta.name || ''} ${c.meta.song || ''} ${c.meta.band || ''} ${filename}`.toLowerCase();
  const found = new Set();
  for (const [alias, canon] of Object.entries(ARTISTS))
    if (blob.includes(alias)) found.add(canon);
  return [...found];
}

// ─────────────────────────────────────────────────────────────
// 4. DATABASE
// ─────────────────────────────────────────────────────────────
function initDb(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS presets (
      id INTEGER PRIMARY KEY, name TEXT, author TEXT, song TEXT, band TEXT,
      tnid INTEGER, schema_type TEXT, device INTEGER, firmware TEXT,
      modified_date INTEGER, source_file TEXT, parent_setlist TEXT, slot INTEGER,
      file_hash TEXT, content_hash TEXT, dup_of INTEGER,
      num_blocks INTEGER, num_amps INTEGER, uses_ir INTEGER, ir_slots TEXT,
      num_named_snapshots INTEGER, tempo REAL, topology TEXT,
      gain_class TEXT, gain_conf REAL,
      amp_models TEXT, amp_brands TEXT, fx TEXT, artists TEXT, info TEXT
    );
    CREATE TABLE IF NOT EXISTS blocks (
      preset_id INTEGER, dsp TEXT, position INTEGER, model TEXT,
      enabled INTEGER, params_json TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_blocks_model ON blocks(model);
    CREATE INDEX IF NOT EXISTS ix_presets_gain ON presets(gain_class);
    CREATE INDEX IF NOT EXISTS ix_presets_author ON presets(author);
    CREATE INDEX IF NOT EXISTS ix_presets_tnid ON presets(tnid);
    CREATE VIRTUAL TABLE IF NOT EXISTS presets_fts USING fts5(
      name, author, song, band, amps, brands, fx, artists, snapshots, info,
      content='', tokenize='unicode61'
    );
  `);
  return db;
}

// ─────────────────────────────────────────────────────────────
// 5. SCANNER + PIPELINE
// ─────────────────────────────────────────────────────────────
function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === '__MACOSX') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function main() {
  const root = process.argv[2];
  const dbPath = process.argv[3] || 'helix.db';
  if (!root) { console.error('Uso: node ingest.mjs <cartella> [db]'); process.exit(1); }
  // HELIX_JSON=1: stdout solo righe JSON (progress/done) per l'app Electron
  const jsonOut = process.env.HELIX_JSON === '1';

  const t0 = Date.now();
  const db = initDb(dbPath);
  const insP = db.prepare(`INSERT INTO presets
    (name,author,song,band,tnid,schema_type,device,firmware,modified_date,
     source_file,parent_setlist,slot,file_hash,content_hash,dup_of,
     num_blocks,num_amps,uses_ir,ir_slots,num_named_snapshots,tempo,topology,
     gain_class,gain_conf,amp_models,amp_brands,fx,artists,info)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insB = db.prepare(`INSERT INTO blocks VALUES (?,?,?,?,?,?)`);
  const insF = db.prepare(`INSERT INTO presets_fts
    (rowid,name,author,song,band,amps,brands,fx,artists,snapshots,info)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);

  const stats = { files: 0, presets: 0, fromSetlists: 0, hsp: 0, dupFile: 0, dupContent: 0, errors: [] };
  const seenFile = new Map(), seenContent = new Map();

  // re-import idempotente: riparti dagli hash già presenti nel DB
  try {
    for (const r of db.prepare('SELECT id, file_hash, content_hash, dup_of FROM presets').all()) {
      if (!seenFile.has(r.file_hash)) seenFile.set(r.file_hash, '(già in DB)');
      if (r.dup_of == null && !seenContent.has(r.content_hash)) seenContent.set(r.content_hash, r.id);
    }
  } catch { /* DB nuovo, nessuno stato precedente */ }

  db.exec('BEGIN');
  for (const file of walk(root)) {
    if (!/\.(hlx|hsp)(\s+copy)?$/i.test(file) && !/\/(U2 40|Purple|PRS Archon|Cougar ATT 15)$/.test(file)) continue;
    stats.files++;
    if (jsonOut && stats.files % 200 === 0)
      console.log(JSON.stringify({ type: 'progress', files: stats.files, presets: stats.presets }));
    let buf;
    try { buf = readFileSync(file); } catch (e) { stats.errors.push([file, 'read']); continue; }
    const fhash = createHash('sha256').update(buf).digest('hex');
    if (seenFile.has(fhash)) { stats.dupFile++; continue; }
    seenFile.set(fhash, file);

    let json = null;
    try { json = JSON.parse(buf.toString('utf8')); } catch { /* può essere HSP */ }
    const parser = parsers.find(p => p.canParse(buf, json));
    if (!parser) { stats.errors.push([file, 'formato sconosciuto']); continue; }

    let items;
    try { items = parser.parse(buf, json, file); }
    catch (e) { stats.errors.push([file, `parse: ${e.message.slice(0, 60)}`]); continue; }

    for (const c of items) {
      const chash = createHash('sha256')
        .update(JSON.stringify(c.blocks.map(b => [b.model, b.position, b.params])))
        .digest('hex');
      const dupOf = seenContent.get(chash) ?? null;
      if (dupOf) stats.dupContent++;

      const [gainClass, gainConf] = classifyGain(c);
      const artists = detectArtists(c, basename(file));
      const ampShorts = c.amps.map(a => a.model.replace(/^HD2_(Preamp|Amp)/, 'Amp'));
      const ampNames = ampShorts.map(s => AMP_MAP[s]?.[0] || s.replace(/^Amp/, ''));
      const brands = [...new Set(ampShorts.map(s => AMP_MAP[s]?.[1 + 1]).filter(Boolean))];
      const realGear = ampShorts.map(s => AMP_MAP[s]?.[1]).filter(Boolean);

      insP.run(
        c.meta.name || basename(file), c.meta.author || null, c.meta.song || null,
        c.meta.band || null, c.meta.tnid || null, c.schema, c.device, c.firmware,
        c.meta.modifieddate || null, file, c.parentSetlist, c.slot,
        fhash, chash, dupOf,
        c.blocks.length, c.amps.length, c.irBlocks.length ? 1 : 0,
        JSON.stringify(c.irBlocks.map(b => b.params.Index ?? null)),
        c.snapshots.length, c.tempo, c.topology,
        gainClass, gainConf,
        JSON.stringify(ampNames), JSON.stringify(brands),
        JSON.stringify(c.fx), JSON.stringify(artists), c.meta.info || null,
      );
      const id = db.prepare('SELECT last_insert_rowid() r').get().r;
      if (!dupOf) seenContent.set(chash, id);
      for (const b of c.blocks)
        insB.run(id, b.dsp, b.position, b.model, b.enabled ? 1 : 0, JSON.stringify(b.params));
      insF.run(id,
        c.meta.name || '', c.meta.author || '', c.meta.song || '', c.meta.band || '',
        [...ampNames, ...realGear].join(' '), brands.join(' '), c.fx.join(' '),
        artists.join(' '), c.snapshots.map(s => s.name).join(' '), c.meta.info || '');

      stats.presets++;
      if (c.parentSetlist) stats.fromSetlists++;
      if (c.schema === 'HSP') stats.hsp++;
    }
  }
  db.exec('COMMIT');
  db.exec('INSERT INTO presets_fts(presets_fts) VALUES (\'optimize\')');

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  if (jsonOut) {
    console.log(JSON.stringify({
      type: 'done', seconds: +dt, files: stats.files, presets: stats.presets,
      fromSetlists: stats.fromSetlists, hsp: stats.hsp,
      dupFile: stats.dupFile, dupContent: stats.dupContent, errors: stats.errors.length,
    }));
    return;
  }
  console.log(`\n── Ingestione completata in ${dt}s ──`);
  console.log(`File analizzati:        ${stats.files}`);
  console.log(`Preset indicizzati:     ${stats.presets}`);
  console.log(`  di cui da setlist:    ${stats.fromSetlists}`);
  console.log(`  di cui Stadium:       ${stats.hsp}`);
  console.log(`Duplicati file saltati: ${stats.dupFile}`);
  console.log(`Duplicati logici:       ${stats.dupContent} (indicizzati, marcati dup_of)`);
  console.log(`Errori:                 ${stats.errors.length}`);
  for (const e of stats.errors.slice(0, 5)) console.log('   ', e.join(' — '));
  console.log(`DB: ${dbPath}`);
}
main();
