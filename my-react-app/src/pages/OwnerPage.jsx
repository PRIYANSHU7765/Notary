import React, { useState, useEffect, useRef } from "react";
import { PDFDocument } from "pdf-lib";
import PdfViewer from "../components/PdfViewer";
import SidebarAssets from "../components/SidebarAssets";
import CanvasBoard from "../components/CanvasBoard";
import ScreenRecorder from "../components/ScreenRecorder";
import socket from "../socket/socket";

const EDITOR_WIDTH = 900;
const EDITOR_HEIGHT = 1300;

const OwnerPage = () => {
  const editorScrollRef = useRef(null);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [elements, setElements] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [notaryConnected, setNotaryConnected] = useState(false);
  const [sessionStatus, setSessionStatus] = useState(null);

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
    localStorage.setItem("notary.role", "owner");
    localStorage.setItem("notary.ownerSessionId", roomId);
    localStorage.setItem("notary.lastSessionId", roomId);

    params.set("role", "owner");
    params.set("sessionId", roomId);
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);

    socket.emit("joinSession", {
      roomId,
      role: "owner",
      userId: socket.id,
    });

    // Listen for element updates from notary
    socket.on("elementAdded", (element) => {
      console.log("Notary added element:", element);
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
      // Check if notary is in the connected users
      const notary = users.find(u => u.role === 'notary');
      setNotaryConnected(!!notary);
    });

    socket.on("sessionStatus", (status) => {
      console.log("Session status:", status);
      setSessionStatus(status);
      setNotaryConnected(status.notaryConnected);
    });

    socket.on("documentShared", (data) => {
      setUploadedFile(data.pdfDataUrl);
      setUploadedFileName(data.fileName || "document.pdf");
    });

    return () => {
      socket.off("elementAdded");
      socket.off("elementUpdated");
      socket.off("elementRemoved");
      socket.off("usersConnected");
      socket.off("documentShared");
      socket.off("sessionStatus");
    };
  }, []);

  const handleCopyNotaryLink = () => {
    if (!sessionId) return;
    const url = `${window.location.origin}${window.location.pathname}?role=notary&sessionId=${sessionId}`;
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
    reader.onload = () => {
      const payload = { pdfDataUrl: reader.result, fileName: file.name };
      setUploadedFile(reader.result);
      setUploadedFileName(file.name);
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

      const inputBytes =
        typeof uploadedFile === "string"
          ? await fetch(uploadedFile).then((response) => response.arrayBuffer())
          : await uploadedFile.arrayBuffer();
      const pdfDoc = await PDFDocument.load(inputBytes);
      const [firstPage] = pdfDoc.getPages();

      if (!firstPage) {
        throw new Error("The uploaded PDF has no pages.");
      }

      const { width: pdfWidth, height: pdfHeight } = firstPage.getSize();

      for (const element of elements) {
        if (!element.image) continue;

        const pngBytes = await toPngArrayBuffer(element.image);
        const embeddedImage = await pdfDoc.embedPng(pngBytes);

        const drawWidth = ((element.width || 100) / EDITOR_WIDTH) * pdfWidth;
        const drawHeight = ((element.height || 100) / EDITOR_HEIGHT) * pdfHeight;
        const drawX = (element.x / EDITOR_WIDTH) * pdfWidth;
        const drawY = pdfHeight - (((element.y || 0) + (element.height || 100)) / EDITOR_HEIGHT) * pdfHeight;

        firstPage.drawImage(embeddedImage, {
          x: drawX,
          y: drawY,
          width: drawWidth,
          height: drawHeight,
        });
      }

      const outputBytes = await pdfDoc.save();
      const outputBlob = new Blob([outputBytes], { type: "application/pdf" });
      const outputUrl = URL.createObjectURL(outputBlob);

      const resolvedName =
        uploadedFileName ||
        (typeof uploadedFile !== "string" ? uploadedFile.name : "document.pdf");
      const sourceName = resolvedName.toLowerCase().endsWith(".pdf")
        ? resolvedName.slice(0, -4)
        : resolvedName;

      const link = document.createElement("a");
      link.href = outputUrl;
      link.download = `${sourceName}-with-signatures.pdf`;
      link.click();

      URL.revokeObjectURL(outputUrl);
    } catch (error) {
      console.error("Failed to generate updated PDF:", error);
      setDownloadError(error?.message || "Failed to create updated PDF.");
    } finally {
      setIsDownloading(false);
    }
  };

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

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Sidebar */}
      <SidebarAssets userRole="owner" />

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
          {uploadedFile ? (
            <div
              ref={editorScrollRef}
              style={{ overflowY: "auto", overflowX: "auto", maxHeight: "70vh", border: "1px solid #ddd", borderRadius: "5px" }}
            >
              <div
                style={{
                  position: "relative",
                  width: `${EDITOR_WIDTH}px`,
                  height: `${EDITOR_HEIGHT}px`,
                  backgroundColor: "white",
                }}
              >
                <PdfViewer
                  file={uploadedFile}
                  containerHeight={`${EDITOR_HEIGHT}px`}
                  showControls={false}
                  pageWidth={EDITOR_WIDTH}
                  noInternalScroll
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
                padding: "20px",
                textAlign: "center",
                color: "#999",
                borderRadius: "5px",
              }}
            >
              Upload a document to start placing signatures and stamps
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OwnerPage;
