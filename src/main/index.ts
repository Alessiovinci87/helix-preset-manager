import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
  shell,
  utilityProcess,
} from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, writeFileSync } from 'node:fs'
import {
  openDb,
  getStats,
  search,
  show,
  isOpen,
  getSourceFile,
  getPresetFileInfo,
  setUserData,
} from './db'
import { materializePreset, physicalPath, sourceExists } from './extract'
import { buildSetlist } from './setlist'
import type { ImportProgress, ImportResult, SearchRequest, UserData } from '../shared/types'
import electronUpdater from 'electron-updater'

const __dirname = dirname(fileURLToPath(import.meta.url))

let currentDbPath: string | null = null

function resolveDbPath(): string | null {
  const candidates = [
    process.env.HELIX_DB,
    join(app.getAppPath(), 'helix.db'),
    join(app.getPath('userData'), 'helix.db'),
  ].filter(Boolean) as string[]
  return candidates.find((p) => existsSync(p)) ?? null
}

// icona 1x1 trasparente per il drag nativo (Windows la richiede)
const DRAG_ICON = nativeImage.createFromDataURL(
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
)

function runIngest(root: string, dbPath: string, sender: Electron.WebContents): Promise<ImportResult> {
  // nell'app impacchettata core/ è fuori dall'asar (asarUnpack)
  const script = join(app.getAppPath(), 'core', 'ingest.mjs').replace(
    'app.asar',
    'app.asar.unpacked',
  )
  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(script, [root, dbPath], {
      stdio: 'pipe',
      env: { ...process.env, HELIX_JSON: '1' },
    })
    let done: ImportResult | null = null
    let buf = ''
    let errBuf = ''
    const last: ImportProgress = { files: 0, presets: 0 }
    const emit = () => {
      if (!sender.isDestroyed()) sender.send('import:progress', { ...last })
    }
    child.stdout?.on('data', (d: Buffer) => {
      buf += d.toString()
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line.startsWith('{')) continue
        try {
          const msg = JSON.parse(line)
          if (msg.type === 'start') {
            last.totalFiles = msg.totalFiles
            emit()
          } else if (msg.type === 'progress') {
            last.files = msg.files
            last.presets = msg.presets
            emit()
          } else if (msg.type === 'phase') {
            last.phase = msg.phase
            emit()
          } else if (msg.type === 'done') {
            done = msg as ImportResult
          }
        } catch {
          /* riga non JSON, ignora */
        }
      }
    })
    child.stderr?.on('data', (d: Buffer) => {
      errBuf += d.toString()
    })
    child.on('exit', (code) => {
      if (code === 0 && done) resolve(done)
      else reject(new Error(`Import fallito (exit ${code}): ${errBuf.slice(0, 300)}`))
    })
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d1117',
    autoHideMenuBar: true,
    title: 'Helix Preset Manager',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false,
    },
  })

  // link esterni (CustomTone) nel browser di sistema, mai nella finestra
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // HELIX_CAPTURE=<file.png>: screenshot della finestra e uscita (verifiche automatiche)
  // HELIX_CAPTURE_DELAY=<ms>: attesa prima dello scatto (default 2500)
  const capturePath = process.env.HELIX_CAPTURE
  if (capturePath) {
    const delay = Number(process.env.HELIX_CAPTURE_DELAY) || 2500
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const img = await win.webContents.capturePage()
        writeFileSync(capturePath, img.toPNG())
        app.quit()
      }, delay)
    })
  }
}

let importing = false

const userdataPath = (): string => join(app.getPath('userData'), 'userdata.db')

