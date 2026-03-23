/// <reference lib="webworker" />

import { embedTexts } from '../lib/embeddings'
import { extractPdfDocument } from '../lib/pdf'
import type {
  ProcessDocumentPayload,
  ProcessDocumentResponse,
  WorkerEnvelope,
} from '../types'

let activeRequestId = ''

self.onmessage = async (event: MessageEvent<ProcessDocumentPayload>) => {
  const payload = event.data
  activeRequestId = payload.requestId

  try {
    postProgress({
      type: 'progress',
      stage: 'extracting',
      detail: '正在解析 PDF 文本',
    })

    const document = await extractPdfDocument(
      {
        bytes: payload.bytes,
        fileName: payload.fileName,
      },
      payload.language,
    )

    postProgress({
      type: 'progress',
      stage: 'embedding',
      detail: `已切出 ${document.segments.length} 个片段，正在生成向量`,
    })

    const embeddings = await embedTexts(document.segments.map((segment) => segment.text), (detail) => {
      postProgress({
        type: 'progress',
        stage: 'embedding',
        detail:
          detail === 'Downloading multilingual embedding model'
            ? '首次运行会下载多语言向量模型'
            : detail,
      })
    })

    self.postMessage({
      channel: 'document-processing',
      requestId: payload.requestId,
      payload: {
        type: 'success',
        document,
        embeddings,
      },
    } satisfies WorkerEnvelope<Extract<ProcessDocumentResponse, { type: 'success' }>>)
  } catch (caught) {
    self.postMessage({
      channel: 'document-processing',
      requestId: payload.requestId,
      payload: {
        type: 'error',
        message: caught instanceof Error ? caught.message : '未知错误',
      },
    } satisfies WorkerEnvelope<Extract<ProcessDocumentResponse, { type: 'error' }>>)
  }
}

function postProgress(message: Extract<ProcessDocumentResponse, { type: 'progress' }>) {
  self.postMessage({
    channel: 'document-processing',
    requestId: activeRequestId,
    payload: message,
  } satisfies WorkerEnvelope<Extract<ProcessDocumentResponse, { type: 'progress' }>>)
}

export {}
