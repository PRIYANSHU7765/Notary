import React, { useState, useEffect } from "react";
import PdfViewer from "../components/PdfViewer";
import SidebarAssets from "../components/SidebarAssets";
import CanvasBoard from "../components/CanvasBoard";
import ScreenRecorder from "../components/ScreenRecorder";
import socket from "../socket/socket";

const OwnerPage = () => {
  const [uploadedFile, setUploadedFile] = useState(null);
  const [elements, setElements] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [connectedUsers, setConnectedUsers] = useState([]);

  useEffect(() => {
    // Create or join a session
    const roomId = `notary-session-${Date.now()}`;
    setSessionId(roomId);

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
    });

    return () => {
      socket.off("elementAdded");
      socket.off("elementUpdated");
      socket.off("elementRemoved");
      socket.off("usersConnected");
    };
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setUploadedFile(file);
      // Emit file info to notary
      socket.emit("documentUploaded", {
        fileName: file.name,
        fileSize: file.size,
      });
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
          <h2 style={{ margin: "0 0 10px 0" }}>📄 Owner Dashboard</h2>
          <p style={{ margin: "5px 0" }}>
            <strong>Session ID:</strong> {sessionId}
          </p>
          <p style={{ margin: "5px 0" }}>
            <strong>Connected Notaries:</strong> {connectedUsers.filter((u) => u.role === "notary").length}
          </p>
        </div>

        {/* Upload Section */}
        <div style={{ marginBottom: "15px", padding: "15px", backgroundColor: "#f5f5f5", borderRadius: "5px" }}>
          <label htmlFor="file-upload" style={{ fontWeight: "bold" }}>
            📁 Upload Document:
          </label>
          <input
            id="file-upload"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={handleFileUpload}
            style={{ marginLeft: "10px", cursor: "pointer" }}
          />
          {uploadedFile && <p style={{ margin: "5px 0 0 0", color: "green" }}>✅ {uploadedFile.name}</p>}
        </div>

        {/* Screen Recorder */}
        <ScreenRecorder />

        {/* Main Content Area */}
        <div style={{ display: "flex", gap: "15px", flex: 1 }}>
          {/* PDF/Document Viewer */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: "0 0 10px 0" }}>Document</h3>
            {uploadedFile ? (
              <PdfViewer file={uploadedFile} containerHeight="300px" />
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
                Upload a document to see preview
              </div>
            )}
          </div>

          {/* Canvas Board */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: "0 0 10px 0" }}>Signature Canvas</h3>
            <CanvasBoard
              elements={elements}
              onElementAdd={handleElementAdd}
              onElementUpdate={handleElementUpdate}
              onElementRemove={handleElementRemove}
              canvasWidth={400}
              canvasHeight={500}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default OwnerPage;
