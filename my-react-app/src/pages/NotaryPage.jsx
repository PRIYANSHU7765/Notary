import React, { useState, useEffect, useRef } from "react";
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
  const editorScrollRef = useRef(null);
  const fileInputRef = useRef(null);

  // Auto-fill from URL param even if not passed as prop (direct URL open)
  const urlSessionId = normalizeSessionId(new URLSearchParams(window.location.search).get("sessionId"));
  const storedSessionId = normalizeSessionId(localStorage.getItem("notary.lastSessionId"));
  const initialSessionId = normalizeSessionId(passedSessionId || urlSessionId || storedSessionId || "");
  const [inputSessionId, setInputSessionId] = useState(initialSessionId);
  const [sessionJoined, setSessionJoined] = useState(!!initialSessionId);

  // If session ID came from URL, treat it as already set
  useEffect(() => {
    if (initialSessionId && !sessionId) {
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

      return () => {
        socket.off("elementAdded");
        socket.off("elementUpdated");
        socket.off("elementRemoved");
        socket.off("usersConnected");
        socket.off("documentUploaded");
        socket.off("documentShared");
        socket.off("sessionStatus");
      };
    }
  }, [sessionJoined, sessionId]);

  const handleJoinSession = () => {
    const normalized = normalizeSessionId(inputSessionId);
    if (normalized) {
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
    setElements([...elements, element]);
    socket.emit("elementAdded", element);
  };

  const handleElementUpdate = (elementId, updates) => {
    const updatedElement = {
      ...elements.find((el) => el.id === elementId),
      ...updates,
    };
    setElements((prev) =>
      prev.map((el) => (el.id === elementId ? updatedElement : el))
    );
    socket.emit("elementUpdated", updatedElement);
  };

  const handleElementRemove = (elementId) => {
    setElements((prev) => prev.filter((el) => el.id !== elementId));
    socket.emit("elementRemoved", elementId);
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
      <SidebarAssets userRole="notary" uploadedAsset={uploadedAsset} uploadedAssets={uploadedAssets} />

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "15px", overflowY: "auto" }}>
        {/* Header */}
        <div style={{ marginBottom: "15px", backgroundColor: "#f3e5f5", padding: "15px", borderRadius: "5px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
            <h2 style={{ margin: 0 }}>✍️ Notary Dashboard</h2>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: "5px",
              padding: "4px 10px", borderRadius: "20px", fontSize: "13px", fontWeight: "bold",
              backgroundColor: isConnected ? "#e8f5e9" : "#ffebee",
              color: isConnected ? "#2e7d32" : "#c62828",
              border: `1px solid ${isConnected ? "#a5d6a7" : "#ef9a9a"}`
            }}>
              {isConnected ? "● Server connected" : "● Server offline"}
            </span>
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
