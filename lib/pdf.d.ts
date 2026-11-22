/**
 * PDF text extraction via pdf-parse v2 (`new PDFParse({ data })` +
 * `getText()`), with slicing for model-facing reads.
 * @module dsh-scholar-search/pdf
 */
import type { PaperMeta } from './types.js';
/** Extracted text with the page count. */
export interface PdfText {
    text: string;
    pages: number;
}
/**
 * Extract text from PDF bytes.
 * @param data - PDF bytes.
 * @returns the concatenated page text and page count.
 */
export declare function extractPdfText(data: Uint8Array): Promise<PdfText>;
export type PdfVerification = 'matched' | 'unverified' | 'content-mismatch';
/** 用首页的题名和 DOI 核对文件身份。缺少能判定身份的证据时留给人工核验。 */
export declare function verifyPdfContent(data: Uint8Array, paper: PaperMeta): Promise<PdfVerification>;
/**
 * Extract text from a PDF file on disk.
 * @param path - absolute file path.
 * @returns the concatenated page text and page count.
 */
export declare function extractPdfFile(path: string): Promise<PdfText>;
/** One slice of extracted text. */
export interface TextSlice {
    totalChars: number;
    offset: number;
    text: string;
    truncated: boolean;
}
/**
 * Slice extracted text for one read call.
 * @param full - the whole text.
 * @param maxChars - requested length (clamped to at least 1).
 * @returns the slice.
 */
export declare function sliceText(full: string, maxChars: number): TextSlice;
