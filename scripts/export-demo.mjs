#!/usr/bin/env node
// Esporta i preset unici in JSON compatto per la demo browser.
// Uso: node scripts/export-demo.mjs [db] [out.json]
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';

const db = new DatabaseSync(process.argv[2] || 'helix.db', { readOnly: true });
const out = process.argv[3] || 'demo-data.json';

const GAINS = ['clean', 'edge', 'crunch', 'lead', 'highgain', 'acoustic', 'ambient', 'fx-only'];
const FXS = ['delay', 'reverb', 'compressor', 'chorus', 'phaser', 'flanger', 'tremolo',
  'rotary', 'wah', 'pitch', 'synth', 'eq', 'dist', 'looper', 'ir'];

const brands = [];
const brandIdx = new Map();
const bId = (b) => {
  if (!brandIdx.has(b)) { brandIdx.set(b, brands.length); brands.push(b); }
  return brandIdx.get(b);
};

const rows = db.prepare(`
  SELECT id, name, author, band, song, gain_class, amp_brands, fx, artists, tnid
  FROM presets WHERE dup_of IS NULL ORDER BY name COLLATE NOCASE`).all();

const presets = rows.map((r) => {
  let fxMask = 0;
  for (const f of JSON.parse(r.fx || '[]')) {
    const i = FXS.indexOf(f);
    if (i >= 0) fxMask |= 1 << i;
  }
  const artists = JSON.parse(r.artists || '[]');
  const display = r.band || r.song || artists[0] || '';
  // termini di ricerca extra non già visibili in nome/autore/display
  const shown = `${r.name} ${r.author || ''} ${display}`.toLowerCase();
  const extra = [r.band, r.song, ...artists]
    .filter(Boolean)
    .map((s) => s.toLowerCase())
    .filter((s) => !shown.includes(s))
    .join(' ');
  return [
    r.name,
    r.author || '',
    display,
    GAINS.indexOf(r.gain_class),
    JSON.parse(r.amp_brands || '[]').map(bId),
    fxMask,
    r.tnid || 0,
    extra,
  ];
});

writeFileSync(out, JSON.stringify({ gains: GAINS, fxs: FXS, brands, presets }));
console.log(`${presets.length} preset → ${out}`);
