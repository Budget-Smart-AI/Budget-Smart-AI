import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuidv4 } from "uuid";
import * as path from "path";

// Lazy-initialized clients to avoid startup failures when credentials are missing
let _r2Client: S3Client | null = null;
let _anthropic: Anthropic | null = null;

function getR2Client(): S3Client {
  if (!_r2Client) {
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.R2_TOKEN_VALUE;
    const rawEndpoint = process.env.R2_ENDPOINT;
    if (!accessKeyId || !secretAccessKey || !rawEndpoint) {
      throw new Error("R2 storage is not configured. Please set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (or R2_TOKEN_VALUE), and R2_ENDPOINT environment variables.");
    }
    // Sanitize the endpoint: strip surrounding/leading/trailing quote characters that may
    // have been accidentally included when the environment variable was set (e.g. R2_ENDPOINT="\"https://...").
    // Then extract only the origin (scheme + host + optional port) so any trailing bucket path is removed.
    const stripped = rawEndpoint.replace(/^["']+|["']+$/g, "");
    let endpoint: string;
    try {
      endpoint = new URL(stripped).origin;
    } catch {
      // If URL parsing fails, fall back to the stripped value as-is
      endpoint = stripped;
    }
    _r2Client = new S3Client({
      region: "auto",
      endpoint,
      // forcePathStyle is required for S3-compatible endpoints such as Cloudflare R2 to
      // prevent the SDK from prepending the bucket name as a subdomain.
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return _r2Client;
}

/**
 * Build a public URL for a stored file key.
 * When R2_PUBLIC_URL is set (e.g. https://media.budgetsmart.io) the file is served
 * directly from the custom domain as a permanent public URL.  Each path segment of the
 * key is percent-encoded so the URL is always well-formed.
 * Returns null when R2_PUBLIC_URL is not configured.
 */
function getPublicFileUrl(fileKey: string): string | null {
  const raw = process.env.R2_PUBLIC_URL;
  if (!raw) return null;
  const publicBase = raw.replace(/\/+$/, "");
  // Validate that the configured value is a proper HTTPS URL before using it.
  try {
    const parsed = new URL(publicBase);
    if (parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }
  const encodedKey = fileKey.split("/").map(encodeURIComponent).join("/");
  return `${publicBase}/${encodedKey}`;
}

function getAnthropicClient(): Anthropic {
  if (!_anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      throw new Error("Anthropic API key is not configured. Please set ANTHROPIC_API_KEY environment variable.");
    }
    if (!process.env.ANTHROPIC_API_KEY && process.env.CLAUDE_API_KEY) {
      console.warn("Deprecation warning: CLAUDE_API_KEY is deprecated, please use ANTHROPIC_API_KEY instead.");
    }
    _anthropic = new Anthropic({ apiKey });
  }
  return _anthropic;
}

function getBucketName(): string {
  const bucketName = process.env.R2_BUCKET_NAME;
  if (!bucketName) {
    throw new Error("R2 bucket is not configured. Please set R2_BUCKET_NAME environment variable.");
  }
  return bucketName;
}

// Interface for receipt data
interface ReceiptData {
  merchant: string;
  amount: number;
  date: string;
  category: string;
  items: Array<{
    name: string;
    price: number;
    quantity: number;
  }>;
  confidence: number;
}

// Interface for transaction matching
interface TransactionMatch {
  transactionId: string;
  receiptId: string;
  confidence: number;
  matchedAmount: number;
  matchedMerchant: string;
  status: "auto-matched" | "needs-review" | "manual-match";
}

/**
 * Upload receipt to R2 storage
 */
export async function uploadReceipt(file: Express.Multer.File, userId: string): Promise<{ key: string; signedUrl: string }> {
  const fileId = uuidv4();
  const fileExtension = path.extname(file.originalname).toLowerCase();
  const fileName = `receipts/${userId}/${fileId}${fileExtension}`;
  
  const uploadParams = {
    Bucket: getBucketName(),
    Key: fileName,
    Body: file.buffer,
    ContentType: file.mimetype,
    Metadata: {
      userId,
      originalName: file.originalname,
      uploadDate: new Date().toISOString(),
    },
  };

  try {
    await getR2Client().send(new PutObjectCommand(uploadParams));
    
    // Use the custom public domain when configured; fall back to a 24-hour signed URL.
    let signedUrl = getPublicFileUrl(fileName);
    if (!signedUrl) {
      const getObjectParams = {
        Bucket: getBucketName(),
        Key: fileName,
      };
      signedUrl = await getSignedUrl(getR2Client(), new GetObjectCommand(getObjectParams), {
        expiresIn: 86400, // 24 hours
      });
    }
    
    return { key: fileName, signedUrl };
  } catch (error) {
    console.error("Error uploading to R2:", error);
    throw new Error("Failed to upload receipt");
  }
}

/**
 * Test R2 storage connectivity by writing a small test object then deleting it.
 */
export async function testR2Connection(): Promise<{ success: boolean; message: string; details?: string }> {
  const testKey = `_test/connectivity-${Date.now()}.txt`;
  const testContent = `R2 connectivity test - ${new Date().toISOString()}`;
  try {
    const bucket = getBucketName();
    const client = getR2Client();
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: testKey,
      Body: Buffer.from(testContent),
      ContentType: "text/plain",
    }));
    // Clean up test object so storage is not polluted
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));
    } catch {
      // Cleanup failure is non-fatal
    }
    return { success: true, message: "R2 storage is reachable and writable", details: `Test write+delete succeeded (key: ${testKey})` };
  } catch (error: any) {
    return { success: false, message: "R2 storage connection failed", details: error?.message || String(error) };
  }
}

