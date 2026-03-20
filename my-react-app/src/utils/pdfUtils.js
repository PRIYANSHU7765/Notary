import { PDFDocument, degrees } from "pdf-lib";

// Converts an image data URL (PNG, JPEG, SVG, etc.) into a PNG ArrayBuffer.
export async function toPngArrayBuffer(imageDataUrl) {
  if (!imageDataUrl) {
    throw new Error("Missing image data URL");
  }

  // If the URL is already a base64 PNG/JPEG, decode directly.
  const dataUrlMatch = /^data:(image\/(png|jpeg|jpg))(;base64)?,(.*)$/i.exec(imageDataUrl);
  if (dataUrlMatch) {
    const base64 = dataUrlMatch[4];
    return base64ToUint8Array(base64);
  }

  // For SVG or unknown types, render through a canvas.
  let image;
  try {
    image = await new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(new Error("Failed to load image"));
      img.src = imageDataUrl;
    });
  } catch (err) {
    // Fallback: try fetching the resource and using a blob URL (helps with some SVG/data URL edge cases).
    try {
      const response = await fetch(imageDataUrl);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      image = await new Promise((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(new Error('Failed to load image from blob URL'));
        img.src = objectUrl;
      });
      URL.revokeObjectURL(objectUrl);
    } catch (fetchErr) {
      throw new Error(`Failed to load image for PDF embedding: ${fetchErr?.message || fetchErr}`);
    }
  }

  // Some SVGs may report 0 natural size; fallback to reasonable defaults.
  const naturalWidth = image.naturalWidth || image.width || 250;
  const naturalHeight = image.naturalHeight || image.height || 100;

  const canvas = document.createElement("canvas");
  canvas.width = naturalWidth;
  canvas.height = naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  // Prefer toBlob, but fallback to toDataURL if it fails (some browsers may return null blob when canvas is tainted).
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) {
        resolve(b);
        return;
      }
      try {
        const dataUrl = canvas.toDataURL("image/png");
        const base64 = dataUrl.split(",")[1] || "";
        resolve(new Blob([base64ToUint8Array(base64)], { type: "image/png" }));
      } catch (err) {
        reject(new Error("Failed to convert image to PNG"));
      }
    }, "image/png");
  });

  return await blob.arrayBuffer();
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Generates a PDF that includes the provided elements rendered on the first page of the original PDF.
 *
 * @param {string|File} pdfSource - A data URL or File object containing the original PDF.
 * @param {Array} elements - Array of elements (with image, x, y, width, height) to overlay.
 * @param {object} options
 * @param {number} options.editorWidth - The editor canvas width used when placing elements (default 900).
 * @param {number} options.editorHeight - The editor canvas height used when placing elements (default 1300).
 * @returns {Promise<string>} A data URL (base64) of the generated PDF.
 */
export async function generateNotarizedPdfBytes(pdfSource, elements = [], { editorWidth = 900, editorHeight = 1300 } = {}) {
  if (!pdfSource) {
    throw new Error("Missing PDF source");
  }

  // Load the PDF bytes
  const inputBytes =
    typeof pdfSource === "string"
      ? await fetch(pdfSource).then((res) => res.arrayBuffer())
      : await pdfSource.arrayBuffer();

  const pdfDoc = await PDFDocument.load(inputBytes);
  const pages = pdfDoc.getPages();
  if (!pages || pages.length === 0) {
    throw new Error("PDF has no pages");
  }

  const firstPage = pages[0];
  const { width: pdfWidth, height: pdfHeight } = firstPage.getSize();

  for (const element of elements || []) {
    if (!element || !element.image) continue;

    try {
      const pngBytes = await toPngArrayBuffer(element.image);
      const embeddedImage = await pdfDoc.embedPng(pngBytes);

      const drawWidth = ((element.width || 100) / editorWidth) * pdfWidth;
      const drawHeight = ((element.height || 100) / editorHeight) * pdfHeight;
      const drawX = (element.x / editorWidth) * pdfWidth;
      const drawY = pdfHeight - (((element.y || 0) + (element.height || 100)) / editorHeight) * pdfHeight;

      firstPage.drawImage(embeddedImage, {
        x: drawX,
        y: drawY,
        width: Math.max(1, drawWidth),
        height: Math.max(1, drawHeight),
        rotate: degrees(element.rotation || 0),
      });
    } catch (err) {
      // Silently ignore any elements that fail to embed (e.g., invalid image format)
      console.warn("[pdfUtils] Failed to embed element in PDF:", err);
    }
  }

  const outputBytes = await pdfDoc.save();
  return outputBytes;
}

export function bytesToDataUrl(bytes, mime = "application/pdf") {
  const base64 = arrayBufferToBase64(bytes);
  return `data:${mime};base64,${base64}`;
}

export function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
