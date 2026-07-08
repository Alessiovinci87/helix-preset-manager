import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, writeFileSync } from 'node:fs'
import { openDb, getStats, search, show } from './db'
import type { SearchRequest } from '../shared/types'

const __dirname = dirname(fileURLToPath(import.meta.url))

function resolveDbPath(): string | null {
  const candidates = [
    process.env.HELIX_DB,
    join(app.getAppPath(), 'helix.db'),
    join(app.getPath('userData'), 'helix.db'),
  ].filter(Boolean) as string[]
  return candidates.find((p) => existsSync(p)) ?? null
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

app.whenReady().then(() => {
  const dbPath = resolveDbPath()
  if (dbPath) openDb(dbPath)

  ipcMain.handle('db:stats', () => getStats())
  ipcMain.handle('db:search', (_e, req: SearchRequest) => search(req))
  ipcMain.handle('db:show', (_e, id: number) => show(id))

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
