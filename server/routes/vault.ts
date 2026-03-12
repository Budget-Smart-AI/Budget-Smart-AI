// FEATURE: FINANCIAL_VAULT | tier: pro | limit: disabled (free), 50 docs (pro), 100 docs (family)
// FEATURE: VAULT_AI_SEARCH | tier: pro | limit: unlimited
import express from "express";
import multer from "multer";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import * as path from "path";
import { extractTextFromFile } from "../vault-extractor";
import { requireAuth } from "../auth";
import { createRateLimiter, apiRateLimiter } from "../rate-limiter";
import { Pool } from "pg";
import { sendEmailViaPostmark } from "../email";
import { withTimeout } from "../timeout";
import { checkAndConsume } from "../lib/featureGate";
import { storage } from "../storage";

const router = express.Router();

// ─── R2 helpers ───────────────────────────────────────────────────────────────
let _r2: S3Client | null = null;
function getR2(): S3Client {
  if (!_r2) {
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.R2_TOKEN_VALUE;
    const rawEndpoint = process.env.R2_ENDPOINT;
    if (!accessKeyId || !secretAccessKey || !rawEndpoint) {
      throw new Error("R2 storage is not configured.");
    }
    const stripped = rawEndpoint.replace(/^["']+|["']+$/g, "");
    let endpoint: string;
    try { endpoint = new URL(stripped).origin; } catch { endpoint = stripped; }
    _r2 = new S3Client({ region: "auto", endpoint, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
  }
  return _r2;
}
function getBucket(): string {
  const b = process.env.R2_BUCKET_NAME;
  if (!b) throw new Error("R2_BUCKET_NAME not configured.");
  return b;
}
async function makeSignedUrl(fileKey: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(getR2(), new GetObjectCommand({ Bucket: getBucket(), Key: fileKey }), { expiresIn });
}

// ─── DB helper ────────────────────────────────────────────────────────────────
let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
    _pool.on("error", (err) => console.error("Vault pool error:", err));
  }
  return _pool;
}

// ─── Multer config ────────────────────────────────────────────────────────────
const ALLOWED_MIMES = [
  "application/pdf",
  "image/jpeg","image/jpg","image/png","image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain","text/csv","application/csv",
];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

// Upload rate limiter: max 20 uploads per hour per user
const uploadRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 20,
  message: "Upload limit reached. Maximum 20 uploads per hour.",
});

// General vault API rate limiter: max 200 requests per 15 minutes per user
const vaultRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 200,
  message: "Too many requests to the vault. Please try again later.",
});

// ─── AI document processing ───────────────────────────────────────────────────
const DOC_ANALYSIS_SYSTEM_PROMPT = `You are a financial document analyzer for BudgetSmart. Analyze the uploaded document and respond with ONLY a valid JSON object (no markdown fences, no explanation).

JSON fields:
- summary: string (2-3 sentence plain-English summary of what this document is)
- extractedData: object with key-value pairs relevant to the document type:
    Tax: taxYear, totalIncome, employerName, sinMasked
    Insurance: policyNumber, coverageAmount, premium, expiryDate, insurerName
    Loan/Mortgage: lender, balance, interestRate, paymentAmount, maturityDate
    Investment: accountType, totalValue, period
    Warranty: productName, purchaseDate, expiryDate, retailer
    Utility: provider, amount, billingPeriod, accountNumber
    General: any key dates, amounts, parties involved
- tags: string[] (5-10 searchable tags)
- suggestedCategory: one of [tax, insurance, loan, investment, warranty, utility, other]
- suggestedSubcategory: string (e.g. "T4", "home insurance", "mortgage", "RRSP")
- expiryDate: string in YYYY-MM-DD format if the document has an expiry/renewal date, else null`;

function parseAIJsonResponse(rawText: string): Record<string, any> {
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(cleaned);
}

