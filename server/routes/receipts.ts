import express from "express";
import multer from "multer";
import { processReceiptUpload, generateSignedUrl } from "../receipt-scanner";
import { requireAuth as authenticate } from "../auth";

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
 * @desc Upload and process a receipt
 * @access Private
 */
router.post('/upload', authenticate, upload.single('receipt'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get user transactions for matching (in real app, fetch from database)
    const userTransactions: any[] = []; // TODO: Fetch from database
    
    const result = await processReceiptUpload(
      req.file,
      String(req.session.userId ?? ''),
      userTransactions
    );

    res.json({
      success: true,
      message: 'Receipt processed successfully',
      data: {
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
    const results: any[] = [];
    
    // Get user transactions for matching
    const userTransactions: any[] = []; // TODO: Fetch from database
    
    for (const file of files) {
      try {
        const result = await processReceiptUpload(
          file,
          String(req.session.userId ?? ''),
          userTransactions
        );
        
        results.push({
          filename: file.originalname,
          success: true,
          data: result
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
 * @route GET /api/receipts/:fileKey/url
 * @desc Get signed URL for receipt file
 * @access Private
 */
router.get('/:fileKey/url', authenticate, async (req, res) => {
  try {
    const { fileKey } = req.params;
    
    // Verify user has access to this file
    // TODO: Add authorization check
    
    const signedUrl = await generateSignedUrl(String(fileKey));
    
    res.json({
      success: true,
      signedUrl,
      expiresIn: '24 hours'
    });
  } catch (error: any) {
    console.error('Get signed URL error:', error);
    res.status(500).json({
      error: 'Failed to generate signed URL',
      details: error.message
    });
  }
});

/**
 * @route POST /api/receipts/:receiptId/match
 * @desc Manually match receipt with transaction
 * @access Private
 */
router.post('/:receiptId/match', authenticate, async (req, res) => {
  try {
    const { receiptId } = req.params;
    const { transactionId } = req.body;
    
    // TODO: Implement manual matching logic
    // 1. Verify receipt exists and belongs to user
    // 2. Verify transaction exists and belongs to user
    // 3. Create match record in database
    // 4. Update transaction with receipt reference
    
    res.json({
      success: true,
      message: 'Receipt manually matched with transaction',
      data: {
        receiptId,
        transactionId,
        matchedAt: new Date().toISOString(),
        matchedBy: 'manual'
      }
    });
  } catch (error: any) {
    console.error('Manual match error:', error);
    res.status(500).json({
      error: 'Failed to match receipt',
      details: error.message
    });
  }
});

/**
 * @route POST /api/receipts/:receiptId/categorize
 * @desc Set category for receipt
 * @access Private
 */
router.post('/:receiptId/categorize', authenticate, async (req, res) => {
  try {
    const { receiptId } = req.params;
    const { category } = req.body;
    
    // TODO: Implement categorization logic
    // 1. Verify receipt exists and belongs to user
    // 2. Update receipt category in database
    // 3. If matched with transaction, update transaction category
    
    res.json({
      success: true,
      message: 'Receipt categorized',
      data: {
        receiptId,
        category,
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('Categorization error:', error);
    res.status(500).json({
      error: 'Failed to categorize receipt',
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
    const { page = 1, limit = 20, category, startDate, endDate } = req.query;
    
    // TODO: Implement receipt listing logic
    // 1. Fetch receipts from database with pagination
    // 2. Apply filters (category, date range)
    // 3. Generate signed URLs for each receipt
    
    const receipts: any[] = []; // Placeholder
    
    res.json({
      success: true,
      data: {
        receipts,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: receipts.length,
          totalPages: Math.ceil(receipts.length / Number(limit))
        }
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
 * @route DELETE /api/receipts/:receiptId
 * @desc Delete a receipt
 * @access Private
 */
router.delete('/:receiptId', authenticate, async (req, res) => {
  try {
    const { receiptId } = req.params;
    
    // TODO: Implement deletion logic
    // 1. Verify receipt exists and belongs to user
    // 2. Delete from R2 storage
    // 3. Delete from database
    // 4. Remove any transaction matches
    
    res.json({
      success: true,
      message: 'Receipt deleted successfully'
    });
  } catch (error: any) {
    console.error('Delete receipt error:', error);
    res.status(500).json({
      error: 'Failed to delete receipt',
      details: error.message
    });
  }
});

export default router;