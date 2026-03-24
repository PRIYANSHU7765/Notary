import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import PdfViewer from "../components/PdfViewer";
import SidebarAssets from "../components/SidebarAssets";
import CanvasBoard from "../components/CanvasBoard";
import ScreenRecorder from "../components/ScreenRecorder";
import socket from "../socket/socket";
import { createDocumentDragAsset } from "../utils/documentAsset";
import { bytesToDataUrl, generateNotarizedPdfBytes } from "../utils/pdfUtils";
import { completeOwnerDocumentNotarization, endOwnerDocumentSession, fetchOwnerDocuments, markOwnerDocumentSessionStarted } from "../utils/apiClient";

const EDITOR_WIDTH = 900;
const EDITOR_HEIGHT = 1300;

const normalizeSessionId = (value) => {
  if (!value) return "";
  const raw = value.trim();

  // If a full share URL is pasted, extract sessionId query param.
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const parsedUrl = new URL(raw);
      const sid = parsedUrl.searchParams.get("sessionId");
      if (sid) return sid;
    } catch {
      // Ignore parse failure and continue with fallback extraction below.
    }
  }

  // Fallback: pull out notary-session-* from arbitrary text.
  const match = raw.match(/notary-session-[A-Za-z0-9_-]+/);
  return match ? match[0] : raw;
};

const getNotaryElementsStorageKey = (sessionId) => `notary.elements.${sessionId}`;

const loadNotaryElements = (sessionId) => {
  if (!sessionId) return [];
  try {
    return JSON.parse(localStorage.getItem(getNotaryElementsStorageKey(sessionId)) || "[]");
  } catch {
    return [];
  }
};

const saveNotaryElements = (sessionId, elements) => {
  if (!sessionId) return;
  localStorage.setItem(getNotaryElementsStorageKey(sessionId), JSON.stringify(elements));
};

