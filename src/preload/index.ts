import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { HelixApi, ImportProgress, SearchRequest, UserData } from '../shared/types'

const api: HelixApi = {
  stats: () => ipcRenderer.invoke('db:stats'),
  search: (req: SearchRequest) => ipcRenderer.invoke('db:search', req),
  show: (id: number) => ipcRenderer.invoke('db:show', id),
  importFolder: (mode?: 'folder' | 'zip') => ipcRenderer.invoke('import:folder', mode),
  onImportProgress: (cb: (p: ImportProgress) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, p: ImportProgress) => cb(p)
    ipcRenderer.on('import:progress', listener)
    return () => ipcRenderer.removeListener('import:progress', listener)
  },
  reveal: (id: number) => ipcRenderer.invoke('preset:reveal', id),
  startDrag: (id: number) => ipcRenderer.send('preset:drag', id),
  openInHxEdit: (id: number) => ipcRenderer.invoke('preset:open', id),
  onNotice: (cb: (msg: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, msg: string) => cb(msg)
    ipcRenderer.on('app:notice', listener)
    return () => ipcRenderer.removeListener('app:notice', listener)
  },
  setUserData: (id: number, patch: Partial<UserData>) =>
    ipcRenderer.invoke('user:set', id, patch),
  pathForFile: (f: File) => webUtils.getPathForFile(f),
  importPaths: (paths: string[]) => ipcRenderer.invoke('import:paths', paths),
  exportSetlist: (ids: number[], name: string) =>
    ipcRenderer.invoke('setlist:export', ids, name),
}

contextBridge.exposeInMainWorld('api', api)
