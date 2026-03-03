import { extractTextFromFile } from './vault-extractor';
import OpenAI from 'openai';
import { EXPENSE_CATEGORIES } from '@shared/schema';

// Deepseek client for receipt analysis — reuses existing DEEPSEEK_API_KEY.
// Initialized at module load time; null when the key is not set so that
// the server starts cleanly and `extractReceiptData` degrades gracefully.
const deepseekClient = process.env.DEEPSEEK_API_KEY
  ? new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: 'https://api.deepseek.com',
    })
  : null;

export interface ReceiptData {
  merchant: string;
  amount: number;
  date: string;
  category: string;
  items: Array<{
    name: string;
    price: number;
    quantity?: number;
  }>;
  tax?: number;
  subtotal?: number;
  paymentMethod?: string;
  receiptNumber?: string;
  confidence: number;
}

export async function extractReceiptData(
  fileBuffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<ReceiptData> {
  const fallback: ReceiptData = {
    merchant: 'Unknown',
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    category: 'Other',
    items: [],
    confidence: 0,
  };

  try {
    // Step 1: Free OCR text extraction — same pipeline as Financial Vault
    const extraction = await extractTextFromFile(fileBuffer, mimeType, fileName);

    console.log(
      `[Receipt] OCR method: ${extraction.method} | Chars: ${extraction.charCount}`,
    );

    if (!extraction.success || extraction.charCount < 20) {
      console.warn(
        '[Receipt] OCR extracted insufficient text, returning fallback',
      );
      return { ...fallback, confidence: 0 };
    }

    // Step 2: Deepseek V3 to understand the receipt text
    if (!deepseekClient) {
      console.warn(
        '[Receipt] Deepseek not configured, returning OCR text only',
      );
      return { ...fallback, confidence: 0 };
    }

    const systemPrompt =
      `You are a receipt parser for a personal finance app. ` +
      `Extract structured data from receipt text. ` +
      `Always respond with valid JSON only. ` +
      `No markdown, no explanation, just raw JSON.`;

    const userPrompt =
      `Parse this receipt and return a JSON object.\n\nReceipt text:\n---\n` +
      `${extraction.text.substring(0, 3000)}\n---\n\n` + // ~3 000 chars ≈ 750 tokens — keeps cost low
      `Return exactly this JSON structure:\n` +
      `{\n` +
      `  "merchant": "store or business name",\n` +
      `  "amount": total amount as number (no currency symbol),\n` +
      `  "date": "YYYY-MM-DD format",\n` +
      `  "category": "one of: ${EXPENSE_CATEGORIES.join(', ')}",\n` +
      `  "items": [\n` +
      `    {\n` +
      `      "name": "item name",\n` +
      `      "price": price as number,\n` +
      `      "quantity": quantity as number or 1 if not shown\n` +
      `    }\n` +
      `  ],\n` +
      `  "tax": tax amount as number or null,\n` +
      `  "subtotal": subtotal as number or null,\n` +
      `  "paymentMethod": "cash/visa/mastercard/debit/etc or null",\n` +
      `  "receiptNumber": "receipt or transaction number or null",\n` +
      `  "confidence": number between 0 and 1 indicating how confident you are in the extraction accuracy\n` +
      `}\n\n` +
      `If you cannot determine a value with confidence, use null for optional fields or 0 for amounts.\n` +
      `Date should default to today if not found.`;

    const startTime = Date.now();

    const response = await deepseekClient.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 600,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const duration = Date.now() - startTime;
    const content = response.choices[0]?.message?.content || '';

    console.log(`[Receipt] Deepseek analysis complete in ${duration}ms`);

    // Clean and parse JSON response
    const cleanJson = content
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(cleanJson) as ReceiptData;

    // Validate category against known list; fall back to "Other"
    const aiCategory: string = parsed.category || '';
    const validCategory = (EXPENSE_CATEGORIES as readonly string[]).includes(aiCategory)
      ? aiCategory
      : 'Other';

    return {
      merchant: parsed.merchant || 'Unknown',
      amount: typeof parsed.amount === 'number' ? parsed.amount : 0,
      date: parsed.date || fallback.date,
      category: validCategory,
      items: Array.isArray(parsed.items) ? parsed.items : [],
      tax: parsed.tax || undefined,
      subtotal: parsed.subtotal || undefined,
      paymentMethod: parsed.paymentMethod || undefined,
      receiptNumber: parsed.receiptNumber || undefined,
      confidence: parsed.confidence || 0.5,
    };
  } catch (err) {
    console.error('[Receipt] Extraction failed:', err);
    return fallback;
  }
}
