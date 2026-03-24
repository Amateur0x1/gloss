import type { CachedDocumentPayload, DocumentLanguage, LibraryDocument } from './types'

/// <reference types="vite/client" />

declare global {
  interface Window {
    desktopApp?: {
      platform: string
      listCachedDocuments?: () => Promise<LibraryDocument[]>
      deleteCachedDocuments?: (
        entries: Array<{
          fileHash: string
          language: DocumentLanguage
        }>,
      ) => Promise<number>
      loadCachedDocument?: (
        fileHash: string,
        language: DocumentLanguage,
      ) => Promise<CachedDocumentPayload | null>
      saveCachedDocument?: (
        fileHash: string,
        language: DocumentLanguage,
        work: {
          key: string
          title: string
        },
        data: CachedDocumentPayload,
      ) => Promise<boolean>
    }
  }
}

export {}