async function processDocumentWithAI(
  buffer: Buffer,
  mimetype: string,
  category: string,
  fileName: string,
  userId?: string,
): Promise<{ summary: string; extractedData: Record<string, any>; tags: string[]; suggestedCategory: string; suggestedSubcategory: string; expiryDate: string | null }> {
  // Step 1: Extract text using smart OCR detection (pdf-parse → tesseract fallback → direct text)
  const extracted = await extractTextFromFile(buffer, mimetype, fileName);

  // Step 2: Build prompt content from extracted text (or filename/category if extraction failed)
  let textContent = `Financial document: ${fileName}\nCategory: ${category}\nFile type: ${mimetype}\n`;
  if (extracted.success && extracted.text.length > 0) {
    textContent += `\nExtracted text:\n${extracted.text.slice(0, 4000)}`;
  } else {
    textContent += `\nNote: Could not extract text from this document (${extracted.method}). Analyze based on the filename and category.`;
  }

  // Step 3: Use AI for document understanding
  const { routeAI } = await import("../ai-router");
  const aiRes = await routeAI({
    taskSlot: "vault_ai",
    userId,
    featureContext: "vault_extraction",
    maxTokens: 2048,
    temperature: 0.3,
    messages: [
      { role: "system", content: DOC_ANALYSIS_SYSTEM_PROMPT },
      { role: "user", content: textContent },
    ],
  });

  const rawText = aiRes.content || "{}";
  const parsed = parseAIJsonResponse(rawText);
  return {
    summary: parsed.summary || "",
    extractedData: parsed.extractedData || {},
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    suggestedCategory: parsed.suggestedCategory || category || "other",
    suggestedSubcategory: parsed.suggestedSubcategory || "",
    expiryDate: parsed.expiryDate || null,
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/vault/upload
 * Accept multipart form data, up to 10 files at once
 */
router.post("/upload", requireAuth, uploadRateLimiter, upload.array("file", 10), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const userId = String(req.session.userId ?? "");
    const user = await storage.getUser(userId);
    const plan = user?.plan || "free";
    const gateResult = await checkAndConsume(userId, plan, "financial_vault");
    if (!gateResult.allowed) {
      return res.status(402).json({
        feature: "financial_vault",
        remaining: gateResult.remaining,
        resetDate: gateResult.resetDate?.toISOString() ?? null,
        upgradeRequired: gateResult.upgradeRequired,
      });
    }

    const db = getPool();

    const results: any[] = [];

    for (const file of files) {
      const docId = uuidv4();
      const ext = path.extname(file.originalname).toLowerCase();
      const fileKey = `vault/${userId}/${docId}${ext}`;

      // Determine file type label
      const fileType = ext.replace(".", "").toUpperCase() || "FILE";

      // Upload to R2
      await getR2().send(new PutObjectCommand({
        Bucket: getBucket(),
        Key: fileKey,
        Body: file.buffer,
        ContentType: file.mimetype,
        Metadata: { userId, originalName: file.originalname, uploadDate: new Date().toISOString() },
      }));

      const category = (req.body.category as string) || "other";
      const displayName = (req.body.display_name as string) || file.originalname.replace(/\.[^.]+$/, "");
      const description = (req.body.description as string) || null;
      const expiryDateInput = (req.body.expiry_date as string) || null;

      // Insert document record immediately
      const insertResult = await db.query(
        `INSERT INTO vault_documents
           (id, user_id, file_name, display_name, file_key, file_size, file_type, mime_type,
            category, description, expiry_date, ai_processing_status, uploaded_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending',NOW(),NOW())
         RETURNING *`,
        [docId, userId, file.originalname, displayName, fileKey, file.size, fileType,
         file.mimetype, category, description, expiryDateInput || null],
      );
      const doc = insertResult.rows[0];

      // Generate signed URL for immediate return
      let signedUrl = "";
      try { signedUrl = await makeSignedUrl(fileKey); } catch { /* non-fatal */ }

      results.push({ ...doc, signedUrl, aiProcessing: true });

      // Async AI processing — do not await, never fail the upload.
      // A 120-second timeout prevents the status from staying "pending" forever
      // when pdf2pic or the DeepSeek API call hangs.
      (async () => {
        try {
          const ai = await withTimeout(
            processDocumentWithAI(file.buffer, file.mimetype, category, file.originalname, userId),
            120000,
            "Document AI analysis timed out",
          );
          const finalCategory = ai.suggestedCategory || category;
          await db.query(
            `UPDATE vault_documents SET
               ai_summary=$1, extracted_data=$2, tags=$3,
               category=$4, subcategory=$5,
               expiry_date=COALESCE($6::date, expiry_date),
               ai_processing_status='completed',
               updated_at=NOW()
             WHERE id=$7`,
            [
              ai.summary,
              JSON.stringify(ai.extractedData),
              ai.tags,
              finalCategory,
              ai.suggestedSubcategory || null,
              ai.expiryDate || null,
              docId,
            ],
          );
        } catch (aiErr) {
          console.error(`[Vault] AI processing failed for doc ${docId}:`, aiErr);
          // Mark as failed so the client can show an appropriate error state
          try {
            await db.query(
              `UPDATE vault_documents SET ai_processing_status='failed', updated_at=NOW() WHERE id=$1`,
              [docId],
            );
          } catch (dbErr) {
            console.error(`[Vault] Failed to mark doc ${docId} as failed:`, dbErr);
          }
          // Don't rethrow — document was already saved
        }
      })();
    }

    res.status(201).json({ success: true, data: results });
  } catch (error: any) {
    console.error("[Vault] Upload error:", error);
    res.status(500).json({ error: "Upload failed", details: error.message });
  }
});