app.whenReady().then(() => {
  currentDbPath = resolveDbPath()
  console.log('DB path:', currentDbPath, '| userdata:', userdataPath())
  if (currentDbPath) {
    try {
      openDb(currentDbPath, userdataPath())
      console.log('openDb OK, isOpen:', isOpen())
    } catch (e) {
      console.error('openDb FALLITO:', e)
    }
  }

  // auto-update da GitHub Releases (solo app installata; silenzioso se offline)
  if (app.isPackaged && !process.env.HELIX_CAPTURE) {
    electronUpdater.autoUpdater.checkForUpdatesAndNotify().catch(() => {})
  }

  ipcMain.handle('db:stats', () => (isOpen() ? getStats() : null))
  ipcMain.handle('db:search', (_e, req: SearchRequest) => {
    if (!isOpen()) return { rows: [], total: 0 }
    const res = search(req)
    if (process.env.HELIX_CAPTURE)
      console.log('search', JSON.stringify(req), '→ total', res.total)
    return res
  })
  ipcMain.handle('db:show', (_e, id: number) => (isOpen() ? show(id) : null))

  ipcMain.handle('import:folder', async (e, mode: 'folder' | 'zip' = 'folder') => {
    if (importing) return null
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return null
    const res = await dialog.showOpenDialog(
      win,
      mode === 'zip'
        ? {
            title: 'Scegli un archivio ZIP di preset',
            buttonLabel: 'Importa',
            properties: ['openFile'],
            filters: [{ name: 'Archivi ZIP', extensions: ['zip'] }],
          }
        : {
            title: 'Scegli la cartella dei preset',
            buttonLabel: 'Importa',
            properties: ['openDirectory'],
          },
    )
    if (res.canceled || !res.filePaths[0]) return null

    importing = true
    try {
      const dbPath = currentDbPath ?? join(app.getPath('userData'), 'helix.db')
      const result = await runIngest(res.filePaths[0], dbPath, e.sender)
      if (!isOpen()) openDb(dbPath, userdataPath())
      currentDbPath = dbPath
      return result
    } finally {
      importing = false
    }
  })

  // import di percorsi rilasciati con drag&drop (cartelle, ZIP, singoli .hlx)
  ipcMain.handle('import:paths', async (e, paths: string[]) => {
    if (importing || !paths?.length) return null
    importing = true
    try {
      const dbPath = currentDbPath ?? join(app.getPath('userData'), 'helix.db')
      const sum: ImportResult = {
        seconds: 0, files: 0, presets: 0, fromSetlists: 0, hsp: 0,
        dupFile: 0, dupContent: 0, errors: 0,
      }
      for (const p of paths) {
        const r = await runIngest(p, dbPath, e.sender)
        for (const k of Object.keys(sum) as (keyof ImportResult)[]) sum[k] += r[k]
      }
      if (!isOpen()) openDb(dbPath, userdataPath())
      currentDbPath = dbPath
      return sum
    } finally {
      importing = false
    }
  })

  ipcMain.handle('user:set', (_e, id: number, patch: Partial<UserData>) =>
    isOpen() ? setUserData(id, patch) : null,
  )

  ipcMain.handle('setlist:export', async (e, ids: number[], name: string) => {
    if (!isOpen() || !ids?.length) return null
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return null
    const safe = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'Setlist'
    const res = await dialog.showSaveDialog(win, {
      title: 'Salva setlist per HX Edit',
      defaultPath: `${safe}.hls`,
      filters: [{ name: 'Setlist HX Edit', extensions: ['hls'] }],
    })
    if (res.canceled || !res.filePath) return null
    try {
      return buildSetlist(ids, name, res.filePath)
    } catch (err) {
      notice(e, `Export setlist fallito: ${(err as Error).message}`)
      return null
    }
  })

  const notice = (e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent, msg: string) =>
    e.sender.send('app:notice', msg)

  /** File .hlx utilizzabile per il preset: sorgente, o estratto da setlist/ZIP. */
  const usableFile = (
    e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent,
    id: number,
  ): string | null => {
    const info = getPresetFileInfo(id)
    if (!info) return null
    if (!sourceExists(info.file)) {
      notice(
        e,
        `File non trovato sul disco: ${physicalPath(info.file)}. ` +
          'Se hai spostato la cartella dei preset, re-importala per aggiornare la libreria.',
      )
      return null
    }
    try {
      return materializePreset(info, id)
    } catch (err) {
      notice(e, `Estrazione del preset fallita: ${(err as Error).message}`)
      return null
    }
  }

  ipcMain.handle('preset:reveal', (e, id: number) => {
    const file = getSourceFile(id)
    const phys = file ? physicalPath(file) : null
    if (phys && existsSync(phys)) shell.showItemInFolder(phys)
    else notice(e, `File non trovato sul disco: ${phys ?? `preset #${id}`}`)
  })

  ipcMain.on('preset:drag', (e, id: number) => {
    const file = usableFile(e, id)
    if (file) e.sender.startDrag({ file, icon: DRAG_ICON })
  })

  ipcMain.handle('preset:open', async (e, id: number) => {
    const file = usableFile(e, id)
    if (!file) return
    const err = await shell.openPath(file) // usa l'associazione .hlx → HX Edit
    if (err) notice(e, `Impossibile aprire il file in HX Edit: ${err}`)
  })

  createWindow()

  // HELIX_IMPORT=<cartella>: import automatico all'avvio (verifiche automatiche)
  if (process.env.HELIX_IMPORT) {
    const win = BrowserWindow.getAllWindows()[0]
    const dbPath = currentDbPath ?? join(app.getPath('userData'), 'helix.db')
    runIngest(process.env.HELIX_IMPORT, dbPath, win.webContents)
      .then((r) => {
        if (!isOpen()) openDb(dbPath, userdataPath())
        currentDbPath = dbPath
        console.log('AUTO-IMPORT OK', JSON.stringify(r))
      })
      .catch((err) => console.error('AUTO-IMPORT FAIL', err))
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
