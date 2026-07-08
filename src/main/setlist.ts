import { writeFileSync } from 'node:fs'
import { deflateSync, inflateSync } from 'node:zlib'
import { readSourceBuffer } from './extract'
import { getExportInfos } from './db'

/**
 * Costruzione di setlist .hls per HX Edit.
 * Formato (verificato su file reali): JSON con schema L6Setlist,
 * encoded_data = Base64(zlib(inner)), inner = { meta:{name}, presets:[128 slot] },
 * compression.crc32 = CRC32 dei byte decompressi.
 */

// Slot "New Preset" di fabbrica (struttura di default vuota, nessun contenuto
// creativo: soli valori predefiniti — serve per riempire gli slot non usati).
const EMPTY_SLOT_JSON = `{"device":2162692,"device_version":57671680,"meta":{"build_sha":"39f7f9a","name":"New Preset"},"tone":{"dsp0":{"inputA":{"@input":1,"@model":"HD2_AppDSPFlow1Input","decay":0.5,"noiseGate":false,"threshold":-48},"inputB":{"@input":0,"@model":"HD2_AppDSPFlow2Input","decay":0.5,"noiseGate":false,"threshold":-48},"join":{"@enabled":true,"@model":"HD2_AppDSPFlowJoin","@no_snapshot_bypass":false,"@position":8,"A Level":0,"A Pan":0.5,"B Level":0,"B Pan":0.5,"B Polarity":false,"Level":0},"outputA":{"@model":"HD2_AppDSPFlowOutput","@output":1,"gain":0,"pan":0.5},"outputB":{"@model":"HD2_AppDSPFlowOutput","@output":0,"gain":0,"pan":0.5},"split":{"@enabled":true,"@model":"HD2_AppDSPFlowSplitY","@no_snapshot_bypass":false,"@position":0,"BalanceA":0.5,"BalanceB":0.5,"bypass":false}},"dsp1":{"inputA":{"@input":0,"@model":"HD2_AppDSPFlow1Input","decay":0.5,"noiseGate":false,"threshold":-48},"inputB":{"@input":0,"@model":"HD2_AppDSPFlow2Input","decay":0.5,"noiseGate":false,"threshold":-48},"join":{"@enabled":true,"@model":"HD2_AppDSPFlowJoin","@no_snapshot_bypass":false,"@position":8,"A Level":0,"A Pan":0.5,"B Level":0,"B Pan":0.5,"B Polarity":false,"Level":0},"outputA":{"@model":"HD2_AppDSPFlowOutput","@output":1,"gain":0,"pan":0.5},"outputB":{"@model":"HD2_AppDSPFlowOutput","@output":0,"gain":0,"pan":0.5},"split":{"@enabled":true,"@model":"HD2_AppDSPFlowSplitY","@no_snapshot_bypass":false,"@position":0,"BalanceA":0.5,"BalanceB":0.5,"bypass":false}},"dt0":{"@dt_12ax7boost":0,"@dt_bplusvoltage":0,"@dt_channel":0,"@dt_feedbackcap":0,"@dt_poweramp":1,"@dt_reverb":true,"@dt_revmix":0.25,"@dt_topology":0,"@dt_tubeconfig":0,"@model":"@dt"},"dt1":{"@dt_12ax7boost":0,"@dt_bplusvoltage":0,"@dt_channel":0,"@dt_feedbackcap":0,"@dt_poweramp":1,"@dt_reverb":true,"@dt_revmix":0.25,"@dt_topology":0,"@dt_tubeconfig":0,"@model":"@dt"},"dtdual":{"@dt_12ax7boost":0,"@dt_bplusvoltage":0,"@dt_channel":0,"@dt_feedbackcap":0,"@dt_poweramp":1,"@dt_reverb":true,"@dt_revmix":0.25,"@dt_topology":0,"@dt_tubeconfig":0,"@model":"@dt"},"global":{"@DtSelect":2,"@PowercabMode":0,"@PowercabSelect":2,"@PowercabVoicing":0,"@current_snapshot":0,"@cursor_dsp":0,"@cursor_group":"","@cursor_path":0,"@cursor_position":0,"@guitarinputZ":0,"@guitarpad":0,"@model":"@global_params","@pedalstate":2,"@tempo":120,"@topology0":"A","@topology1":"A"},"powercab0":{"@model":"@powercab","@powercab_color":0,"@powercab_distance":3.5,"@powercab_flatlevel":0,"@powercab_hicut":20100,"@powercab_irlevel":-18,"@powercab_lowcut":19.9,"@powercab_mic":0,"@powercab_speaker":0,"@powercab_speakerlevel":-15,"@powercab_userir":0},"powercab1":{"@model":"@powercab","@powercab_color":0,"@powercab_distance":3.5,"@powercab_flatlevel":0,"@powercab_hicut":20100,"@powercab_irlevel":-18,"@powercab_lowcut":19.9,"@powercab_mic":0,"@powercab_speaker":0,"@powercab_speakerlevel":-15,"@powercab_userir":0},"powercabdual":{"@model":"@powercab","@powercab_color":0,"@powercab_distance":3.5,"@powercab_flatlevel":0,"@powercab_hicut":20100,"@powercab_irlevel":-18,"@powercab_lowcut":19.9,"@powercab_mic":0,"@powercab_speaker":0,"@powercab_speakerlevel":-15,"@powercab_userir":0},"snapshot0":{"@custom_name":false,"@ledcolor":0,"@name":"SNAPSHOT 1","@pedalstate":2,"@tempo":120,"@valid":true},"snapshot1":{"@custom_name":false,"@ledcolor":0,"@name":"SNAPSHOT 2","@pedalstate":2,"@tempo":120,"@valid":false},"snapshot2":{"@custom_name":false,"@ledcolor":0,"@name":"SNAPSHOT 3","@pedalstate":2,"@tempo":120,"@valid":false},"snapshot3":{"@custom_name":false,"@ledcolor":0,"@name":"SNAPSHOT 4","@pedalstate":2,"@tempo":120,"@valid":false},"snapshot4":{"@custom_name":false,"@ledcolor":0,"@name":"SNAPSHOT 5","@pedalstate":2,"@tempo":120,"@valid":false},"snapshot5":{"@custom_name":false,"@ledcolor":0,"@name":"SNAPSHOT 6","@pedalstate":2,"@tempo":120,"@valid":false},"snapshot6":{"@custom_name":false,"@ledcolor":0,"@name":"SNAPSHOT 7","@pedalstate":2,"@tempo":120,"@valid":false},"snapshot7":{"@custom_name":false,"@ledcolor":0,"@name":"SNAPSHOT 8","@pedalstate":2,"@tempo":120,"@valid":false},"variax":{"@model":"@variax","@variax_customtuning":false,"@variax_lockctrls":0,"@variax_magmode":true,"@variax_model":0,"@variax_str1level":1,"@variax_str1tuning":0,"@variax_str2level":1,"@variax_str2tuning":0,"@variax_str3level":1,"@variax_str3tuning":0,"@variax_str4level":1,"@variax_str4tuning":0,"@variax_str5level":1,"@variax_str5tuning":0,"@variax_str6level":1,"@variax_str6tuning":0,"@variax_toneknob":-0.1,"@variax_volumeknob":-0.1}}}`

