import * as pdfjs from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import type { DocumentLanguage, DocumentSegment, ParsedPdfDocument } from '../types'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

type PdfTextToken = {
  text: string
  x: number
  y: number
}

const CHINESE_BREAKS = /(?<=[。！？；])/u
const ENGLISH_BREAKS = /(?<=[.!?;:])/u

export async function extractPdfDocument(
  input: File | { bytes: Uint8Array; fileName: string },
  language: DocumentLanguage,
): Promise<ParsedPdfDocument> {
  const bytes =
    input instanceof File ? new Uint8Array(await input.arrayBuffer()) : input.bytes
  const loadingTask = pdfjs.getDocument({ data: bytes })
  const pdf = await loadingTask.promise

  const segments: DocumentSegment[] = []
  const pageTexts: string[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const textContent = await page.getTextContent()
    const tokens = textContent.items
      .filter((item) => 'str' in item && typeof item.str === 'string')
      .map((item) => ({
        text: (item as { str: string }).str.trim(),
        x: (item as { transform: number[] }).transform[4] ?? 0,
        y: (item as { transform: number[] }).transform[5] ?? 0,
      }))
      .filter((item) => item.text.length > 0)

    const lines = buildLines(tokens, language)
    const pageText = lines.join('\n').trim()
    if (!pageText) {
      continue
    }

    pageTexts.push(pageText)

    const pageSegments = splitIntoSegments(pageText, language).map((text, index) => ({
      id: `${language}-${pageNumber}-${index}`,
      index: segments.length + index,
      page: pageNumber,
      text,
      language,
    }))

    segments.push(...pageSegments)
  }

  return {
    fileName: input instanceof File ? input.name : input.fileName,
    language,
    pageCount: pdf.numPages,
    fullText: pageTexts.join('\n\n'),
    segments,
  }
}

function buildLines(tokens: PdfTextToken[], language: DocumentLanguage) {
  const ordered = [...tokens].sort((left, right) => {
    const deltaY = right.y - left.y
    if (Math.abs(deltaY) > 2) {
      return deltaY
    }

    return left.x - right.x
  })

  const lines: PdfTextToken[][] = []

  for (const token of ordered) {
    const line = lines.find((entry) => Math.abs(entry[0].y - token.y) <= 2)
    if (line) {
      line.push(token)
    } else {
      lines.push([token])
    }
  }

  return lines.map((line) =>
    joinTokens(
      line
        .sort((left, right) => left.x - right.x)
        .map((token) => token.text)
        .filter(Boolean),
      language,
    ),
  )
}

function joinTokens(tokens: string[], language: DocumentLanguage) {
  if (language === 'zh') {
    return tokens.join('').replace(/\s+/g, '')
  }

  return tokens
    .join(' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/([(])\s+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitIntoSegments(text: string, language: DocumentLanguage) {
  const normalized = text
    .split(String.fromCharCode(0))
    .join('')
    .replace(/[ \t]+/g, language === 'zh' ? '' : ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!normalized) {
    return []
  }

  const blocks = normalized
    .split(/\n{2,}/)
    .flatMap((block) => block.split(language === 'zh' ? CHINESE_BREAKS : ENGLISH_BREAKS))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
    .flatMap((sentence) => splitLongSentence(sentence, language))

  return mergeShortSegments(blocks, language)
}

function splitLongSentence(sentence: string, language: DocumentLanguage) {
  const limit = language === 'zh' ? 80 : 220
  if (sentence.length <= limit) {
    return [sentence]
  }

  const delimiter = language === 'zh' ? /(?<=[，、])/u : /(?<=[,])/u
  return sentence
    .split(delimiter)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

function mergeShortSegments(sentences: string[], language: DocumentLanguage) {
  const minLength = language === 'zh' ? 16 : 48
  const output: string[] = []
  let buffer = ''

  for (const sentence of sentences) {
    const next = buffer
      ? `${buffer}${language === 'zh' ? '' : ' '}${sentence}`.trim()
      : sentence

    if (next.length < minLength) {
      buffer = next
      continue
    }

    if (buffer) {
      output.push(next)
      buffer = ''
      continue
    }

    output.push(sentence)
  }

  if (buffer) {
    output.push(buffer)
  }

  return output
}
