import { contextBridge, ipcRenderer } from 'electron'
import type { HelixApi, SearchRequest } from '../shared/types'

const api: HelixApi = {
  stats: () => ipcRenderer.invoke('db:stats'),
  search: (req: SearchRequest) => ipcRenderer.invoke('db:search', req),
  show: (id: number) => ipcRenderer.invoke('db:show', id),
}

contextBridge.exposeInMainWorld('api', api)