// CRC32 (IEEE, come zlib) — tabella lazy
let CRC_TABLE: Uint32Array | null = null
function crc32(buf: Buffer): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      CRC_TABLE[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (const x of buf) c = CRC_TABLE[(c ^ x) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

interface SlotData {
  device: number | null
  device_version: number | null
  meta: Record<string, unknown>
  tone: unknown
}

/** Slot completo {device, device_version, meta, tone} dal file sorgente. */
function loadSlot(sourceFile: string, slot: number | null, parentSetlist: string | null): SlotData {
  const j = JSON.parse(readSourceBuffer(sourceFile).toString('utf8'))
  if (parentSetlist != null) {
    if (j.schema !== 'L6Setlist') throw new Error(`${sourceFile} non è una setlist`)
    const inner = JSON.parse(inflateSync(Buffer.from(j.encoded_data, 'base64')).toString('utf8'))
    const p = inner.presets?.[slot ?? 0]
    if (!p?.meta?.name) throw new Error(`slot ${slot} vuoto`)
    return p as SlotData
  }
  if (j.schema !== 'L6Preset') throw new Error(`${sourceFile} non è un preset Helix`)
  // un .hlx singolo ha in data la stessa forma di uno slot di setlist
  return {
    device: j.data?.device ?? null,
    device_version: j.data?.device_version ?? null,
    meta: j.data?.meta ?? {},
    tone: j.data?.tone,
  }
}

export interface SetlistResult {
  file: string
  written: number
  skipped: string[]
}

/** Costruisce e scrive una setlist .hls con i preset scelti (max 128). */
export function buildSetlist(ids: number[], name: string, outPath: string): SetlistResult {
  const infos = getExportInfos(ids)
  const slots: SlotData[] = []
  const skipped: string[] = []
  for (const info of infos) {
    if (slots.length >= 128) {
      skipped.push(`${info.name} (oltre il limite di 128 slot)`)
      continue
    }
    if (info.schemaType === 'HSP') {
      skipped.push(`${info.name} (preset Helix Stadium, non compatibile con le setlist)`)
      continue
    }
    try {
      slots.push(loadSlot(info.file, info.slot, info.parentSetlist))
    } catch (e) {
      skipped.push(`${info.name} (${(e as Error).message.slice(0, 80)})`)
    }
  }
  if (!slots.length) throw new Error('Nessun preset esportabile tra quelli selezionati')

  // device più frequente tra i preset inclusi (per la meta della setlist)
  const devCounts = new Map<number, number>()
  for (const s of slots)
    if (s.device != null) devCounts.set(s.device, (devCounts.get(s.device) ?? 0) + 1)
  const device = [...devCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 2162692

  const written = slots.length
  while (slots.length < 128) slots.push(JSON.parse(EMPTY_SLOT_JSON))

  const raw = Buffer.from(JSON.stringify({ meta: { name }, presets: slots }), 'utf8')
  const out = {
    schema: 'L6Setlist',
    version: 2,
    encoding: 'Base64',
    encoded_data: deflateSync(raw).toString('base64'),
    compression: { type: 'zlib', decompressed_size: raw.length, crc32: crc32(raw) },
    data: { meta: { band: null, author: null, tnid: null, song: null } },
    meta: {
      version: 'L6S',
      subversion: 2,
      name,
      application: 'HX Edit',
      appversion: 0,
      device,
      device_version: 0,
      l6midiid: device,
      modifieddate: Math.floor(Date.now() / 1000),
    },
  }
  writeFileSync(outPath, JSON.stringify(out))
  return { file: outPath, written, skipped }
}
