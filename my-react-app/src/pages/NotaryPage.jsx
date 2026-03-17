import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import PdfViewer from "../components/PdfViewer";
import SidebarAssets from "../components/SidebarAssets";
import CanvasBoard from "../components/CanvasBoard";
import ScreenRecorder from "../components/ScreenRecorder";
import socket from "../socket/socket";
import { createDocumentDragAsset } from "../utils/documentAsset";

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

const NOTARY_UPLOADED_ASSETS_KEY = "notary.notaryUploadedAssets";

const loadNotaryUploadedAssets = () => {
  try {
    return JSON.parse(localStorage.getItem(NOTARY_UPLOADED_ASSETS_KEY) || "[]");
  } catch {
    return [];
  }
};

const saveNotaryUploadedAssets = (assets) => {
  localStorage.setItem(NOTARY_UPLOADED_ASSETS_KEY, JSON.stringify(assets));
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
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [documentInfo, setDocumentInfo] = useState(null);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [pdfDataUrl, setPdfDataUrl] = useState(null);
  const [ownerConnected, setOwnerConnected] = useState(false);
  const [sessionStatus, setSessionStatus] = useState(null);
  const [uploadedAssets, setUploadedAssets] = useState(() => loadNotaryUploadedAssets());
  const [uploadedAsset, setUploadedAsset] = useState(null);
  const [isAssetBoxMode, setIsAssetBoxMode] = useState(false);
  const editorScrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  // Auto-fill from URL param even if not passed as prop (direct URL open)
  const urlSessionId = normalizeSessionId(new URLSearchParams(window.location.search).get("sessionId"));
  const storedSessionId = normalizeSessionId(localStorage.getItem("notary.lastSessionId"));
  const initialSessionId = normalizeSessionId(passedSessionId || urlSessionId || storedSessionId || "");
  const [inputSessionId, setInputSessionId] = useState(initialSessionId);
  const [sessionJoined, setSessionJoined] = useState(!!initialSessionId);

  // If session ID came from URL, treat it as already set
  useEffect(() => {
    if (initialSessionId && !sessionId) {
      // Clear uploaded assets for a fresh document session when auto-joining from URL
      setUploadedAssets([]);
      setUploadedAsset(null);
      localStorage.removeItem(NOTARY_UPLOADED_ASSETS_KEY);
      
      setSessionId(initialSessionId);
    }
  }, []);

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
      socket.emit("joinSession", {
        roomId: sessionId,
        role: "notary",
        userId: socket.id,
        username: (() => { try { return JSON.parse(localStorage.getItem('notary.authUser') || 'null')?.username || 'Notary'; } catch { return 'Notary'; } })(),
      });

      // Listen for element updates from owner
      socket.on("elementAdded", (element) => {
        console.log("Owner added element:", element);
        setElements((prev) => [...prev, element]);
      });

      socket.on("elementUpdated", (updatedElement) => {
        setElements((prev) =>
          prev.map((el) => (el.id === updatedElement.id ? updatedElement : el))
        );
      });

      socket.on("elementRemoved", (elementId) => {
        setElements((prev) => prev.filter((el) => el.id !== elementId));
      });

      socket.on("usersConnected", (users) => {
        setConnectedUsers(users);
        // Check if owner is in the connected users
        const owner = users.find(u => u.role === 'owner');
        setOwnerConnected(!!owner);
      });

      socket.on("sessionStatus", (status) => {
        console.log("Session status:", status);
        setSessionStatus(status);
        setOwnerConnected(status.ownerConnected);
      });

      socket.on("documentUploaded", (docInfo) => {
        setDocumentInfo(docInfo);
      });

      socket.on("documentShared", (data) => {
        setPdfDataUrl(data.pdfDataUrl);
        setDocumentInfo({ fileName: data.fileName });
      });

      socket.on("ownerLeftSession", (data) => {
        console.log("Owner left session:", data.sessionId);
        if (data.sessionId === sessionId) {
          // Owner left this session, clean up and redirect
          setSessionJoined(false);
          setSessionId(null);
          setInputSessionId("");
          setElements([]);
          setPdfDataUrl(null);
          setDocumentInfo(null);
          setOwnerConnected(false);
          setConnectedUsers([]);
        }
      });

      return () => {
        socket.off("elementAdded");
        socket.off("elementUpdated");
        socket.off("elementRemoved");
        socket.off("usersConnected");
        socket.off("documentUploaded");
        socket.off("documentShared");
        socket.off("sessionStatus");
        socket.off("ownerLeftSession");
      };
    }
  }, [sessionJoined, sessionId]);

  const handleJoinSession = () => {
    const normalized = normalizeSessionId(inputSessionId);
    if (normalized) {
      // Clear uploaded assets for a fresh document session
      setUploadedAssets([]);
      setUploadedAsset(null);
      localStorage.removeItem(NOTARY_UPLOADED_ASSETS_KEY);
      
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

  const handleEndSession = () => {
    // Emit event to notify owner that session is ending
    if (sessionId) {
      socket.emit('notarySessionEnded', {
        sessionId: sessionId,
      });
    }

    setSessionJoined(false);
    setSessionId(null);
    setInputSessionId("");
    setElements([]);
    setPdfDataUrl(null);
    setDocumentInfo(null);
    setOwnerConnected(false);
    setConnectedUsers([]);

    localStorage.removeItem("notary.lastSessionId");
    const params = new URLSearchParams(window.location.search);
    params.delete("sessionId");
    params.delete("role");
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);

    navigate("/notary/doc/dashboard");
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

      setUploadedAssets((prev) => [...prev, asset]);
      setUploadedAsset(asset);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  useEffect(() => {
    saveNotaryUploadedAssets(uploadedAssets);
  }, [uploadedAssets]);

  const restoreUploadedAssets = () => {
    uploadedAssets.forEach((asset) => {
      setTimeout(() => setUploadedAsset(asset), 10);
    });
  };

  useEffect(() => {
    if (sessionJoined && uploadedAssets.length > 0) {
      restoreUploadedAssets();
    }
  }, [sessionJoined]);

  // Load notary elements from localStorage on session join
  useEffect(() => {
    if (sessionJoined && sessionId) {
      const savedElements = loadNotaryElements(sessionId);
      if (savedElements.length > 0) {
        setElements(savedElements);
      }
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
      <SidebarAssets userRole="notary" uploadedAsset={uploadedAsset} uploadedAssets={uploadedAssets} onAssetBoxClick={() => setIsAssetBoxMode(true)} />

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "15px", overflowY: "auto" }}>
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
        <ScreenRecorder />

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
              style={{ maxHeight: "70vh", border: "1px solid #ddd", borderRadius: "5px" }}
            >
              <div
                style={{
                  position: "relative",
                  width: `${EDITOR_WIDTH}px`,
                  height: `${EDITOR_HEIGHT}px`,
                  backgroundColor: "white",
                  overflow: "hidden",
                }}
              >
                <PdfViewer
                  file={pdfDataUrl}
                  fileName={documentInfo?.fileName}
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
      </div>
    </div>
  );
};

export default NotaryPage;
