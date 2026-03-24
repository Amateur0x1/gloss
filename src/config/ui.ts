import type { DocumentLanguage, DocumentSlotState, ProcessDocumentResponse, WorkerEnvelope } from '../types'

export const INITIAL_SLOT: DocumentSlotState = {
  status: 'idle',
  detail: '等待导入 PDF',
}

export const SIDE_CONFIG: Record<DocumentLanguage, { title: string; subtitle: string }> = {
  zh: {
    title: '中文译本',
    subtitle: '选择你正在阅读的中译 PDF',
  },
  en: {
    title: '英文原文',
    subtitle: '导入对应的英文 PDF，建立本地向量索引',
  },
}

export function isWorkerEnvelope(value: unknown): value is WorkerEnvelope<ProcessDocumentResponse> {
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

export function renderStatus(status: DocumentSlotState['status']) {
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
