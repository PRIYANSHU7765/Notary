import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { saveOwnerDocument, fetchOwnerDocuments, deleteOwnerDocument, payOwnerDocumentSession, notarizeOwnerDocument, saveSignature, downloadOwnerDocument, downloadNotarizedOwnerDocument } from "../utils/apiClient";
import { base64ToUint8Array } from "../utils/pdfUtils";
import socket from "../socket/socket";
import PdfViewer from "../components/PdfViewer";
import SidebarAssets from "../components/SidebarAssets";
import CanvasBoard from "../components/CanvasBoard";
import ScreenRecorder from "../components/ScreenRecorder";
import SignatureExtractionModal from "../components/SignatureExtractionModal";
import { createDocumentDragAsset } from "../utils/documentAsset";

const ACTIVE_SESSIONS_KEY = "notary.ownerActiveSessions";
const DASHBOARD_STATE_KEY = "notary.ownerDashboardState";
const UPLOADED_ASSETS_KEY_PREFIX = "notary.ownerUploadedAssets";
const EDITOR_ELEMENTS_KEY_PREFIX = "notary.ownerEditorElements";
const PREVIOUS_SESSIONS_KEY = "notary.ownerPreviousSessions";

const getUploadedAssetsStorageKey = (docId) => `${UPLOADED_ASSETS_KEY_PREFIX}.${docId}`;
const getEditorElementsStorageKey = (docId) => `${EDITOR_ELEMENTS_KEY_PREFIX}.${docId}`;

const loadUploadedAssets = (docId) => {
  if (!docId) return [];
  try {
    return JSON.parse(localStorage.getItem(getUploadedAssetsStorageKey(docId)) || "[]");
  } catch {
    return [];
  }
};

const saveUploadedAssets = (docId, assets) => {
  if (!docId) return;
  localStorage.setItem(getUploadedAssetsStorageKey(docId), JSON.stringify(assets));
};

const loadDocs = () => {
  return [];
};

const saveDocs = () => {};

const loadActiveSessions = () => {
  try {
    return JSON.parse(localStorage.getItem(ACTIVE_SESSIONS_KEY) || "{}");
  } catch {
    return {};
  }
};

const loadPreviousSessions = () => {
  try {
    return JSON.parse(localStorage.getItem(PREVIOUS_SESSIONS_KEY) || "{}");
  } catch {
    return {};
  }
};

const addPreviousSession = (docId, sessionId) => {
  const previous = loadPreviousSessions();
  previous[docId] = sessionId;
  localStorage.setItem(PREVIOUS_SESSIONS_KEY, JSON.stringify(previous));
};

const loadDashboardState = () => {
  try {
    return JSON.parse(localStorage.getItem(DASHBOARD_STATE_KEY) || "{}");
  } catch {
    return {};
  }
};

const loadEditorElements = (docId) => {
  if (!docId) return [];
  try {
    return JSON.parse(localStorage.getItem(getEditorElementsStorageKey(docId)) || "[]");
  } catch {
    return [];
  }
};

const saveEditorElements = (docId, elements) => {
  if (!docId) return;
  localStorage.setItem(getEditorElementsStorageKey(docId), JSON.stringify(elements));
};

const normalizeSessionId = (value) => {
  if (!value) return "";
  const raw = String(value).trim();
  const match = raw.match(/notary-session-[A-Za-z0-9_-]+/);
  return match ? match[0] : raw;
};

const resolveDocSessionId = (doc, activeSessions = {}, previousSessions = {}) =>
  normalizeSessionId(
    activeSessions?.[doc?.id] ||
      doc?.sessionId ||
      previousSessions?.[doc?.id] ||
      ""
  );

const formatDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const STATUS_COLORS = {
  uploaded: { bg: "#eef2ff", color: "#1e3a8a" },
  pending_review: { bg: "#fff7ed", color: "#92400e" },
  accepted: { bg: "#d1fae5", color: "#065f46" },
  session_started: { bg: "#cfe2ff", color: "#0a4e9b" },
  payment_pending: { bg: "#fff4e5", color: "#9a3412" },
  notarized: { bg: "#d1e7dd", color: "#0f5132" },
  rejected: { bg: "#fee2e2", color: "#991b1b" },
};

const ThreeDotsMenu = ({ onView, onDownload, onNotarize, onCancelNotarize, onDelete, notarized }) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={menuRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: "20px",
          padding: "4px 8px",
          borderRadius: "6px",
          color: "#555",
          lineHeight: 1,
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f0f0")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
        title="Options"
      >
        ⋮
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "110%",
            background: "#fff",
            border: "1px solid #e0e0e0",
            borderRadius: "8px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            minWidth: "140px",
            zIndex: 100,
            overflow: "hidden",
          }}
        >
          <button
            onClick={() => { setOpen(false); onView(); }}
            style={menuItemStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f5")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
          >
            👁 View
          </button>
          {onNotarize ? (
            <button
              onClick={() => {
                setOpen(false);
                onNotarize();
              }}
              style={menuItemStyle}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f5")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
            >
              ✍️ Notarize
            </button>
          ) : null}
          {onDownload && (
            <button
              onClick={() => { setOpen(false); onDownload(); }}
              style={menuItemStyle}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f5")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
            >
              ⬇️ Download
            </button>
          )}
          <button
            onClick={() => {
              if (notarized) {
                return;
              }
              setOpen(false);
              onDelete();
            }}
            style={{
              ...menuItemStyle,
              color: notarized ? "#9ca3af" : "#b91c1c",
              cursor: notarized ? "not-allowed" : "pointer",
            }}
            disabled={notarized}
            title={notarized ? "Cannot delete fully notarized document" : "Delete document"}
            onMouseEnter={(e) => (e.currentTarget.style.background = notarized ? "#fff" : "#fef2f2")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
          >
            🗑 {notarized ? "Cannot delete" : "Delete"}
          </button>
        </div>
      )}
    </div>
  );
};

const menuItemStyle = {
  display: "block",
  width: "100%",
  padding: "10px 16px",
  background: "#fff",
  border: "none",
  textAlign: "left",
  cursor: "pointer",
  fontSize: "14px",
  color: "#333",
  transition: "background 0.15s",
};

