import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

import { app } from 'electron'

const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite')

type CachedIndexRow = {
  document_json: string
  embeddings_json: string
}

type LibraryRow = {
  file_hash: string
  language: 'zh' | 'en'
  work_key: string | null
  work_title: string | null
  work_title_zh: string | null
  work_title_en: string | null
  document_json: string
  updated_at: string
}

export type CachedIndexPayload = {
  document: {
    fileName: string
    language: 'zh' | 'en'
    pageCount: number
    fullText: string
    segments: Array<{
      id: string
      index: number
      page: number
      text: string
      language: 'zh' | 'en'
    }>
  }
  embeddings: number[][]
}

export type LibraryDocumentRecord = {
  fileHash: string
  language: 'zh' | 'en'
  fileName: string
  workKey: string
  workTitle: string
  workTitleZh?: string
  workTitleEn?: string
  pageCount: number
  segmentCount: number
  updatedAt: string
}

let database: InstanceType<typeof DatabaseSync> | null = null

export function initializeCacheDatabase() {
  if (database) {
    return database
  }

  const userDataPath = app.getPath('userData')
  mkdirSync(userDataPath, { recursive: true })

  const databasePath = path.join(userDataPath, 'gloss-cache.sqlite')
  database = new DatabaseSync(databasePath)
  database.exec(`
    CREATE TABLE IF NOT EXISTS works (
      work_key TEXT PRIMARY KEY,
      title_zh TEXT,
      title_en TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cached_indexes (
      cache_key TEXT PRIMARY KEY,
      file_hash TEXT NOT NULL,
      language TEXT NOT NULL,
      work_key TEXT,
      work_title TEXT,
      document_json TEXT NOT NULL,
      embeddings_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  ensureColumn(database, 'work_key', 'TEXT')
  ensureColumn(database, 'work_title', 'TEXT')
  backfillWorks(database)

  return database
}

export function loadCachedIndex(fileHash: string, language: 'zh' | 'en'): CachedIndexPayload | null {
  const db = initializeCacheDatabase()
  const row = db
    .prepare('SELECT document_json, embeddings_json FROM cached_indexes WHERE cache_key = ?')
    .get(createCacheKey(fileHash, language)) as CachedIndexRow | undefined

  if (!row) {
    return null
  }

  return {
    document: JSON.parse(row.document_json),
    embeddings: JSON.parse(row.embeddings_json),
  } satisfies CachedIndexPayload
}

export function saveCachedIndex(
  fileHash: string,
  language: 'zh' | 'en',
  payload: CachedIndexPayload,
  work: {
    key: string
    title: string
  },
) {
  const db = initializeCacheDatabase()
  const languageTitle = prettifyWorkTitle(payload.document.fileName)
  db.prepare(`
    INSERT INTO works (work_key, title_zh, title_en, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(work_key) DO UPDATE SET
      title_zh = COALESCE(excluded.title_zh, works.title_zh),
      title_en = COALESCE(excluded.title_en, works.title_en),
      updated_at = CURRENT_TIMESTAMP
  `).run(
    work.key,
    language === 'zh' ? languageTitle : null,
    language === 'en' ? languageTitle : null,
  )

  db.prepare(`
    INSERT INTO cached_indexes (
      cache_key,
      file_hash,
      language,
      work_key,
      work_title,
      document_json,
      embeddings_json,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(cache_key) DO UPDATE SET
      work_key = excluded.work_key,
      work_title = excluded.work_title,
      document_json = excluded.document_json,
      embeddings_json = excluded.embeddings_json,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    createCacheKey(fileHash, language),
    fileHash,
    language,
    work.key,
    work.title,
    JSON.stringify(payload.document),
    JSON.stringify(payload.embeddings),
  )
}

export function listCachedIndexes(): LibraryDocumentRecord[] {
  const db = initializeCacheDatabase()
  const rows = db
    .prepare(
      `SELECT
        ci.file_hash,
        ci.language,
        ci.work_key,
        ci.work_title,
        w.title_zh AS work_title_zh,
        w.title_en AS work_title_en,
        ci.document_json,
        ci.updated_at
      FROM cached_indexes ci
      LEFT JOIN works w ON w.work_key = ci.work_key
      ORDER BY ci.updated_at DESC`,
    )
    .all() as LibraryRow[]

  return rows.map((row) => {
    const document = JSON.parse(row.document_json) as CachedIndexPayload['document']
    const fallbackTitle = prettifyWorkTitle(document.fileName)
    const fallbackKey = normalizeWorkTitle(document.fileName)
    const titleZh =
      row.language === 'zh'
        ? fallbackTitle
        : (row.work_title_zh ?? undefined)
    const titleEn =
      row.language === 'en'
        ? fallbackTitle
        : (row.work_title_en ?? undefined)

    return {
      fileHash: row.file_hash,
      language: row.language,
      fileName: document.fileName,
      workKey: row.work_key ?? fallbackKey,
      workTitle:
        row.language === 'zh'
          ? (titleZh ?? row.work_title ?? fallbackTitle)
          : (titleEn ?? row.work_title ?? fallbackTitle),
      workTitleZh: titleZh,
      workTitleEn: titleEn,
      pageCount: document.pageCount,
      segmentCount: document.segments.length,
      updatedAt: row.updated_at,
    }
  })
}

export function deleteCachedIndexes(
  entries: Array<{
    fileHash: string
    language: 'zh' | 'en'
  }>,
) {
  if (entries.length === 0) {
    return 0
  }

  const db = initializeCacheDatabase()
  const statement = db.prepare('DELETE FROM cached_indexes WHERE cache_key = ?')
  let deletedCount = 0

  for (const entry of entries) {
    const result = statement.run(createCacheKey(entry.fileHash, entry.language))
    deletedCount += Number(result.changes ?? 0)
  }

  db.prepare(`
    DELETE FROM works
    WHERE work_key NOT IN (
      SELECT DISTINCT work_key FROM cached_indexes WHERE work_key IS NOT NULL
    )
  `).run()

  return deletedCount
}

function createCacheKey(fileHash: string, language: 'zh' | 'en') {
  return `${fileHash}:${language}`
}

function ensureColumn(db: InstanceType<typeof DatabaseSync>, columnName: string, type: string) {
  const columns = db.prepare('PRAGMA table_info(cached_indexes)').all() as Array<{ name: string }>
  if (columns.some((column) => column.name === columnName)) {
    return
  }

  db.exec(`ALTER TABLE cached_indexes ADD COLUMN ${columnName} ${type}`)
}

function backfillWorks(db: InstanceType<typeof DatabaseSync>) {
  const rows = db.prepare(
    'SELECT DISTINCT work_key, language, work_title FROM cached_indexes WHERE work_key IS NOT NULL',
  ).all() as Array<{ work_key: string; language: 'zh' | 'en'; work_title: string | null }>

  const grouped = new Map<string, { zh?: string; en?: string }>()
  for (const row of rows) {
    const existing = grouped.get(row.work_key) ?? {}
    if (row.language === 'zh' && row.work_title) {
      existing.zh = row.work_title
    }
    if (row.language === 'en' && row.work_title) {
      existing.en = row.work_title
    }
    grouped.set(row.work_key, existing)
  }

  const statement = db.prepare(`
    INSERT INTO works (work_key, title_zh, title_en, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(work_key) DO UPDATE SET
      title_zh = COALESCE(excluded.title_zh, works.title_zh),
      title_en = COALESCE(excluded.title_en, works.title_en)
  `)

  for (const [workKey, titles] of grouped) {
    statement.run(workKey, titles.zh ?? null, titles.en ?? null)
  }
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