/**
 * Extract text from receipt buffer directly (no R2 required)
 * Supports images and PDFs via Anthropic's API
 */
export async function extractReceiptFromBuffer(buffer: Buffer, mimetype: string): Promise<string> {
  const anthropic = getAnthropicClient();

  // PDF support via Anthropic's document type (requires beta header)
  if (mimetype === 'application/pdf') {
    const pdfBase64 = buffer.toString('base64');
    try {
      const message = await (anthropic.beta.messages.create as any)({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1000,
        betas: ["pdfs-2024-09-25"],
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: pdfBase64,
                },
              },
              {
                type: "text",
                text: "Extract all text from this receipt. Include merchant name, date, total amount, and line items if available. Format as JSON with fields: merchant, date, total, items[] with name and price. If you can't extract something, use null."
              }
            ]
          }
        ]
      });
      const firstBlock = (message as any).content[0];
      return firstBlock?.type === "text" ? firstBlock.text : "";
    } catch (pdfError) {
      console.error("PDF extraction failed:", pdfError);
      throw new Error("Failed to extract text from PDF. Please upload an image of the receipt instead.");
    }
  }

  // Image support — convert buffer to base64 and send directly
  const imageBase64 = buffer.toString('base64');
  const supportedMimeTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
  type SupportedMimeType = typeof supportedMimeTypes[number];
  const rawMimeType = mimetype.split(";")[0].trim();
  const imageMimeType: SupportedMimeType = supportedMimeTypes.includes(rawMimeType as SupportedMimeType)
    ? (rawMimeType as SupportedMimeType)
    : "image/jpeg";

  const message = await anthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract all text from this receipt. Include merchant name, date, total amount, and line items if available. Format as JSON with fields: merchant, date, total, items[] with name and price. If you can't extract something, use null."
          },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: imageMimeType,
              data: imageBase64
            }
          }
        ]
      }
    ]
  });

  const firstBlock = message.content[0];
  return firstBlock.type === "text" ? firstBlock.text : "";
}

/**
 * Extract text from receipt using Claude Haiku (from a URL)
 */
