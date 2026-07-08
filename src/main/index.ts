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
import { openDb, getStats, search, show, isOpen, getSourceFile, getPresetFileInfo } from './db'
import { extractFromSetlist } from './extract'
import type { ImportResult, SearchRequest } from '../shared/types'

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
    child.stdout?.on('data', (d: Buffer) => {
      buf += d.toString()
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line.startsWith('{')) continue
        try {
          const msg = JSON.parse(line)
          if (msg.type === 'progress' && !sender.isDestroyed())
            sender.send('import:progress', { files: msg.files, presets: msg.presets })
          if (msg.type === 'done') done = msg as ImportResult
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
  const capturePath = process.env.HELIX_CAPTURE
  if (capturePath) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const img = await win.webContents.capturePage()
        writeFileSync(capturePath, img.toPNG())
        app.quit()
      }, 2500)
    })
  }
}

let importing = false

app.whenReady().then(() => {
  currentDbPath = resolveDbPath()
  if (currentDbPath) openDb(currentDbPath)

  ipcMain.handle('db:stats', () => (isOpen() ? getStats() : null))
  ipcMain.handle('db:search', (_e, req: SearchRequest) =>
    isOpen() ? search(req) : { rows: [], total: 0 },
  )
  ipcMain.handle('db:show', (_e, id: number) => (isOpen() ? show(id) : null))

  ipcMain.handle('import:folder', async (e) => {
    if (importing) return null
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return null
    const res = await dialog.showOpenDialog(win, {
      title: 'Scegli la cartella dei preset',
      buttonLabel: 'Importa',
      properties: ['openDirectory'],
    })
    if (res.canceled || !res.filePaths[0]) return null

    importing = true
    try {
      const dbPath = currentDbPath ?? join(app.getPath('userData'), 'helix.db')
      const result = await runIngest(res.filePaths[0], dbPath, e.sender)
      if (!isOpen()) openDb(dbPath)
      currentDbPath = dbPath
      return result
    } finally {
      importing = false
    }
  })

  const notice = (e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent, msg: string) =>
    e.sender.send('app:notice', msg)

  /** File .hlx utilizzabile per il preset: il sorgente, o l'estratto dalla setlist. */
  const usableFile = (
    e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent,
    id: number,
  ): string | null => {
    const info = getPresetFileInfo(id)
    if (!info) return null
    if (!existsSync(info.file)) {
      notice(
        e,
        `File non trovato sul disco: ${info.file}. ` +
          'Se hai spostato la cartella dei preset, re-importala per aggiornare la libreria.',
      )
      return null
    }
    if (info.parentSetlist == null) return info.file
    try {
      return extractFromSetlist(info.file, info.slot ?? 0, id, info.name)
    } catch (err) {
      notice(e, `Estrazione dalla setlist fallita: ${(err as Error).message}`)
      return null
    }
  }

  ipcMain.handle('preset:reveal', (e, id: number) => {
    const file = getSourceFile(id)
    if (file && existsSync(file)) shell.showItemInFolder(file)
    else notice(e, `File non trovato sul disco: ${file ?? `preset #${id}`}`)
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
        if (!isOpen()) openDb(dbPath)
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
