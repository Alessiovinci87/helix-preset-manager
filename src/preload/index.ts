import { contextBridge, ipcRenderer } from 'electron'
import type { HelixApi, ImportProgress, SearchRequest } from '../shared/types'

const api: HelixApi = {
  stats: () => ipcRenderer.invoke('db:stats'),
  search: (req: SearchRequest) => ipcRenderer.invoke('db:search', req),
  show: (id: number) => ipcRenderer.invoke('db:show', id),
  importFolder: () => ipcRenderer.invoke('import:folder'),
  onImportProgress: (cb: (p: ImportProgress) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, p: ImportProgress) => cb(p)
    ipcRenderer.on('import:progress', listener)
    return () => ipcRenderer.removeListener('import:progress', listener)
  },
  reveal: (id: number) => ipcRenderer.invoke('preset:reveal', id),
  startDrag: (id: number) => ipcRenderer.send('preset:drag', id),
  onNotice: (cb: (msg: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, msg: string) => cb(msg)
    ipcRenderer.on('app:notice', listener)
    return () => ipcRenderer.removeListener('app:notice', listener)
  },
}

contextBridge.exposeInMainWorld('api', api)
