import { useEffect, useMemo, useRef, useState } from 'react'

import './App.css'
import { HeroPanel } from './components/HeroPanel'
import { ImportCard } from './components/ImportCard'
import { LibraryShelf, type LibraryWork } from './components/LibraryShelf'
import { MatchHero } from './components/MatchHero'
import { ReaderColumns } from './components/ReaderColumns'
import { SidebarNav } from './components/SidebarNav'
import { WindowToolbar } from './components/WindowToolbar'
import { INITIAL_SLOT, isWorkerEnvelope, renderStatus, SIDE_CONFIG } from './config/ui'
import { findTopMatches } from './lib/alignment'
import type {
  CachedDocumentPayload,
  DocumentLanguage,
  DocumentSlotState,
  LibraryDocument,
  ProcessDocumentPayload,
  ProcessDocumentResponse,
  WorkerEnvelope,
} from './types'
import DocumentWorker from './workers/document-worker.ts?worker'

const PREFERRED_LANGUAGE_STORAGE_KEY = 'gloss.preferredLanguage'
type AppPage = 'library' | 'import' | 'reader'

function App() {
  const [slots, setSlots] = useState<Record<DocumentLanguage, DocumentSlotState>>({
    zh: INITIAL_SLOT,
    en: INITIAL_SLOT,
  })
  const [selectedSourceIndex, setSelectedSourceIndex] = useState(0)
  const [globalStatus, setGlobalStatus] = useState('准备就绪')
  const [error, setError] = useState<string | null>(null)
  const [libraryDocuments, setLibraryDocuments] = useState<LibraryDocument[]>([])
  const [preferredLanguage, setPreferredLanguage] = useState<DocumentLanguage>(() =>
    readPreferredLanguage(),
  )
  const [activePage, setActivePage] = useState<AppPage>('library')

  const chineseInputRef = useRef<HTMLInputElement>(null)
  const englishInputRef = useRef<HTMLInputElement>(null)
  const workerRefs = useRef<Partial<Record<DocumentLanguage, Worker>>>({})

  const chineseDoc = slots.zh.document
  const englishDoc = slots.en.document
  const chineseEmbeddings = slots.zh.embeddings
  const englishEmbeddings = slots.en.embeddings
  const libraryWorks = useMemo(() => groupLibraryDocuments(libraryDocuments), [libraryDocuments])

  const matches = useMemo(() => {
    if (!chineseDoc || !englishDoc || !chineseEmbeddings || !englishEmbeddings) {
      return []
    }

    return findTopMatches(chineseEmbeddings, englishEmbeddings, selectedSourceIndex, 5)
  }, [chineseDoc, chineseEmbeddings, englishDoc, englishEmbeddings, selectedSourceIndex])

  const bestMatch = matches[0]

  useEffect(() => {
    if (bestMatch === undefined) {
      return
    }

    const target = document.querySelector<HTMLElement>(
      `[data-target-segment="${bestMatch.targetIndex}"]`,
    )

    target?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }, [bestMatch])

  useEffect(() => {
    void refreshLibrary()
  }, [])

  useEffect(() => {
    window.localStorage.setItem(PREFERRED_LANGUAGE_STORAGE_KEY, preferredLanguage)
  }, [preferredLanguage])

  const readyToCompare =
    chineseDoc !== undefined &&
    englishDoc !== undefined &&
    chineseEmbeddings !== undefined &&
    englishEmbeddings !== undefined

  const selectedSource = chineseDoc?.segments[selectedSourceIndex]
  const selectedTarget = bestMatch ? englishDoc?.segments[bestMatch.targetIndex] : undefined

  async function importDocument(language: DocumentLanguage, file: File) {
    setError(null)
    patchSlot(language, {
      status: 'extracting',
      fileName: file.name,
      detail: '正在检查本地缓存',
      document: undefined,
      embeddings: undefined,
    })
    setGlobalStatus(`正在处理 ${file.name}`)

    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const fileHash = await createFileHash(bytes)
      const cached = await loadCachedDocument(fileHash, language)
      const work = resolveWorkMetadata(file.name, language, slots, libraryDocuments)

      if (cached) {
        const cachedDocument = {
          ...cached.document,
          fileName: file.name,
        }

        patchSlot(language, {
          status: 'ready',
          fileName: file.name,
          workKey: work.key,
          workTitle: work.title,
          detail: `已从本地缓存恢复，${cachedDocument.pageCount} 页 / ${cachedDocument.segments.length} 个片段`,
          document: cachedDocument,
          embeddings: cached.embeddings,
        })
        setGlobalStatus(`已从本地缓存载入 ${file.name}`)

        if (language === 'zh') {
          setSelectedSourceIndex(0)
        }
        await saveCachedDocument(fileHash, language, {
          document: cachedDocument,
          embeddings: cached.embeddings,
        }, work)
        await refreshLibrary()
        return
      }

      patchSlot(language, {
        status: 'extracting',
        fileName: file.name,
        detail: '正在解析 PDF 文本',
        document: undefined,
        embeddings: undefined,
      })
      const result = await processDocumentInWorker({
        requestId: crypto.randomUUID(),
        fileName: file.name,
        language,
        bytes,
      })

      patchSlot(language, {
        status: 'ready',
        fileName: file.name,
        workKey: work.key,
        workTitle: work.title,
        detail: `完成索引，${result.document.pageCount} 页 / ${result.document.segments.length} 个片段`,
        document: result.document,
        embeddings: result.embeddings,
      })

      setGlobalStatus(`已完成 ${file.name} 的本地建库`)
      await saveCachedDocument(fileHash, language, {
        document: result.document,
        embeddings: result.embeddings,
      }, work)
      await refreshLibrary()

      if (language === 'zh') {
        setSelectedSourceIndex(0)
      }
      setActivePage('reader')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '未知错误'
      patchSlot(language, {
        status: 'error',
        detail: message,
      })
      setError(message)
      setGlobalStatus('处理失败')
    }
  }

  function processDocumentInWorker(payload: ProcessDocumentPayload) {
    const previousWorker = workerRefs.current[payload.language]
    previousWorker?.terminate()

    const worker = new DocumentWorker()
    workerRefs.current[payload.language] = worker

    return new Promise<Extract<ProcessDocumentResponse, { type: 'success' }>>((resolve, reject) => {
      worker.onmessage = (
        event: MessageEvent<WorkerEnvelope<ProcessDocumentResponse> | unknown>,
      ) => {
        const envelope = event.data

        if (!isWorkerEnvelope(envelope)) {
          return
        }

        if (envelope.channel !== 'document-processing' || envelope.requestId !== payload.requestId) {
          return
        }

        const message = envelope.payload

        if (message.type === 'progress') {
          patchSlot(payload.language, {
            status: message.stage,
            detail: message.detail,
          })
          return
        }

        if (message.type === 'error') {
          worker.terminate()
          delete workerRefs.current[payload.language]
          reject(new Error(message.message))
          return
        }

        if (message.type !== 'success' || !message.document || !Array.isArray(message.embeddings)) {
          worker.terminate()
          delete workerRefs.current[payload.language]
          reject(new Error('Worker 返回结果不完整，未拿到文档或向量数据'))
          return
        }

        worker.terminate()
        delete workerRefs.current[payload.language]
        resolve(message)
      }

      worker.onerror = (event) => {
        worker.terminate()
        delete workerRefs.current[payload.language]
        const location =
          event.filename && event.lineno
            ? ` (${event.filename}:${event.lineno}${event.colno ? `:${event.colno}` : ''})`
            : ''
        reject(new Error((event.message || 'Worker 处理失败') + location))
      }

      worker.onmessageerror = () => {
        worker.terminate()
        delete workerRefs.current[payload.language]
        reject(new Error('Worker 返回了无法反序列化的数据'))
      }

      worker.postMessage(payload, [payload.bytes.buffer])
    })
  }

  useEffect(() => {
    const workers = workerRefs.current

    return () => {
      Object.values(workers).forEach((worker) => worker?.terminate())
    }
  }, [])

  function patchSlot(language: DocumentLanguage, patch: Partial<DocumentSlotState>) {
    setSlots((current) => ({
      ...current,
      [language]: {
        ...current[language],
        ...patch,
      },
    }))
  }

  function openPicker(language: DocumentLanguage) {
    if (language === 'zh') {
      chineseInputRef.current?.click()
      return
    }

    englishInputRef.current?.click()
  }

  async function loadCachedDocument(fileHash: string, language: DocumentLanguage) {
    if (!window.desktopApp?.loadCachedDocument) {
      return null
    }

    return window.desktopApp.loadCachedDocument(fileHash, language)
  }

  async function saveCachedDocument(
    fileHash: string,
    language: DocumentLanguage,
    payload: CachedDocumentPayload,
    work: {
      key: string
      title: string
    },
  ) {
    if (!window.desktopApp?.saveCachedDocument) {
      return
    }

    await window.desktopApp.saveCachedDocument(fileHash, language, work, payload)
  }

  async function refreshLibrary() {
    if (!window.desktopApp?.listCachedDocuments) {
      return
    }

    const documents = await window.desktopApp.listCachedDocuments()
    setLibraryDocuments(documents)
  }

  async function deleteCachedWork(work: LibraryWork) {
    const title = resolveWorkDisplayTitle(work, preferredLanguage)
    const confirmed = window.confirm(`删除“${title}”的本地向量缓存？`)
    if (!confirmed || !window.desktopApp?.deleteCachedDocuments) {
      return
    }

    const entries = (Object.values(work.documents).filter(Boolean) as LibraryDocument[]).map((document) => ({
      fileHash: document.fileHash,
      language: document.language,
    }))

    await window.desktopApp.deleteCachedDocuments(entries)

    setSlots((current) => {
      const next = { ...current }
      for (const language of ['zh', 'en'] as DocumentLanguage[]) {
        if (current[language].workKey === work.id) {
          next[language] = { ...INITIAL_SLOT }
        }
      }
      return next
    })

    setSelectedSourceIndex(0)
    setError(null)
    setGlobalStatus(`已删除 ${title} 的本地缓存`)
    await refreshLibrary()
  }

  async function openCachedDocument(work: LibraryWork) {
    setError(null)
    const entries = (['zh', 'en'] as DocumentLanguage[])
      .map((language) => work.documents[language])
      .filter((value): value is LibraryDocument => Boolean(value))

    if (entries.length === 0) {
      setError('这部作品还没有可用的缓存版本。')
      return
    }

    for (const entry of entries) {
      patchSlot(entry.language, {
        status: 'extracting',
        fileName: entry.fileName,
        detail: '正在从本地书架载入',
        document: undefined,
        embeddings: undefined,
      })
    }

    let loadedCount = 0
    for (const entry of entries) {
      const cached = await loadCachedDocument(entry.fileHash, entry.language)
      if (!cached) {
        patchSlot(entry.language, {
          status: 'error',
          fileName: entry.fileName,
          detail: '缓存不存在或已损坏，请重新导入该文档。',
        })
        continue
      }

    patchSlot(entry.language, {
      status: 'ready',
      fileName: cached.document.fileName,
      workKey: entry.workKey,
      workTitle: entry.workTitle,
      detail: `已从本地书架载入，${cached.document.pageCount} 页 / ${cached.document.segments.length} 个片段`,
      document: cached.document,
      embeddings: cached.embeddings,
      })
      loadedCount += 1
    }

    if (work.documents.zh) {
      setSelectedSourceIndex(0)
    }

    if (loadedCount > 0) {
      setGlobalStatus(`已载入 ${work.title} 的 ${loadedCount} 个版本`)
      setActivePage('reader')
    } else {
      setError('这部作品的缓存不存在或已损坏，请重新导入。')
    }
  }

  return (
    <main className="app-shell">
      <input
        ref={chineseInputRef}
        hidden
        accept="application/pdf"
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            void importDocument('zh', file)
          }
          event.currentTarget.value = ''
        }}
      />
      <input
        ref={englishInputRef}
        hidden
        accept="application/pdf"
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            void importDocument('en', file)
          }
          event.currentTarget.value = ''
        }}
      />

      <div className="window-shell">
        <WindowToolbar platformLabel={window.desktopApp?.platform ?? 'Electron'} />
        <div className="workspace-shell">
          <SidebarNav activePage={activePage} onChange={setActivePage} />

          <div className="workspace-main">
            {activePage === 'library' ? (
              <>
                <HeroPanel globalStatus={globalStatus} />
                <LibraryShelf
                  works={libraryWorks}
                  preferredLanguage={preferredLanguage}
                  onPreferredLanguageChange={setPreferredLanguage}
                  onOpen={openCachedDocument}
                  onDelete={(work) => {
                    void deleteCachedWork(work)
                  }}
                />
              </>
            ) : null}

            {activePage === 'import' ? (
              <>
                <HeroPanel globalStatus={globalStatus} />
                <section className="control-grid">
                  {(['zh', 'en'] as DocumentLanguage[]).map((language) => {
                    const slot = slots[language]
                    const side = SIDE_CONFIG[language]

                    return (
                      <ImportCard
                        key={language}
                        language={language}
                        slot={slot}
                        title={side.title}
                        subtitle={side.subtitle}
                        statusLabel={renderStatus(slot.status)}
                        onImport={() => openPicker(language)}
                      />
                    )
                  })}
                </section>
              </>
            ) : null}

            {activePage === 'reader' ? (
              <>
                <section className="notice-bar">
                  <p>{globalStatus}</p>
                  <p>首次使用会下载模型到本地缓存。之后同一台机器可重复复用。</p>
                </section>

                {error ? <section className="error-banner">{error}</section> : null}

                {readyToCompare && selectedSource && selectedTarget ? (
                  <>
                    <MatchHero
                      sourceText={selectedSource.text}
                      sourcePage={selectedSource.page}
                      targetText={selectedTarget.text}
                      targetPage={selectedTarget.page}
                      score={bestMatch.score}
                    />

                    <ReaderColumns
                      chineseDoc={chineseDoc}
                      englishDoc={englishDoc}
                      selectedSourceIndex={selectedSourceIndex}
                      matches={matches}
                      onSelectSource={setSelectedSourceIndex}
                    />
                  </>
                ) : (
                  <section className="empty-state">
                    <p className="panel-tag">Reader</p>
                    <h2>从书架选择一部作品，或先导入两个版本</h2>
                    <p>当同一部作品下已有多语言版本时，点击书架卡片就会自动载入到这里。</p>
                  </section>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  )
}

export default App

function readPreferredLanguage(): DocumentLanguage {
  if (typeof window === 'undefined') {
    return 'zh'
  }

  const stored = window.localStorage.getItem(PREFERRED_LANGUAGE_STORAGE_KEY)
  return stored === 'en' ? 'en' : 'zh'
}

async function createFileHash(bytes: Uint8Array) {
  const input = new Uint8Array(bytes.byteLength)
  input.set(bytes)
  const digest = await crypto.subtle.digest('SHA-256', input.buffer as ArrayBuffer)
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

function groupLibraryDocuments(documents: LibraryDocument[]): LibraryWork[] {
  const groups = new Map<string, LibraryWork>()

  for (const document of documents) {
    const key = document.workKey
    const existing = groups.get(key)

    if (existing) {
      existing.documents[document.language] = document
      if (new Date(document.updatedAt) > new Date(existing.updatedAt)) {
        existing.updatedAt = document.updatedAt
      }
      continue
    }

    groups.set(key, {
      id: key,
      title: document.workTitle,
      documents: {
        [document.language]: document,
      },
      updatedAt: document.updatedAt,
    })
  }

  return Array.from(groups.values()).sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  )
}

function normalizeWorkTitle(fileName: string) {
  return stripExtension(fileName)
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\b(zh|cn|中文|中译本|译本|en|eng|english|英文|原文|de|deu|german|德文)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function prettifyWorkTitle(fileName: string) {
  return stripExtension(fileName)
    .replace(/[_-]+/g, ' ')
    .replace(/\b(zh|cn|中文|中译本|译本|en|eng|english|英文|原文|de|deu|german|德文)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '')
}

function resolveWorkMetadata(
  fileName: string,
  language: DocumentLanguage,
  slots: Record<DocumentLanguage, DocumentSlotState>,
  libraryDocuments: LibraryDocument[],
) {
  const oppositeLanguage: DocumentLanguage = language === 'zh' ? 'en' : 'zh'
  const oppositeSlot = slots[oppositeLanguage]
  if (oppositeSlot?.workKey && oppositeSlot.workTitle) {
    return {
      key: oppositeSlot.workKey,
      title: oppositeSlot.workTitle,
    }
  }

  const normalizedTitle = normalizeWorkTitle(fileName)
  const relatedDocument = libraryDocuments.find((document) => {
    if (document.language !== oppositeLanguage) {
      return false
    }

    if (document.workKey === normalizedTitle) {
      return true
    }

    return normalizeWorkTitle(document.fileName) === normalizedTitle
  })

  if (relatedDocument?.workKey && relatedDocument.workTitle) {
    return {
      key: relatedDocument.workKey,
      title: relatedDocument.workTitle,
    }
  }

  return {
    key: normalizedTitle,
    title: prettifyWorkTitle(fileName),
  }
}

function resolveWorkDisplayTitle(work: LibraryWork, preferredLanguage: DocumentLanguage) {
  const preferredDocument = work.documents[preferredLanguage]
  if (preferredLanguage === 'zh' && preferredDocument?.workTitleZh) {
    return preferredDocument.workTitleZh
  }
  if (preferredLanguage === 'en' && preferredDocument?.workTitleEn) {
    return preferredDocument.workTitleEn
  }
  if (preferredDocument?.workTitle) {
    return preferredDocument.workTitle
  }

  const fallbackLanguage: DocumentLanguage = preferredLanguage === 'zh' ? 'en' : 'zh'
  const fallbackDocument = work.documents[fallbackLanguage]
  if (fallbackLanguage === 'zh' && fallbackDocument?.workTitleZh) {
    return fallbackDocument.workTitleZh
  }
  if (fallbackLanguage === 'en' && fallbackDocument?.workTitleEn) {
    return fallbackDocument.workTitleEn
  }
  return fallbackDocument?.workTitle ?? work.title
}
