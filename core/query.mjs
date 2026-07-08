#!/usr/bin/env node
/**
 * Helix Preset Manager — Spike v0.1 — Query CLI
 *
 * Uso:
 *   node query.mjs stats                          → statistiche libreria
 *   node query.mjs search "pink floyd wall"       → ricerca full-text
 *   node query.mjs filter gain=clean brand=Fender fx=delay limit=15
 *   node query.mjs artist "Pink Floyd"
 *   node query.mjs show <id>                      → scheda preset completa
 */
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(process.env.HELIX_DB || 'helix.db', { readOnly: true });
const [cmd, ...args] = process.argv.slice(2);

const row2line = r =>
  `#${String(r.id).padEnd(6)} ${String(r.name).slice(0, 20).padEnd(20)} ` +
  `│ ${String(r.gain_class).padEnd(8)} │ ${JSON.parse(r.amp_brands || '[]').join(',').slice(0, 18).padEnd(18)} ` +
  `│ ${String(r.band || r.song || '').slice(0, 22).padEnd(22)} │ by ${String(r.author || '?').slice(0, 14)}` +
  (r.dup_of ? ` (dup di #${r.dup_of})` : '');

if (cmd === 'stats') {
  const n = db.prepare('SELECT COUNT(*) c FROM presets').get().c;
  const uniq = db.prepare('SELECT COUNT(*) c FROM presets WHERE dup_of IS NULL').get().c;
  console.log(`Preset totali: ${n}  (unici: ${uniq}, duplicati logici: ${n - uniq})\n`);
  console.log('Per classe di gain:');
  for (const r of db.prepare('SELECT gain_class, COUNT(*) c FROM presets GROUP BY 1 ORDER BY c DESC').all())
    console.log(`  ${String(r.gain_class).padEnd(10)} ${r.c}`);
  console.log('\nTop 10 marche amp:');
  const brands = {};
  for (const r of db.prepare("SELECT amp_brands FROM presets WHERE amp_brands != '[]'").all())
    for (const b of JSON.parse(r.amp_brands)) brands[b] = (brands[b] || 0) + 1;
  Object.entries(brands).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .forEach(([b, c]) => console.log(`  ${b.padEnd(14)} ${c}`));
  console.log('\nTop 10 artisti rilevati:');
  const arts = {};
  for (const r of db.prepare("SELECT artists FROM presets WHERE artists != '[]'").all())
    for (const a of JSON.parse(r.artists)) arts[a] = (arts[a] || 0) + 1;
  Object.entries(arts).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .forEach(([a, c]) => console.log(`  ${a.padEnd(20)} ${c}`));

} else if (cmd === 'search') {
  const q = args.join(' ').trim().split(/\s+/).map(w => `"${w}"*`).join(' ');
  const rows = db.prepare(`
    SELECT p.* FROM presets_fts f JOIN presets p ON p.id = f.rowid
    WHERE presets_fts MATCH ? ORDER BY rank LIMIT 20`).all(q);
  console.log(`${rows.length} risultati per: ${args.join(' ')}\n`);
  rows.forEach(r => console.log(row2line(r)));

} else if (cmd === 'filter') {
  const f = Object.fromEntries(args.map(a => a.split('=')));
  const where = ['1=1']; const params = [];
  if (f.gain)   { where.push('gain_class = ?'); params.push(f.gain); }
  if (f.brand)  { where.push('amp_brands LIKE ?'); params.push(`%${f.brand}%`); }
  if (f.fx)     for (const x of f.fx.split(',')) { where.push('fx LIKE ?'); params.push(`%"${x}"%`); }
  if (f.author) { where.push('author = ?'); params.push(f.author); }
  if (f.ir)     { where.push('uses_ir = ?'); params.push(f.ir === 'yes' ? 1 : 0); }
  if (f.nodup)  { where.push('dup_of IS NULL'); }
  const rows = db.prepare(
    `SELECT * FROM presets WHERE ${where.join(' AND ')} LIMIT ${+(f.limit || 15)}`).all(...params);
  console.log(`${rows.length} risultati (filtri: ${args.filter(a=>!a.startsWith('limit')).join(', ')})\n`);
  rows.forEach(r => console.log(row2line(r)));

} else if (cmd === 'artist') {
  const rows = db.prepare(`SELECT * FROM presets WHERE artists LIKE ? LIMIT 20`)
    .all(`%${args.join(' ')}%`);
  console.log(`${rows.length}+ preset per artista "${args.join(' ')}"\n`);
  rows.forEach(r => console.log(row2line(r)));

} else if (cmd === 'show') {
  const p = db.prepare('SELECT * FROM presets WHERE id = ?').get(+args[0]);
  if (!p) { console.log('Non trovato'); process.exit(1); }
  console.log(`\n${p.name}  [${p.gain_class}]`);
  console.log(`Autore: ${p.author || '?'}   Band: ${p.band || '—'}   Song: ${p.song || '—'}`);
  console.log(`Firmware: ${p.firmware || '?'}   CustomTone: ${p.tnid ? 'https://line6.com/customtone/tone/' + p.tnid : '—'}`);
  console.log(`Amp: ${JSON.parse(p.amp_models).join(', ') || '—'}   IR: ${p.uses_ir ? 'sì, slot ' + JSON.parse(p.ir_slots).join(',') : 'no'}`);
  console.log(`FX: ${JSON.parse(p.fx).join(', ')}`);
  if (p.parent_setlist) console.log(`Da setlist: ${p.parent_setlist} (slot ${p.slot})`);
  console.log(`File: ${p.source_file}\nCatena:`);
  for (const b of db.prepare('SELECT * FROM blocks WHERE preset_id = ? ORDER BY dsp, position').all(p.id))
    console.log(`  [${b.dsp}] ${String(b.position).padStart(2)} ${b.enabled ? '●' : '○'} ${b.model.replace('HD2_', '')}`);

} else {
  console.log('Comandi: stats | search <testo> | filter k=v… | artist <nome> | show <id>');
}
