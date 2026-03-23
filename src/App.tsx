import { startTransition, useEffect, useMemo, useRef, useState } from 'react'

import './App.css'
import { findTopMatches } from './lib/alignment'
import type {
  DocumentLanguage,
  DocumentSlotState,
  ProcessDocumentPayload,
  ProcessDocumentResponse,
  WorkerEnvelope,
} from './types'

const INITIAL_SLOT: DocumentSlotState = {
  status: 'idle',
  detail: '等待导入 PDF',
}

const DocumentWorker = new URL('./workers/document-worker.ts', import.meta.url)

const SIDE_CONFIG: Record<DocumentLanguage, { title: string; subtitle: string }> = {
  zh: {
    title: '中文译本',
    subtitle: '选择你正在阅读的中译 PDF',
  },
  en: {
    title: '英文原文',
    subtitle: '导入对应的英文 PDF，建立本地向量索引',
  },
}

function App() {
  const [slots, setSlots] = useState<Record<DocumentLanguage, DocumentSlotState>>({
    zh: INITIAL_SLOT,
    en: INITIAL_SLOT,
  })
  const [selectedSourceIndex, setSelectedSourceIndex] = useState(0)
  const [globalStatus, setGlobalStatus] = useState('准备就绪')
  const [error, setError] = useState<string | null>(null)

  const chineseInputRef = useRef<HTMLInputElement>(null)
  const englishInputRef = useRef<HTMLInputElement>(null)
  const workerRefs = useRef<Partial<Record<DocumentLanguage, Worker>>>({})

  const chineseDoc = slots.zh.document
  const englishDoc = slots.en.document
  const chineseEmbeddings = slots.zh.embeddings
  const englishEmbeddings = slots.en.embeddings

  const matches = useMemo(() => {
    if (!chineseDoc || !englishDoc || !chineseEmbeddings || !englishEmbeddings) {
      return []
    }

    return findTopMatches(
      chineseEmbeddings,
      englishEmbeddings,
      selectedSourceIndex,
      5,
    )
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
      detail: '正在解析 PDF 文本',
      document: undefined,
      embeddings: undefined,
    })
    setGlobalStatus(`正在处理 ${file.name}`)

    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const result = await processDocumentInWorker({
        requestId: crypto.randomUUID(),
        fileName: file.name,
        language,
        bytes,
      })

      patchSlot(language, {
        status: 'ready',
        detail: `完成索引，${result.document.pageCount} 页 / ${result.document.segments.length} 个片段`,
        document: result.document,
        embeddings: result.embeddings,
      })

      setGlobalStatus(`已完成 ${file.name} 的本地建库`)

      if (language === 'zh') {
        setSelectedSourceIndex(0)
      }
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

    const worker = new Worker(DocumentWorker, { type: 'module' })
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
        reject(new Error(event.message || 'Worker 处理失败'))
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

  return (
    <main className="app-shell">
      <header className="hero-panel">
        <div>
          <p className="eyebrow">Parallel Text Finder</p>
          <h1>本地 PDF 多语言对读</h1>
          <p className="hero-copy">
            把中译本和英译本都放进来，桌面端会在本机完成文本抽取、向量化和跨语言匹配。
            选中左侧中文句段，右侧会自动定位最可能对应的英文原文。
          </p>
        </div>
        <div className="status-cluster">
          <span className="status-pill">macOS Desktop</span>
          <span className="status-pill">
            {window.desktopApp?.platform ? `Platform: ${window.desktopApp.platform}` : 'Electron'}
          </span>
          <span className="status-pill accent">Embedding: Multilingual MiniLM</span>
        </div>
      </header>

      <section className="control-grid">
        {(['zh', 'en'] as DocumentLanguage[]).map((language) => {
          const slot = slots[language]
          const side = SIDE_CONFIG[language]

          return (
            <article key={language} className="import-card">
              <div className="import-card__header">
                <div>
                  <p className="panel-tag">{language === 'zh' ? 'Source' : 'Target'}</p>
                  <h2>{side.title}</h2>
                  <p>{side.subtitle}</p>
                </div>
                <button className="primary-button" onClick={() => openPicker(language)}>
                  {slot.document ? '重新导入' : '选择 PDF'}
                </button>
              </div>

              <dl className="meta-grid">
                <div>
                  <dt>文件</dt>
                  <dd>{slot.fileName ?? '未选择'}</dd>
                </div>
                <div>
                  <dt>状态</dt>
                  <dd>{renderStatus(slot.status)}</dd>
                </div>
                <div>
                  <dt>片段</dt>
                  <dd>{slot.document?.segments.length ?? 0}</dd>
                </div>
                <div>
                  <dt>页数</dt>
                  <dd>{slot.document?.pageCount ?? 0}</dd>
                </div>
              </dl>

              <p className="slot-detail">{slot.detail}</p>
            </article>
          )
        })}
      </section>

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

      <section className="notice-bar">
        <p>{globalStatus}</p>
        <p>首次使用会下载模型到本地缓存。之后同一台机器可重复复用。</p>
      </section>

      {error ? <section className="error-banner">{error}</section> : null}

      {readyToCompare && selectedSource && selectedTarget ? (
        <>
          <section className="match-hero">
            <div className="match-card">
              <p className="panel-tag">当前中文片段</p>
              <p className="quote">{selectedSource.text}</p>
              <p className="quote-meta">第 {selectedSource.page} 页</p>
            </div>
            <div className="match-card match-card--accent">
              <p className="panel-tag">最可能对应的英文原文</p>
              <p className="quote">{selectedTarget.text}</p>
              <p className="quote-meta">
                第 {selectedTarget.page} 页 · 相关度 {(bestMatch.score * 100).toFixed(1)}%
              </p>
            </div>
          </section>

          <section className="reader-layout">
            <article className="reader-panel">
              <div className="reader-panel__header">
                <h2>中文句段</h2>
                <p>点击左侧任意一句，右边会自动定位最相近的英文段落。</p>
              </div>
              <div className="segment-list">
                {chineseDoc.segments.map((segment) => (
                  <button
                    key={segment.id}
                    className={`segment-card ${
                      segment.index === selectedSourceIndex ? 'segment-card--active' : ''
                    }`}
                    onClick={() =>
                      startTransition(() => {
                        setSelectedSourceIndex(segment.index)
                      })
                    }
                  >
                    <span className="segment-page">P.{segment.page}</span>
                    <span>{segment.text}</span>
                  </button>
                ))}
              </div>
            </article>

            <article className="reader-panel">
              <div className="reader-panel__header">
                <h2>英文句段</h2>
                <p>顶部展示最优命中，列表里高亮对应位置，方便继续对读。</p>
              </div>

              <div className="match-list">
                {matches.map((match, index) => {
                  const segment = englishDoc.segments[match.targetIndex]
                  if (!segment) {
                    return null
                  }

                  return (
                    <div key={`${segment.id}-${index}`} className="match-chip">
                      <span>Top {index + 1}</span>
                      <strong>{(match.score * 100).toFixed(1)}%</strong>
                      <span>{segment.text.slice(0, 72)}{segment.text.length > 72 ? '...' : ''}</span>
                    </div>
                  )
                })}
              </div>

              <div className="segment-list">
                {englishDoc.segments.map((segment) => {
                  const rank = matches.findIndex((match) => match.targetIndex === segment.index)

                  return (
                    <div
                      key={segment.id}
                      data-target-segment={segment.index}
                      className={`segment-card segment-card--static ${
                        rank === 0 ? 'segment-card--matched' : ''
                      } ${rank > 0 ? 'segment-card--secondary' : ''}`}
                    >
                      <div className="segment-topline">
                        <span className="segment-page">P.{segment.page}</span>
                        {rank >= 0 ? <span className="rank-badge">Top {rank + 1}</span> : null}
                      </div>
                      <span>{segment.text}</span>
                    </div>
                  )
                })}
              </div>
            </article>
          </section>
        </>
      ) : (
        <section className="empty-state">
          <h2>先导入中英两个 PDF</h2>
          <p>
            第一版聚焦“本地文本抽取 + 句段对齐”。也就是说，我们先把 PDF 提取成可读文本，再做跨语言向量匹配，
            这样能比较稳定地完成中英对读。
          </p>
        </section>
      )}
    </main>
  )
}

function isWorkerEnvelope(value: unknown): value is WorkerEnvelope<ProcessDocumentResponse> {
  if (!value || typeof value !== 'object') {
    return false
  }

  const maybeEnvelope = value as Partial<WorkerEnvelope<ProcessDocumentResponse>>
  return (
    maybeEnvelope.channel === 'document-processing' &&
    typeof maybeEnvelope.requestId === 'string' &&
    !!maybeEnvelope.payload &&
    typeof maybeEnvelope.payload === 'object' &&
    'type' in maybeEnvelope.payload
  )
}

function renderStatus(status: DocumentSlotState['status']) {
  switch (status) {
    case 'idle':
      return '等待导入'
    case 'extracting':
      return '解析中'
    case 'embedding':
      return '向量化中'
    case 'ready':
      return '可对读'
    case 'error':
      return '失败'
    default:
      return status
  }
}

export default App