/**
 * GET /api/vault/documents
 */
router.get("/documents", requireAuth, vaultRateLimiter, async (req, res) => {
  try {
    const userId = String(req.session.userId ?? "");
    const db = getPool();
    const { category, search, page = "1", limit = "20" } = req.query;
    const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);

    const params: any[] = [userId];
    let where = "WHERE user_id=$1";
    if (category && category !== "all") {
      params.push(category);
      where += ` AND category=$${params.length}`;
    }
    if (search) {
      const likeIdx = params.length + 1;
      const exactIdx = params.length + 2;
      params.push(`%${search}%`, String(search).toLowerCase());
      where += ` AND (display_name ILIKE $${likeIdx} OR file_name ILIKE $${likeIdx} OR ai_summary ILIKE $${likeIdx} OR $${exactIdx}=ANY(tags))`;
    }

    const countResult = await db.query(`SELECT COUNT(*) FROM vault_documents ${where}`, params);
    const total = parseInt(countResult.rows[0].count, 10);

    params.push(parseInt(limit as string, 10), offset);
    const rows = await db.query(
      `SELECT * FROM vault_documents ${where} ORDER BY uploaded_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    // Add signed URLs
    const docs = await Promise.all(
      rows.rows.map(async (doc: any) => {
        let signedUrl = "";
        try { signedUrl = await makeSignedUrl(doc.file_key); } catch { /* non-fatal */ }
        return { ...doc, signedUrl };
      }),
    );

    res.json({ success: true, data: { documents: docs, total, page: parseInt(page as string, 10), limit: parseInt(limit as string, 10) } });
  } catch (error: any) {
    console.error("[Vault] List documents error:", error);
    res.status(500).json({ error: "Failed to fetch documents", details: error.message });
  }
});

/**
 * GET /api/vault/documents/:id
 */
router.get("/documents/:id", requireAuth, vaultRateLimiter, async (req, res) => {
  try {
    const userId = String(req.session.userId ?? "");
    const db = getPool();
    const result = await db.query("SELECT * FROM vault_documents WHERE id=$1", [req.params.id]);
    const doc = result.rows[0];
    if (!doc || doc.user_id !== userId) return res.status(404).json({ error: "Document not found" });

    let signedUrl = "";
    try { signedUrl = await makeSignedUrl(doc.file_key); } catch { /* non-fatal */ }

    const convResult = await db.query(
      "SELECT * FROM vault_ai_conversations WHERE document_id=$1 ORDER BY created_at ASC",
      [req.params.id],
    );

    res.json({ success: true, data: { ...doc, signedUrl, conversations: convResult.rows } });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch document", details: error.message });
  }
});

/**
 * DELETE /api/vault/documents/:id
 */
router.delete("/documents/:id", requireAuth, vaultRateLimiter, async (req, res) => {
  try {
    const userId = String(req.session.userId ?? "");
    const db = getPool();
    const result = await db.query("SELECT * FROM vault_documents WHERE id=$1", [req.params.id]);
    const doc = result.rows[0];
    if (!doc || doc.user_id !== userId) return res.status(404).json({ error: "Document not found" });

    // Delete from R2
    try {
      await getR2().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: doc.file_key }));
    } catch (r2Err) {
      console.warn("[Vault] R2 delete failed (continuing):", r2Err);
    }

    await db.query("DELETE FROM vault_documents WHERE id=$1", [req.params.id]);
    res.json({ success: true, message: "Document deleted" });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to delete document", details: error.message });
  }
});

/**
 * PATCH /api/vault/documents/:id
 */
router.patch("/documents/:id", requireAuth, vaultRateLimiter, async (req, res) => {
  try {
    const userId = String(req.session.userId ?? "");
    const db = getPool();
    const result = await db.query("SELECT * FROM vault_documents WHERE id=$1", [req.params.id]);
    const doc = result.rows[0];
    if (!doc || doc.user_id !== userId) return res.status(404).json({ error: "Document not found" });

    const { display_name, category, description, tags, expiry_date, is_favorite } = req.body;
    const sets: string[] = [];
    const params: any[] = [];

    if (display_name !== undefined) { params.push(display_name); sets.push(`display_name=$${params.length}`); }
    if (category !== undefined) { params.push(category); sets.push(`category=$${params.length}`); }
    if (description !== undefined) { params.push(description); sets.push(`description=$${params.length}`); }
    if (tags !== undefined) { params.push(tags); sets.push(`tags=$${params.length}`); }
    if (expiry_date !== undefined) {
      params.push(expiry_date || null);
      sets.push(`expiry_date=$${params.length}`);
      // Reset expiry_notified if date changed
      sets.push(`expiry_notified=false`);
    }
    if (is_favorite !== undefined) { params.push(is_favorite); sets.push(`is_favorite=$${params.length}`); }

    if (sets.length === 0) return res.json({ success: true, data: doc });

    sets.push(`updated_at=NOW()`);
    params.push(req.params.id);
    const updated = await db.query(
      `UPDATE vault_documents SET ${sets.join(",")} WHERE id=$${params.length} RETURNING *`,
      params,
    );

    res.json({ success: true, data: updated.rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to update document", details: error.message });
  }
});

/**
 * POST /api/vault/documents/:id/ask
 */
router.post("/documents/:id/ask", requireAuth, vaultRateLimiter, async (req, res) => {
  try {
    const userId = String(req.session.userId ?? "");
    const user = await storage.getUser(userId);
    const plan = user?.plan || "free";
    const gateResult = await checkAndConsume(userId, plan, "vault_ai_search");
    if (!gateResult.allowed) {
      return res.status(402).json({
        feature: "vault_ai_search",
        remaining: gateResult.remaining,
        resetDate: gateResult.resetDate?.toISOString() ?? null,
        upgradeRequired: gateResult.upgradeRequired,
      });
    }

    const db = getPool();
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: "question is required" });

    if (
      !process.env.DEEPSEEK_API_KEY && !process.env.OPENAI_API_KEY && !process.env.OPENAI_API
    ) {
      return res.status(503).json({ error: "No AI service configured. Please set DEEPSEEK_API_KEY." });
    }

    const result = await db.query("SELECT * FROM vault_documents WHERE id=$1", [req.params.id]);
    const doc = result.rows[0];
    if (!doc || doc.user_id !== userId) return res.status(404).json({ error: "Document not found" });

    // Build context from document
    const convHistory = await db.query(
      "SELECT * FROM vault_ai_conversations WHERE document_id=$1 ORDER BY created_at ASC LIMIT 20",
      [req.params.id],
    );

    // Add document context as first user message
    let docContext = `Document: ${doc.display_name || doc.file_name}\nCategory: ${doc.category}\n`;
    if (doc.ai_summary) docContext += `\nSummary: ${doc.ai_summary}\n`;
    if (doc.extracted_data) {
      try {
        const data = typeof doc.extracted_data === "string" ? JSON.parse(doc.extracted_data) : doc.extracted_data;
        docContext += `\nExtracted data:\n${Object.entries(data).map(([k, v]) => `  ${k}: ${v}`).join("\n")}\n`;
      } catch { /* ignore */ }
    }

    const vaultSystemPrompt = `You are a financial document assistant for BudgetSmart. The user has uploaded a financial document and wants to ask questions about it. Answer clearly and accurately based only on the document content. If something isn't in the document, say so. Format currency amounts clearly. Flag anything that seems unusual or worth the user's attention.`;

    let answer: string;

    // Use AI for document Q&A
    const { routeAI } = await import("../ai-router");
    const qaMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: vaultSystemPrompt },
      { role: "user", content: `Document context:\n${docContext}\n\nNow I have a question about this document.` },
      { role: "assistant", content: "I have reviewed the document details. Please ask your question." },
      ...convHistory.rows.flatMap((conv: { question: string; answer: string }) => [
        { role: "user" as const, content: conv.question },
        { role: "assistant" as const, content: conv.answer },
      ]),
      { role: "user", content: question },
    ];
    const aiRes = await routeAI({
      taskSlot: "vault_ai",
      userId,
      featureContext: "vault_chat",
      maxTokens: 1024,
      temperature: 0.7,
      messages: qaMessages,
    });
    answer = aiRes.content || "I was unable to process your question.";

    // Save Q&A
    await db.query(
      "INSERT INTO vault_ai_conversations (user_id, document_id, question, answer) VALUES ($1,$2,$3,$4)",
      [userId, req.params.id, question, answer],
    );

    res.json({ success: true, data: { question, answer } });
  } catch (error: any) {
    console.error("[Vault] Ask error:", error);
    res.status(500).json({ error: "Failed to process question", details: error.message });
  }
});

/**
 * GET /api/vault/documents/:id/download
 */
router.get("/documents/:id/download", requireAuth, vaultRateLimiter, async (req, res) => {
  try {
    const userId = String(req.session.userId ?? "");
    const db = getPool();
    const result = await db.query("SELECT * FROM vault_documents WHERE id=$1", [req.params.id]);
    const doc = result.rows[0];
    if (!doc || doc.user_id !== userId) return res.status(404).json({ error: "Document not found" });

    const signedUrl = await makeSignedUrl(doc.file_key);
    res.json({ success: true, data: { signedUrl, fileName: doc.display_name || doc.file_name } });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to generate download URL", details: error.message });
  }
});

/**
 * GET /api/vault/storage-stats
 */
router.get("/storage-stats", requireAuth, vaultRateLimiter, async (req, res) => {
  try {
    const userId = String(req.session.userId ?? "");
    const db = getPool();

    const totalResult = await db.query(
      "SELECT COUNT(*) as count, COALESCE(SUM(file_size),0) as total_bytes FROM vault_documents WHERE user_id=$1",
      [userId],
    );
    const byCategory = await db.query(
      "SELECT category, COUNT(*) as count, COALESCE(SUM(file_size),0) as bytes FROM vault_documents WHERE user_id=$1 GROUP BY category",
      [userId],
    );

    const totalBytes = parseInt(totalResult.rows[0].total_bytes, 10);
    res.json({
      success: true,
      data: {
        totalFiles: parseInt(totalResult.rows[0].count, 10),
        totalBytes,
        totalMB: (totalBytes / (1024 * 1024)).toFixed(2),
        totalGB: (totalBytes / (1024 * 1024 * 1024)).toFixed(3),
        byCategory: byCategory.rows,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch storage stats", details: error.message });
  }
});

/**
 * POST /api/vault/documents/:id/reprocess
 */
router.post("/documents/:id/reprocess", requireAuth, vaultRateLimiter, async (req, res) => {
  try {
    const userId = String(req.session.userId ?? "");
    const db = getPool();
    const result = await db.query("SELECT * FROM vault_documents WHERE id=$1", [req.params.id]);
    const doc = result.rows[0];
    if (!doc || doc.user_id !== userId) return res.status(404).json({ error: "Document not found" });

    // Mark as pending before reprocessing
    await db.query(
      `UPDATE vault_documents SET ai_processing_status='pending', updated_at=NOW() WHERE id=$1`,
      [req.params.id],
    );

    // Download from R2
    const { GetObjectCommand: GetObjCmd } = await import("@aws-sdk/client-s3");
    const r2Result = await getR2().send(new GetObjCmd({ Bucket: getBucket(), Key: doc.file_key }));
    const chunks: Buffer[] = [];
    const body = r2Result.Body as NodeJS.ReadableStream;
    await new Promise<void>((resolve, reject) => {
      body.on("data", (chunk: Buffer) => chunks.push(chunk));
      body.on("end", resolve);
      body.on("error", reject);
    });
    const buffer = Buffer.concat(chunks);

    const ai = await withTimeout(
      processDocumentWithAI(buffer, doc.mime_type, doc.category, doc.file_name, userId),
      120000,
      "Document AI analysis timed out",
    );
    await db.query(
      `UPDATE vault_documents SET ai_summary=$1, extracted_data=$2, tags=$3, category=$4, subcategory=$5, expiry_date=COALESCE($6::date, expiry_date), ai_processing_status='completed', updated_at=NOW() WHERE id=$7`,
      [ai.summary, JSON.stringify(ai.extractedData), ai.tags, ai.suggestedCategory || doc.category, ai.suggestedSubcategory || null, ai.expiryDate || null, req.params.id],
    );

    const updated = await db.query("SELECT * FROM vault_documents WHERE id=$1", [req.params.id]);
    res.json({ success: true, data: updated.rows[0] });
  } catch (error: any) {
    console.error("[Vault] Reprocess error:", error);
    // Mark as failed so the client can show an appropriate error state
    try {
      await getPool().query(
        `UPDATE vault_documents SET ai_processing_status='failed', updated_at=NOW() WHERE id=$1`,
        [req.params.id],
      );
    } catch { /* ignore secondary error */ }
    res.status(500).json({ error: "Failed to reprocess document", details: error.message });
  }
});

export default router;

// Export for use in email scheduler
export async function checkVaultExpiryNotifications(): Promise<void> {
  const db = getPool();
  try {
    // Get documents expiring within 30 days that haven't been notified
    const result = await db.query(`
      SELECT vd.*, u.email
      FROM vault_documents vd
      JOIN users u ON u.id::text = vd.user_id
      WHERE vd.expiry_date IS NOT NULL
        AND vd.expiry_date <= NOW() + INTERVAL '30 days'
        AND vd.expiry_date >= NOW()
        AND vd.expiry_notified = false
    `);

    for (const doc of result.rows) {
      if (!doc.email) continue;

      const expiryDate = new Date(doc.expiry_date);
      const daysRemaining = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      const fromEmail = process.env.ALERT_EMAIL_FROM;
      if (!fromEmail || !process.env.POSTMARK_USERNAME) continue;

      const subject = `⚠️ Document Expiring Soon: ${doc.display_name || doc.file_name}`;
      const body = `Hello,

Your document is expiring soon!

Document: ${doc.display_name || doc.file_name}
Category: ${doc.category}
Expiry Date: ${expiryDate.toLocaleDateString("en-CA")}
Days Remaining: ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}

Log in to your Financial Vault to view and update this document:
${process.env.APP_URL || "https://app.budgetsmart.io"}/vault

Best regards,
BudgetSmart AI`;

      try {
        await sendEmailViaPostmark({ from: fromEmail, to: doc.email, subject, text: body });
        await db.query("UPDATE vault_documents SET expiry_notified=true WHERE id=$1", [doc.id]);
        console.log(`[Vault] Expiry notification sent for doc ${doc.id}`);
      } catch (emailErr) {
        console.error(`[Vault] Failed to send expiry notification for doc ${doc.id}:`, emailErr);
      }
    }
  } catch (err) {
    console.error("[Vault] Expiry notification check failed:", err);
  }
}
