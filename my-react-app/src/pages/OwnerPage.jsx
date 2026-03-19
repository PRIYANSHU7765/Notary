import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { pdfjs } from "react-pdf";
import { generateNotarizedPdfBytes } from "../utils/pdfUtils";
import PdfViewer from "../components/PdfViewer";
import SidebarAssets from "../components/SidebarAssets";
import CanvasBoard from "../components/CanvasBoard";
import ScreenRecorder from "../components/ScreenRecorder";
import socket from "../socket/socket";

const EDITOR_WIDTH = 900;
const EDITOR_HEIGHT = 1300;

const getOwnerElementsStorageKey = (sessionId) => `owner.elements.${sessionId}`;

const loadOwnerElements = (sessionId) => {
  if (!sessionId) return [];
  try {
    return JSON.parse(localStorage.getItem(getOwnerElementsStorageKey(sessionId)) || "[]");
  } catch {
    return [];
  }
};

const saveOwnerElements = (sessionId, elements) => {
  if (!sessionId) return;
  localStorage.setItem(getOwnerElementsStorageKey(sessionId), JSON.stringify(elements));
};

const OwnerPage = () => {
  const navigate = useNavigate();
  const editorScrollRef = useRef(null);
  
  // Redirect to dashboard if no sessionId in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("sessionId");
    
    if (!sessionId) {
      navigate("/owner/doc/dashboard", { replace: true });
      return;
    }
  }, [navigate]);
  
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [uploadedAsset, setUploadedAsset] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [elements, setElements] = useState([]);

  const generatePdfThumbnail = async (pdfDataUrl, maxWidth = 180) => {
    try {
      const loadingTask = pdfjs.getDocument(pdfDataUrl);
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(1, maxWidth / viewport.width);
      const scaledViewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(scaledViewport.width);
      canvas.height = Math.round(scaledViewport.height);
      const context = canvas.getContext("2d");

      await page.render({ canvasContext: context, viewport: scaledViewport }).promise;
      return canvas.toDataURL("image/png");
    } catch (error) {
      console.warn("[OwnerPage] Failed to generate PDF thumbnail:", error);
      return null;
    }
  };
  const [sessionId, setSessionId] = useState(null);
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [notaryConnected, setNotaryConnected] = useState(false);
  const [sessionStatus, setSessionStatus] = useState(null);

  const authUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('notary.authUser') || 'null') || {};
    } catch {
      return {};
    }
  })();

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
    // Reuse existing session on refresh when possible.
    const params = new URLSearchParams(window.location.search);
    const roomIdFromUrl = params.get("sessionId");
    const roomIdFromStorage = localStorage.getItem("notary.ownerSessionId");
    const roomId = roomIdFromUrl || roomIdFromStorage || `notary-session-${Date.now()}`;

    setSessionId(roomId);
    localStorage.setItem("notary.ownerSessionId", roomId);
    localStorage.setItem("notary.lastSessionId", roomId);

    params.set("role", "owner");
    params.set("sessionId", roomId);
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);

    const authUser = (() => {
      try {
        return JSON.parse(localStorage.getItem('notary.authUser') || 'null') || {};
      } catch {
        return {};
      }
    })();

    console.log('📡 [OWNER] Joining session:', {roomId, role: 'owner', userId: authUser.userId});
    socket.emit("joinSession", {
      roomId,
      role: "owner",
      userId: authUser.userId || socket.id,
      username: authUser.username || "Owner",
    });

    // Listen for element updates from notary
    socket.on("elementAdded", (element) => {
      console.log("✏️ [OWNER] Notary added element:", element);
      setElements((prev) => [...prev, element]);
    });

    socket.on("elementUpdated", (updatedElement) => {
      console.log("🔄 [OWNER] Notary updated element:", updatedElement.id);
      setElements((prev) =>
        prev.map((el) => (el.id === updatedElement.id ? updatedElement : el))
      );
    });

    socket.on("elementRemoved", (elementId) => {
      console.log("🗑️ [OWNER] Notary removed element:", elementId);
      setElements((prev) => prev.filter((el) => el.id !== elementId));
    });

    socket.on("usersConnected", (users) => {
      console.log("👥 [OWNER] Users connected:", users);
      setConnectedUsers(users);
      // Check if notary is in the connected users
      const notary = users.find(u => u.role === 'notary');
      setNotaryConnected(!!notary);
    });

    socket.on("sessionStatus", (status) => {
      console.log("📊 [OWNER] Session status:", status);
      setSessionStatus(status);
      setNotaryConnected(status.notaryConnected);
    });

    socket.on("documentShared", (data) => {
      console.log("📄 [OWNER] Document shared by notary:", data.fileName);
      setUploadedFile(data.pdfDataUrl);
      setUploadedFileName(data.fileName || "document.pdf");
    });

    socket.on("adminSessionTerminated", (data) => {
      if (!data?.sessionId || data.sessionId !== roomId) return;
      alert(data?.message || "Admin terminated this session.");
      navigate("/owner/doc/dashboard", { replace: true });
    });

    return () => {
      socket.off("elementAdded");
      socket.off("elementUpdated");
      socket.off("elementRemoved");
      socket.off("usersConnected");
      socket.off("documentShared");
      socket.off("sessionStatus");
      socket.off("adminSessionTerminated");
    };
  }, []);

  // Load owner elements from localStorage when sessionId is available
  useEffect(() => {
    if (sessionId) {
      const savedElements = loadOwnerElements(sessionId);
      setElements(savedElements);
    }
  }, [sessionId]);

  // Cleanup: Notify when owner leaves the session
  useEffect(() => {
    return () => {
      if (sessionId) {
        socket.emit("ownerLeftSession", { sessionId });
        localStorage.removeItem("notary.ownerSessionId");
      }
    };
  }, [sessionId]);

  const handleCopyNotaryLink = () => {
    if (!sessionId) return;
    const url = `${window.location.origin}/notary?role=notary&sessionId=${sessionId}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    });
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setUploadedFile(null);
      setUploadError("Only PDF files are supported.");
      return;
    }

    setUploadError("");
    setDownloadError("");
    setElements([]);
    setUploadedFile(file);
    setUploadedFileName(file.name);
    // Emit metadata
    socket.emit("documentUploaded", { fileName: file.name, fileSize: file.size });

    // Emit full PDF data URL so the notary can view the document in their browser
    const reader = new FileReader();
    reader.onload = async () => {
      const pdfDataUrl = reader.result;
      const payload = { pdfDataUrl, fileName: file.name };
      setUploadedFile(pdfDataUrl);
      setUploadedFileName(file.name);

      // Generate a thumbnail PNG from the first page of the PDF so it can be used as an image asset
      const thumbnail = await generatePdfThumbnail(pdfDataUrl);
      const assetImage = thumbnail ||
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect x='8' y='8' width='48' height='48' rx='6' ry='6' fill='%23f44336'/%3E%3Cpath d='M22 18h20v4H22z' fill='%23fff'/%3E%3Cpath d='M22 28h20v4H22z' fill='%23fff'/%3E%3Cpath d='M22 38h20v4H22z' fill='%23fff'/%3E%3Cpath d='M22 48h12v4H22z' fill='%23fff'/%3E%3C/svg%3E";

      setUploadedAsset({
        id: `uploaded-doc-${Date.now()}`,
        name: file.name,
        type: "image",
        image: assetImage,
        user: "owner",
      });

      socket.emit("documentShared", payload);
    };
    reader.readAsDataURL(file);
  };

  const toPngArrayBuffer = async (imageDataUrl) => {
    const image = await new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load dropped asset image."));
      img.src = imageDataUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || 200;
    canvas.height = image.naturalHeight || 100;

    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (!result) {
          reject(new Error("Failed to convert dropped asset to PNG."));
          return;
        }
        resolve(result);
      }, "image/png");
    });

    return blob.arrayBuffer();
  };

  const handleDownloadNewFile = async () => {
    if (!uploadedFile || elements.length === 0) return;

    try {
      setIsDownloading(true);
      setDownloadError("");

      const pdfBytes = await generateNotarizedPdfBytes(uploadedFile, elements, {
        editorWidth: EDITOR_WIDTH,
        editorHeight: EDITOR_HEIGHT,
      });

      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);

      const resolvedName =
        uploadedFileName ||
        (typeof uploadedFile !== "string" ? uploadedFile.name : "document.pdf");
      const sourceName = resolvedName.toLowerCase().endsWith(".pdf")
        ? resolvedName.slice(0, -4)
        : resolvedName;

      const link = document.createElement("a");
      link.href = url;
      link.download = `${sourceName}-with-signatures.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to generate updated PDF:", error);
      setDownloadError(error?.message || "Failed to create updated PDF.");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleElementAdd = (element) => {
    const newElements = [...elements, element];
    setElements(newElements);
    saveOwnerElements(sessionId, newElements);
    socket.emit("elementAdded", element);
  };

  const handleElementUpdate = (elementId, updates) => {
    const updatedElement = {
      ...elements.find((el) => el.id === elementId),
      ...updates,
    };
    const newElements = elements.map((el) => (el.id === elementId ? updatedElement : el));
    setElements(newElements);
    saveOwnerElements(sessionId, newElements);
    socket.emit("elementUpdated", updatedElement);
  };

  const handleElementRemove = (elementId) => {
    const newElements = elements.filter((el) => el.id !== elementId);
    setElements(newElements);
    saveOwnerElements(sessionId, newElements);
    socket.emit("elementRemoved", elementId);
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Sidebar */}
      <SidebarAssets
        userRole="owner"
        sessionId={sessionId}
        userId={authUser.userId}
        showAssets={true}
        uploadedAsset={uploadedAsset}
      />

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "15px", overflowY: "auto" }}>
        {/* Header */}
        <div style={{ marginBottom: "15px", backgroundColor: "#e3f2fd", padding: "15px", borderRadius: "5px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
            <h2 style={{ margin: 0 }}>📄 Owner Dashboard</h2>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: "5px",
              padding: "4px 10px", borderRadius: "20px", fontSize: "13px", fontWeight: "bold",
              backgroundColor: isConnected ? "#e8f5e9" : "#ffebee",
              color: isConnected ? "#2e7d32" : "#c62828",
              border: `1px solid ${isConnected ? "#a5d6a7" : "#ef9a9a"}`
            }}>
              <span style={{ fontSize: "9px" }}>{isConnected ? "●" : "●"}</span>
              {isConnected ? "Server connected" : "Server offline"}
            </span>
          </div>
          <p style={{ margin: "8px 0 5px" }}>
            <strong>Session ID:</strong>{" "}
            <code style={{ fontSize: "13px", backgroundColor: "#fff", padding: "2px 6px", borderRadius: "3px" }}>{sessionId}</code>
          </p>
          <p style={{ margin: "4px 0" }}>
            <strong>Connected Notaries:</strong> {connectedUsers.filter((u) => String(u.role || "").toLowerCase().trim() === "notary").length}
            {" | "}
            <strong>Notary Status:</strong>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: "4px",
              marginLeft: "6px",
              padding: "2px 8px", borderRadius: "12px", fontSize: "12px", fontWeight: "bold",
              backgroundColor: notaryConnected ? "#e8f5e9" : "#fff3e0",
              color: notaryConnected ? "#2e7d32" : "#e65100",
              border: `1px solid ${notaryConnected ? "#a5d6a7" : "#ffe0b2"}`
            }}>
              {notaryConnected ? "● Online" : "● Waiting..."}
            </span>
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginTop: "6px" }}>
            <button
              onClick={handleCopyNotaryLink}
              title="Copy a link that automatically opens the Notary page in this session"
              style={{
                padding: "5px 12px",
                backgroundColor: linkCopied ? "#388e3c" : "#1565c0",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: "bold",
              }}
            >
              {linkCopied ? "✅ Link copied!" : "📋 Copy Notary Link"}
            </button>
            <span style={{ fontSize: "12px", color: "#555" }}>Share this link with the notary to join this session.</span>
          </div>
        </div>

        {/* Upload Section */}
        <div style={{ marginBottom: "15px", padding: "15px", backgroundColor: "#f5f5f5", borderRadius: "5px" }}>
          <label htmlFor="file-upload" style={{ fontWeight: "bold" }}>
            📁 Upload Document:
          </label>
          <input
            id="file-upload"
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileUpload}
            style={{ marginLeft: "10px", cursor: "pointer" }}
          />
          {uploadedFile && <p style={{ margin: "5px 0 0 0", color: "green" }}>✅ {uploadedFileName || "document.pdf"}</p>}
          {uploadError && <p style={{ margin: "5px 0 0 0", color: "#d32f2f" }}>{uploadError}</p>}

          {uploadedFile && (
            <div style={{ marginTop: "10px" }}>
              <button
                onClick={handleDownloadNewFile}
                disabled={isDownloading || elements.length === 0}
                style={{
                  padding: "8px 12px",
                  backgroundColor: isDownloading || elements.length === 0 ? "#9e9e9e" : "#2e7d32",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: isDownloading || elements.length === 0 ? "not-allowed" : "pointer",
                  fontWeight: "bold",
                }}
              >
                {isDownloading ? "Preparing file..." : "Download new file"}
              </button>
              {elements.length === 0 && (
                <p style={{ margin: "6px 0 0 0", color: "#666", fontSize: "12px" }}>
                  Add at least one signature/stamp on the document to enable download.
                </p>
              )}
              {downloadError && (
                <p style={{ margin: "6px 0 0 0", color: "#d32f2f" }}>{downloadError}</p>
              )}
            </div>
          )}
        </div>

        {/* Screen Recorder */}
        <ScreenRecorder />

        {/* Main Content Area */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: "0 0 10px 0" }}>Document Editor</h3>
          {uploadedFile && (
            <div
              ref={editorScrollRef}
              style={{ maxHeight: "70vh", border: "none", borderRadius: "5px", backgroundColor: "transparent" }}
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
                  file={uploadedFile}
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
                    currentUserRole="owner"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OwnerPage;