export async function extractReceiptText(imageUrl: string): Promise<string> {
  try {
    // Download image from URL
    const response = await fetch(imageUrl);
    const imageBuffer = await response.arrayBuffer();
    const imageBase64 = Buffer.from(imageBuffer).toString("base64");
    
    // Determine MIME type - extract base type only, must be one of the supported types
    const rawMimeType = (response.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    const supportedMimeTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
    type SupportedMimeType = typeof supportedMimeTypes[number];
    const mimeType: SupportedMimeType = supportedMimeTypes.includes(rawMimeType as SupportedMimeType)
      ? (rawMimeType as SupportedMimeType)
      : "image/jpeg";
    
    const message = await getAnthropicClient().messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract all text from this receipt. Include merchant name, date, total amount, and line items if available. Format as JSON with fields: merchant, date, total, items[] with name and price. If you can't extract something, use null."
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType,
                data: imageBase64
              }
            }
          ]
        }
      ]
    });
    
    const firstBlock = message.content[0];
    return firstBlock.type === "text" ? firstBlock.text : "";
  } catch (error) {
    console.error("Error extracting receipt text:", error);
    throw new Error("Failed to extract receipt text");
  }
}

/**
 * Parse extracted text into structured data
 */
export function parseReceiptData(extractedText: string): ReceiptData {
  try {
    // Try to parse as JSON first
    const jsonMatch = extractedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        merchant: parsed.merchant || "Unknown",
        amount: parseFloat(parsed.total) || 0,
        date: parsed.date || new Date().toISOString().split('T')[0],
        category: "Uncategorized",
        items: parsed.items || [],
        confidence: 0.85
      };
    }
    
    // Fallback: Simple text parsing
    const lines = extractedText.split('\n');
    let merchant = "Unknown";
    let amount = 0;
    let date = new Date().toISOString().split('T')[0];
    const items: Array<{name: string, price: number, quantity: number}> = [];
    
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      
      // Extract merchant (common patterns)
      if (lowerLine.includes("target") || lowerLine.includes("walmart") || 
          lowerLine.includes("amazon") || lowerLine.includes("starbucks")) {
        merchant = line.trim();
      }
      
      // Extract total amount
      const totalMatch = line.match(/total\s*[\$£€]?\s*([\d,]+\.?\d*)/i);
      if (totalMatch) {
        amount = parseFloat(totalMatch[1].replace(',', ''));
      }
      
      // Extract date
      const dateMatch = line.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
      if (dateMatch) {
        date = dateMatch[1];
      }
      
      // Extract line items (simple pattern)
      const itemMatch = line.match(/(.+?)\s+[\$£€]?\s*([\d,]+\.?\d*)/);
      if (itemMatch && !line.toLowerCase().includes("total") && 
          !line.toLowerCase().includes("subtotal") && 
          !line.toLowerCase().includes("tax")) {
        items.push({
          name: itemMatch[1].trim(),
          price: parseFloat(itemMatch[2].replace(',', '')),
          quantity: 1
        });
      }
    }
    
    return {
      merchant,
      amount,
      date,
      category: "Uncategorized",
      items,
      confidence: 0.65 // Lower confidence for text parsing
    };
  } catch (error) {
    console.error("Error parsing receipt data:", error);
    return {
      merchant: "Unknown",
      amount: 0,
      date: new Date().toISOString().split('T')[0],
      category: "Uncategorized",
      items: [],
      confidence: 0.3
    };
  }
}

/**
 * Fuzzy match receipt with existing transactions
 */
