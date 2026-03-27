/**
 * Signature Extraction Routes
 * AI-powered signature detection using YOLOv8
 */

const express = require('express');
const { runPythonSignatureExtractor } = require('../services/signatureExtractService');

const router = express.Router();

/**
 * POST /api/signature-extraction/extract-yolo
 * Extract signature candidates from a PDF or image using YOLOv8
 * 
 * Request body:
 * {
 *   "dataUrl": "data:application/pdf;base64,..." or "data:image/png;base64,...",
 *   "pageNumber": 1 (optional, default: 1),
 *   "confidence": 0.25 (optional, default: 0.25),
 *   "iou": 0.45 (optional, default: 0.45),
 *   "maxDetections": 15 (optional, default: 15)
 * }
 */
const handleExtractYolo = async (req, res) => {
  try {
    const {
      dataUrl,
      pageNumber = 1,
      confidence = 0.25,
      iou = 0.45,
      maxDetections = 15,
    } = req.body || {};

    if (!dataUrl) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required field: dataUrl (PDF or image data URL)',
      });
    }

    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      return res.status(400).json({
        ok: false,
        error: 'dataUrl must be a valid data URL (data:mime/type;base64,...)',
      });
    }

    const payload = {
      dataUrl,
      pageNumber: Math.max(1, parseInt(pageNumber, 10) || 1),
      confidence: Math.max(0, Math.min(1, parseFloat(confidence) || 0.25)),
      iou: Math.max(0, Math.min(1, parseFloat(iou) || 0.45)),
      maxDetections: Math.max(1, parseInt(maxDetections, 10) || 15),
    };

    console.log(`🔍 Extracting signatures from data (confidence=${payload.confidence})`);

    const result = await runPythonSignatureExtractor(payload);

    const response = {
      ok: true,
      pageNumber: result.pageNumber || payload.pageNumber,
      totalPages: result.totalPages || 1,
      pageImageDataUrl: result.pageImageDataUrl || null,
      candidates: Array.isArray(result.candidates) ? result.candidates : [],
      model: result.model || 'tech4humans/yolov8s-signature-detector',
    };

    console.log(`✅ Signature extraction complete: ${response.candidates.length} candidates found`);
    res.json(response);
  } catch (error) {
    console.error('❌ Signature extraction error:', error?.message || error);
    res.status(500).json({
      ok: false,
      error: error?.message || 'Signature extraction failed',
      details: error?.message,
    });
  }
};

router.post('/extract-yolo', handleExtractYolo);
router.post('/signature-extract-yolo', handleExtractYolo);

module.exports = router;
