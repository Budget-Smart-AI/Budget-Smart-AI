import express from "express";
import multer from "multer";
import { processReceiptUpload, generateSignedUrl } from "../receipt-scanner";
import { requireAuth as authenticate } from "../auth";
import { storage } from "../storage";

const router = express.Router();

// Configure multer for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept images and PDFs
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WEBP, and PDF are allowed.'));
    }
  }
});

/**
 * @route POST /api/receipts/upload
 * @desc Upload and process a single receipt
 * @access Private
 */
router.post('/upload', authenticate, upload.single('receipt'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = String(req.session.userId ?? '');

    // Fetch user's expenses and manual transactions for matching
    const [expenses, manualTx] = await Promise.all([
      storage.getExpenses(userId),
      storage.getManualTransactionsByUser(userId),
    ]);
    const userTransactions = [
      ...expenses.map(e => ({ id: e.id, amount: parseFloat(e.amount), merchant: e.merchant, date: e.date })),
      ...manualTx.map(t => ({ id: t.id, amount: parseFloat(t.amount), merchant: t.merchant, date: t.date })),
    ];

    const result = await processReceiptUpload(req.file, userId, userTransactions);

    // Persist receipt to database
    const topMatch = result.matches[0];
    const saved = await storage.createReceipt({
      userId,
      merchant: result.receiptData.merchant,
      amount: String(result.receiptData.amount),
      date: result.receiptData.date,
      category: result.receiptData.category,
      items: JSON.stringify(result.receiptData.items),
      confidence: result.receiptData.confidence,
      imageUrl: result.signedUrl || null,
      rawText: result.rawText || null,
      matchedTransactionId: topMatch?.status === 'auto-matched' ? topMatch.transactionId : null,
      matchStatus: topMatch?.status === 'auto-matched' ? 'auto-matched' : 'unmatched',
      createdAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: 'Receipt processed successfully',
      data: {
        id: saved.id,
        receipt: result.receiptData,
        matches: result.matches,
        signedUrl: result.signedUrl,
        processingTime: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('Receipt upload error:', error);
    res.status(500).json({
      error: 'Failed to process receipt',
      details: error.message
    });
  }
});

/**
 * @route POST /api/receipts/upload-multiple
 * @desc Upload and process multiple receipts
 * @access Private
 */
router.post('/upload-multiple', authenticate, upload.array('receipts', 10), async (req, res) => {
  try {
    if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const files = req.files as Express.Multer.File[];
    const userId = String(req.session.userId ?? '');

    // Fetch user's transactions once for all receipts
    const [expenses, manualTx] = await Promise.all([
      storage.getExpenses(userId),
      storage.getManualTransactionsByUser(userId),
    ]);
    const userTransactions = [
      ...expenses.map(e => ({ id: e.id, amount: parseFloat(e.amount), merchant: e.merchant, date: e.date })),
      ...manualTx.map(t => ({ id: t.id, amount: parseFloat(t.amount), merchant: t.merchant, date: t.date })),
    ];

    const results: any[] = [];
    
    for (const file of files) {
      try {
        const result = await processReceiptUpload(file, userId, userTransactions);

        // Persist receipt to database
        const topMatch = result.matches[0];
        const saved = await storage.createReceipt({
          userId,
          merchant: result.receiptData.merchant,
          amount: String(result.receiptData.amount),
          date: result.receiptData.date,
          category: result.receiptData.category,
          items: JSON.stringify(result.receiptData.items),
          confidence: result.receiptData.confidence,
          imageUrl: result.signedUrl || null,
          rawText: result.rawText || null,
          matchedTransactionId: topMatch?.status === 'auto-matched' ? topMatch.transactionId : null,
          matchStatus: topMatch?.status === 'auto-matched' ? 'auto-matched' : 'unmatched',
          createdAt: new Date().toISOString(),
        });

        results.push({
          filename: file.originalname,
          success: true,
          data: {
            id: saved.id,
            receipt: result.receiptData,
            matches: result.matches,
            signedUrl: result.signedUrl,
          }
        });
      } catch (fileError: any) {
        results.push({
          filename: file.originalname,
          success: false,
          error: fileError.message
        });
      }
    }

    res.json({
      success: true,
      message: `${results.filter(r => r.success).length} of ${files.length} receipts processed`,
      results
    });
  } catch (error: any) {
    console.error('Multiple receipt upload error:', error);
    res.status(500).json({
      error: 'Failed to process receipts',
      details: error.message
    });
  }
});

/**
 * @route GET /api/receipts
 * @desc Get user's receipts
 * @access Private
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = String(req.session.userId ?? '');
    const { category, startDate, endDate } = req.query;

    const receiptList = await storage.getReceipts(userId, {
      category: category as string | undefined,
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
    });

    res.json({
      success: true,
      data: {
        receipts: receiptList,
        total: receiptList.length,
      }
    });
  } catch (error: any) {
    console.error('Get receipts error:', error);
    res.status(500).json({
      error: 'Failed to fetch receipts',
      details: error.message
    });
  }
});

/**
 * @route GET /api/receipts/:receiptId
 * @desc Get a single receipt
 * @access Private
 */
router.get('/:receiptId', authenticate, async (req, res) => {
  try {
    const userId = String(req.session.userId ?? '');
    const receipt = await storage.getReceipt(req.params.receiptId);
    if (!receipt || receipt.userId !== userId) {
      return res.status(404).json({ error: 'Receipt not found' });
    }
    res.json({ success: true, data: receipt });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch receipt', details: error.message });
  }
});

/**
 * @route POST /api/receipts/:receiptId/match
 * @desc Manually match receipt with transaction
 * @access Private
 */
router.post('/:receiptId/match', authenticate, async (req, res) => {
  try {
    const userId = String(req.session.userId ?? '');
    const { transactionId } = req.body;
    const { receiptId } = req.params;

    const receipt = await storage.getReceipt(receiptId);
    if (!receipt || receipt.userId !== userId) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const updated = await storage.updateReceipt(receiptId, {
      matchedTransactionId: transactionId || null,
      matchStatus: transactionId ? 'manual-match' : 'unmatched',
    });

    res.json({
      success: true,
      message: transactionId ? 'Receipt manually matched with transaction' : 'Receipt match removed',
      data: updated
    });
  } catch (error: any) {
    console.error('Manual match error:', error);
    res.status(500).json({ error: 'Failed to match receipt', details: error.message });
  }
});

/**
 * @route PATCH /api/receipts/:receiptId
 * @desc Update receipt details (category, notes, etc.)
 * @access Private
 */
router.patch('/:receiptId', authenticate, async (req, res) => {
  try {
    const userId = String(req.session.userId ?? '');
    const { receiptId } = req.params;

    const receipt = await storage.getReceipt(receiptId);
    if (!receipt || receipt.userId !== userId) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const { category, notes, merchant, amount, date } = req.body;
    const updated = await storage.updateReceipt(receiptId, {
      ...(category !== undefined && { category }),
      ...(notes !== undefined && { notes }),
      ...(merchant !== undefined && { merchant }),
      ...(amount !== undefined && { amount: String(amount) }),
      ...(date !== undefined && { date }),
    });

    res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Update receipt error:', error);
    res.status(500).json({ error: 'Failed to update receipt', details: error.message });
  }
});

/**
 * @route DELETE /api/receipts/:receiptId
 * @desc Delete a receipt
 * @access Private
 */
router.delete('/:receiptId', authenticate, async (req, res) => {
  try {
    const userId = String(req.session.userId ?? '');
    const { receiptId } = req.params;

    const receipt = await storage.getReceipt(receiptId);
    if (!receipt || receipt.userId !== userId) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    await storage.deleteReceipt(receiptId);

    res.json({ success: true, message: 'Receipt deleted successfully' });
  } catch (error: any) {
    console.error('Delete receipt error:', error);
    res.status(500).json({ error: 'Failed to delete receipt', details: error.message });
  }
});

/**
 * @route GET /api/receipts/:fileKey/url  (legacy - kept for compatibility)
 * @desc Get signed URL for receipt file
 * @access Private
 */
router.get('/:fileKey/url', authenticate, async (req, res) => {
  try {
    const { fileKey } = req.params;
    const signedUrl = await generateSignedUrl(String(fileKey));
    res.json({ success: true, signedUrl, expiresIn: '24 hours' });
  } catch (error: any) {
    console.error('Get signed URL error:', error);
    res.status(500).json({ error: 'Failed to generate signed URL', details: error.message });
  }
});

export default router;