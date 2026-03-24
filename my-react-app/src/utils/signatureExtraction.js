import { extractSignatureCandidatesWithYolo } from "./apiClient";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const DEFAULT_OPTIONS = {
  confidence: 0.25,
  iou: 0.45,
  maxDetections: 15,
};

export async function renderImageToCanvas(imageSource) {
  if (!imageSource || typeof imageSource !== "string") {
    throw new Error("Image data URL is required for image-based signature extraction.");
  }

  const img = await new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = (err) => reject(new Error("Failed to load image for signature extraction."));
    image.src = imageSource;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width || 1024;
  canvas.height = img.naturalHeight || img.height || 768;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return {
    canvas,
    pageNumber: 1,
    totalPages: 1,
  };
}
function normalizeCandidate(candidate) {
  return {
    x: Number(candidate?.x) || 0,
    y: Number(candidate?.y) || 0,
    width: Number(candidate?.width) || 0,
    height: Number(candidate?.height) || 0,
    confidence: Number(candidate?.confidence) || 0,
    label: String(candidate?.label || "signature"),
  };
}

export async function extractSignatureCandidatesFromPdf(pdfSource, pageNumber = 1, customOptions = {}) {
  if (!pdfSource || typeof pdfSource !== "string") {
    throw new Error("A PDF or image data URL is required for signature extraction.");
  }

  const options = { ...DEFAULT_OPTIONS, ...customOptions };
  const response = await extractSignatureCandidatesWithYolo({
    dataUrl: pdfSource,
    pageNumber,
    confidence: options.confidence,
    iou: options.iou,
    maxDetections: options.maxDetections,
  });

  const pageImageDataUrl = String(response?.pageImageDataUrl || "");
  if (!pageImageDataUrl) {
    throw new Error("YOLO extractor did not return a page image.");
  }

  const rendered = await renderImageToCanvas(pageImageDataUrl);
  const candidates = Array.isArray(response?.candidates)
    ? response.candidates.map(normalizeCandidate)
    : [];

  return {
    canvas: rendered.canvas,
    candidates,
    pageNumber: Number(response?.pageNumber) || rendered.pageNumber || 1,
    totalPages: Number(response?.totalPages) || rendered.totalPages || 1,
    model: response?.model || "tech4humans/yolov8s-signature-detector",
  };
}

function trimWhitespace(canvas, alphaThreshold = 8, whiteThreshold = 245) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const data = context.getImageData(0, 0, width, height).data;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      const isInk = a > alphaThreshold && (r < whiteThreshold || g < whiteThreshold || b < whiteThreshold);
      if (!isInk) continue;

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    return canvas;
  }

  const pad = 6;
  const cropX = clamp(minX - pad, 0, width - 1);
  const cropY = clamp(minY - pad, 0, height - 1);
  const cropWidth = clamp(maxX - minX + 1 + pad * 2, 1, width - cropX);
  const cropHeight = clamp(maxY - minY + 1 + pad * 2, 1, height - cropY);

  const output = document.createElement("canvas");
  output.width = cropWidth;
  output.height = cropHeight;
  const outputCtx = output.getContext("2d", { willReadFrequently: true });
  outputCtx.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

  // Make white-ish background transparent and keep ink strokes opaque.
  const outputData = outputCtx.getImageData(0, 0, cropWidth, cropHeight);
  const pixels = outputData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];

    const isWhite = r >= whiteThreshold && g >= whiteThreshold && b >= whiteThreshold;
    const isTransparent = a <= alphaThreshold;

    if (isWhite || isTransparent) {
      pixels[i + 3] = 0;
    }
  }
  outputCtx.putImageData(outputData, 0, 0);

  return output;
}

export function cropCandidateToPngDataUrl(canvas, candidate, extraPadding = 10) {
  if (!canvas || !candidate) {
    throw new Error("Missing canvas or candidate for crop.");
  }

  const x = clamp(Math.floor(candidate.x - extraPadding), 0, canvas.width - 1);
  const y = clamp(Math.floor(candidate.y - extraPadding), 0, canvas.height - 1);
  const width = clamp(Math.ceil(candidate.width + extraPadding * 2), 1, canvas.width - x);
  const height = clamp(Math.ceil(candidate.height + extraPadding * 2), 1, canvas.height - y);

  const cropped = document.createElement("canvas");
  cropped.width = width;
  cropped.height = height;
  cropped.getContext("2d").drawImage(canvas, x, y, width, height, 0, 0, width, height);

  const trimmed = trimWhitespace(cropped);
  return trimmed.toDataURL("image/png");
}
