import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import Anthropic from "@anthropic-ai/sdk";
import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as path from "path";

// Configure R2 S3 client
const r2Client = new S3Client({
  region: "auto",
  endpoint: "https://711303ba637d386edfffed9520418bdf.r2.cloudflarestorage.com",
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "f2283d70ff205a9d9750fc570958f617",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "0bcda5355ced881bcc3843efb8d21d88d10756f8ecb444863d7173457105ea3a",
  },
});

// Configure Claude API
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY || "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",
});

const BUCKET_NAME = "budgetsmart";

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
export async function uploadReceipt(file: Express.Multer.File, userId: string): Promise<string> {
  const fileId = uuidv4();
  const fileExtension = path.extname(file.originalname).toLowerCase();
  const fileName = `receipts/${userId}/${fileId}${fileExtension}`;
  
  const uploadParams = {
    Bucket: BUCKET_NAME,
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
    await r2Client.send(new PutObjectCommand(uploadParams));
    
    // Generate a signed URL for accessing the file
    const getObjectParams = {
      Bucket: BUCKET_NAME,
      Key: fileName,
    };
    
    const signedUrl = await getSignedUrl(r2Client, new GetObjectCommand(getObjectParams), {
      expiresIn: 3600, // 1 hour
    });
    
    return signedUrl;
  } catch (error) {
    console.error("Error uploading to R2:", error);
    throw new Error("Failed to upload receipt");
  }
}

/**
 * Extract text from receipt using Claude Haiku
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
  const getObjectParams = {
    Bucket: BUCKET_NAME,
    Key: fileKey,
  };
  
  const signedUrl = await getSignedUrl(r2Client, new GetObjectCommand(getObjectParams), {
    expiresIn: 86400, // 24 hours
  });
  
  return signedUrl;
}

/**
 * Process receipt upload (main function)
 */
export async function processReceiptUpload(
  file: Express.Multer.File,
  userId: string,
  userTransactions: any[]
): Promise<{
  receiptData: ReceiptData;
  matches: TransactionMatch[];
  signedUrl: string;
}> {
  try {
    // 1. Upload to R2
    const signedUrl = await uploadReceipt(file, userId);
    
    // 2. Extract text with Claude
    const extractedText = await extractReceiptText(signedUrl);
    
    // 3. Parse receipt data
    const receiptData = parseReceiptData(extractedText);
    
    // 4. Match with transactions
    const matches = await matchReceiptWithTransactions(receiptData, userId, userTransactions);
    
    return {
      receiptData,
      matches,
      signedUrl
    };
  } catch (error) {
    console.error("Error processing receipt:", error);
    throw error;
  }
}