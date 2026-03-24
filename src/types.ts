export type DocumentLanguage = 'zh' | 'en'

export interface DocumentSegment {
  id: string
  index: number
  page: number
  text: string
  language: DocumentLanguage
}

export interface ParsedPdfDocument {
  fileName: string
  language: DocumentLanguage
  pageCount: number
  fullText: string
  segments: DocumentSegment[]
}

export interface MatchResult {
  targetIndex: number
  score: number
  baseScore: number
}

export interface DocumentSlotState {
  status: 'idle' | 'extracting' | 'embedding' | 'ready' | 'error'
  detail: string
  fileName?: string
  workKey?: string
  workTitle?: string
  document?: ParsedPdfDocument
  embeddings?: number[][]
}

export interface ProcessDocumentPayload {
  requestId: string
  fileName: string
  language: DocumentLanguage
  bytes: Uint8Array
}

export interface WorkerEnvelope<T extends ProcessDocumentResponse> {
  channel: 'document-processing'
  requestId: string
  payload: T
}

export interface ProcessDocumentSuccess {
  type: 'success'
  document: ParsedPdfDocument
  embeddings: number[][]
}

export interface CachedDocumentPayload {
  document: ParsedPdfDocument
  embeddings: number[][]
}

export interface LibraryDocument {
  fileHash: string
  language: DocumentLanguage
  fileName: string
  workKey: string
  workTitle: string
  workTitleZh?: string
  workTitleEn?: string
  pageCount: number
  segmentCount: number
  updatedAt: string
}

export interface ProcessDocumentProgress {
  type: 'progress'
  stage: 'extracting' | 'embedding'
  detail: string
}

export interface ProcessDocumentError {
  type: 'error'
  message: string
}

export type ProcessDocumentResponse =
  | ProcessDocumentSuccess
  | ProcessDocumentProgress
  | ProcessDocumentError
