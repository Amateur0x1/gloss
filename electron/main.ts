import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import {
  deleteCachedIndexes,
  initializeCacheDatabase,
  listCachedIndexes,
  loadCachedIndex,
  saveCachedIndex,
} from './cache-db'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function createWindow() {
  const window = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1200,
    minHeight: 760,
    title: 'Gloss',
    backgroundColor: '#f3ede0',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  window.setMenuBarVisibility(false)

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void window.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  initializeCacheDatabase()

  ipcMain.handle('cache:load', (_event, payload: { fileHash: string; language: 'zh' | 'en' }) => {
    return loadCachedIndex(payload.fileHash, payload.language)
  })

  ipcMain.handle('cache:list', () => {
    return listCachedIndexes()
  })

  ipcMain.handle(
    'cache:delete',
    (
      _event,
      payload: {
        entries: Array<{
          fileHash: string
          language: 'zh' | 'en'
        }>
      },
    ) => {
      return deleteCachedIndexes(payload.entries)
    },
  )

  ipcMain.handle(
    'cache:save',
    (
      _event,
      payload: {
        fileHash: string
        language: 'zh' | 'en'
        work: {
          key: string
          title: string
        }
        data: Parameters<typeof saveCachedIndex>[2]
      },
    ) => {
      saveCachedIndex(payload.fileHash, payload.language, payload.data, payload.work)
      return true
    },
  )

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
