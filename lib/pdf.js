/**
 * PDF text extraction via pdf-parse v2 (`new PDFParse({ data })` +
 * `getText()`), with slicing for model-facing reads.
 * @module dsh-scholar-search/pdf
 */
import { readFile } from 'node:fs/promises';
import { PDFParse } from 'pdf-parse';
/**
 * Extract text from PDF bytes.
 * @param data - PDF bytes.
 * @returns the concatenated page text and page count.
 */
export async function extractPdfText(data) {
    const pdf = new PDFParse({ data });
    try {
        const result = await pdf.getText();
        return { text: result.text, pages: result.total };
    }
    finally {
        await pdf.destroy();
    }
}
/**
 * Extract text from a PDF file on disk.
 * @param path - absolute file path.
 * @returns the concatenated page text and page count.
 */
export async function extractPdfFile(path) {
    const bytes = await readFile(path);
    return extractPdfText(new Uint8Array(bytes));
}
/**
 * Slice extracted text for one read call.
 * @param full - the whole text.
 * @param maxChars - requested length (clamped to at least 1).
 * @returns the slice.
 */
export function sliceText(full, maxChars) {
    const end = Math.min(full.length, Math.max(1, Math.trunc(maxChars)));
    return { totalChars: full.length, offset: 0, text: full.slice(0, end), truncated: end < full.length };
}