const NotaryPage = ({ sessionId: passedSessionId }) => {
  const [elements, setElements] = useState([]);
  const [sessionId, setSessionId] = useState(passedSessionId || null);
  const [documentId, setDocumentId] = useState(null);
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [documentInfo, setDocumentInfo] = useState(null);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [pdfDataUrl, setPdfDataUrl] = useState(null);
  const [ownerConnected, setOwnerConnected] = useState(false);
  const [sessionStatus, setSessionStatus] = useState(null);
  const [uploadedAssets, setUploadedAssets] = useState([]);
  const [uploadedAsset, setUploadedAsset] = useState(null);
  const [isAssetBoxMode, setIsAssetBoxMode] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState("info");
  const toastTimerRef = useRef(null);
  const editorScrollRef = useRef(null);
  const pdfScrollRef = useRef(null);
  const scrollEmitTimerRef = useRef(null);
  const isApplyingScrollRef = useRef(false);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const showToast = (message, type = "info", duration = 2600) => {
    setToastMessage(message);
    setToastType(type);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage("");
      toastTimerRef.current = null;
    }, duration);
  };

  // Auto-fill from URL param even if not passed as prop (direct URL open)
  const urlSessionId = normalizeSessionId(new URLSearchParams(window.location.search).get("sessionId"));
  const storedSessionId = normalizeSessionId(localStorage.getItem("notary.lastSessionId"));
  const initialSessionId = normalizeSessionId(passedSessionId || urlSessionId || storedSessionId || "");
  const [inputSessionId, setInputSessionId] = useState(initialSessionId);
  const [sessionJoined, setSessionJoined] = useState(!!initialSessionId);

  // If session ID came from URL, set it immediately and mark as joined
  useEffect(() => {
    if (initialSessionId && !sessionId) {
      setSessionId(initialSessionId);
      setSessionJoined(true);
      if (initialSessionId) {
        localStorage.setItem("notary.lastSessionId", initialSessionId);
      }
    }
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setUploadedAssets([]);
      setUploadedAsset(null);
      return;
    }

    setUploadedAssets([]);
    setUploadedAsset(null);
  }, [sessionId]);

  // Track backend connection status
  useEffect(() => {
    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  useEffect(() => {
    if (sessionJoined && sessionId) {
      const authUser = (() => {
        try {
          return JSON.parse(localStorage.getItem('notary.authUser') || 'null') || {};
        } catch {
          return {};
        }
      })();

      const onElementAdded = (element) => {
        console.log("✏️ [NOTARY] Owner added element:", element);
        setElements((prev) => [...prev, element]);
      };

      const onElementUpdated = (updatedElement) => {
        console.log("🔄 [NOTARY] Owner updated element:", updatedElement.id);
        setElements((prev) =>
          prev.map((el) => (el.id === updatedElement.id ? updatedElement : el))
        );
      };

      const onElementRemoved = (elementId) => {
        console.log("🗑️ [NOTARY] Owner removed element:", elementId);
        setElements((prev) => prev.filter((el) => el.id !== elementId));
      };

      const onUsersConnected = (users) => {
        console.log("👥 [NOTARY] Users connected:", users);
        setConnectedUsers(users);
        const owner = users.find((u) => u.role === 'owner');
        setOwnerConnected(!!owner);
      };

      const onSessionStatus = (status) => {
        console.log("📊 [NOTARY] Session status:", status);
        setSessionStatus(status);
        setOwnerConnected(Boolean(status?.ownerConnected));
        if (Array.isArray(status?.allUsers)) {
          setConnectedUsers(status.allUsers);
        }
      };

      const onDocumentUploaded = (docInfo) => {
        console.log("📄 [NOTARY] Document uploaded:", docInfo);
        setDocumentInfo(docInfo);
      };

      const onDocumentShared = (data) => {
        console.log("📄 [NOTARY] Document shared by owner:", data.fileName);
        setPdfDataUrl(data.pdfDataUrl);
        setDocumentInfo({ fileName: data.fileName });
      };

      const onDocumentScrolled = (data) => {
        if (data?.fromRole && data.fromRole !== "owner") return;
        if (data?.scrollRatio === undefined && data?.scrollPosition === undefined) return;

        const editorTarget = editorScrollRef.current;
        const pdfTarget = pdfScrollRef.current;
        const candidates = [editorTarget, pdfTarget].filter(Boolean);
        if (!candidates.length) return;

        const scrollTarget = candidates.reduce((best, current) => {
          const bestRange = Math.max(best.scrollHeight - best.clientHeight, 0);
          const currentRange = Math.max(current.scrollHeight - current.clientHeight, 0);
          return currentRange > bestRange ? current : best;
        });

        const maxScrollable = Math.max(scrollTarget.scrollHeight - scrollTarget.clientHeight, 0);
        const nextScrollTop = data?.scrollRatio !== undefined
          ? maxScrollable * Number(data.scrollRatio)
          : Number(data.scrollPosition);
        const finalScrollTop = Number.isFinite(nextScrollTop) ? nextScrollTop : 0;

        isApplyingScrollRef.current = true;
        if (editorTarget) editorTarget.scrollTop = finalScrollTop;
        if (pdfTarget) pdfTarget.scrollTop = finalScrollTop;
        setTimeout(() => {
          isApplyingScrollRef.current = false;
        }, 100);
      };

      const onOwnerLeftSession = (data) => {
        console.log("👤 [NOTARY] Owner left session:", data.sessionId);
        if (data.sessionId === sessionId) {
          setSessionJoined(false);
          setSessionId(null);
          setInputSessionId("");
          setElements([]);
          setUploadedAssets([]);
          setUploadedAsset(null);
          setPdfDataUrl(null);
          setDocumentInfo(null);
          setOwnerConnected(false);
          setConnectedUsers([]);
        }
      };

      const onAdminSessionTerminated = (data) => {
        if (!data?.sessionId || data.sessionId !== sessionId) return;

        showToast(data.message || "Admin terminated this session", "error", 4600);

        setSessionJoined(false);
        setSessionId(null);
        setInputSessionId("");
        setElements([]);
        setUploadedAssets([]);
        setUploadedAsset(null);
        setPdfDataUrl(null);
        setDocumentInfo(null);
        setOwnerConnected(false);
        setConnectedUsers([]);
        setDocumentId(null);

        localStorage.removeItem("notary.lastSessionId");
        const params = new URLSearchParams(window.location.search);
        params.delete("sessionId");
        params.delete("role");
        params.delete("documentId");
        window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);

        window.setTimeout(() => {
          navigate("/notary/doc/dashboard");
        }, 200);
      };

      const onNotarySessionStartRejected = (payload) => {
        if (!payload?.sessionId || payload.sessionId !== sessionId) return;

        showToast(payload.message || 'Notary session start rejected because session is terminated.', 'error', 5200);

        setSessionJoined(false);
        setSessionId(null);
        setInputSessionId("");
        setElements([]);
        setUploadedAssets([]);
        setUploadedAsset(null);
        setPdfDataUrl(null);
        setDocumentInfo(null);
        setOwnerConnected(false);
        setConnectedUsers([]);
        setDocumentId(null);

        localStorage.removeItem("notary.lastSessionId");
        const params = new URLSearchParams(window.location.search);
        params.delete("sessionId");
        params.delete("role");
        params.delete("documentId");
        window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);

        window.setTimeout(() => {
          navigate("/notary/doc/dashboard");
        }, 200);
      };

      // Register listeners BEFORE joining to avoid missing initial presence events.
      socket.on("elementAdded", onElementAdded);
      socket.on("elementUpdated", onElementUpdated);
      socket.on("elementRemoved", onElementRemoved);
      socket.on("usersConnected", onUsersConnected);
      socket.on("sessionStatus", onSessionStatus);
      socket.on("documentUploaded", onDocumentUploaded);
      socket.on("documentShared", onDocumentShared);
      socket.on("documentScrolled", onDocumentScrolled);
      socket.on("ownerLeftSession", onOwnerLeftSession);
      socket.on("adminSessionTerminated", onAdminSessionTerminated);
      socket.on("notarySessionStartRejected", onNotarySessionStartRejected);
      const onOwnerPaymentCompleted = (data) => {
        if (!data?.documentId || !documentId) return;
        if (String(data.documentId) !== String(documentId)) return;
        showToast(`Payment received: ${Number(data.amountPaid || 0).toFixed(2)}. You can now end the session.`, 'success', 4200);
      };
      socket.on('ownerPaymentCompleted', onOwnerPaymentCompleted);

      console.log('📡 [NOTARY] Joining session:', {roomId: sessionId, role: 'notary', userId: authUser.userId});
      socket.emit("joinSession", {
        roomId: sessionId,
        role: "notary",
        userId: authUser.userId || socket.id,
        username: authUser.username || "Notary",
        token: authUser.token,
      });

      // Check if this is a fresh session start (sessionStarted=true in URL)
      const params = new URLSearchParams(window.location.search);
      const wasJustStarted = params.get('sessionStarted') === 'true';
      const documentId = params.get('documentId') || null;
      setDocumentId(documentId);

      if (wasJustStarted) {
        console.log('🔔 [NOTARY] Fresh session start detected - will emit notarySessionStarted');

        if (documentId) {
          markOwnerDocumentSessionStarted(
            documentId,
            sessionId,
            authUser.username || 'Notary',
            authUser.userId
          ).catch((error) => {
            console.warn('⚠️ [NOTARY] Failed to persist session_started via API:', error?.message || error);
          });
        } else {
          console.warn('⚠️ [NOTARY] Missing documentId in URL; cannot persist session_started state');
        }
        
        // Emit immediately if socket is connected, otherwise wait with retry
        const attemptEmit = (attempt = 0) => {
          if (socket.connected) {
            console.log('🔔 [NOTARY] Socket connected - Emitting notarySessionStarted');
            socket.emit('notarySessionStarted', {
              documentId: documentId,
              sessionId: sessionId,
              notaryName: authUser.username || 'Notary',
              notaryUserId: authUser.userId,
              timestamp: new Date().toISOString(),
            });
            
            // Remove the flag from URL so we don't re-emit on refresh
            params.delete('sessionStarted');
            params.delete('documentId');
            window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
          } else if (attempt < 5) {
            // Retry up to 5 times (500ms total wait)
            console.log(`⏳ [NOTARY] Socket not ready yet, retrying... (attempt ${attempt + 1}/5)`);
            setTimeout(() => attemptEmit(attempt + 1), 100);
          } else {
            console.warn('❌ [NOTARY] Failed to emit notarySessionStarted - socket not connected after retries');
          }
        };
        
        attemptEmit();
      }

      return () => {
        socket.off("elementAdded", onElementAdded);
        socket.off("elementUpdated", onElementUpdated);
        socket.off("elementRemoved", onElementRemoved);
        socket.off("usersConnected", onUsersConnected);
        socket.off("documentUploaded", onDocumentUploaded);
        socket.off("documentShared", onDocumentShared);
        socket.off("sessionStatus", onSessionStatus);
        socket.off("ownerLeftSession", onOwnerLeftSession);
        socket.off("adminSessionTerminated", onAdminSessionTerminated);
        socket.off("notarySessionStartRejected", onNotarySessionStartRejected);
        socket.off("documentScrolled", onDocumentScrolled);
        socket.off('ownerPaymentCompleted', onOwnerPaymentCompleted);
      };
    }
  }, [sessionJoined, sessionId]);

  // Scroll synchronization: emit notary's scroll position to owner.
  // Listen to outer editor container which receives all scroll events.
  useEffect(() => {
    if (!sessionJoined || !sessionId) return;

    const getScrollMetrics = () => {
      // Prioritize editor scroll ref (outer scrollable container)
      const el = editorScrollRef.current;
      if (!el) {
        console.warn('[NOTARY SCROLL] editorScrollRef not set');
        return { scrollPosition: 0, scrollRatio: 0 };
      }
      const maxScrollable = Math.max(el.scrollHeight - el.clientHeight, 0);
      const scrollPosition = el.scrollTop;
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
        console.log('[NOTARY SCROLL] Emitting scroll:', { scrollPosition, scrollRatio, sessionId });
        socket.emit("documentScrolled", {
          sessionId,
          scrollPosition,
          scrollRatio,
          timestamp: Date.now(),
        });
      }, 50); // Throttle scroll events
    };

    const target = editorScrollRef.current;
    if (!target) {
      console.warn('[NOTARY SCROLL] Cannot attach listener - editorScrollRef not set');
      return;
    }

    console.log('[NOTARY SCROLL] Attaching scroll listener to editorScrollRef');
    target.addEventListener("scroll", handleScroll);
    return () => {
      console.log('[NOTARY SCROLL] Removing scroll listener from editorScrollRef');
      if (scrollEmitTimerRef.current) {
        window.clearTimeout(scrollEmitTimerRef.current);
      }
      target.removeEventListener("scroll", handleScroll);
    };
  }, [sessionJoined, sessionId, pdfDataUrl]);

  const resolveSessionDocumentId = async () => {
    if (documentId) return documentId;
    if (!sessionId) return null;

    try {
      const docs = await fetchOwnerDocuments({ sessionId });
      const currentFileName = String(documentInfo?.fileName || '').trim().toLowerCase();

      const preferredDoc =
        docs.find((d) => String(d.name || '').trim().toLowerCase() === currentFileName && d.status === 'session_started') ||
        docs.find((d) => String(d.name || '').trim().toLowerCase() === currentFileName && d.status === 'accepted') ||
        docs.find((d) => String(d.name || '').trim().toLowerCase() === currentFileName) ||
        docs.find((d) => d.status === 'session_started') ||
        docs.find((d) => d.status === 'accepted') ||
        docs[0];

      const resolvedDocumentId = preferredDoc?.id || null;
      if (resolvedDocumentId) {
        setDocumentId(resolvedDocumentId);
        console.log('Resolved documentId from session:', resolvedDocumentId);
      }

      return resolvedDocumentId;
    } catch (resolveError) {
      console.warn('Failed to resolve document by session:', resolveError);
      return null;
    }
  };
  const handleJoinSession = () => {
    const normalized = normalizeSessionId(inputSessionId);
    if (normalized) {
      setElements([]);
      setUploadedAssets([]);
      setUploadedAsset(null);
      setSessionId(normalized);
      setInputSessionId(normalized);
      setSessionJoined(true);
      localStorage.setItem("notary.lastSessionId", normalized);

      const params = new URLSearchParams(window.location.search);
      params.set("role", "notary");
      params.set("sessionId", normalized);
      window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
    }
  };

  const handleEndSession = async () => {
    const authUser = (() => {
      try {
        return JSON.parse(localStorage.getItem('notary.authUser') || 'null') || {};
      } catch {
        return {};
      }
    })();

    const targetDocumentId = await resolveSessionDocumentId();

    const payload = {
      sessionId: sessionId || null,
      documentId: targetDocumentId || null,
      notaryName: authUser.username || 'Notary',
      notaryUserId: authUser.userId || null,
    };

    if (targetDocumentId && sessionId) {
      try {
        await endOwnerDocumentSession(
          targetDocumentId,
          sessionId,
          authUser.username || 'Notary',
          authUser.userId
        );
      } catch (error) {
        const message = error?.message || 'Failed to end session';
        if (String(message).toLowerCase().includes('payment') || String(message).toLowerCase().includes('pending')) {
          showToast(message, 'error', 4200);
          return;
        }
        console.warn('Failed to persist session end:', message);
      }
    }

    if (sessionId) {
      socket.emit('notarySessionEnded', payload);
    }

    setSessionJoined(false);
    setSessionId(null);
    setInputSessionId("");
    setElements([]);
    setUploadedAssets([]);
    setUploadedAsset(null);
    setPdfDataUrl(null);
    setDocumentInfo(null);
    setOwnerConnected(false);
    setConnectedUsers([]);
    setDocumentId(null);

    localStorage.removeItem("notary.lastSessionId");
    const params = new URLSearchParams(window.location.search);
    params.delete("sessionId");
    params.delete("role");
    params.delete("documentId");
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);

    navigate("/notary/doc/dashboard");
  };

  const handleMarkNotarized = async () => {
    showToast('Notarization started…', 'info');

    let targetDocumentId = documentId;

    if (!targetDocumentId && sessionId) {
      targetDocumentId = await resolveSessionDocumentId();
    }

    if (!targetDocumentId) {
      showToast('Unable to resolve the session document. Please refresh and try again.', 'error');
      console.warn('⚠️ [NOTARY] Mark notarized aborted: no target document id', {
        sessionId,
        documentInfo,
      });
      return;
    }

    const authUser = (() => {
      try {
        return JSON.parse(localStorage.getItem('notary.authUser') || 'null') || {};
      } catch {
        return {};
      }
    })();

    let notarizedDataUrl = null;
    const normalizedAmount = 25; // Fixed price of 25
    if (pdfDataUrl) {
      try {
        const bytes = await generateNotarizedPdfBytes(pdfDataUrl, elements, {
          editorWidth: EDITOR_WIDTH,
          editorHeight: EDITOR_HEIGHT,
        });
        notarizedDataUrl = bytesToDataUrl(bytes, "application/pdf");
      } catch (error) {
        console.warn('⚠️ [NOTARY] Failed to generate notarized PDF:', error);
      }
    }

    if (!notarizedDataUrl) {
      showToast('Unable to generate notarized PDF. Please try again.', 'error');
      console.warn('⚠️ Notarization aborted: no notarized PDF available', { elements, pdfDataUrl });
      return;
    }

    try {
      await completeOwnerDocumentNotarization(
        targetDocumentId,
        authUser.username || 'Notary',
        notarizedDataUrl,
        normalizedAmount
      );
      console.log('✅ Notarization marked complete for', targetDocumentId);
      if (normalizedAmount > 0) {
        showToast(`✅ Document marked. Waiting for owner payment of ${normalizedAmount.toFixed(2)}.`, 'info', 4200);
      } else {
        showToast('✅ Document notarized successfully!', 'success');
      }
    } catch (error) {
      console.error('❌ Failed to mark document notarized:', error);
      showToast('Failed to mark document notarized. Please try again.', 'error');
    }
  };

  useEffect(() => {
    if (sessionJoined && sessionId) {
      localStorage.setItem("notary.lastSessionId", sessionId);

      const params = new URLSearchParams(window.location.search);
      params.set("role", "notary");
      params.set("sessionId", sessionId);
      window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
    }
  }, [sessionJoined, sessionId]);

  const handleElementAdd = (element) => {
    const newElements = [...elements, element];
    setElements(newElements);
    saveNotaryElements(sessionId, newElements);
    socket.emit("elementAdded", element);
  };

  const handleElementUpdate = (elementId, updates) => {
    const updatedElement = {
      ...elements.find((el) => el.id === elementId),
      ...updates,
    };
    const newElements = elements.map((el) => (el.id === elementId ? updatedElement : el));
    setElements(newElements);
    saveNotaryElements(sessionId, newElements);
    socket.emit("elementUpdated", updatedElement);
  };

  const handleElementRemove = (elementId) => {
    const newElements = elements.filter((el) => el.id !== elementId);
    setElements(newElements);
    saveNotaryElements(sessionId, newElements);
    socket.emit("elementRemoved", elementId);
  };

  const handleCreateAssetBox = (x, y, width = 120, height = 80) => {
    const boxSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><rect x="2" y="2" width="116" height="76" fill="none" stroke="#666" stroke-width="2" rx="2"/></svg>`;
    const boxImage = `data:image/svg+xml,${encodeURIComponent(boxSvg)}`;

    const newElement = {
      id: `box-${Date.now()}`,
      image: boxImage,
      x: x,
      y: y,
      width: width,
      height: height,
      type: "box",
      user: "notary",
    };

    setElements([...elements, newElement]);
    socket.emit("elementAdded", newElement);
    setIsAssetBoxMode(false);
  };

  const handleAssetUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const asset = await createDocumentDragAsset({
        fileName: file.name,
        dataUrl: reader.result,
        mimeType: file.type,
        userRole: "notary",
      });

      setUploadedAsset(asset);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
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

  // Load notary elements from localStorage on session join
  useEffect(() => {
    if (sessionJoined && sessionId) {
      const savedElements = loadNotaryElements(sessionId);
      setElements(savedElements);
    }
  }, [sessionJoined, sessionId]);

  if (!sessionJoined) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          backgroundColor: "#f5f5f5",
        }}
      >
        <div
          style={{
            backgroundColor: "white",
            padding: "40px",
            borderRadius: "8px",
            boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
            textAlign: "center",
            maxWidth: "420px",
            width: "100%",
          }}
        >
          <h2>🔐 Join Notarization Session</h2>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "5px",
            padding: "4px 10px", borderRadius: "20px", fontSize: "13px", fontWeight: "bold",
            marginBottom: "16px",
            backgroundColor: isConnected ? "#e8f5e9" : "#ffebee",
            color: isConnected ? "#2e7d32" : "#c62828",
            border: `1px solid ${isConnected ? "#a5d6a7" : "#ef9a9a"}`
          }}>
            {isConnected ? "● Server connected" : "● Server offline — start the backend first"}
          </div>
          <p style={{ color: "#666" }}>Paste the session ID or open the link shared by the document owner.</p>

          <input
            type="text"
            placeholder="Enter Session ID"
            value={inputSessionId}
            onChange={(e) => setInputSessionId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoinSession()}
            style={{
              width: "100%",
              padding: "10px",
              marginBottom: "15px",
              border: "1px solid #ddd",
              borderRadius: "4px",
              boxSizing: "border-box",
            }}
          />

          <button
            onClick={handleJoinSession}
            disabled={!inputSessionId.trim()}
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: inputSessionId.trim() ? "#2196F3" : "#9e9e9e",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: inputSessionId.trim() ? "pointer" : "not-allowed",
              fontWeight: "bold",
              fontSize: "16px",
            }}
          >
            Join Session
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Sidebar */}
      <SidebarAssets
        userRole="notary"
        sessionId={sessionId}
        userId={(() => {
          try {
            return JSON.parse(localStorage.getItem('notary.authUser') || 'null')?.userId;
          } catch {
            return undefined;
          }
        })()}
        uploadedAsset={uploadedAsset}
        uploadedAssets={uploadedAssets}
        onAssetBoxClick={() => setIsAssetBoxMode(true)}
        assetScopeKey={sessionId || "notary-no-session"}
      />

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "15px", overflowY: "auto", position: "relative" }}>
        {/* Header */}
        <div style={{ marginBottom: "15px", backgroundColor: "#f3e5f5", padding: "15px", borderRadius: "5px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
            <h2 style={{ margin: 0 }}>✍️ Notary Dashboard</h2>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: "5px",
                padding: "4px 10px", borderRadius: "20px", fontSize: "13px", fontWeight: "bold",
                backgroundColor: isConnected ? "#e8f5e9" : "#ffebee",
                color: isConnected ? "#2e7d32" : "#c62828",
                border: `1px solid ${isConnected ? "#a5d6a7" : "#ef9a9a"}`
              }}>
                {isConnected ? "● Server connected" : "● Server offline"}
              </span>
              <button
                onClick={handleMarkNotarized}
                disabled={!ownerConnected}
                style={{
                  padding: "6px 10px",
                  backgroundColor: ownerConnected ? "#2563eb" : "#9ca3af",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: ownerConnected ? "pointer" : "not-allowed",
                  fontSize: "12px",
                  fontWeight: "600",
                }}
                title={ownerConnected ? "Mark document as notarized" : "Connect to owner to complete notarization"}
              >
                Mark Notarized
              </button>
              <button
                onClick={handleEndSession}
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
          </div>
          <p style={{ margin: "8px 0 4px" }}>
            <strong>Session ID:</strong>{" "}
            <code style={{ fontSize: "13px", backgroundColor: "#fff", padding: "2px 6px", borderRadius: "3px" }}>{sessionId}</code>
          </p>
          <p style={{ margin: "4px 0" }}>
            <strong>Connected Users:</strong> {connectedUsers.length}
            {" | "}
            <strong>Owner Status:</strong>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: "4px",
              marginLeft: "6px",
              padding: "2px 8px", borderRadius: "12px", fontSize: "12px", fontWeight: "bold",
              backgroundColor: ownerConnected ? "#e8f5e9" : "#fff3e0",
              color: ownerConnected ? "#2e7d32" : "#e65100",
              border: `1px solid ${ownerConnected ? "#a5d6a7" : "#ffe0b2"}`
            }}>
              {ownerConnected ? "● Online" : "● Waiting..."}
            </span>
          </p>
          {documentInfo && (
            <p style={{ margin: "4px 0" }}>
              <strong>Document:</strong> {documentInfo.fileName}
            </p>
          )}
        </div>

        {/* Screen Recorder */}
        <ScreenRecorder role="notary" sessionId={sessionId} socket={socket} />

        {/* Asset Upload Section */}
        <div style={{ marginBottom: "15px", padding: "15px", backgroundColor: "#f5f5f5", borderRadius: "5px" }}>
          <label htmlFor="notary-asset-upload" style={{ fontWeight: "bold" }}>
            📎 Upload Asset:
          </label>
          <input
            id="notary-asset-upload"
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            style={{ marginLeft: "10px", cursor: "pointer" }}
            onChange={handleAssetUpload}
          />
          {uploadedAsset && <p style={{ margin: "5px 0 0 0", color: "green" }}>✅ {uploadedAsset.name} added to assets</p>}
        </div>

        {/* Canvas Board (Full Width) */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: "0 0 10px 0" }}>📋 Document with Signatures</h3>
          {pdfDataUrl ? (
            <div
              ref={editorScrollRef}
              style={{
                height: "calc(100vh - 260px)",
                minHeight: "520px",
                overflowY: "auto",
                border: "1px solid #ddd",
                borderRadius: "5px",
                backgroundColor: "#fff"
              }}
              onWheel={(e) => {
                if (editorScrollRef.current) {
                  e.preventDefault();
                  editorScrollRef.current.scrollTop += e.deltaY;
                }
              }}
            >
              <div
                style={{
                  position: "relative",
                  minHeight: "100%",
                  width: "100%",
                  backgroundColor: "white",
                  overflow: "hidden",
                }}
              >
                <PdfViewer
                  file={pdfDataUrl}
                  fileName={documentInfo?.fileName}
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
                    elements={elements}
                    onElementAdd={handleElementAdd}
                    onElementUpdate={handleElementUpdate}
                    onElementRemove={handleElementRemove}
                    canvasWidth={EDITOR_WIDTH}
                    canvasHeight={EDITOR_HEIGHT}
                    overlayMode
                    showGuide={false}
                    isAssetBoxMode={isAssetBoxMode}
                    onCreateAssetBox={handleCreateAssetBox}
                    currentUserRole="notary"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                border: "2px dashed #ccc",
                padding: "40px",
                textAlign: "center",
                color: "#999",
                borderRadius: "5px",
              }}
            >
              Waiting for the document owner to upload a document...
            </div>
          )}
        </div>

        {/* Toast */}
        {toastMessage && (
          <div
            style={{
              position: "fixed",
              bottom: "20px",
              right: "20px",
              minWidth: "260px",
              padding: "16px 18px",
              borderRadius: "12px",
              boxShadow: "0 12px 26px rgba(0,0,0,0.16)",
              backgroundColor: toastType === "success" ? "#22c55e" : toastType === "error" ? "#ef4444" : "#2563eb",
              color: "white",
              fontWeight: 600,
              zIndex: 110,
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <span style={{ fontSize: "18px" }}>
              {toastType === "success" ? "✅" : toastType === "error" ? "⚠️" : "ℹ️"}
            </span>
            <span style={{ flex: 1, fontSize: "13px" }}>{toastMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotaryPage;

