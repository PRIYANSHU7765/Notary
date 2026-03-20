import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { saveOwnerDocument, fetchOwnerDocuments, deleteOwnerDocument } from "../utils/apiClient";
import { base64ToUint8Array } from "../utils/pdfUtils";
import socket from "../socket/socket";
import PdfViewer from "../components/PdfViewer";
import SidebarAssets from "../components/SidebarAssets";
import CanvasBoard from "../components/CanvasBoard";
import ScreenRecorder from "../components/ScreenRecorder";
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
          <button
            onClick={() => {
              setOpen(false);
              if (notarized) onCancelNotarize();
              else onNotarize();
            }}
            style={menuItemStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f5")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
          >
            {notarized ? "🚫 Cancel notarize" : "✍️ Notarize"}
          </button>
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
            onClick={() => { setOpen(false); onDelete(); }}
            style={{ ...menuItemStyle, color: "#b91c1c" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#fef2f2")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
          >
            🗑 Delete
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
            Notarize Document?
          </h3>
          <p style={{ margin: "0 0 24px 0", color: "#777", fontSize: "14px", lineHeight: "1.5" }}>
            Do you want to notarize <strong>{doc.name}</strong>?
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

const OwnerDashboardPage = () => {
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
          setDocs(backendDocs);
          saveDocs(backendDocs);
        }
      } catch (err) {
        console.warn('[OWNER] Failed to load documents from backend:', err?.message || err);
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
  const [uploadedFile, setUploadedFile] = useState(restoredDashboardState.uploadedFile || null);
  const [uploadedFileName, setUploadedFileName] = useState(restoredDashboardState.uploadedFileName || "");
  const [uploadedAssets, setUploadedAssets] = useState([]);
  const [uploadedAsset, setUploadedAsset] = useState(null);
  const [adminTerminationNotice, setAdminTerminationNotice] = useState(null);

  const lastAutoSharedDocKeyRef = useRef("");
  const currentSessionIdRef = useRef(null);
  const editorScrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlSessionId = params.get("sessionId");
    let id = urlSessionId || localStorage.getItem("notary.ownerSessionId") || "";
    
    // If no sessionId exists, generate one and navigate
    if (!id) {
      id = `notary-session-${Date.now()}`;
      navigate(`/owner/doc/dashboard?sessionId=${encodeURIComponent(id)}`, { replace: true });
    }
    
    setSessionId(id);
    localStorage.setItem("notary.ownerSessionId", id);
  }, [navigate]);

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
        uploadedFile,
        uploadedFileName,
      })
    );
  }, [activeSessionDocId, sessionJoined, sessionDocName, uploadedFile, uploadedFileName]);

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
    if (!sessionJoined || !activeSessionDocId || !uploadedFile || notaries.length === 0) return;

    const sessionIdToShare = activeSessions[activeSessionDocId] || previousSessions[activeSessionDocId];
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
    activeSessions,
    previousSessions,
    uploadedFile,
    uploadedFileName,
    sessionDocName,
    notaries.length,
  ]);

  useEffect(() => {
    const onNotarySessionStarted = (data) => {
      console.log('✅ [OWNER] Received notarySessionStarted event:', data);
      if (!data?.documentId || !data?.sessionId) {
        console.warn('⚠️ Invalid notarySessionStarted data:', data);
        return;
      }
      
      // Store the active session - this is the key that unlocks Join button
      setActiveSessions((prev) => {
        const updated = {
          ...prev,
          [data.documentId]: data.sessionId,
        };
        console.log('✅ [OWNER] Updated activeSessions from notarySessionStarted:', updated);
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
        console.log('✅ [OWNER] Updated docs with notary session start:', nextDocs.find(d => d.id === data.documentId));
        return nextDocs;
      });
      
      // Emit acknowledgment back so notary knows owner is aware
      socket.emit('ownerAckSessionStart', { 
        documentId: data.documentId,
        sessionId: data.sessionId,
        timestamp: new Date().toISOString()
      });
    };

    const onNotarySessionEnded = (data) => {
      console.log('❌ [OWNER] Received notarySessionEnded event:', data);

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
        setActiveSessionDocId(null);
        setNotaries([]);
        setSessionDocName("");
        setSessionJoined(false);
        setUploadedFile(null);
        setUploadedFileName("");
        setUploadedAsset(null);
        lastAutoSharedDocKeyRef.current = "";
        localStorage.removeItem(DASHBOARD_STATE_KEY);
        navigate("/owner/doc/dashboard", { replace: true });
      }

      setActiveSessions((prev) => {
        const updated = { ...prev };
        Object.keys(updated).forEach((docId) => {
          if (updated[docId] === endedSessionId || docId === endedDocumentId) {
            delete updated[docId];
          }
        });
        console.log('✅ [OWNER] Updated activeSessions after session end:', updated);
        return updated;
      });
    };

    const onOwnerLeftSession = (data) => {
      console.log('ℹ️ Owner left session:', data.sessionId);
      setActiveSessions((prev) => {
        const updated = { ...prev };
        Object.keys(updated).forEach((docId) => {
          if (updated[docId] === data.sessionId) {
            delete updated[docId];
          }
        });
        return updated;
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
        const updated = { ...prev };
        Object.keys(updated).forEach((docId) => {
          if (
            (terminatedSessionId && updated[docId] === terminatedSessionId) ||
            (terminatedDocumentId && docId === terminatedDocumentId)
          ) {
            delete updated[docId];
          }
        });
        return updated;
      });

      const isCurrentSession = terminatedSessionId && currentSessionIdRef.current === terminatedSessionId;
      const isCurrentDoc = terminatedDocumentId && activeSessionDocId === terminatedDocumentId;

      if (isCurrentSession || isCurrentDoc) {
        currentSessionIdRef.current = null;
        setActiveSessionDocId(null);
        setNotaries([]);
        setSessionDocName('');
        setSessionJoined(false);
        setUploadedFile(null);
        setUploadedFileName('');
        setUploadedAsset(null);
        lastAutoSharedDocKeyRef.current = '';
        localStorage.removeItem(DASHBOARD_STATE_KEY);
        navigate('/owner/doc/dashboard', { replace: true });
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

        const backendById = new Map(backendDocs.map((d) => [d.id, d]));
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

            if (
              nextStatus !== doc.status ||
              nextReview !== doc.notaryReview ||
              nextName !== doc.notaryName ||
              nextReviewedAt !== doc.notaryReviewedAt ||
              nextSessionId !== doc.sessionId
            ) {
              changed = true;
              console.log(`✅ [OWNER] Polling: Updated doc ${doc.id} status to ${nextStatus}`);
              return {
                ...doc,
                status: nextStatus,
                notaryReview: nextReview,
                notaryName: nextName,
                notaryReviewedAt: nextReviewedAt,
                sessionId: nextSessionId,
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
        console.warn("[owner-dashboard] Failed to sync review status:", error?.message || error);
      }
    };

    syncReviewStatus();
    const intervalId = setInterval(syncReviewStatus, 3000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  // Keep owner dashboard in sync with notary accept/reject decisions.
  useEffect(() => {
    const onDocumentReviewUpdated = (data) => {
      const { documentId, notaryReview, notaryName, notaryReviewedAt, status } = data || {};
      if (!documentId || !notaryReview) {
        console.warn('⚠️ [OWNER] Invalid documentReviewUpdated data:', data);
        return;
      }

      console.log(`✅ [OWNER] Received documentReviewUpdated: ${documentId} → ${notaryReview} (status: ${status})`);

      setDocs((prevDocs) => {
        const nextDocs = prevDocs.map((doc) =>
          doc.id === documentId
            ? { ...doc, status: status || doc.status, notaryReview, notaryName, notaryReviewedAt }
            : doc
        );
        saveDocs(nextDocs);
        console.log(`✅ [OWNER] Updated doc ${documentId}:`, nextDocs.find(d => d.id === documentId));
        return nextDocs;
      });

      if (notaryReview !== "accepted") {
        console.log(`ℹ️ [OWNER] Document rejected/pending, clearing active session for ${documentId}`);
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
      const { documentId, status } = data || {};
      if (!documentId) return;
      console.log(`✅ [OWNER] Received documentNotarized: ${documentId} (status: ${status})`);
      setDocs((prevDocs) => {
        const nextDocs = prevDocs.map((doc) =>
          doc.id === documentId ? { ...doc, status: status || doc.status, notarized: true } : doc
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
    console.log('🔌 [OWNER] Socket connection status:', {
      connected: socket.connected,
      id: socket.id,
      listeners: socket.listeners('notarySessionStarted')?.length || 0
    });
    
    const onConnect = () => {
      console.log('✅ [OWNER] Socket CONNECTED');
      setIsConnected(true);
    };
    const onDisconnect = () => {
      console.log('❌ [OWNER] Socket DISCONNECTED');
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
// Join session when active session is selected (restores after refresh too)
  useEffect(() => {
    if (!activeSessionDocId) return;

    const sessionIdToJoin = activeSessions[activeSessionDocId] || previousSessions[activeSessionDocId];
    if (!sessionIdToJoin) return;

    // Store the current session ID for later use in handleExitSession
    currentSessionIdRef.current = sessionIdToJoin;

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

    socket.on("usersConnected", onUsersConnected);
    socket.on("documentShared", onDocumentShared);
    socket.on("elementAdded", onElementAdded);
    socket.on("elementUpdated", onElementUpdated);
    socket.on("elementRemoved", onElementRemoved);

    socket.emit("joinSession", {
      roomId: sessionIdToJoin,
      role: "owner",
      userId: authUser?.userId || socket.id,
      username: authUser?.username || "Owner",
    });

    return () => {
      socket.off("usersConnected", onUsersConnected);
      socket.off("documentShared", onDocumentShared);
      socket.off("elementAdded", onElementAdded);
      socket.off("elementUpdated", onElementUpdated);
      socket.off("elementRemoved", onElementRemoved);
    };
  }, [activeSessionDocId, activeSessions, previousSessions]);

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
    const sessionIdVal =
      activeSessions[doc.id] ||
      previousSessions[doc.id] ||
      doc.sessionId;
    if (sessionIdVal) {
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
      const sessionIdVal = activeSessions[activeSessionDocId] || previousSessions[activeSessionDocId];
      if (sessionIdVal) {
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
        userRole: "owner",
      });

      setUploadedAssets((prev) => [...prev, asset]);
      setUploadedAsset(asset);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleEditorElementAdd = (element) => {
    setEditorElements((prev) => [...prev, element]);
    const sessionIdVal = activeSessions[activeSessionDocId] || previousSessions[activeSessionDocId];
    if (sessionIdVal) socket.emit("elementAdded", element);
  };

  const handleEditorElementUpdate = (elementId, updates) => {
    const updatedElement = {
      ...editorElements.find((el) => el.id === elementId),
      ...updates,
    };
    setEditorElements((prev) => prev.map((el) => (el.id === elementId ? updatedElement : el)));
    const sessionIdVal = activeSessions[activeSessionDocId] || previousSessions[activeSessionDocId];
    if (sessionIdVal) socket.emit("elementUpdated", updatedElement);
  };

  const handleEditorElementRemove = (elementId) => {
    setEditorElements((prev) => prev.filter((el) => el.id !== elementId));
    const sessionIdVal = activeSessions[activeSessionDocId] || previousSessions[activeSessionDocId];
    if (sessionIdVal) socket.emit("elementRemoved", elementId);
  };

  const handleExitSession = () => {
    // Notify notary that owner is leaving the session using the stored ref
    const sessionIdToLeave = currentSessionIdRef.current;
    if (sessionIdToLeave) {
      socket.emit("ownerLeftSession", { sessionId: sessionIdToLeave });
      console.log("Emitted ownerLeftSession:", sessionIdToLeave);
    }
    currentSessionIdRef.current = null;

    setActiveSessionDocId(null);
    setNotaries([]);
    setSessionDocName("");
    setSessionJoined(false);
    setUploadedFile(null);
    setUploadedFileName("");
    setUploadedAsset(null);
    lastAutoSharedDocKeyRef.current = "";
    localStorage.removeItem(DASHBOARD_STATE_KEY);
    // Also clear the active session for this document when exiting
    setActiveSessions((prev) => {
      const updated = { ...prev };
      delete updated[activeSessionDocId];
      return updated;
    });

    navigate("/owner/doc/dashboard");
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

  const handleDownloadNotarized = (doc) => {
    if (!doc?.id) {
      alert('Unable to download notarized document.');
      return;
    }

    const downloadUrl = `/api/owner-documents/${doc.id}/notarized`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `${doc.name?.replace(/\.pdf$/i, '') || 'document'}-notarized.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
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
      console.error("Failed to delete owner document:", error);
      setDocs(previous);
      saveDocs(previous);
      alert("Failed to delete document. Please try again.");
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!authUser?.userId) {
      alert('Please login again. Unable to save document without owner ID.');
      e.target.value = "";
      return;
    }

    const ownerName = (() => {
      try {
        return JSON.parse(localStorage.getItem("notary.authUser") || "null")?.username || "Owner";
      } catch {
        return "Owner";
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
      };
      const previousDocs = docs;
      const updated = [newDoc, ...previousDocs];
      setDocs(updated);
      saveDocs(updated);

      // Persist uploaded document to backend immediately.
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

        const backendDocs = await fetchOwnerDocuments({ ownerId: authUser.userId });
        if (Array.isArray(backendDocs)) {
          setDocs(backendDocs);
          saveDocs(backendDocs);
        }

        console.log('✅ [OWNER] Uploaded document saved and synced from backend:', newDoc.name);
      } catch (error) {
        console.warn('⚠️ [OWNER] Failed to save uploaded document to backend:', error);
        setDocs(previousDocs);
        saveDocs(previousDocs);
        alert('Upload failed to save in database. Please try again.');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleView = (doc) => {
    // Navigate to the document detail view which shows the document, notarization status, session info, and notary details.
    navigate(`/owner/doc/view/${encodeURIComponent(doc.id)}`);
  };

  const handleNotarize = (doc) => {
    setNotarizingDoc(doc);
  };

  const handleConfirmNotarize = async () => {
    const ownerName = (() => {
      try {
        return (
          notarizingDoc?.ownerName ||
          JSON.parse(localStorage.getItem("notary.authUser") || "null")?.username ||
          "Owner"
        );
      } catch {
        return notarizingDoc?.ownerName || "Owner";
      }
    })();

    const docSessionId = `notary-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const updatedDoc = {
      ...notarizingDoc,
      ownerName,
      sessionId: docSessionId,
      status: "pending_review",
      notaryReview: "pending",
      notarized: false,
      notarizedAt: null,
      notaryName: "",
      notaryReviewedAt: null,
    };
    const updated = docs.map((d) =>
      d.id === notarizingDoc.id ? updatedDoc : d
    );
    setDocs(updated);
    saveDocs(updated);

    // Save to backend
    try {
      // IMPORTANT: Don't set activeSessions here! Only set it when notary actually starts the session.
      // setPreviousSessions can stay for continuing past sessions, but NOT for new ones
      console.log('📤 [OWNER] Saving document for notary review with sessionId:', docSessionId);
      const savedDoc = await saveOwnerDocument({
        id: updatedDoc.id,
        ownerId: authUser.userId,
        ownerName: updatedDoc.ownerName,
        sessionId: docSessionId,
        name: updatedDoc.name,
        size: updatedDoc.size,
        type: updatedDoc.type,
        dataUrl: updatedDoc.dataUrl,
        uploadedAt: updatedDoc.uploadedAt,
        status: 'pending_review',
      });

      // Broadcast to notary dashboard via socket.io with complete context
      console.log('📡 [OWNER] Emitting documentNotarized event (pending review)');
      socket.emit("documentNotarized", {
        id: savedDoc.id,
        sessionId: savedDoc.sessionId,
        ownerId: savedDoc.ownerId,
        ownerName: savedDoc.ownerName,
        name: savedDoc.name,
        size: savedDoc.size,
        type: savedDoc.type,
        uploadedAt: savedDoc.uploadedAt,
        status: savedDoc.status,
        notarized: savedDoc.notarized,
      });
      console.log("✅ [OWNER] Emitted documentNotarized event via socket");
    } catch (error) {
      console.error("❌ [OWNER] Failed to sync document to backend:", error);
    }

    setNotarizingDoc(null);
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
          {/* Sidebar */}
          <SidebarAssets
            userRole="owner"
            sessionId={activeSessions[activeSessionDocId] || previousSessions[activeSessionDocId]}
            userId={authUser.userId}
            uploadedAsset={uploadedAsset}
            uploadedAssets={uploadedAssets}
            assetScopeKey={activeSessionDocId || "owner-no-doc"}
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
                    title="Back to Notaries"
                  >
                    ←
                  </button>
                  <h2 style={{ margin: 0, display: "inline" }}>✍️ Owner Dashboard</h2>
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

            {/* Screen Recording Section */}
            <ScreenRecorder />

            {/* Document Editor */}
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
              style={{ maxHeight: "70vh", borderRadius: "5px", backgroundColor: "#fff", flexShrink: 0 }}
            >
              <h3 style={{ margin: "10px 15px" }}>Document Editor</h3>
              {uploadedFile ? (
                <div
                  style={{
                    position: "relative",
                    width: `${EDITOR_WIDTH}px`,
                    height: `${EDITOR_HEIGHT}px`,
                    backgroundColor: "white",
                    margin: "0 15px 15px 15px",
                    overflow: "hidden",
                  }}
                >
                  <PdfViewer
                    file={uploadedFile}
                    fileName={uploadedFileName}
                    containerHeight={`${EDITOR_HEIGHT}px`}
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
                  Owner Dashboard
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
                      {authUser?.role ? authUser.role.toUpperCase() : "OWNER"} • ID: {authUser?.userId || "—"}
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
                onClick={() => navigate("/owner/session")}
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

          {/* Content */}
          <div style={{ maxWidth: "900px", margin: "0 auto", padding: "32px 24px" }}>
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
                gridTemplateColumns: "1fr 120px 140px 140px 48px",
                padding: "12px 20px",
                background: "#f9fafc",
                borderBottom: "1px solid #e8eaed",
                fontSize: "12px",
                fontWeight: 700,
                color: "#888",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
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
              // Do not depend only on in-memory socket maps because the owner may miss the live event.
              const showJoinButton =
                status === 'session_started' &&
                Boolean(hasDocumentSession);

              const displayStatus =
                status === 'uploaded'
                  ? 'Waiting for notary'
                  : status === 'pending_review'
                  ? 'Waiting for acceptance'
                  : status === 'accepted'
                  ? 'Accepted — waiting for session'
                  : status === 'session_started'
                  ? 'Session started'
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
                    gridTemplateColumns: "1fr 120px 140px 140px 48px",
                    padding: "14px 20px",
                    alignItems: "center",
                    borderBottom: idx < docs.length - 1 ? "1px solid #f0f0f0" : "none",
                    transition: "background 0.1s",
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
                  ) : (
                    <span style={{ fontSize: "12px", color: "#9ca3af" }}>
                      {displayStatus}
                    </span>
                  )}

                  {/* Three dots */}
                  <ThreeDotsMenu
                    onView={() => handleView(doc)}
                    onDownload={isNotarized ? () => handleDownloadNotarized(doc) : undefined}
                    onNotarize={() => handleNotarize(doc)}
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
    </div>
  );
};

export default OwnerDashboardPage;

