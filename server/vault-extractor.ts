import { PDFParse } from 'pdf-parse';
import Tesseract from 'tesseract.js';
import { fromBuffer } from 'pdf2pic';

export interface ExtractionResult {
  text: string;
  method: string;
  charCount: number;
  success: boolean;
}

export async function extractTextFromFile(
  fileBuffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<ExtractionResult> {
  console.log(`[Extractor] Starting extraction for: ${fileName} (${mimeType})`);

  // ─── PATH A: Text-based PDF ───────────────────────────────────────────────
  // Most financial documents (T4s, bank statements, insurance PDFs) have
  // selectable text embedded. pdf-parse extracts this instantly with perfect
  // accuracy.
  if (mimeType === 'application/pdf') {
    try {
      const parser = new PDFParse({ data: fileBuffer });
      const pdfData = await parser.getText();
      const text = pdfData.text?.trim() || '';

      if (text.length > 100) {
        console.log(`[Extractor] PATH A success: pdf-parse extracted ${text.length} chars`);
        return {
          text,
          method: 'pdf-parse',
          charCount: text.length,
          success: true,
        };
      }

      console.log(
        `[Extractor] PATH A: PDF has no selectable text (${text.length} chars), trying PATH B`,
      );
    } catch (err) {
      console.warn('[Extractor] PATH A failed:', err);
    }

    // ─── PATH B: Scanned PDF → Image → OCR ───────────────────────────────
    // PDF is a scanned document (image-only).
    // Convert first page to PNG then run Tesseract OCR.
    try {
      console.log('[Extractor] PATH B: Converting PDF to image for OCR...');

      const converter = fromBuffer(fileBuffer, {
        density: 200,
        format: 'png',
        width: 1654,
        height: 2339,
        preserveAspectRatio: true,
      });

      const pageImage = await converter(1, { responseType: 'buffer' });

      if (!pageImage?.buffer) {
        throw new Error('PDF to image conversion returned empty buffer');
      }

      const {
        data: { text },
      } = await Tesseract.recognize(pageImage.buffer as Buffer, 'eng', { logger: () => {} });

      const trimmed = text?.trim() || '';
      console.log(`[Extractor] PATH B success: Tesseract extracted ${trimmed.length} chars`);

      return {
        text: trimmed,
        method: 'tesseract-pdf',
        charCount: trimmed.length,
        success: trimmed.length > 20,
      };
    } catch (err) {
      console.error('[Extractor] PATH B failed:', err);
      return {
        text: '',
        method: 'failed-pdf',
        charCount: 0,
        success: false,
      };
    }
  }

  // ─── PATH C: Image file → Direct OCR ─────────────────────────────────────
  // JPG, PNG, WEBP receipts or scanned documents.
  // Run Tesseract directly on the image buffer.
  if (mimeType.startsWith('image/')) {
    try {
      console.log('[Extractor] PATH C: Running Tesseract on image...');

      const {
        data: { text },
      } = await Tesseract.recognize(fileBuffer, 'eng', { logger: () => {} });

      const trimmed = text?.trim() || '';
      console.log(`[Extractor] PATH C success: ${trimmed.length} chars extracted`);

      return {
        text: trimmed,
        method: 'tesseract-image',
        charCount: trimmed.length,
        success: trimmed.length > 20,
      };
    } catch (err) {
      console.error('[Extractor] PATH C failed:', err);
      return {
        text: '',
        method: 'failed-image',
        charCount: 0,
        success: false,
      };
    }
  }

  // ─── PATH D: Plain text / CSV ─────────────────────────────────────────────
  if (
    mimeType === 'text/plain' ||
    mimeType === 'text/csv' ||
    fileName.endsWith('.txt') ||
    fileName.endsWith('.csv')
  ) {
    const text = fileBuffer.toString('utf-8').trim();
    console.log(`[Extractor] PATH D: Direct text read, ${text.length} chars`);
    return {
      text,
      method: 'text-direct',
      charCount: text.length,
      success: text.length > 0,
    };
  }

  // ─── Unsupported file type ────────────────────────────────────────────────
  console.warn(`[Extractor] Unsupported mimeType: ${mimeType}`);
  return {
    text: '',
    method: 'unsupported',
    charCount: 0,
    success: false,
  };
}
