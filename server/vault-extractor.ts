import pdfParse from 'pdf-parse';
import Tesseract from 'tesseract.js';
import { withTimeout } from './timeout';

// âââ Timeouts ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const PDF_PARSE_TIMEOUT_MS = 15000;      // 15s â text extraction is fast
const PDF_TO_IMAGE_TIMEOUT_MS = 30000;   // 30s â pdf2pic conversion
const TESSERACT_TIMEOUT_MS = 45000;      // 45s â OCR can be slow on large images

export interface ExtractionResult {
  text: string;
  method: string;
  charCount: number;
  success: boolean;
}

/**
 * Lazy-import pdf2pic only when needed. If GraphicsMagick / Ghostscript
 * aren't installed (common on Railway / containers), the import or first
 * call will throw â we catch that and skip PATH B gracefully.
 */
async function tryConvertPdfToImage(
  fileBuffer: Buffer,
): Promise<Buffer | null> {
  try {
    const { fromBuffer } = await import('pdf2pic');

    const converter = fromBuffer(fileBuffer, {
      density: 200,
      format: 'png',
      width: 1654,
      height: 2339,
      preserveAspectRatio: true,
    });

    const pageImage = await withTimeout(
      converter(1, { responseType: 'buffer' }),
      PDF_TO_IMAGE_TIMEOUT_MS,
      'PDF to image conversion timed out',
    );

    if (!pageImage?.buffer) return null;
    return pageImage.buffer as Buffer;
  } catch (err: any) {
    // Distinguish missing system deps from other errors for clearer logs
    const msg = String(err?.message || err);
    if (
      msg.includes('GraphicsMagick') ||
      msg.includes('gm') ||
      msg.includes('Ghostscript') ||
      msg.includes('gs') ||
      msg.includes('spawn') ||
      msg.includes('ENOENT') ||
      msg.includes('Cannot find module')
    ) {
      console.warn(
        '[Extractor] pdf2pic unavailable (missing GraphicsMagick/Ghostscript). Skipping scanned-PDF OCR path.',
      );
    } else {
      console.error('[Extractor] PDF to image conversion failed:', err);
    }
    return null;
  }
}

export async function extractTextFromFile(
  fileBuffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<ExtractionResult> {
  console.log(`[Extractor] Starting extraction for: ${fileName} (${mimeType})`);

  // âââ PATH A: Text-based PDF âââââââââââââââââââââââââââââââââââââââââââââââ
  // Most financial documents (T4s, bank statements, insurance PDFs) have
  // selectable text embedded. pdf-parse extracts this instantly with perfect
  // accuracy.
  if (mimeType === 'application/pdf') {
    try {
      const pdfData = await withTimeout(
        pdfParse(fileBuffer),
        PDF_PARSE_TIMEOUT_MS,
        'PDF text extraction timed out',
      );
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

    // âââ PATH B: Scanned PDF â Image â OCR âââââââââââââââââââââââââââââââ
    // PDF is a scanned document (image-only).
    // Convert first page to PNG then run Tesseract OCR.
    // pdf2pic requires GraphicsMagick + Ghostscript system deps â if missing
    // we skip this path and return a graceful failure instead of hanging.
    try {
      console.log('[Extractor] PATH B: Converting PDF to image for OCR...');

      const imageBuffer = await tryConvertPdfToImage(fileBuffer);

      if (!imageBuffer) {
        console.warn('[Extractor] PATH B: Could not convert PDF to image, skipping OCR');
        return {
          text: '',
          method: 'skipped-pdf-ocr',
          charCount: 0,
          success: false,
        };
      }

      const {
        data: { text },
      } = await withTimeout(
        Tesseract.recognize(imageBuffer, 'eng', { logger: () => {} }),
        TESSERACT_TIMEOUT_MS,
        'Tesseract OCR timed out on scanned PDF',
      );

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

  // âââ PATH C: Image file â Direct OCR âââââââââââââââââââââââââââââââââââââ
  // JPG, PNG, WEBP receipts or scanned documents.
  // Run Tesseract directly on the image buffer with a timeout guard.
  if (mimeType.startsWith('image/')) {
    try {
      console.log('[Extractor] PATH C: Running Tesseract on image...');

      const {
        data: { text },
      } = await withTimeout(
        Tesseract.recognize(fileBuffer, 'eng', { logger: () => {} }),
        TESSERACT_TIMEOUT_MS,
        'Tesseract OCR timed out on image',
      );

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

  // âââ PATH D: Plain text / CSV âââââââââââââââââââââââââââââââââââââââââââââ
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

  // âââ Unsupported file type ââââââââââââââââââââââââââââââââââââââââââââââââ
  console.warn(`[Extractor] Unsupported mimeType: ${mimeType}`);
  return {
    text: '',
    method: 'unsupported',
    charCount: 0,
    success: false,
  };
}
