import React, { useState, useEffect } from "react";
import SidebarAssets from "../components/SidebarAssets";
import CanvasBoard from "../components/CanvasBoard";
import ScreenRecorder from "../components/ScreenRecorder";
import socket from "../socket/socket";

const NotaryPage = ({ sessionId: passedSessionId }) => {
  const [elements, setElements] = useState([]);
  const [sessionId, setSessionId] = useState(passedSessionId || null);
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [documentInfo, setDocumentInfo] = useState(null);

  const [inputSessionId, setInputSessionId] = useState("");
  const [sessionJoined, setSessionJoined] = useState(!!passedSessionId);

  useEffect(() => {
    if (sessionJoined && sessionId) {
      socket.emit("joinSession", {
        roomId: sessionId,
        role: "notary",
        userId: socket.id,
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
      });

      socket.on("documentUploaded", (docInfo) => {
        setDocumentInfo(docInfo);
      });

      return () => {
        socket.off("elementAdded");
        socket.off("elementUpdated");
        socket.off("elementRemoved");
        socket.off("usersConnected");
        socket.off("documentUploaded");
      };
    }
  }, [sessionJoined, sessionId]);

  const handleJoinSession = () => {
    if (inputSessionId.trim()) {
      setSessionId(inputSessionId);
      setSessionJoined(true);
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
            maxWidth: "400px",
          }}
        >
          <h2>🔐 Join Notarization Session</h2>
          <p style={{ color: "#666" }}>Enter the session ID provided by the document owner</p>

          <input
            type="text"
            placeholder="Enter Session ID"
            value={inputSessionId}
            onChange={(e) => setInputSessionId(e.target.value)}
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
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: "#2196F3",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "16px",
            }}
          >
            Join Session
          </button>

          <div
            style={{
              marginTop: "20px",
              padding: "15px",
              backgroundColor: "#f9f9f9",
              borderRadius: "4px",
              fontSize: "12px",
              color: "#666",
            }}
          >
            <p style={{ margin: "5px 0" }}>💡 Example Session ID:</p>
            <code>notary-session-1234567890</code>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Sidebar */}
      <SidebarAssets userRole="notary" />

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "15px", overflowY: "auto" }}>
        {/* Header */}
        <div style={{ marginBottom: "15px", backgroundColor: "#f3e5f5", padding: "15px", borderRadius: "5px" }}>
          <h2 style={{ margin: "0 0 10px 0" }}>✍️ Notary Dashboard</h2>
          <p style={{ margin: "5px 0" }}>
            <strong>Session ID:</strong> {sessionId}
          </p>
          <p style={{ margin: "5px 0" }}>
            <strong>Connected Users:</strong> {connectedUsers.length}
          </p>
          {documentInfo && (
            <p style={{ margin: "5px 0" }}>
              <strong>Document:</strong> {documentInfo.fileName}
            </p>
          )}
        </div>

        {/* Screen Recorder */}
        <ScreenRecorder />

        {/* Canvas Board (Full Width) */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: "0 0 10px 0" }}>📋 Document with Signatures</h3>
          <CanvasBoard
            elements={elements}
            onElementAdd={handleElementAdd}
            onElementUpdate={handleElementUpdate}
            onElementRemove={handleElementRemove}
            canvasWidth={900}
            canvasHeight={600}
          />
        </div>

        {/* Element List */}
        <div style={{ marginTop: "15px", padding: "10px", backgroundColor: "#f9f9f9", borderRadius: "5px", maxHeight: "150px", overflowY: "auto" }}>
          <h4 style={{ margin: "0 0 10px 0" }}>Elements on Canvas ({elements.length})</h4>
          {elements.length === 0 ? (
            <p style={{ color: "#999", margin: 0 }}>No elements yet. Drag assets from sidebar to add.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: "20px" }}>
              {elements.map((el) => (
                <li key={el.id}>
                  {el.type} by {el.user} at ({Math.round(el.x)}, {Math.round(el.y)})
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotaryPage;
