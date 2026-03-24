import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('desktopApp', {
  platform: process.platform,
  listCachedDocuments: () => ipcRenderer.invoke('cache:list'),
  deleteCachedDocuments: (entries: Array<{ fileHash: string; language: 'zh' | 'en' }>) =>
    ipcRenderer.invoke('cache:delete', { entries }),
  loadCachedDocument: (fileHash: string, language: 'zh' | 'en') =>
    ipcRenderer.invoke('cache:load', { fileHash, language }),
  saveCachedDocument: (
    fileHash: string,
    language: 'zh' | 'en',
    work: {
      key: string
      title: string
    },
    data: {
      document: unknown
      embeddings: number[][]
    },
  ) => ipcRenderer.invoke('cache:save', { fileHash, language, work, data }),
})
