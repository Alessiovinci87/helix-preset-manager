#!/usr/bin/env node
/**
 * Genera build/icon.ico da zero (nessuna dipendenza): disegna l'icona in RGBA
 * a 1024px con anti-aliasing via SDF, la ridimensiona a 256/48/32/16 e
 * impacchetta un .ico (PNG per 256, DIB per le taglie piccole).
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const S = 1024

// ── disegno ───────────────────────────────────────────────────
const px = new Float64Array(S * S * 4) // RGBA premoltiplicato in float

const clamp01 = (v) => Math.max(0, Math.min(1, v))

/** SDF di un rettangolo arrotondato centrato in (cx,cy), metà-lati (hx,hy), raggio r */
function sdRoundRect(x, y, cx, cy, hx, hy, r) {
  const qx = Math.abs(x - cx) - (hx - r)
  const qy = Math.abs(y - cy) - (hy - r)
  const ox = Math.max(qx, 0)
  const oy = Math.max(qy, 0)
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r
}

/** riempie con colore (fn di y per gradienti) dove sdf < 0, alpha-composite over */
function fill(sdf, colorAt) {
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = sdf(x + 0.5, y + 0.5)
      if (d > 1) continue
      const a = clamp01(0.5 - d)
      if (a <= 0) continue
      const [r, g, b] = colorAt(y / S)
      const i = (y * S + x) * 4
      const na = a + px[i + 3] * (1 - a)
      px[i] = (r * a + px[i] * px[i + 3] * (1 - a)) / (na || 1)
      px[i + 1] = (g * a + px[i + 1] * px[i + 3] * (1 - a)) / (na || 1)
      px[i + 2] = (b * a + px[i + 2] * px[i + 3] * (1 - a)) / (na || 1)
      px[i + 3] = na
    }
  }
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)

// sfondo: quadrato arrotondato scuro
fill((x, y) => sdRoundRect(x, y, S / 2, S / 2, S / 2, S / 2, S * 0.18), () => hex('#0d1117'))
// bordo interno sottile
fill(
  (x, y) => {
    const d = sdRoundRect(x, y, S / 2, S / 2, S * 0.47, S * 0.47, S * 0.15)
    return Math.max(d, -(d + S * 0.008))
  },
  () => hex('#1f2937'),
)
// "H": due montanti + traversa, gradiente sky
const skyTop = hex('#38bdf8')
const skyBot = hex('#0369a1')
const grad = (t) => mix(skyTop, skyBot, t)
const barW = S * 0.075
const barTop = S * 0.2
const barBot = S * 0.68
const barCY = (barTop + barBot) / 2
const barHY = (barBot - barTop) / 2
fill((x, y) => sdRoundRect(x, y, S * 0.31, barCY, barW, barHY, barW * 0.9), grad)
fill((x, y) => sdRoundRect(x, y, S * 0.69, barCY, barW, barHY, barW * 0.9), grad)
fill((x, y) => sdRoundRect(x, y, S / 2, S * 0.44, S * 0.19, S * 0.052, S * 0.045), grad)
// sottolineatura ambra (la "corda")
fill(
  (x, y) => sdRoundRect(x, y, S / 2, S * 0.8, S * 0.265, S * 0.026, S * 0.026),
  () => hex('#f59e0b'),
)

// ── downsample box a RGBA8 ────────────────────────────────────
function resize(size) {
  const f = S / size
  const out = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < f; sy++)
        for (let sx = 0; sx < f; sx++) {
          const i = ((y * f + sy) * S + (x * f + sx)) * 4
          const pa = px[i + 3]
          r += px[i] * pa
          g += px[i + 1] * pa
          b += px[i + 2] * pa
          a += pa
        }
      const n = f * f
      const o = (y * size + x) * 4
      out[o] = a ? Math.round(r / a) : 0
      out[o + 1] = a ? Math.round(g / a) : 0
      out[o + 2] = a ? Math.round(b / a) : 0
      out[o + 3] = Math.round((a / n) * 255)
    }
  return out
}

// ── PNG ───────────────────────────────────────────────────────
let CRC_T = null
function crc32(buf) {
  if (!CRC_T) {
    CRC_T = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      CRC_T[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (const x of buf) c = CRC_T[(c ^ x) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 6   // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filtro none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ── DIB (BMP dentro ICO): BGRA bottom-up + AND mask ───────────
function encodeDib(rgba, size) {
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0)
  header.writeInt32LE(size, 4)
  header.writeInt32LE(size * 2, 8) // XOR + AND
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(32, 14)
  const xor = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4
      const dst = ((size - 1 - y) * size + x) * 4
      xor[dst] = rgba[src + 2]
      xor[dst + 1] = rgba[src + 1]
      xor[dst + 2] = rgba[src]
      xor[dst + 3] = rgba[src + 3]
    }
  const and = Buffer.alloc(size * Math.ceil(size / 32) * 4) // tutto visibile (alpha decide)
  return Buffer.concat([header, xor, and])
}

// ── ICO ───────────────────────────────────────────────────────
const sizes = [256, 48, 32, 16]
const images = sizes.map((s) => {
  const rgba = resize(s)
  return { size: s, data: s === 256 ? encodePng(rgba, s) : encodeDib(rgba, s) }
})
const header = Buffer.alloc(6)
header.writeUInt16LE(1, 2) // tipo icona
header.writeUInt16LE(images.length, 4)
let offset = 6 + images.length * 16
const entries = []
for (const img of images) {
  const e = Buffer.alloc(16)
  e[0] = img.size === 256 ? 0 : img.size
  e[1] = img.size === 256 ? 0 : img.size
  e.writeUInt16LE(1, 4)
  e.writeUInt16LE(32, 6)
  e.writeUInt32LE(img.data.length, 8)
  e.writeUInt32LE(offset, 12)
  offset += img.data.length
  entries.push(e)
}
mkdirSync('build', { recursive: true })
writeFileSync('build/icon.ico', Buffer.concat([header, ...entries, ...images.map((i) => i.data)]))
// PNG 256 anche da solo (utile per anteprime/README)
writeFileSync('build/icon.png', encodePng(resize(256), 256))
console.log('build/icon.ico e build/icon.png generati')
