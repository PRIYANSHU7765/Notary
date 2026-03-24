import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PdfViewer from "../components/PdfViewer";
import { fetchOwnerDocuments } from "../utils/apiClient";

const STATUS_COLORS = {
  uploaded: { bg: "#eef2ff", color: "#1e3a8a" },
  pending_review: { bg: "#fff7ed", color: "#92400e" },
  accepted: { bg: "#d1fae5", color: "#065f46" },
  session_started: { bg: "#cfe2ff", color: "#0a4e9b" },
  notarized: { bg: "#d1e7dd", color: "#0f5132" },
  rejected: { bg: "#fee2e2", color: "#991b1b" },
};

const formatDate = (iso) => {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const OwnerDocumentViewPage = () => {
  const { docId } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [previewMode, setPreviewMode] = useState("original");

  const authUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("notary.authUser") || "null") || {};
    } catch {
      return {};
    }
  }, []);

  useEffect(() => {
    if (!docId) {
      setError("No document specified.");
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const docs = await fetchOwnerDocuments({ ownerId: authUser.userId });
        const found = Array.isArray(docs) ? docs.find((d) => d.id === docId) : null;
        if (!found) {
          setError("Document not found.");
          setDoc(null);
        } else {
          setDoc(found);
          setPreviewMode("original");
        }
      } catch (err) {
        setError(err?.message || "Failed to load document.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [docId, authUser.userId]);

  const handleDownload = (dataUrl, fileName) => {
    if (!dataUrl) return;
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleDownloadNotarized = () => {
    if (!doc?.id) return;
    const downloadUrl = `/api/owner-documents/${doc.id}/notarized`;
    const fileName = `${doc.name?.replace(/\.pdf$/i, "") || "document"}-notarized.pdf`;
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const statusTag = (status) => {
    const key = String(status || "").trim().toLowerCase();
    const style = STATUS_COLORS[key] || { bg: "#f3f4f6", color: "#374151" };
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: "6px 12px",
          borderRadius: "999px",
          background: style.bg,
          color: style.color,
          fontWeight: 600,
          fontSize: "12px",
        }}
      >
        {key === "notarized" ? "✅" : key === "rejected" ? "❌" : "📌"}
        {key.replace(/_/g, " ") || "unknown"}
      </span>
    );
  };

  const handleBack = () => {
    navigate("/owner/doc/dashboard");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f7f8fc", fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      <div
        style={{
          background: "#fff",
          borderBottom: "1px solid #e8eaed",
          padding: "16px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <button
            onClick={handleBack}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "20px",
              color: "#4f6ef7",
              padding: "0 6px",
              lineHeight: 1,
              marginRight: "10px",
            }}
            title="Back to dashboard"
          >
            ←
          </button>
          <span style={{ fontSize: "20px", fontWeight: 700, color: "#1a1a2e" }}>
            Document Details
          </span>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {doc && (
            <button
              onClick={() => handleDownload(doc.dataUrl, doc.name)}
              style={{
                background: "#4f46e5",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                padding: "10px 16px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              ⬇️ Download Document
            </button>
          )}
          {doc?.notarized && (
            <button
              onClick={handleDownloadNotarized}
              style={{
                background: "#059669",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                padding: "10px 16px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              📄 Download Notarized
            </button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: "980px", margin: "0 auto", padding: "24px" }}>
        {loading ? (
          <div style={{ padding: "80px 20px", textAlign: "center", color: "#555" }}>
            <p style={{ fontSize: "18px" }}>Loading document details…</p>
          </div>
        ) : error ? (
          <div style={{ padding: "80px 20px", textAlign: "center", color: "#b91c1c" }}>
            <p style={{ fontSize: "18px", fontWeight: 600 }}>{error}</p>
            <p style={{ marginTop: "10px" }}>
              Return to the dashboard to pick another document.
            </p>
          </div>
        ) : !doc ? (
          <div style={{ padding: "80px 20px", textAlign: "center", color: "#555" }}>
            <p style={{ fontSize: "18px" }}>No document selected.</p>
          </div>
        ) : (
          <>
            <div
              style={{
                marginBottom: "20px",
                background: "#fff",
                border: "1px solid #e8eaed",
                borderRadius: "14px",
                padding: "18px 22px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "18px", fontWeight: 700, color: "#1a1a2e" }}>{doc.name}</div>
                  <div style={{ fontSize: "13px", color: "#555", marginTop: "4px" }}>
                    Uploaded {formatDate(doc.uploadedAt)} • {doc.size ? `${(doc.size / 1024).toFixed(1)} KB` : "–"}
                  </div>
                </div>
                <div>
                  {statusTag(doc.status)}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginTop: "18px" }}>
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Session ID
                  </div>
                  <div style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "8px", color: "#333", fontWeight: 600 }}>
                    <code style={{ background: "#f3f4f6", padding: "4px 8px", borderRadius: "6px" }}>
                      {doc.sessionId || "—"}
                    </code>
                    {doc.sessionId && (
                      <button
                        onClick={() => {
                          localStorage.setItem("notary.ownerSessionId", doc.sessionId);
                          navigate("/owner/session");
                        }}
                        style={{
                          border: "1px solid #cbd5e1",
                          background: "#fff",
                          color: "#1f2937",
                          borderRadius: "8px",
                          padding: "6px 10px",
                          cursor: "pointer",
                          fontSize: "12px",
                        }}
                      >
                        Join Session
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Notary
                  </div>
                  <div style={{ marginTop: "6px", color: "#333", fontWeight: 600 }}>
                    {doc.notaryName || doc.notaryId ? (
                      <span>
                        {doc.notaryName || doc.notaryId}
                        {doc.notaryReviewedAt ? ` (reviewed ${formatDate(doc.notaryReviewedAt)})` : ""}
                      </span>
                    ) : (
                      <span style={{ color: "#888" }}>No notary assigned yet</span>
                    )}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Review status
                  </div>
                  <div style={{ marginTop: "6px", color: "#333", fontWeight: 600 }}>
                    {doc.notaryReview ? doc.notaryReview.replace(/_/g, " ") : "pending"}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Notarized
                  </div>
                  <div style={{ marginTop: "6px", color: "#333", fontWeight: 600 }}>
                    {doc.notarized ? `Yes (${formatDate(doc.notarizedAt)})` : "No"}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: "16px" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Metadata
                </div>
                <pre
                  style={{
                    marginTop: "12px",
                    padding: "14px",
                    background: "#f3f4f6",
                    borderRadius: "10px",
                    fontSize: "12px",
                    overflowX: "auto",
                    maxHeight: "180px",
                  }}
                >
                  {JSON.stringify(
                    {
                      id: doc.id,
                      ownerId: doc.ownerId,
                      ownerName: doc.ownerName,
                      sessionId: doc.sessionId,
                      status: doc.status,
                      notaryReview: doc.notaryReview,
                      notaryName: doc.notaryName,
                      notaryReviewedAt: doc.notaryReviewedAt,
                      notarized: doc.notarized,
                      notarizedAt: doc.notarizedAt,
                      uploadedAt: doc.uploadedAt,
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>

            <div style={{ marginTop: "20px", background: "#fff", border: "1px solid #e8eaed", borderRadius: "14px", overflow: "hidden", display: "flex", flexDirection: "column", height: "calc(100vh - 300px)", minHeight: "560px" }}>
              <div style={{ padding: "18px 22px", borderBottom: "1px solid #e8eaed", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#1a1a2e" }}>Preview</div>
                  <div style={{ marginTop: "6px", color: "#555" }}>
                    {doc.dataUrl ? "View the current document stored in the system." : "No document content available."}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    onClick={() => setPreviewMode("original")}
                    disabled={!doc?.dataUrl}
                    style={{
                      border: previewMode === "original" ? "1px solid #4f46e5" : "1px solid #cbd5e1",
                      background: previewMode === "original" ? "#eef2ff" : "#fff",
                      color: previewMode === "original" ? "#4338ca" : "#1f2937",
                      borderRadius: "8px",
                      padding: "8px 14px",
                      cursor: doc?.dataUrl ? "pointer" : "not-allowed",
                      fontSize: "13px",
                      fontWeight: 600,
                    }}
                  >
                    Original
                  </button>
                  <button
                    onClick={() => setPreviewMode("notarized")}
                    disabled={!doc?.notarizedDataUrl && !doc?.notarized}
                    style={{
                      border: previewMode === "notarized" ? "1px solid #059669" : "1px solid #cbd5e1",
                      background: previewMode === "notarized" ? "#d1fae5" : "#fff",
                      color: previewMode === "notarized" ? "#065f46" : "#1f2937",
                      borderRadius: "8px",
                      padding: "8px 14px",
                      cursor: doc?.notarized ? "pointer" : "not-allowed",
                      fontSize: "13px",
                      fontWeight: 600,
                    }}
                  >
                    Notarized
                  </button>
                </div>
              </div>
              <div style={{ padding: "18px 22px", flex: 1, minHeight: 0, overflowY: "auto" }}>
                <div style={{ height: "100%", minHeight: "420px", background: "#fff", border: "1px solid #e8eaed", borderRadius: "12px", overflow: "hidden" }}>
                  {previewMode === "notarized" ? (
                    doc?.notarizedDataUrl ? (
                      <PdfViewer file={doc.notarizedDataUrl} fileName={`${doc.name?.replace(/\.pdf$/i, "") || "document"}-notarized.pdf`} containerHeight="100%" />
                    ) : doc?.notarized ? (
                      <p style={{ color: "#777" }}>
                        This document has been marked as notarized but no notarized PDF is currently available.
                        You can download the notarized version from the button above.
                      </p>
                    ) : (
                      <p style={{ color: "#777" }}>No notarized document is available yet.</p>
                    )
                  ) : doc?.dataUrl ? (
                    <PdfViewer file={doc.dataUrl} fileName={doc.name} containerHeight="100%" />
                  ) : (
                    <p style={{ color: "#777" }}>Unable to preview this document.</p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default OwnerDocumentViewPage;