const NotarizeConfirmModal = ({ doc, onClose, onConfirm }) => {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "12px",
          padding: "32px 36px",
          minWidth: "340px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>📋</div>
          <h3 style={{ margin: "0 0 8px 0", fontSize: "18px", fontWeight: 700, color: "#1a1a2e" }}>
            Send For Notary Review?
          </h3>
          <p style={{ margin: "0 0 24px 0", color: "#777", fontSize: "14px", lineHeight: "1.5" }}>
            Do you want to send <strong>{doc.name}</strong> to available notaries for acceptance?
          </p>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: "12px", marginTop: "28px" }}>
          <button
            onClick={onClose}
            style={{
              padding: "10px 28px",
              border: "1px solid #ddd",
              borderRadius: "8px",
              background: "#fff",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 600,
              color: "#333",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f5")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
          >
            No
          </button>
          <button
            onClick={() => { onClose(); onConfirm(); }}
            style={{
              padding: "10px 28px",
              border: "none",
              borderRadius: "8px",
              background: "#22c55e",
              color: "#fff",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 600,
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#16a34a")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#22c55e")}
          >
            Yes
          </button>
        </div>
      </div>
    </div>
  );
};

const SessionPaymentModal = ({
  doc,
  selectedPaymentMethod,
  onSelectMethod,
  cardholderName,
  onCardholderNameChange,
  cardNumber,
  onCardNumberChange,
  expiry,
  onExpiryChange,
  cvc,
  onCvcChange,
  paymentError,
  isPaying,
  onClose,
  onConfirm,
}) => {
  if (!doc) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "#fff",
          borderRadius: "12px",
          padding: "20px",
          boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 8px", fontSize: "20px", color: "#0f172a" }}>Complete Session Payment</h3>
        <p style={{ margin: "0 0 12px", color: "#475569", fontSize: "14px" }}>
          Choose payment method to complete payment for <strong>{doc.name}</strong>.
        </p>

        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "10px",
            padding: "12px",
            marginBottom: "12px",
          }}
        >
          <div style={{ fontSize: "12px", color: "#64748b" }}>Amount Due</div>
          <div style={{ marginTop: "4px", fontSize: "28px", fontWeight: 800, color: "#0f172a" }}>
            ${Number(doc.sessionAmount || 0).toFixed(2)}
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          <button
            type="button"
            onClick={() => onSelectMethod("stripe")}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: "8px",
              border: selectedPaymentMethod === "stripe" ? "2px solid #2563eb" : "1px solid #cbd5e1",
              background: selectedPaymentMethod === "stripe" ? "#eff6ff" : "#fff",
              color: "#1e293b",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Pay with Stripe
          </button>
          <button
            type="button"
            onClick={() => onSelectMethod("card")}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: "8px",
              border: selectedPaymentMethod === "card" ? "2px solid #2563eb" : "1px solid #cbd5e1",
              background: selectedPaymentMethod === "card" ? "#eff6ff" : "#fff",
              color: "#1e293b",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Pay with Credit/Debit Card
          </button>
        </div>

        <div style={{ display: "grid", gap: "8px", marginBottom: "10px" }}>
          <input
            type="text"
            value={cardholderName}
            onChange={(e) => onCardholderNameChange(e.target.value)}
            placeholder="Cardholder name"
            style={{ width: "100%", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "10px 12px", fontSize: "14px" }}
          />
          <input
            type="text"
            value={cardNumber}
            onChange={(e) => onCardNumberChange(e.target.value.replace(/[^\d\s]/g, "").slice(0, 19))}
            placeholder="Card number (16 digits)"
            style={{ width: "100%", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "10px 12px", fontSize: "14px" }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <input
              type="text"
              value={expiry}
              onChange={(e) => onExpiryChange(e.target.value.replace(/[^\d/]/g, "").slice(0, 5))}
              placeholder="MM/YY"
              style={{ width: "100%", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "10px 12px", fontSize: "14px" }}
            />
            <input
              type="password"
              value={cvc}
              onChange={(e) => onCvcChange(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
              placeholder="CVC"
              style={{ width: "100%", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "10px 12px", fontSize: "14px" }}
            />
          </div>
        </div>

        {paymentError ? <p style={{ margin: "0 0 10px", color: "#b91c1c", fontSize: "13px", fontWeight: 600 }}>{paymentError}</p> : null}

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isPaying}
            style={{
              flex: 1,
              padding: "11px 12px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              background: "#fff",
              color: "#334155",
              fontWeight: 700,
              cursor: isPaying ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPaying}
            style={{
              flex: 1.5,
              padding: "11px 12px",
              borderRadius: "8px",
              border: "none",
              background: isPaying ? "#94a3b8" : "#16a34a",
              color: "#fff",
              fontWeight: 700,
              cursor: isPaying ? "not-allowed" : "pointer",
            }}
          >
            {isPaying
              ? "Processing Payment..."
              : `Pay with ${selectedPaymentMethod === "stripe" ? "Stripe" : "Credit/Debit Card"} - $${Number(doc.sessionAmount || 0).toFixed(2)}`}
          </button>
        </div>
      </div>
    </div>
  );
};

const OwnerDashboardPage = ({ setHideSidebar }) => {
  const restoredDashboardState = loadDashboardState();
  const [docs, setDocs] = useState([]);
  const [notarizingDoc, setNotarizingDoc] = useState(null);
  const [sessionId, setSessionId] = useState("");

  const authUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('notary.authUser') || 'null') || {};
    } catch {
      return {};
    }
  })();

  useEffect(() => {
    const loadFromBackend = async () => {
      if (!authUser?.userId) return;
      try {
        const backendDocs = await fetchOwnerDocuments({ ownerId: authUser.userId });
        if (Array.isArray(backendDocs)) {
          const withSyncFlag = backendDocs.map((d) => ({ ...d, syncedWithBackend: true }));
          setDocs(withSyncFlag);
          saveDocs(withSyncFlag);
        }
      } catch (err) {
        console.warn('[SIGNER] Failed to load documents from backend:', err?.message || err);
      }
    };

    loadFromBackend();
  }, []);
  const [activeSessions, setActiveSessions] = useState(loadActiveSessions);
  const [previousSessions, setPreviousSessions] = useState(loadPreviousSessions);
  // Restore activeSessionDocId to maintain session state on page refresh
  const [activeSessionDocId, setActiveSessionDocId] = useState(restoredDashboardState.activeSessionDocId || null);
  const [notaries, setNotaries] = useState([]);
  const [sessionDocName, setSessionDocName] = useState(restoredDashboardState.sessionDocName || "");
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [sessionJoined, setSessionJoined] = useState(Boolean(restoredDashboardState.sessionJoined));
  const [editorElements, setEditorElements] = useState([]);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [uploadedAssets, setUploadedAssets] = useState([]);
  const [uploadedAsset, setUploadedAsset] = useState(null);
  const [adminTerminationNotice, setAdminTerminationNotice] = useState(null);
  const [paymentModalDoc, setPaymentModalDoc] = useState(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("stripe");
  const [paymentCardholderName, setPaymentCardholderName] = useState("");
  const [paymentCardNumber, setPaymentCardNumber] = useState("");
  const [paymentExpiry, setPaymentExpiry] = useState("");
  const [paymentCvc, setPaymentCvc] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [isPaying, setIsPaying] = useState(false);
  const [paymentSuccessMessage, setPaymentSuccessMessage] = useState("");
  const [signatureExtractionPdfDataUrl, setSignatureExtractionPdfDataUrl] = useState("");
  const [signatureExtractionMessage, setSignatureExtractionMessage] = useState("");

  const lastAutoSharedDocKeyRef = useRef("");
  const lastJoinEmitRef = useRef({ sessionId: null, socketId: null });
  const currentSessionIdRef = useRef(null);
  const joinedSessionKeyRef = useRef("");
  const editorScrollRef = useRef(null);
  const pdfScrollRef = useRef(null);
  const scrollEmitTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const extractionFileInputRef = useRef(null);
  const isApplyingScrollRef = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlSessionId = normalizeSessionId(params.get("sessionId"));
    const storedSessionId = normalizeSessionId(localStorage.getItem("notary.signerSessionId") || "");
    const id = urlSessionId || storedSessionId || "";

    setSessionId(id);
    if (id) {
      localStorage.setItem("notary.signerSessionId", id);
    } else {
      localStorage.removeItem("notary.signerSessionId");
    }
  }, []);

  // Sync sidebar visibility with session state (on mount and refresh)
  useEffect(() => {
    if (setHideSidebar) {
      if (sessionJoined && activeSessionDocId) {
        setHideSidebar(true);
      } else {
        setHideSidebar(false);
      }
    }
  }, [sessionJoined, activeSessionDocId, setHideSidebar]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_SESSIONS_KEY, JSON.stringify(activeSessions));
  }, [activeSessions]);

  useEffect(() => {
    localStorage.setItem(PREVIOUS_SESSIONS_KEY, JSON.stringify(previousSessions));
  }, [previousSessions]);

  useEffect(() => {
    localStorage.setItem(
      DASHBOARD_STATE_KEY,
      JSON.stringify({
        activeSessionDocId,
        sessionJoined,
        sessionDocName,
      })
    );
  }, [activeSessionDocId, sessionJoined, sessionDocName]);

  useEffect(() => {
    saveUploadedAssets(activeSessionDocId, uploadedAssets);
  }, [activeSessionDocId, uploadedAssets]);

  useEffect(() => {
    saveEditorElements(activeSessionDocId, editorElements);
  }, [activeSessionDocId, editorElements]);

  useEffect(() => {
    if (!activeSessionDocId) {
      setUploadedAssets([]);
      setUploadedAsset(null);
      setEditorElements([]);
      return;
    }

    setUploadedAssets(loadUploadedAssets(activeSessionDocId));
    setUploadedAsset(null);
    setEditorElements(loadEditorElements(activeSessionDocId));
  }, [activeSessionDocId]);

  useEffect(() => {
    if (!activeSessionDocId || uploadedFile) return;

    const doc = docs.find((d) => d.id === activeSessionDocId);
    if (!doc?.dataUrl) return;

    setUploadedFile(doc.dataUrl);
    setUploadedFileName(doc.name || "document.pdf");
    if (!sessionDocName) {
      setSessionDocName(doc.name || "");
    }
  }, [activeSessionDocId, docs, uploadedFile, sessionDocName]);

  useEffect(() => {
    if ((sessionJoined && activeSessionDocId) || !sessionId) return;
    if (!Array.isArray(docs) || docs.length === 0) return;

    const normalizedRequestedSession = normalizeSessionId(sessionId);
    if (!normalizedRequestedSession) return;

    const matchingDoc = docs.find((doc) => {
      const docSession = resolveDocSessionId(doc, activeSessions, previousSessions);
      if (!docSession || normalizeSessionId(docSession) !== normalizedRequestedSession) return false;

      const status = String(doc.status || '').trim().toLowerCase();
      return status === 'session_started';
    });

    if (!matchingDoc) return;

    setActiveSessionDocId(matchingDoc.id);
    setSessionJoined(true);
    if (setHideSidebar) setHideSidebar(true);
  }, [sessionId, docs, activeSessions, previousSessions, sessionJoined, activeSessionDocId, setHideSidebar]);

  useEffect(() => {
    if (!sessionJoined || !activeSessionDocId || !uploadedFile || notaries.length === 0) return;

    const activeDoc = docs.find((d) => d.id === activeSessionDocId);
    const sessionIdToShare = resolveDocSessionId(activeDoc, activeSessions, previousSessions);
    if (!sessionIdToShare) return;

    const resolvedFileName = uploadedFileName || sessionDocName || "document.pdf";
    const shareKey = `${sessionIdToShare}:${resolvedFileName}:${String(uploadedFile).length}`;
    if (lastAutoSharedDocKeyRef.current === shareKey) return;

    socket.emit("documentShared", {
      pdfDataUrl: uploadedFile,
      fileName: resolvedFileName,
    });
    setSessionDocName(resolvedFileName);
    lastAutoSharedDocKeyRef.current = shareKey;
  }, [
    sessionJoined,
    activeSessionDocId,
    docs,
    activeSessions,
    previousSessions,
    uploadedFile,
    uploadedFileName,
    sessionDocName,
    notaries.length,
  ]);

  useEffect(() => {
    const onNotarySessionStarted = (data) => {
      console.log('✅ [SIGNER] Received notarySessionStarted event:', data);
      if (!data?.documentId || !data?.sessionId) {
        console.warn('⚠️ Invalid notarySessionStarted data:', data);
        return;
      }

      const normalizedStartedSessionId = normalizeSessionId(data.sessionId);
      setSessionId(normalizedStartedSessionId);
      localStorage.setItem("notary.signerSessionId", normalizedStartedSessionId);
      const params = new URLSearchParams(window.location.search);
      params.set("sessionId", normalizedStartedSessionId);
      window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
      
      // Store the active session - this is the key that unlocks Join button
      setActiveSessions((prev) => {
        const updated = {
          ...prev,
          [data.documentId]: normalizedStartedSessionId,
        };
        console.log('✅ [SIGNER] Updated activeSessions from notarySessionStarted:', updated);
        return updated;
      });

      // Mark document review as accepted and update with notary info if it's not already
      setDocs((prevDocs) => {
        const nextDocs = prevDocs.map((doc) =>
          doc.id === data.documentId
            ? {
                ...doc,
                status: 'session_started',
                notaryReview: doc.notaryReview || 'accepted',
                notaryName: data.notaryName || doc.notaryName || 'Notary',
              }
            : doc
        );
        saveDocs(nextDocs);
        console.log('✅ [SIGNER] Updated docs with notary session start:', nextDocs.find(d => d.id === data.documentId));
        return nextDocs;
      });
      
      // Emit acknowledgment back so notary knows signer is aware
      socket.emit('ownerAckSessionStart', { 
        documentId: data.documentId,
        sessionId: normalizedStartedSessionId,
        timestamp: new Date().toISOString()
      });
    };

    const onNotarySessionEnded = (data) => {
      console.log('❌ [SIGNER] Received notarySessionEnded event:', data);

      const endedSessionId = data?.sessionId;
      const endedDocumentId = data?.documentId;
      const endedStatus = String(data?.status || '').trim().toLowerCase();
      const shouldResetToAccepted = endedStatus !== 'notarized';

      if (endedDocumentId && shouldResetToAccepted) {
        setDocs((prevDocs) => {
          const nextDocs = prevDocs.map((doc) =>
            doc.id === endedDocumentId
              ? {
                  ...doc,
                  status: 'accepted',
                  notaryReview: 'accepted',
                  notaryName: data?.notaryName || doc.notaryName,
                }
              : doc
          );
          saveDocs(nextDocs);
          return nextDocs;
        });
      }

      const isCurrentSession = endedSessionId && currentSessionIdRef.current === endedSessionId;
      const isCurrentDoc = endedDocumentId && activeSessionDocId && activeSessionDocId === endedDocumentId;

      if (isCurrentSession || isCurrentDoc) {
        currentSessionIdRef.current = null;
        lastJoinEmitRef.current = { sessionId: null, socketId: null };
        setActiveSessionDocId(null);
        setNotaries([]);
        setSessionDocName("");
        setSessionJoined(false);
        setUploadedFile(null);
        setUploadedFileName("");
        setUploadedAsset(null);
        lastAutoSharedDocKeyRef.current = "";
        localStorage.removeItem(DASHBOARD_STATE_KEY);
        navigate("/signer/doc/dashboard", { replace: true });
      }

      setActiveSessions((prev) => {
        let changed = false;
        const updated = { ...prev };
        Object.keys(updated).forEach((docId) => {
          if (updated[docId] === endedSessionId || docId === endedDocumentId) {
            delete updated[docId];
            changed = true;
          }
        });
        console.log('✅ [SIGNER] Updated activeSessions after session end:', updated);
        return changed ? updated : prev;
      });
    };

    const onOwnerLeftSession = (data) => {
      console.log('ℹ️ Signer left session:', data.sessionId);
      setActiveSessions((prev) => {
        let changed = false;
        const updated = { ...prev };
        Object.keys(updated).forEach((docId) => {
          if (updated[docId] === data.sessionId) {
            delete updated[docId];
            changed = true;
          }
        });
        return changed ? updated : prev;
      });
    };

    const onAdminSessionTerminated = (data) => {
      const terminatedSessionId = data?.sessionId;
      const terminatedDocumentId = data?.documentId;
      if (!terminatedSessionId && !terminatedDocumentId) return;

      setAdminTerminationNotice({
        sessionId: terminatedSessionId || null,
        documentId: terminatedDocumentId || null,
        message: data?.message || 'Admin terminated this session.',
      });

      if (terminatedDocumentId) {
        setDocs((prevDocs) => {
          const nextDocs = prevDocs.map((doc) =>
            doc.id === terminatedDocumentId
              ? {
                  ...doc,
                  status: doc.status === 'notarized' ? doc.status : 'accepted',
                  notaryReview: doc.notaryReview === 'rejected' ? 'accepted' : (doc.notaryReview || 'accepted'),
                }
              : doc
          );
          saveDocs(nextDocs);
          return nextDocs;
        });
      }

      setActiveSessions((prev) => {
        let changed = false;
        const updated = { ...prev };
        Object.keys(updated).forEach((docId) => {
          if (
            (terminatedSessionId && updated[docId] === terminatedSessionId) ||
            (terminatedDocumentId && docId === terminatedDocumentId)
          ) {
            delete updated[docId];
            changed = true;
          }
        });
        return changed ? updated : prev;
      });

      const isCurrentSession = terminatedSessionId && currentSessionIdRef.current === terminatedSessionId;
      const isCurrentDoc = terminatedDocumentId && activeSessionDocId === terminatedDocumentId;

      if (isCurrentSession || isCurrentDoc) {
        currentSessionIdRef.current = null;
        lastJoinEmitRef.current = { sessionId: null, socketId: null };
        setActiveSessionDocId(null);
        setNotaries([]);
        setSessionDocName('');
        setSessionJoined(false);
        setUploadedFile(null);
        setUploadedFileName('');
        setUploadedAsset(null);
        lastAutoSharedDocKeyRef.current = '';
        localStorage.removeItem(DASHBOARD_STATE_KEY);
        navigate('/signer/doc/dashboard', { replace: true });
      }
    };

    socket.on('notarySessionStarted', onNotarySessionStarted);
    socket.on('notarySessionEnded', onNotarySessionEnded);
    socket.on('ownerLeftSession', onOwnerLeftSession);
    socket.on('adminSessionTerminated', onAdminSessionTerminated);

    return () => {
      socket.off('notarySessionStarted', onNotarySessionStarted);
      socket.off('notarySessionEnded', onNotarySessionEnded);
      socket.off('ownerLeftSession', onOwnerLeftSession);
      socket.off('adminSessionTerminated', onAdminSessionTerminated);
    };
  }, [activeSessionDocId, navigate]);

  // Fallback sync: pull notary review status from backend in case a socket event is missed.
  useEffect(() => {
    let cancelled = false;

    const syncReviewStatus = async () => {
      try {
        const backendDocs = await fetchOwnerDocuments({ ownerId: authUser.userId });
        if (cancelled || !Array.isArray(backendDocs) || backendDocs.length === 0) return;

        const backendById = new Map(backendDocs.map((d) => [d.id, { ...d, syncedWithBackend: true }]));
        setDocs((prevDocs) => {
          let changed = false;
          const nextDocs = prevDocs.map((doc) => {
            const backendDoc = backendById.get(doc.id);
            if (!backendDoc) return doc;

            const nextStatus = backendDoc.status || doc.status;
            const nextReview = backendDoc.notaryReview || doc.notaryReview;
            const nextName = backendDoc.notaryName || doc.notaryName;
            const nextReviewedAt = backendDoc.notaryReviewedAt || doc.notaryReviewedAt;
            const nextSessionId = backendDoc.sessionId || doc.sessionId;
            const nextScheduledAt = backendDoc.scheduledAt || doc.scheduledAt;
            const nextSessionAmount = backendDoc.sessionAmount ?? doc.sessionAmount;
            const nextPaymentStatus = backendDoc.paymentStatus || doc.paymentStatus;
            const nextPaymentRequestedAt = backendDoc.paymentRequestedAt || doc.paymentRequestedAt;
            const nextPaymentPaidAt = backendDoc.paymentPaidAt || doc.paymentPaidAt;

            if (
              nextStatus !== doc.status ||
              nextReview !== doc.notaryReview ||
              nextName !== doc.notaryName ||
              nextReviewedAt !== doc.notaryReviewedAt ||
              nextSessionId !== doc.sessionId ||
              nextScheduledAt !== doc.scheduledAt ||
              nextSessionAmount !== doc.sessionAmount ||
              nextPaymentStatus !== doc.paymentStatus ||
              nextPaymentRequestedAt !== doc.paymentRequestedAt ||
              nextPaymentPaidAt !== doc.paymentPaidAt
            ) {
              changed = true;
              console.log(`✅ [SIGNER] Polling: Updated doc ${doc.id} status to ${nextStatus}`);
              return {
                ...doc,
                status: nextStatus,
                notaryReview: nextReview,
                notaryName: nextName,
                notaryReviewedAt: nextReviewedAt,
                sessionId: nextSessionId,
                scheduledAt: nextScheduledAt,
                sessionAmount: nextSessionAmount,
                paymentStatus: nextPaymentStatus,
                paymentRequestedAt: nextPaymentRequestedAt,
                paymentPaidAt: nextPaymentPaidAt,
              };
            }

            return doc;
          });

          if (changed) {
            saveDocs(nextDocs);
          }
          return nextDocs;
        });
      } catch (error) {
        console.warn("[signer-dashboard] Failed to sync review status:", error?.message || error);
      }
    };

    syncReviewStatus();
    const intervalId = setInterval(syncReviewStatus, 3000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  // Keep signer dashboard in sync with notary accept/reject decisions.
  useEffect(() => {
    const onDocumentReviewUpdated = (data) => {
      const { documentId, notaryReview, notaryName, notaryReviewedAt, status, scheduledAt } = data || {};
      if (!documentId || !notaryReview) {
        console.warn('⚠️ [SIGNER] Invalid documentReviewUpdated data:', data);
        return;
      }

      console.log(`✅ [SIGNER] Received documentReviewUpdated: ${documentId} → ${notaryReview} (status: ${status})`);

      setDocs((prevDocs) => {
        const nextDocs = prevDocs.map((doc) =>
          doc.id === documentId
            ? { ...doc, status: status || doc.status, notaryReview, notaryName, notaryReviewedAt, scheduledAt: scheduledAt || doc.scheduledAt }
            : doc
        );
        saveDocs(nextDocs);
        console.log(`✅ [SIGNER] Updated doc ${documentId}:`, nextDocs.find(d => d.id === documentId));
        return nextDocs;
      });

      if (notaryReview !== "accepted") {
        console.log(`ℹ️ [SIGNER] Document rejected/pending, clearing active session for ${documentId}`);
        setActiveSessions((prev) => {
          const updated = { ...prev };
          delete updated[documentId];
          return updated;
        });

        if (activeSessionDocId === documentId) {
          setSessionJoined(false);
          setActiveSessionDocId(null);
        }
      }
    };

    socket.on("documentReviewUpdated", onDocumentReviewUpdated);

    const onDocumentNotarized = (data) => {
      const { documentId, status, sessionAmount, paymentStatus, paymentRequestedAt, paymentPaidAt } = data || {};
      if (!documentId) return;
      console.log(`✅ [SIGNER] Received documentNotarized: ${documentId} (status: ${status})`);
      setDocs((prevDocs) => {
        const nextDocs = prevDocs.map((doc) =>
          doc.id === documentId
            ? {
                ...doc,
                status: status || doc.status,
                notarized: String(status || '').toLowerCase() === 'notarized',
                sessionAmount: sessionAmount ?? doc.sessionAmount,
                paymentStatus: paymentStatus || doc.paymentStatus,
                paymentRequestedAt: paymentRequestedAt || doc.paymentRequestedAt,
                paymentPaidAt: paymentPaidAt || doc.paymentPaidAt,
              }
            : doc
        );
        saveDocs(nextDocs);
        return nextDocs;
      });
    };

    socket.on("documentNotarized", onDocumentNotarized);

    return () => {
      socket.off("documentReviewUpdated", onDocumentReviewUpdated);
      socket.off("documentNotarized", onDocumentNotarized);
    };
  }, [activeSessionDocId]);

  useEffect(() => {
    console.log('🔌 [SIGNER] Socket connection status:', {
      connected: socket.connected,
      id: socket.id,
      listeners: socket.listeners('notarySessionStarted')?.length || 0
    });
    
    const onConnect = () => {
      console.log('✅ [SIGNER] Socket CONNECTED');
      setIsConnected(true);
    };
    const onDisconnect = () => {
      console.log('❌ [SIGNER] Socket DISCONNECTED');
      setIsConnected(false);
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  useEffect(() => {
    if (!activeSessionDocId) return;

    const activeDoc = docs.find((doc) => doc.id === activeSessionDocId);
    const activeStatus = String(activeDoc?.status || '').trim().toLowerCase();
    if (!activeDoc || activeStatus === 'session_started' || activeStatus === 'notarized') return;

    currentSessionIdRef.current = null;
    lastJoinEmitRef.current = { sessionId: null, socketId: null };
    setSessionJoined(false);
    setActiveSessionDocId(null);
    setNotaries([]);
    setSessionDocName('');
    setUploadedFile(null);
    setUploadedFileName('');
    setUploadedAsset(null);
    lastAutoSharedDocKeyRef.current = '';
    localStorage.removeItem(DASHBOARD_STATE_KEY);

    setActiveSessions((prev) => {
      const updated = { ...prev };
      delete updated[activeSessionDocId];
      return updated;
    });
  }, [activeSessionDocId, docs]);
// Join session only when signer explicitly enters the live session editor
// (or restores a previously active live session on refresh).
  useEffect(() => {
    if (!activeSessionDocId || !sessionJoined) return;

    const activeDoc = docs.find((doc) => doc.id === activeSessionDocId);
    const activeStatus = String(activeDoc?.status || '').trim().toLowerCase();
    if (activeStatus !== 'session_started') return;

    const sessionIdFromUrl = new URLSearchParams(window.location.search).get("sessionId");
    const sessionIdToJoin =
      resolveDocSessionId(activeDoc, activeSessions, previousSessions) ||
      normalizeSessionId(sessionIdFromUrl) ||
      normalizeSessionId(localStorage.getItem("notary.signerSessionId"));
    if (!sessionIdToJoin) return;

    setActiveSessions((prev) => {
      if (prev[activeSessionDocId] === sessionIdToJoin) return prev;
      return { ...prev, [activeSessionDocId]: sessionIdToJoin };
    });

    // Store the current session ID for later use in handleExitSession
    currentSessionIdRef.current = sessionIdToJoin;
    if (!joinedSessionKeyRef.current.startsWith(`${sessionIdToJoin}:`)) {
      joinedSessionKeyRef.current = "";
    }

    const authUser = (() => {
      try {
        return JSON.parse(localStorage.getItem('notary.authUser') || 'null');
      } catch {
        return null;
      }
    })();

    const onUsersConnected = (users) => {
      const notaryUsers = users.filter((u) => u.role === "notary");
      setNotaries(notaryUsers);
    };

    const onDocumentShared = (data) => {
      setSessionDocName(data.fileName || "");
    };

    const onElementAdded = (element) => {
      setEditorElements((prev) => {
        if (prev.some((existingElement) => existingElement.id === element.id)) {
          return prev;
        }

        return [...prev, element];
      });
    };

    const onElementUpdated = (updatedElement) => {
      setEditorElements((prev) =>
        prev.map((element) =>
          element.id === updatedElement.id ? updatedElement : element
        )
      );
    };

    const onElementRemoved = (elementId) => {
      setEditorElements((prev) => prev.filter((element) => element.id !== elementId));
    };

    const onDocumentScrolled = (data) => {
      if (data?.fromRole && data.fromRole !== "notary") return;
      if (data?.scrollRatio === undefined && data?.scrollPosition === undefined) return;

      const editorTarget = editorScrollRef.current;
      const pdfTarget = pdfScrollRef.current;
      const candidates = [editorTarget, pdfTarget].filter(Boolean);
      if (!candidates.length) return;

      // Pick the element with real scroll range; this avoids binding to a non-scrollable inner PDF wrapper.
      const scrollTarget = candidates.reduce((best, current) => {
        const bestRange = Math.max(best.scrollHeight - best.clientHeight, 0);
        const currentRange = Math.max(current.scrollHeight - current.clientHeight, 0);
        return currentRange > bestRange ? current : best;
      });

      const maxScrollable = Math.max(scrollTarget.scrollHeight - scrollTarget.clientHeight, 0);
      const nextScrollTop = data?.scrollRatio !== undefined
        ? maxScrollable * Number(data.scrollRatio)
        : Number(data.scrollPosition);

      isApplyingScrollRef.current = true;
      const finalScrollTop = Number.isFinite(nextScrollTop) ? nextScrollTop : 0;

      // Keep both refs aligned when both exist.
      if (editorTarget) editorTarget.scrollTop = finalScrollTop;
      if (pdfTarget) pdfTarget.scrollTop = finalScrollTop;

      setTimeout(() => {
        isApplyingScrollRef.current = false;
      }, 100);
    };

    const onAuthError = (payload) => {
      const message = payload?.message || 'Unable to join live session. Please login again.';
      console.warn('[SIGNER] Socket authError:', payload);
      setPaymentError(message);
      setSessionJoined(false);
      setActiveSessionDocId(null);
      if (setHideSidebar) setHideSidebar(false);
    };

    socket.on("usersConnected", onUsersConnected);
    socket.on("documentShared", onDocumentShared);
    socket.on("elementAdded", onElementAdded);
    socket.on("elementUpdated", onElementUpdated);
    socket.on("elementRemoved", onElementRemoved);
    socket.on("documentScrolled", onDocumentScrolled);
    socket.on("authError", onAuthError);

    const emitJoinSession = () => {

      if (!socket.connected || !socket.id) {
        return;
      }

      const currentSocketId = socket.id;

      const joinKey = `${sessionIdToJoin}:${socket.id}`;
      if (joinedSessionKeyRef.current === joinKey) {
        return;
      }

      joinedSessionKeyRef.current = joinKey;
      socket.emit("joinSession", {
        roomId: sessionIdToJoin,
        role: "signer",
        userId: authUser?.userId || socket.id,
        username: authUser?.username || "Signer",
        token: authUser?.token,
      });

      lastJoinEmitRef.current = {
        sessionId: sessionIdToJoin,
        socketId: currentSocketId,
      };
    };

    const onConnectRejoin = () => emitJoinSession();
    const onDisconnectResetJoin = () => {
      joinedSessionKeyRef.current = "";
    };
    socket.on("connect", onConnectRejoin);
    socket.on("disconnect", onDisconnectResetJoin);
    emitJoinSession();

    return () => {
      socket.off("usersConnected", onUsersConnected);
      socket.off("documentShared", onDocumentShared);
      socket.off("elementAdded", onElementAdded);
      socket.off("elementUpdated", onElementUpdated);
      socket.off("elementRemoved", onElementRemoved);
      socket.off("documentScrolled", onDocumentScrolled);
      socket.off("authError", onAuthError);
      socket.off("connect", onConnectRejoin);
      socket.off("disconnect", onDisconnectResetJoin);
    };
  }, [activeSessionDocId, activeSessions, previousSessions, docs, sessionJoined]);

  // Emit signer scroll updates so notary view stays synchronized bidirectionally.
  useEffect(() => {
    if (!activeSessionDocId || !sessionJoined) return;

    const activeDoc = docs.find((d) => d.id === activeSessionDocId);
    const activeSessionId =
      resolveDocSessionId(activeDoc, activeSessions, previousSessions) ||
      currentSessionIdRef.current;
    if (!activeSessionId) return;

    const getScrollMetrics = () => {
      const candidates = [editorScrollRef.current, pdfScrollRef.current].filter(Boolean);
      if (!candidates.length) return { scrollPosition: 0, scrollRatio: 0 };

      const target = candidates.reduce((best, current) => {
        const bestRange = Math.max(best.scrollHeight - best.clientHeight, 0);
        const currentRange = Math.max(current.scrollHeight - current.clientHeight, 0);
        return currentRange > bestRange ? current : best;
      });

      const maxScrollable = Math.max(target.scrollHeight - target.clientHeight, 0);
      const scrollPosition = target.scrollTop;
      const scrollRatio = maxScrollable > 0 ? scrollPosition / maxScrollable : 0;
      return { scrollPosition, scrollRatio };
    };

    const handleScroll = () => {
      if (isApplyingScrollRef.current) return;
      if (scrollEmitTimerRef.current) {
        window.clearTimeout(scrollEmitTimerRef.current);
      }

      scrollEmitTimerRef.current = window.setTimeout(() => {
        const { scrollPosition, scrollRatio } = getScrollMetrics();
        socket.emit("documentScrolled", {
          sessionId: activeSessionId,
          scrollPosition,
          scrollRatio,
          timestamp: Date.now(),
        });
      }, 50);
    };

    const targets = [editorScrollRef.current, pdfScrollRef.current].filter(Boolean);
    if (!targets.length) return;

    targets.forEach((target) => target.addEventListener("scroll", handleScroll));
    return () => {
      if (scrollEmitTimerRef.current) {
        window.clearTimeout(scrollEmitTimerRef.current);
      }
      targets.forEach((target) => target.removeEventListener("scroll", handleScroll));
    };
  }, [activeSessionDocId, docs, activeSessions, previousSessions, sessionJoined, uploadedFile]);

  // Cleanup effect: Emit ownerLeftSession when exiting a session
  useEffect(() => {
    return () => {
      // When component unmounts or session is cleared, notify notary
      if (currentSessionIdRef.current && sessionJoined) {
        socket.emit("ownerLeftSession", { sessionId: currentSessionIdRef.current });
        console.log("Cleanup: Emitted ownerLeftSession:", currentSessionIdRef.current);
      }
    };
  }, [sessionJoined]);

  const handleJoinSession = (doc) => {
    // Resolve only from document-specific session sources.
    const sessionIdVal = resolveDocSessionId(doc, activeSessions, previousSessions);
    if (sessionIdVal) {
      // Keep URL/session state aligned with the exact session being resumed.
      setSessionId(sessionIdVal);
      localStorage.setItem("notary.signerSessionId", sessionIdVal);
      localStorage.setItem("notary.lastSessionId", sessionIdVal);
      navigate(`/signer/doc/dashboard?sessionId=${encodeURIComponent(sessionIdVal)}`, { replace: true });

      setActiveSessions((prev) => ({ ...prev, [doc.id]: sessionIdVal }));
      setActiveSessionDocId(doc.id);
      addPreviousSession(doc.id, sessionIdVal);
      setPreviousSessions((prev) => ({ ...prev, [doc.id]: sessionIdVal }));
      
      // Pre-load the document
      if (doc?.dataUrl) {
        setUploadedFile(doc.dataUrl);
        setUploadedFileName(doc.name || "document.pdf");
        // Share document with notary via socket
        socket.emit("documentShared", { pdfDataUrl: doc.dataUrl, fileName: doc.name || "document.pdf" });
      }
      
      // Immediately show the editor view
      setSessionJoined(true);
      if (setHideSidebar) setHideSidebar(true);
    }
  };

  const EDITOR_WIDTH = 900;
  const EDITOR_HEIGHT = 1300;

  const handleJoinEditor = () => {
    // Pre-load the document associated with this session
    const doc = docs.find((d) => d.id === activeSessionDocId);
    if (doc?.dataUrl) {
      setUploadedFile(doc.dataUrl);
      setUploadedFileName(doc.name || "document.pdf");
      // Share document with notary via socket
      const activeDoc = docs.find((d) => d.id === activeSessionDocId);
      const sessionIdVal = resolveDocSessionId(activeDoc, activeSessions, previousSessions);
      if (sessionIdVal) {
        setSessionId(sessionIdVal);
        localStorage.setItem("notary.signerSessionId", sessionIdVal);
        localStorage.setItem("notary.lastSessionId", sessionIdVal);
        navigate(`/signer/doc/dashboard?sessionId=${encodeURIComponent(sessionIdVal)}`, { replace: true });
        socket.emit("documentShared", { pdfDataUrl: doc.dataUrl, fileName: doc.name || "document.pdf" });
      }
    }
    setSessionJoined(true);
  };

  const handleSessionAssetUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const asset = await createDocumentDragAsset({
        fileName: file.name,
        dataUrl: reader.result,
        mimeType: file.type,
        userRole: "signer",
      });

      setUploadedAssets((prev) => [...prev, asset]);
      setUploadedAsset(asset);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleEditorElementAdd = (element) => {
    setEditorElements((prev) => [...prev, element]);
    const activeDoc = docs.find((d) => d.id === activeSessionDocId);
    const sessionIdVal = resolveDocSessionId(activeDoc, activeSessions, previousSessions);
    if (sessionIdVal) socket.emit("elementAdded", element);
  };

  const handleEditorElementUpdate = (elementId, updates) => {
    const updatedElement = {
      ...editorElements.find((el) => el.id === elementId),
      ...updates,
    };
    setEditorElements((prev) => prev.map((el) => (el.id === elementId ? updatedElement : el)));
    const activeDoc = docs.find((d) => d.id === activeSessionDocId);
    const sessionIdVal = resolveDocSessionId(activeDoc, activeSessions, previousSessions);
    if (sessionIdVal) socket.emit("elementUpdated", updatedElement);
  };

  const handleEditorElementRemove = (elementId) => {
    setEditorElements((prev) => prev.filter((el) => el.id !== elementId));
    const activeDoc = docs.find((d) => d.id === activeSessionDocId);
    const sessionIdVal = resolveDocSessionId(activeDoc, activeSessions, previousSessions);
    if (sessionIdVal) socket.emit("elementRemoved", elementId);
  };

  const handleExitSession = () => {
    // Notify notary that signer is leaving the session using the stored ref
    const sessionIdToLeave = currentSessionIdRef.current;
    if (sessionIdToLeave) {
      socket.emit("ownerLeftSession", { sessionId: sessionIdToLeave });
      console.log("Emitted ownerLeftSession:", sessionIdToLeave);
    }
    currentSessionIdRef.current = null;
    lastJoinEmitRef.current = { sessionId: null, socketId: null };

    setActiveSessionDocId(null);
    setNotaries([]);
    setSessionDocName("");
    setSessionJoined(false);
    setUploadedFile(null);
    setUploadedFileName("");
    setUploadedAsset(null);
    lastAutoSharedDocKeyRef.current = "";
    localStorage.removeItem(DASHBOARD_STATE_KEY);
    localStorage.setItem('signer.sessionActive', 'false');
    // Also clear the active session for this document when exiting
    setActiveSessions((prev) => {
      const updated = { ...prev };
      delete updated[activeSessionDocId];
      return updated;
    });

    if (setHideSidebar) setHideSidebar(false);
    navigate("/signer/dashboard");
  };

  const restoreUploadedAssets = () => {
    uploadedAssets.forEach((asset) => {
      setTimeout(() => setUploadedAsset(asset), 10);
    });
  };

  useEffect(() => {
    if (sessionJoined && uploadedAssets.length > 0) {
      restoreUploadedAssets();
    }
  }, [sessionJoined, uploadedAssets]);

  const copySessionId = () => {
    if (!sessionId) return;
    navigator.clipboard.writeText(sessionId);
  };

  const handleDownloadNotarized = async (doc) => {
    if (!doc?.id) {
      alert('Unable to download notarized document.');
      return;
    }

    try {
      const { blob, filename } = await downloadNotarizedOwnerDocument(doc.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('[OwnerDashboard] downloadNotarized failed:', error);
      alert(`Failed to download notarized document: ${error.message || 'Unknown error'}`);
    }
  };

  const handleCancelNotarize = async (doc) => {
    const updated = docs.map((d) =>
      d.id === doc.id ? { ...d, status: 'uploaded', notaryReview: null, notarized: false } : d
    );
    setDocs(updated);
    saveDocs(updated);

    // Update backend to mark not in process / not notarized
    try {
      const docSessionId =
        doc.sessionId ||
        activeSessions[doc.id] ||
        previousSessions[doc.id] ||
        `notary-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await saveOwnerDocument({
        id: doc.id,
        ownerId: authUser.userId,
        ownerName: doc.ownerName,
        sessionId: docSessionId,
        name: doc.name,
        size: doc.size,
        type: doc.type,
        dataUrl: doc.dataUrl,
        uploadedAt: doc.uploadedAt,
        status: 'uploaded',
      });

      // Broadcast cancellation to notary dashboard via socket.io
      socket.emit("documentNotarizationCancelled", {
        documentId: doc.id,
      });
      console.log("📡 Emitted documentNotarizationCancelled event via socket");
    } catch (error) {
      console.error("Failed to cancel notarization:", error);
    }
  };

  const handleDelete = async (doc) => {
    const isDocNotarized = Boolean(doc.notarized) || String(doc.status || '').trim().toLowerCase() === 'notarized';
    if (isDocNotarized) {
      alert('Cannot delete a notarized document.');
      return;
    }

    const previous = docs;
    const updated = docs.filter((d) => d.id !== doc.id);
    setDocs(updated);
    saveDocs(updated);

    try {
      await deleteOwnerDocument(doc.id);

      const latestDocs = await fetchOwnerDocuments({ ownerId: authUser.userId });
      setDocs(latestDocs);
      saveDocs(latestDocs);
    } catch (error) {
      console.error("Failed to delete signer document:", error);
      setDocs(previous);
      saveDocs(previous);
      alert(error?.message || "Failed to delete document. Please try again.");
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!authUser?.userId) {
      alert('Please login again. Unable to save document without signer ID.');
      e.target.value = "";
      return;
    }

    const ownerName = (() => {
      try {
        return JSON.parse(localStorage.getItem("notary.authUser") || "null")?.username || "Signer";
      } catch {
        return "Signer";
      }
    })();

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const currentSessionId = `notary-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const newDoc = {
        id: `doc-${Date.now()}`,
        name: file.name,
        ownerName,
        size: file.size,
        type: file.type,
        uploadedAt: new Date().toISOString(),
        status: "uploaded",
        notaryReview: "pending",
        notarized: false,
        dataUrl: ev.target.result,
        sessionId: currentSessionId,
        syncedWithBackend: false,
      };
      const previousDocs = docs;
      const updated = [newDoc, ...previousDocs];
      setDocs(updated);
      saveDocs(updated);

      // Persist uploaded document to backend (async, don't block UI)
      let backendSaveFailed = false;
      
      try {
        await saveOwnerDocument({
          id: newDoc.id,
          ownerId: authUser.userId,
          ownerName: newDoc.ownerName,
          sessionId: newDoc.sessionId,
          name: newDoc.name,
          size: newDoc.size,
          type: newDoc.type,
          dataUrl: newDoc.dataUrl,
          uploadedAt: newDoc.uploadedAt,
          status: 'uploaded',
        });

        // Mark the document as synced after successful backend save
        setDocs((currentDocs) => {
          const updated = currentDocs.map((d) =>
            d.id === newDoc.id ? { ...d, syncedWithBackend: true } : d
          );
          saveDocs(updated);
          return updated;
        });

        console.log('✅ [SIGNER] Uploaded document saved to backend:', newDoc.name);
      } catch (error) {
        console.warn('⚠️ [SIGNER] Failed to save uploaded document to backend:', error);
        backendSaveFailed = true;
        setDocs(previousDocs);
        saveDocs(previousDocs);
        alert('Upload failed to save in database. Please try again.');
      }

      // Background: Refresh document list after a short delay if save succeeded
      if (!backendSaveFailed) {
        setTimeout(async () => {
          try {
            const freshDocs = await fetchOwnerDocuments({ ownerId: authUser.userId, bypassCache: true });
            if (Array.isArray(freshDocs) && freshDocs.length > 0) {
              const withSyncFlag = freshDocs.map((d) => ({ ...d, syncedWithBackend: true }));
              setDocs(withSyncFlag);
              saveDocs(withSyncFlag);
            }
          } catch (err) {
            console.warn('⚠️ [SIGNER] Background refresh failed:', err);
          }
        }, 1000); // Refresh list after 1 second in background
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleView = (doc) => {
    // Navigate to the document detail view which shows the document, notarization status, session info, and notary details.
    navigate(`/signer/doc/view/${encodeURIComponent(doc.id)}`);
  };

  const handleNotarize = (doc) => {
    setNotarizingDoc(doc);
  };

  const handleOpenSignatureExtractionUpload = () => {
    extractionFileInputRef.current?.click();
  };

  const handleSignatureExtractionFileChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isImage = /\.(jpe?g|png)$/i.test(file.name) || /^(image\/png|image\/jpe?g)$/i.test(file.type);

    if (!isPdf && !isImage) {
      setSignatureExtractionMessage("Please upload PDF, PNG, JPG, or JPEG for signature extraction.");
      setTimeout(() => setSignatureExtractionMessage(""), 3600);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) {
        setSignatureExtractionMessage("Failed to read uploaded PDF. Please try again.");
        setTimeout(() => setSignatureExtractionMessage(""), 3600);
        return;
      }
      setSignatureExtractionPdfDataUrl(dataUrl);
    };
    reader.onerror = () => {
      setSignatureExtractionMessage("Failed to read uploaded PDF. Please try again.");
      setTimeout(() => setSignatureExtractionMessage(""), 3600);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveExtractedSignature = async ({ imageDataUrl }) => {
    if (!imageDataUrl) {
      throw new Error("Unable to save extracted signature.");
    }

    const signatureId = typeof window !== "undefined" && window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `signature-signer-${Date.now()}`;

    const effectiveSessionId =
      sessionId ||
      `notary-session-${Date.now()}`;

    await saveSignature({
      id: signatureId,
      sessionId: effectiveSessionId,
      userId: authUser?.userId || null,
      username: authUser?.username || null,
      name: `Extracted Signature (${new Date().toLocaleDateString()})`,
      image: imageDataUrl,
      userRole: "signer",
    });

    setSignatureExtractionPdfDataUrl("");
    setSignatureExtractionMessage("Signature extracted and saved to your library.");
    setTimeout(() => setSignatureExtractionMessage(""), 3600);
  };

  const handlePaySessionAmount = async (doc) => {
    setPaymentModalDoc(doc);
    setPaymentError("");
  };

  const handleConfirmSessionPayment = async () => {
    if (!paymentModalDoc) return;

    const normalizedCardNumber = paymentCardNumber.replace(/\s+/g, "").trim();
    if (!paymentCardholderName.trim()) {
      setPaymentError("Cardholder name is required.");
      return;
    }
    if (!/^\d{16}$/.test(normalizedCardNumber)) {
      setPaymentError("Card number must be 16 digits.");
      return;
    }
    if (!/^(0[1-9]|1[0-2])\/[0-9]{2}$/.test(paymentExpiry.trim())) {
      setPaymentError("Expiry must be in MM/YY format.");
      return;
    }
    if (!/^\d{3,4}$/.test(paymentCvc.trim())) {
      setPaymentError("CVC must be 3 or 4 digits.");
      return;
    }

    setPaymentError("");
    setIsPaying(true);

    try {
      await payOwnerDocumentSession(paymentModalDoc.id, {
        transactionId: `${selectedPaymentMethod}-${Date.now()}`,
        paymentMethod: selectedPaymentMethod === 'stripe' ? 'stripe' : 'credit_card',
      });

      const latestDocs = await fetchOwnerDocuments({ ownerId: authUser.userId });
      if (Array.isArray(latestDocs)) {
        setDocs(latestDocs);
        saveDocs(latestDocs);
      }

      setPaymentSuccessMessage(`Payment completed for ${paymentModalDoc.name}. Notary can now end the session.`);
      setPaymentModalDoc(null);
      setPaymentCardholderName("");
      setPaymentCardNumber("");
      setPaymentExpiry("");
      setPaymentCvc("");
      window.setTimeout(() => setPaymentSuccessMessage(""), 3600);
    } catch (error) {
      console.error('Failed to process payment:', error);
      setPaymentError(error?.message || 'Failed to process payment');
    } finally {
      setIsPaying(false);
    }
  };

  const handleConfirmNotarize = async () => {
    try {
      if (!notarizingDoc?.id) {
        alert('Error: Document not found');
        return;
      }

      // Use the document from state - it's already synced from upload
      const targetDocument = docs.find((d) => String(d.id) === String(notarizingDoc.id)) || notarizingDoc;

      if (!targetDocument?.id) {
        alert('Document not found. Please try again.');
        setNotarizingDoc(null);
        return;
      }

      const targetDocumentId = targetDocument.id;
      console.log('📋 [SIGNER] Sending document for notary review:', targetDocumentId);

      const result = await notarizeOwnerDocument(targetDocumentId);

      const updatedDoc = {
        ...targetDocument,
        ...result,
        status: result.status || 'pending_review',
        notaryReview: result.notaryReview || 'pending',
        notarized: Boolean(result.notarized),
      };

      setDocs((previousDocs) => {
        const updated = previousDocs.map((d) =>
          String(d.id) === String(targetDocumentId) || String(d.id) === String(notarizingDoc.id)
            ? updatedDoc
            : d
        );
        saveDocs(updated);
        return updated;
      });

      setNotarizingDoc(null);
    } catch (error) {
      console.error('❌ [SIGNER] Notarization failed:', error);

      if (String(error?.message || '').includes('HTTP 404')) {
        const latestDocs = await fetchOwnerDocuments({ ownerId: authUser.userId, bypassCache: true });
        if (Array.isArray(latestDocs)) {
          const withSyncFlag = latestDocs.map((d) => ({ ...d, syncedWithBackend: true }));
          setDocs(withSyncFlag);
          saveDocs(withSyncFlag);
        }
        alert('This document is not available on the server anymore. The list has been refreshed. Please try with a current row.');
        setNotarizingDoc(null);
        return;
      }

      if (String(error?.message || '').includes('HTTP 409')) {
        const latestDocs = await fetchOwnerDocuments({ ownerId: authUser.userId });
        if (Array.isArray(latestDocs) && latestDocs.length > 0) {
          const withSyncFlag = latestDocs.map((d) => ({ ...d, syncedWithBackend: true }));
          setDocs(withSyncFlag);
          saveDocs(withSyncFlag);
        }
        alert('This document is already in progress or finalized. The list has been refreshed. Please notarize only rows with status "Waiting for notary".');
      } else {
        alert(`Failed to notarize document: ${error.message}`);
      }

      setNotarizingDoc(null);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f7f8fc", fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      {/* If session joined, show editor view */}
      {activeSessionDocId && sessionJoined ? (
        <div style={{ display: "flex", height: "100vh" }}>
          {/* Asset Sidebar (signer session) */}
          <SidebarAssets
            userRole="signer"
            sessionId={resolveDocSessionId(docs.find((d) => d.id === activeSessionDocId), activeSessions, previousSessions)}
            userId={authUser.userId}
            uploadedAsset={uploadedAsset}
            uploadedAssets={uploadedAssets}
            assetScopeKey={activeSessionDocId || "signer-no-doc"}
            sourcePdfDataUrl={typeof uploadedFile === "string" ? uploadedFile : ""}
            allowSignatureExtraction
          />

          {/* Main Content */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "15px", overflowY: "auto" }}>
            {/* Header */}
            <div style={{ marginBottom: "15px", backgroundColor: "#f3e5f5", padding: "15px", borderRadius: "5px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                <div>
                  <button
                    onClick={handleExitSession}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "20px",
                      color: "#4f6ef7",
                      padding: "0 4px",
                      lineHeight: 1,
                      marginRight: "10px",
                    }}
                    title="Back to Dashboard"
                  >
                    ←
                  </button>
                  <h2 style={{ margin: 0, display: "inline" }}>✍️ Signer Dashboard</h2>
                </div>
                {activeSessions[activeSessionDocId] && (
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: "#555" }}>
                    <div>
                      Session ID: <span style={{ fontWeight: 600 }}>{activeSessions[activeSessionDocId]}</span>
                    </div>
                    <button
                      onClick={handleExitSession}
                      style={{
                        padding: "6px 10px",
                        backgroundColor: "#ef4444",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: "600",
                      }}
                    >
                      End Session
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Screen Sharing + Document Editor */}
            <ScreenRecorder
              role="signer"
              sessionId={resolveDocSessionId(docs.find((d) => d.id === activeSessionDocId), activeSessions, previousSessions) || ""}
              socket={socket}
            />
            <div style={{ marginBottom: "15px", padding: "15px", backgroundColor: "#f5f5f5", borderRadius: "5px" }}>
              <label htmlFor="session-file-upload" style={{ fontWeight: "bold" }}>
                📁 Upload Asset:
              </label>
              <input
                id="session-file-upload"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                style={{ marginLeft: "10px", cursor: "pointer" }}
                onChange={handleSessionAssetUpload}
              />
              {uploadedAsset && <p style={{ margin: "5px 0 0 0", color: "green" }}>✅ {uploadedAsset.name} added to assets</p>}
            </div>

            <div
              ref={editorScrollRef}
              style={{
                height: "calc(100vh - 220px)",
                minHeight: "520px",
                borderRadius: "5px",
                backgroundColor: "#fff",
                overflowY: "auto",
                position: "relative",
              }}
              onWheel={(e) => {
                if (editorScrollRef.current) {
                  e.preventDefault();
                  editorScrollRef.current.scrollTop += e.deltaY;
                }
              }}
            >
              <h3 style={{ margin: "10px 15px" }}>Document Editor</h3>
              {uploadedFile ? (
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    minHeight: "100%",
                    backgroundColor: "white",
                    margin: "0 15px 15px 15px",
                    overflow: "hidden",
                  }}
                >
                  <PdfViewer
                    file={uploadedFile}
                    fileName={uploadedFileName}
                    scrollContainerRef={pdfScrollRef}
                    containerHeight="100%"
                    showControls={false}
                    pageWidth={EDITOR_WIDTH}
                    noInternalScroll={false}
                  />
                  <div
                    style={{ position: "absolute", inset: 0 }}
                    onWheel={(e) => {
                      if (editorScrollRef.current) {
                        editorScrollRef.current.scrollTop += e.deltaY;
                      }
                    }}
                  >
                    <CanvasBoard
                      elements={editorElements}
                      onElementAdd={handleEditorElementAdd}
                      onElementUpdate={handleEditorElementUpdate}
                      onElementRemove={handleEditorElementRemove}
                      canvasWidth={EDITOR_WIDTH}
                      canvasHeight={EDITOR_HEIGHT}
                      overlayMode
                      showGuide={false}
                    />
                  </div>
                </div>
              ) : (
                <div style={{ height: "300px", display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>
                  Upload a document to start placing signatures and stamps
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeSessionDocId ? (
        // Session Listing View
        <div style={{ background: "#f7f8fc", minHeight: "100vh" }}>
          {/* Top Bar - Session View */}
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
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <button
                  onClick={handleExitSession}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "20px",
                    color: "#4f6ef7",
                    padding: "0 4px",
                    lineHeight: 1,
                  }}
                  title="Back to Documents"
                >
                  ←
                </button>
                <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 700, color: "#1a1a2e" }}>
                  Signer Dashboard
                </h1>
              </div>
              {activeSessions[activeSessionDocId] && (
                <p style={{ margin: "4px 0 0 36px", fontSize: "13px", color: "#888" }}>
                  Session ID: <span style={{ fontWeight: 600, color: "#555" }}>{activeSessions[activeSessionDocId]}</span>
                </p>
              )}
            </div>
            {isConnected && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "13px",
                  color: "#16a34a",
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: "#16a34a",
                    display: "inline-block",
                  }}
                />
                Server online
              </div>
            )}
          </div>

          {/* Session Content */}
          <div style={{ maxWidth: "820px", margin: "0 auto", padding: "32px 24px" }}>
            {notaries.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "80px 20px",
                  color: "#aaa",
                }}
              >
                <div style={{ fontSize: "56px", marginBottom: "16px" }}>🔕</div>
                <p style={{ fontSize: "17px", fontWeight: 500, margin: "0 0 8px 0", color: "#888" }}>
                  Waiting for notary to connect...
                </p>
                <p style={{ fontSize: "14px", margin: 0 }}>
                  The notary user will appear here once they join the session.
                </p>
              </div>
            ) : (
              <div
                style={{
                  background: "#fff",
                  borderRadius: "12px",
                  border: "1px solid #e8eaed",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 140px 120px",
                    padding: "12px 24px",
                    background: "#f9fafc",
                    borderBottom: "1px solid #e8eaed",
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#888",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  <span>Notary User</span>
                  <span>Document</span>
                  <span>Status</span>
                  <span>Action</span>
                </div>

                {notaries.map((notary, idx) => (
                  <div
                    key={notary.socketId}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 140px 120px",
                      padding: "16px 24px",
                      alignItems: "center",
                      borderBottom: idx < notaries.length - 1 ? "1px solid #f0f0f0" : "none",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#fafafa")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "50%",
                          background: "#eef1fe",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "16px",
                          fontWeight: 700,
                          color: "#4f6ef7",
                          flexShrink: 0,
                        }}
                      >
                        {(notary.username || "N")[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "14px", color: "#1a1a2e" }}>
                          {notary.username || notary.userId}
                        </div>
                        <div style={{ fontSize: "11px", color: "#aaa", marginTop: "2px" }}>Notary</div>
                      </div>
                    </div>

                    <div style={{ fontSize: "13px", color: "#555" }}>
                      {sessionDocName ? (
                        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span>📄</span>
                          <span
                            style={{
                              maxWidth: "180px",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "inline-block",
                            }}
                          >
                            {sessionDocName}
                          </span>
                        </span>
                      ) : (
                        <span style={{ color: "#bbb", fontStyle: "italic" }}>No document shared yet</span>
                      )}
                    </div>

                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        background: "#d1fae5",
                        color: "#065f46",
                        padding: "4px 12px",
                        borderRadius: "12px",
                        fontSize: "12px",
                        fontWeight: 600,
                      }}
                    >
                      <span
                        style={{
                          width: "7px",
                          height: "7px",
                          borderRadius: "50%",
                          background: "#10b981",
                          display: "inline-block",
                        }}
                      />
                      Connected
                    </span>

                    <button
                      onClick={handleJoinEditor}
                      style={{
                        background: "#4f6ef7",
                        color: "#fff",
                        border: "none",
                        borderRadius: "8px",
                        padding: "8px 16px",
                        cursor: "pointer",
                        fontSize: "13px",
                        fontWeight: 600,
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#3a58e0")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "#4f6ef7")}
                    >
                      Join
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        // Documents List View
        <div>
          {/* Top Bar */}
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
              <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 700, color: "#1a1a2e" }}>
                My Documents
              </h1>
              <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "#888" }}>
                Manage and track all your notarization documents
              </p>
              <div style={{ marginTop: "12px", padding: "12px", background: "#f3f4f6", borderRadius: "12px", border: "1px solid #e5e7eb", display: "flex", alignItems: "flex-start", gap: "14px", flexWrap: "wrap" }}>
                <div style={{ minWidth: "220px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    You
                  </div>
                  <div style={{ marginTop: "6px", fontSize: "13px", color: "#1f2937" }}>
                    <div style={{ fontWeight: 600 }}>{authUser?.username || "Unknown"}</div>
                    <div style={{ fontSize: "12px", color: "#64748b" }}>
                      {authUser?.role ? authUser.role.toUpperCase() : "SIGNER"} • ID: {authUser?.userId || "—"}
                    </div>
                  </div>
                </div>
                <div style={{ minWidth: "220px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Connected Notaries
                  </div>
                  <div style={{ marginTop: "6px", fontSize: "13px", color: "#1f2937" }}>
                    {notaries.length === 0 ? (
                      <span style={{ color: "#64748b" }}>No notaries connected</span>
                    ) : (
                      <ul style={{ margin: 0, padding: "0 0 0 18px" }}>
                        {notaries.slice(0, 3).map((n) => (
                          <li key={n.socketId} style={{ marginBottom: "4px" }}>
                            {n.username || n.userId}
                          </li>
                        ))}
                        {notaries.length > 3 && (
                          <li style={{ color: "#64748b" }}>+ {notaries.length - 3} more</li>
                        )}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
              {sessionId && (
                <div style={{ marginTop: "10px", display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "12px", color: "#555" }}>
                    Session ID:
                    <span style={{ fontWeight: 700, marginLeft: "6px" }}>{sessionId}</span>
                  </span>
                  <button
                    onClick={copySessionId}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "8px",
                      border: "1px solid #d1d5db",
                      background: "#fff",
                      cursor: "pointer",
                      fontSize: "12px",
                      color: "#374151",
                    }}
                  >
                    Copy
                  </button>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 22px",
                  background: "#4f6ef7",
                  color: "#fff",
                  border: "none",
                  borderRadius: "10px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: 600,
                  boxShadow: "0 2px 8px rgba(79,110,247,0.3)",
                  transition: "background 0.15s, transform 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#3a58e0")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#4f6ef7")}
              >
                <span style={{ fontSize: "18px" }}>+</span>
                Upload File
              </button>

              <button
                onClick={handleOpenSignatureExtractionUpload}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 22px",
                  background: "#0f766e",
                  color: "#fff",
                  border: "none",
                  borderRadius: "10px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: 600,
                  boxShadow: "0 2px 8px rgba(15,118,110,0.28)",
                  transition: "background 0.15s, transform 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#0d5f59")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#0f766e")}
              >
                ✂️ Extract Signature
              </button>

              <button
                onClick={() => navigate("/signer/session")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 22px",
                  background: "#10b981",
                  color: "#fff",
                  border: "none",
                  borderRadius: "10px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: 600,
                  boxShadow: "0 2px 8px rgba(16,185,129,0.3)",
                  transition: "background 0.15s, transform 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#059669")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#10b981")}
              >
                Sessions
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            <input
              ref={extractionFileInputRef}
              type="file"
              accept=".pdf,application/pdf,.png,image/png,.jpg,.jpeg,image/jpeg"
              style={{ display: "none" }}
              onChange={handleSignatureExtractionFileChange}
            />
          </div>

          {adminTerminationNotice?.message && (
            <div style={{ maxWidth: "900px", margin: "12px auto 0", padding: "0 24px" }}>
              <div style={{
                background: "#fff1f2",
                border: "1px solid #fecdd3",
                color: "#9f1239",
                borderRadius: "10px",
                padding: "10px 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
                fontSize: "13px",
                fontWeight: 600,
              }}>
                <span>{adminTerminationNotice.message}</span>
                <button
                  onClick={() => setAdminTerminationNotice(null)}
                  style={{ border: "none", background: "transparent", color: "#9f1239", cursor: "pointer", fontWeight: 700 }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {paymentSuccessMessage ? (
            <div style={{ maxWidth: "900px", margin: "12px auto 0", padding: "0 24px" }}>
              <div
                style={{
                  background: "#ecfdf3",
                  border: "1px solid #86efac",
                  color: "#166534",
                  borderRadius: "10px",
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "10px",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                <span>{paymentSuccessMessage}</span>
                <button
                  onClick={() => setPaymentSuccessMessage("")}
                  style={{ border: "none", background: "transparent", color: "#166534", cursor: "pointer", fontWeight: 700 }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}

          {signatureExtractionMessage ? (
            <div style={{ maxWidth: "900px", margin: "12px auto 0", padding: "0 24px" }}>
              <div
                style={{
                  background: "#ecfeff",
                  border: "1px solid #67e8f9",
                  color: "#155e75",
                  borderRadius: "10px",
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "10px",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                <span>{signatureExtractionMessage}</span>
                <button
                  onClick={() => setSignatureExtractionMessage("")}
                  style={{ border: "none", background: "transparent", color: "#155e75", cursor: "pointer", fontWeight: 700 }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}

          {/* Content */}
          <div style={{ maxWidth: "1340px", width: "100%", margin: "0 auto", padding: "32px 24px" }}>
            {docs.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "80px 20px",
              color: "#aaa",
            }}
          >
            <div style={{ fontSize: "56px", marginBottom: "16px" }}>📄</div>
            <p style={{ fontSize: "17px", fontWeight: 500, margin: "0 0 8px 0", color: "#888" }}>
              No documents yet
            </p>
            <p style={{ fontSize: "14px", margin: 0 }}>
              Click <strong>Upload File</strong> to add your first document.
            </p>
          </div>
        ) : (
          <div
            style={{
              background: "#fff",
              borderRadius: "12px",
              border: "1px solid #e8eaed",
              overflow: "visible",
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            }}
          >
            {/* Table Header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(280px, 1.8fr) 100px 170px 170px 110px",
                gap: "12px",
                padding: "12px 20px",
                background: "#f9fafc",
                borderBottom: "2px solid #e8eaed",
                fontSize: "12px",
                fontWeight: 700,
                color: "#475569",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                alignItems: "center",
              }}
            >
              <span>Document</span>
              <span>Size</span>
              <span>Uploaded</span>
              <span>Session</span>
              <span></span>
            </div>

            {/* Rows */}
            {docs.map((doc, idx) => {
              const rawStatus = String(doc.status || '').trim().toLowerCase();
              const review = String(doc.notaryReview || '').trim().toLowerCase();
              const status =
                rawStatus === 'notarized'
                  ? 'notarized'
                  : rawStatus === 'session_started'
                  ? 'session_started'
                  : rawStatus === 'payment_pending'
                  ? 'payment_pending'
                  : rawStatus === 'accepted' || review === 'accepted'
                  ? 'accepted'
                  : rawStatus === 'rejected' || review === 'rejected'
                  ? 'rejected'
                  : rawStatus || (doc.notarized ? 'notarized' : 'uploaded');
                  const isNotarized = status === 'notarized';
              const statusStyle = STATUS_COLORS[status] || STATUS_COLORS.uploaded;
              const hasActiveSession = activeSessions[doc.id];
              const hasPreviousSession = previousSessions[doc.id];
              const hasDocumentSession = doc.sessionId || hasActiveSession || hasPreviousSession;

              // Join button appears when backend marks session_started and a session id is available.
              // Do not depend only on in-memory socket maps because the signer may miss the live event.
              const showJoinButton =
                status === 'session_started' &&
                Boolean(hasDocumentSession);
              const showPayButton = status === 'payment_pending' && Number(doc.sessionAmount || 0) > 0 && String(doc.paymentStatus || '').toLowerCase() !== 'paid';

              const displayStatus =
                status === 'uploaded'
                  ? 'Waiting for notary'
                  : status === 'pending_review'
                  ? 'Waiting for acceptance'
                  : status === 'accepted'
                  ? 'Accepted — waiting for session'
                  : status === 'session_started'
                  ? 'Session started'
                  : status === 'payment_pending'
                  ? 'Payment pending'
                  : status === 'notarized'
                  ? 'Notarized'
                  : status === 'rejected'
                  ? 'Rejected'
                  : status;

              return (
                <div
                  key={doc.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(280px, 1.8fr) 100px 170px 170px 110px",
                    gap: "12px",
                    padding: "14px 20px",
                    alignItems: "center",
                    borderBottom: idx < docs.length - 1 ? "1px solid #e7ecf3" : "none",
                    transition: "background 0.1s",
                    minHeight: "70px",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#fafafa")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {/* Name + status */}
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", overflow: "hidden" }}>
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        background: "#eef1fe",
                        borderRadius: "8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "18px",
                        flexShrink: 0,
                        position: "relative",
                      }}
                    >
                      📄
                      {isNotarized && (
                        <div
                          style={{
                            position: "absolute",
                            bottom: "-4px",
                            right: "-4px",
                            width: "18px",
                            height: "18px",
                            background: "#22c55e",
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "12px",
                            color: "#fff",
                            fontWeight: "bold",
                            border: "2px solid #fff",
                          }}
                        >
                          ✓
                        </div>
                      )}
                    </div>
                    <div style={{ overflow: "hidden" }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "14px",
                          color: "#1a1a2e",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {doc.name}
                      </div>
                      <span
                        style={{
                          display: "inline-block",
                          marginTop: "3px",
                          background: statusStyle.bg,
                          color: statusStyle.color,
                          padding: "1px 8px",
                          borderRadius: "10px",
                          fontSize: "11px",
                          fontWeight: 600,
                        }}
                      >
                        {status === 'notarized' ? '✓ Notarized' : displayStatus}
                      </span>
                      {doc.scheduledAt ? (
                        <div style={{ marginTop: '3px', fontSize: '11px', color: '#059669', fontWeight: 600 }}>
                          📅 {new Date(doc.scheduledAt).toLocaleDateString()} {new Date(doc.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      ) : null}
                      {adminTerminationNotice?.documentId === doc.id && (
                        <div style={{ marginTop: "4px", fontSize: "11px", color: "#be123c", fontWeight: 600 }}>
                          {adminTerminationNotice.message}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Size */}
                  <span style={{ fontSize: "13px", color: "#777" }}>{formatSize(doc.size)}</span>

                  {/* Date */}
                  <span style={{ fontSize: "12px", color: "#999" }}>{formatDate(doc.uploadedAt)}</span>

                  {/* Session Button */}
                  {showJoinButton ? (
                    <button
                      onClick={() => handleJoinSession(doc)}
                      style={{
                        background: "#10b981",
                        color: "#fff",
                        border: "none",
                        borderRadius: "8px",
                        padding: "8px 16px",
                        cursor: "pointer",
                        fontSize: "13px",
                        fontWeight: 600,
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#059669")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "#10b981")}
                    >
                      {previousSessions[doc.id] || activeSessions[doc.id] ? "Continue session" : "Join Session"}
                    </button>
                  ) : showPayButton ? (
                    <button
                      onClick={() => handlePaySessionAmount(doc)}
                      style={{
                        background: "#2563eb",
                        color: "#fff",
                        border: "none",
                        borderRadius: "8px",
                        padding: "8px 16px",
                        cursor: "pointer",
                        fontSize: "13px",
                        fontWeight: 600,
                      }}
                      title={`Pay ${Number(doc.sessionAmount || 0).toFixed(2)} to continue`}
                    >
                      Pay {Number(doc.sessionAmount || 0).toFixed(2)}
                    </button>
                  ) : (
                    <span style={{ fontSize: "12px", color: "#9ca3af" }}>
                      {displayStatus}
                    </span>
                  )}

                  {/* Three dots */}
                  <ThreeDotsMenu
                    onView={() => handleView(doc)}
                    onDownload={isNotarized ? () => handleDownloadNotarized(doc) : undefined}
                    onNotarize={
                      !isNotarized && status === 'uploaded'
                        ? () => handleNotarize(doc)
                        : undefined
                    }
                    onCancelNotarize={() => handleCancelNotarize(doc)}
                    onDelete={() => handleDelete(doc)}
                    notarized={isNotarized}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
      )}

      {/* Notarize Confirmation Modal */}
      {notarizingDoc && (
        <NotarizeConfirmModal
          doc={notarizingDoc}
          onClose={() => setNotarizingDoc(null)}
          onConfirm={handleConfirmNotarize}
        />
      )}

      <SessionPaymentModal
        doc={paymentModalDoc}
        selectedPaymentMethod={selectedPaymentMethod}
        onSelectMethod={setSelectedPaymentMethod}
        cardholderName={paymentCardholderName}
        onCardholderNameChange={setPaymentCardholderName}
        cardNumber={paymentCardNumber}
        onCardNumberChange={setPaymentCardNumber}
        expiry={paymentExpiry}
        onExpiryChange={setPaymentExpiry}
        cvc={paymentCvc}
        onCvcChange={setPaymentCvc}
        paymentError={paymentError}
        isPaying={isPaying}
        onClose={() => {
          if (isPaying) return;
          setPaymentModalDoc(null);
          setPaymentError("");
        }}
        onConfirm={handleConfirmSessionPayment}
      />

      <SignatureExtractionModal
        open={Boolean(signatureExtractionPdfDataUrl)}
        pdfDataUrl={signatureExtractionPdfDataUrl}
        title="Extract Signature • Uploaded Source Document"
        onClose={() => setSignatureExtractionPdfDataUrl("")}
        onSave={handleSaveExtractedSignature}
      />
    </div>
  );
};

export default OwnerDashboardPage;