/**
 * PDF text extraction via pdf-parse v2 (`new PDFParse({ data })` +
 * `getText()`), with slicing for model-facing reads.
 * @module dsh-scholar-search/pdf
 */

import { readFile } from 'node:fs/promises'
import { PDFParse } from 'pdf-parse'
import { normalizeDoi } from './http.js'
import { normalizeTitle } from './paper.js'
import type { PaperMeta } from './types.js'

/** Extracted text with the page count. */
export interface PdfText {
  text: string
  pages: number
}

/**
 * Extract text from PDF bytes.
 * @param data - PDF bytes.
 * @returns the concatenated page text and page count.
 */
export async function extractPdfText(data: Uint8Array): Promise<PdfText> {
  const pdf = new PDFParse({ data })
  try {
    const result = await pdf.getText()
    return { text: result.text, pages: result.total }
  } finally {
    await pdf.destroy()
  }
}

export type PdfVerification = 'matched' | 'unverified' | 'content-mismatch'

/** 用首页的题名和 DOI 核对文件身份。缺少能判定身份的证据时留给人工核验。 */
export async function verifyPdfContent(data: Uint8Array, paper: PaperMeta): Promise<PdfVerification> {
  const doi = normalizeDoi(paper.doi)
  const title = normalizeDoi(paper.title) === undefined && !/^(arXiv:|PMID\s+\d+$)/i.test(paper.title)
    ? normalizeTitle(paper.title) : ''
  const hasTitle = title.length >= 8 || /^\p{Script=Han}{4,}$/u.test(title)
  if (doi === undefined && !hasTitle) return 'unverified'
  // PDF.js 可能接管传入的缓冲区，保留原始候选用于落盘。
  const pdf = new PDFParse({ data: data.slice() })
  try {
    const { pages } = await pdf.getText({ partial: [1] })
    const firstPage = (pages[0]?.text ?? '').split(/^\s*(?:references|bibliography|参考文献)\s*$/im, 1)[0] ?? ''
    const heading = firstPage.slice(0, 1800)
    const normalizedHeading = ' ' + normalizeTitle(heading.replace(/-\s*\r?\n\s*/g, '')) + ' '
    if (hasTitle && normalizedHeading.includes(' ' + title + ' ')) return 'matched'

    const dois = (text: string, pattern: RegExp) => [...text.matchAll(pattern)]
      .map((match) => normalizeDoi(match[1]?.replace(/[.,;]+$/, '')))
    if (doi !== undefined && dois(heading, /\b(10\.\d{4,9}\/[^\s<>"\u200b]+)/gi).includes(doi)) return 'matched'
    if (!heading.trim()) return 'unverified'
    const info = await pdf.getInfo()
    const xmpDoi = info.metadata?.get('prism:doi')
    const declaredDoi = typeof xmpDoi === 'string' ? normalizeDoi(xmpDoi) : undefined
    if (doi !== undefined && declaredDoi !== undefined) return declaredDoi === doi ? 'matched' : 'content-mismatch'
    // 只用摘要前的显式 DOI 作否定依据，避免拿正文里的引文 DOI 判断错配。
    const frontMatter = heading.split(/^\s*(?:abstract\b|摘要)/im, 1)[0] ?? ''
    const explicitDois = new Set(dois(frontMatter, /\bdoi\s*:\s*(?:https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/[^\s<>"\u200b]+)/gi).filter((item) => item !== undefined))
    if (doi !== undefined && explicitDois.size === 1 && !explicitDois.has(doi)) return 'content-mismatch'
    const infoTitle: unknown = info.info?.Title
    if (hasTitle && typeof infoTitle === 'string') {
      const declaredTitle = normalizeTitle(infoTitle)
      if (declaredTitle.length >= 12 && normalizedHeading.includes(' ' + declaredTitle + ' ') &&
          !(' ' + title + ' ').includes(' ' + declaredTitle + ' ')) return 'content-mismatch'
    }
    return 'unverified'
  } catch {
    return 'unverified'
  } finally {
    await pdf.destroy().catch(() => {})
  }
}

/**
 * Extract text from a PDF file on disk.
 * @param path - absolute file path.
 * @returns the concatenated page text and page count.
 */
export async function extractPdfFile(path: string): Promise<PdfText> {
  const bytes = await readFile(path)
  return extractPdfText(new Uint8Array(bytes))
}

/** One slice of extracted text. */
export interface TextSlice {
  totalChars: number
  offset: number
  text: string
  truncated: boolean
}

/**
 * Slice extracted text for one read call.
 * @param full - the whole text.
 * @param maxChars - requested length (clamped to at least 1).
 * @returns the slice.
 */
export function sliceText(full: string, maxChars: number): TextSlice {
  const end = Math.min(full.length, Math.max(1, Math.trunc(maxChars)))
  return { totalChars: full.length, offset: 0, text: full.slice(0, end), truncated: end < full.length }
}
