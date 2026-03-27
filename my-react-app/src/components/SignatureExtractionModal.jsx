import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  cropCandidateToPngDataUrl,
  extractSignatureCandidatesFromPdf,
} from "../utils/signatureExtraction";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const modalOverlayStyle = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(2, 6, 23, 0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1600,
  padding: "16px",
};

const modalCardStyle = {
  width: "min(1080px, 96vw)",
  maxHeight: "92vh",
  overflow: "hidden",
  display: "grid",
  gridTemplateRows: "auto 1fr auto",
  background: "#ffffff",
  borderRadius: "14px",
  boxShadow: "0 26px 48px rgba(15, 23, 42, 0.36)",
  color: "#000000",
};

const statusTagStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "3px 10px",
  borderRadius: "999px",
  fontSize: "12px",
  fontWeight: 700,
  border: "1px solid #cbd5e1",
  color: "#0f172a",
  background: "#f8fafc",
};

const SignatureExtractionModal = ({
  open,
  pdfDataUrl,
  onClose,
  onSave,
  title = "Extract Signature",
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [candidates, setCandidates] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [previewDataUrl, setPreviewDataUrl] = useState("");
  const [resultCanvas, setResultCanvas] = useState(null);
  const [analysisInfo, setAnalysisInfo] = useState({ confidence: 0.25, iou: 0.45 });
  const [localPdfDataUrl, setLocalPdfDataUrl] = useState("");
  const [currentInputType, setCurrentInputType] = useState("pdf");

  const effectivePdfDataUrl = pdfDataUrl || localPdfDataUrl;
  const pageCanvasRef = useRef(null);

  const selectedCandidate = useMemo(() => candidates[selectedIndex] || null, [candidates, selectedIndex]);

  const runExtraction = async (targetPage, options = analysisInfo, sourceDataUrl = effectivePdfDataUrl) => {
    if (!sourceDataUrl) {
      setError("Upload or open a PDF/image before extracting signature.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await extractSignatureCandidatesFromPdf(effectivePdfDataUrl, targetPage, {
        confidence: options.confidence,
        iou: options.iou,
      });

      setResultCanvas(result.canvas);
      setCandidates(result.candidates);
      setSelectedIndex(0);
      setPageNumber(result.pageNumber);
      setTotalPages(result.totalPages || 1);
      setAnalysisInfo({ confidence: options.confidence, iou: options.iou });

      if (!result.candidates.length) {
        setError("No signature candidates found on this page. Try another page.");
        if (currentInputType === 'image' || sourceDataUrl?.startsWith('data:image/')) {
          setPreviewDataUrl(sourceDataUrl);
        }
      }
    } catch (err) {
      setPreviewDataUrl("");
      setCandidates([]);
      setError(err?.message || "Failed to analyze PDF/image for signature extraction.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;

    if (!effectivePdfDataUrl) {
      setError("Upload or open a PDF/image before extracting signature.");
      setCandidates([]);
      setPreviewDataUrl("");
      setResultCanvas(null);
      return;
    }

    runExtraction(1, analysisInfo, effectivePdfDataUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, effectivePdfDataUrl, currentInputType]);

  useEffect(() => {
    if (!resultCanvas || !pageCanvasRef.current) return;

    const displayCanvas = pageCanvasRef.current;
    displayCanvas.width = resultCanvas.width;
    displayCanvas.height = resultCanvas.height;

    const context = displayCanvas.getContext("2d");
    context.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
    context.drawImage(resultCanvas, 0, 0);

    candidates.forEach((candidate, index) => {
      const isActive = index === selectedIndex;
      context.lineWidth = isActive ? 4 : 2;
      context.strokeStyle = isActive ? "#16a34a" : "#ef4444";
      context.strokeRect(candidate.x, candidate.y, candidate.width, candidate.height);

      const label = `${index + 1}`;
      context.font = "bold 14px Segoe UI";
      const textWidth = context.measureText(label).width + 10;
      const tagX = candidate.x;
      const tagY = Math.max(candidate.y - 22, 2);
      context.fillStyle = isActive ? "#16a34a" : "#ef4444";
      context.fillRect(tagX, tagY, textWidth, 20);
      context.fillStyle = "#ffffff";
      context.fillText(label, tagX + 5, tagY + 14);
    });

    if (selectedCandidate) {
      try {
        const dataUrl = cropCandidateToPngDataUrl(resultCanvas, selectedCandidate);
        setPreviewDataUrl(dataUrl);
      } catch (err) {
        setPreviewDataUrl("");
        setError(err?.message || "Failed to create selected signature preview.");
      }
    }
  }, [resultCanvas, candidates, selectedIndex, selectedCandidate]);

  const handleSave = async () => {
    if (!previewDataUrl) {
      setError("Select a signature candidate before saving.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await onSave?.({
        imageDataUrl: previewDataUrl,
        pageNumber,
        candidate: selectedCandidate,
      });
      onClose?.();
    } catch (err) {
      setError(err?.message || "Failed to save extracted signature.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalCardStyle} onClick={(event) => event.stopPropagation()}>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
            <div>
              <h3 style={{ margin: 0, color: "#0f172a" }}>{title}</h3>
              <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "13px" }}>
                Detecting signatures using YOLOv8 (Hugging Face model).
              </p>
            </div>
            <div style={statusTagStyle}>
              <span>Page</span>
              <strong>{pageNumber}</strong>
              <span>/</span>
              <strong>{totalPages}</strong>
            </div>
          </div>
        </div>

        <div style={{ padding: "16px", display: "grid", gridTemplateColumns: "1fr", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <label htmlFor="signature-file-upload" style={{ fontWeight: 600, color: "#0f172a" }}>
              PDF/Image Document
            </label>
            <input
              id="signature-file-upload"
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;

                const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
                const isImage = file.type.startsWith('image/') || /\.(jpe?g|png)$/i.test(file.name);

                if (!isPdf && !isImage) {
                  setError('Please select PDF, JPG, JPEG, or PNG for signature extraction');
                  return;
                }

                const reader = new FileReader();
                reader.onload = async () => {
                  if (!reader.result) return;

                  const dataUrl = reader.result.toString();
                  setLocalPdfDataUrl(dataUrl);
                  setCurrentInputType(isPdf ? 'pdf' : 'image');
                  setError('');

                  if (isImage) {
                    setPreviewDataUrl(dataUrl);
                  } else {
                    setPreviewDataUrl('');
                    setPageNumber(1);
                    setTotalPages(1);
                  }

                  setCandidates([]);
                  setResultCanvas(null);

                  await runExtraction(1, analysisInfo, dataUrl);
                };
                reader.onerror = () => setError('Unable to read the selected file');
                reader.readAsDataURL(file);
              }}
              style={{ padding: '4px' }}
            />
            <button
              type="button"
              onClick={() => {
                if (!effectivePdfDataUrl) {
                  setError('Upload or open a document before scanning.');
                  return;
                }

                runExtraction(pageNumber, analysisInfo, effectivePdfDataUrl);
              }}
              disabled={loading}
              style={{
                border: 'none',
                borderRadius: '8px',
                background: loading ? '#94a3b8' : '#0ea5e9',
                color: '#fff',
                fontWeight: 700,
                padding: '9px 12px',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {currentInputType === 'image' ? 'Use Image' : 'Scan PDF'}
            </button>
          </div>

          <div
            style={{
              border: "1px solid #cbd5e1",
              borderRadius: "10px",
              background: "#f8fafc",
              overflow: "auto",
              maxHeight: "60vh",
            }}
          >
            {loading ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "#475569", fontWeight: 600 }}>
                Running YOLO signature detection on this page...
              </div>
            ) : currentInputType === 'image' && previewDataUrl ? (
              <img
                src={previewDataUrl}
                alt="Uploaded image preview"
                style={{ display: 'block', width: '100%', height: 'auto', objectFit: 'contain' }}
              />
            ) : (
              <canvas
                ref={pageCanvasRef}
                style={{
                  display: "block",
                  width: "100%",
                  height: "auto",
                }}
              />
            )}
          </div>

          <div style={{ display: "grid", gap: "12px", alignContent: "start" }}>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "10px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                Scan Page
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={pageNumber}
                  onChange={(event) => setPageNumber(clamp(Number(event.target.value) || 1, 1, totalPages))}
                  style={{
                    flex: 1,
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    padding: "9px",
                    fontSize: "13px",
                  }}
                />
                <button
                  type="button"
                  onClick={() => runExtraction(pageNumber, analysisInfo)}
                  disabled={loading}
                  style={{
                    border: "none",
                    borderRadius: "8px",
                    background: loading ? "#94a3b8" : "#0ea5e9",
                    color: "#fff",
                    fontWeight: 700,
                    padding: "9px 12px",
                    cursor: loading ? "not-allowed" : "pointer",
                  }}
                >
                  Scan
                </button>
              </div>
            </div>

            <div style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "10px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                Candidates
              </label>
              <select
                value={selectedIndex}
                onChange={(event) => setSelectedIndex(Number(event.target.value))}
                disabled={!candidates.length || loading}
                style={{
                  width: "100%",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  padding: "9px",
                  fontSize: "13px",
                  background: candidates.length ? "#fff" : "#f1f5f9",
                  color: "#000",
                }}
              >
                {candidates.length ? (
                  candidates.map((candidate, index) => (
                    <option key={`${candidate.x}-${candidate.y}-${index}`} value={index}>
                      {`#${index + 1} (${Math.round(candidate.width)}x${Math.round(candidate.height)})`}
                    </option>
                  ))
                ) : (
                  <option value={0}>No candidates</option>
                )}
              </select>
              <p style={{ margin: "8px 0 0", color: "#000", fontSize: "12px" }}>
                Green box is selected candidate.
              </p>
            </div>

            <div style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "10px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                Preview (PNG)
              </label>
              {previewDataUrl ? (
                <img
                  src={previewDataUrl}
                  alt="Extracted signature preview"
                  style={{ width: "100%", maxHeight: "160px", objectFit: "contain", background: "#fff", borderRadius: "6px" }}
                />
              ) : (
                <div style={{ padding: "18px 10px", borderRadius: "6px", background: "#f8fafc", color: "#64748b", fontSize: "12px", textAlign: "center" }}>
                  Select candidate to preview
                </div>
              )}
            </div>

            {error ? (
              <div style={{ borderRadius: "8px", background: "#fef2f2", color: "#b91c1c", fontSize: "12px", fontWeight: 700, padding: "8px 10px" }}>
                {error}
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ padding: "12px 16px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              background: "#fff",
              color: "#334155",
              fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !previewDataUrl}
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              border: "none",
              background: saving || !previewDataUrl ? "#94a3b8" : "#16a34a",
              color: "#fff",
              fontWeight: 700,
              cursor: saving || !previewDataUrl ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving..." : "Save Signature"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SignatureExtractionModal;