export async function matchReceiptWithTransactions(
  receiptData: ReceiptData, 
  userId: string, 
  transactions: any[]
): Promise<TransactionMatch[]> {
  const matches: TransactionMatch[] = [];
  
  for (const transaction of transactions) {
    let confidence = 0;
    
    // 1. Amount matching (40% weight)
    const amountDiff = Math.abs(receiptData.amount - transaction.amount);
    const amountConfidence = amountDiff < 0.01 ? 1.0 : 
                           amountDiff < 1.00 ? 0.8 : 
                           amountDiff < 5.00 ? 0.5 : 0.2;
    confidence += amountConfidence * 0.4;
    
    // 2. Merchant name fuzzy matching (30% weight)
    const merchantConfidence = calculateStringSimilarity(
      receiptData.merchant.toLowerCase(),
      transaction.merchant?.toLowerCase() || ""
    );
    confidence += merchantConfidence * 0.3;
    
    // 3. Date proximity (30% weight)
    const receiptDate = new Date(receiptData.date);
    const transactionDate = new Date(transaction.date);
    const dateDiff = Math.abs(receiptDate.getTime() - transactionDate.getTime());
    const daysDiff = dateDiff / (1000 * 60 * 60 * 24);
    const dateConfidence = daysDiff < 1 ? 1.0 : 
                          daysDiff < 3 ? 0.7 : 
                          daysDiff < 7 ? 0.4 : 0.1;
    confidence += dateConfidence * 0.3;
    
    if (confidence > 0.5) { // Only consider matches above 50% confidence
      matches.push({
        transactionId: transaction.id,
        receiptId: uuidv4(),
        confidence,
        matchedAmount: receiptData.amount,
        matchedMerchant: receiptData.merchant,
        status: confidence > 0.9 ? "auto-matched" : "needs-review"
      });
    }
  }
  
  // Sort by confidence (highest first)
  return matches.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Calculate string similarity using Levenshtein distance
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  if (str1.length === 0 || str2.length === 0) return 0.0;
  
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  // Check for exact substring match
  if (longer.includes(shorter)) return 0.8;
  
  // Simple word overlap
  const words1 = str1.split(/\s+/);
  const words2 = str2.split(/\s+/);
  const commonWords = words1.filter(word => words2.includes(word));
  const wordOverlap = commonWords.length / Math.max(words1.length, words2.length);
  
  return wordOverlap;
}

/**
 * Generate signed URL for uploaded receipt
 */
export async function generateSignedUrl(fileKey: string): Promise<string> {
  const publicUrl = getPublicFileUrl(fileKey);
  if (publicUrl) return publicUrl;

  const getObjectParams = {
    Bucket: getBucketName(),
    Key: fileKey,
  };
  
  const signedUrl = await getSignedUrl(getR2Client(), new GetObjectCommand(getObjectParams), {
    expiresIn: 86400, // 24 hours
  });
  
  return signedUrl;
}

/**
 * Process receipt upload (main function)
 * Always uploads to R2 first. OCR failure is non-fatal — a receipt record is
 * still returned with the stored file key so the upload is never lost.
 */
export async function processReceiptUpload(
  file: Express.Multer.File,
  userId: string,
  userTransactions: any[]
): Promise<{
  receiptData: ReceiptData;
  matches: TransactionMatch[];
  signedUrl: string;
  fileKey: string;
  rawText: string;
  ocrError?: string;
}> {
  // 1. Always attempt R2 upload first so the file is never lost.
  let signedUrl = "";
  let fileKey = "";
  try {
    const upload = await uploadReceipt(file, userId);
    signedUrl = upload.signedUrl;
    fileKey = upload.key;
    console.log(`Receipt uploaded to R2: ${fileKey}`);
  } catch (r2Error: any) {
    // R2 not configured or upload failed — continue without cloud storage
    console.warn("R2 upload skipped (not configured or failed):", r2Error?.message);
  }

  // 2. OCR — non-fatal. If it fails we still save the receipt with minimal data.
  let rawText = "";
  let ocrError: string | undefined;
  try {
    rawText = await extractReceiptFromBuffer(file.buffer, file.mimetype);
  } catch (err: any) {
    ocrError = err?.message || "OCR extraction failed";
    console.error("OCR failed (receipt will be saved without extracted data):", err);
  }

  // 3. Parse receipt data (fallback defaults when OCR had no output)
  const receiptData: ReceiptData = rawText
    ? parseReceiptData(rawText)
    : {
        merchant: "Unknown",
        amount: 0,
        date: new Date().toISOString().split("T")[0],
        category: "Uncategorized",
        items: [],
        confidence: 0,
      };

  // 4. Match with transactions (skip if OCR produced no data)
  const matches = rawText
    ? await matchReceiptWithTransactions(receiptData, userId, userTransactions)
    : [];

  return {
    receiptData,
    matches,
    signedUrl,
    fileKey,
    rawText,
    ...(ocrError ? { ocrError } : {}),
  };
}