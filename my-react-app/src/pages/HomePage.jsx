import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const HomePage = () => {
  const navigate = useNavigate();

  // Check for valid share link params and auto-navigate if present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const role = params.get("role");
    const sid = params.get("sessionId");

    // Validate that sessionId is not malformed (doesn't contain http:// or encoded URLs)
    const isValidSessionId = (id) => {
      if (!id) return false;
      return /^notary-session-[A-Za-z0-9_-]+$/.test(id) && !id.includes("%");
    };

    // If valid URL params exist, navigate to the appropriate page
    if (role === "notary" && isValidSessionId(sid)) {
      localStorage.setItem("notary.role", "notary");
      localStorage.setItem("notary.lastSessionId", sid);
      navigate(`/notary?sessionId=${sid}`);
    } else if (role === "owner" && params.get("role")) {
      localStorage.setItem("notary.role", "owner");
      navigate("/owner");
    }
    // Otherwise, stay on role selection page
  }, [navigate]);

  const handleSelectRole = (role) => {
    localStorage.setItem("notary.role", role);

    if (role === "owner") {
      navigate("/owner");
    } else if (role === "notary") {
      const storedSessionId = localStorage.getItem("notary.lastSessionId");
      if (storedSessionId) {
        navigate(`/notary?sessionId=${storedSessionId}`);
      } else {
        navigate("/notary");
      }
    }
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        backgroundColor: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        backgroundImage: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      }}
    >
      <div
        style={{
          textAlign: "center",
          backgroundColor: "white",
          padding: "50px",
          borderRadius: "15px",
          boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
          maxWidth: "600px",
        }}
      >
        <h1 style={{ margin: "0 0 10px 0", color: "#333" }}>🔏 Digital Notarization Platform</h1>
        <p style={{ color: "#666", fontSize: "16px", marginBottom: "40px" }}>
          Real-time document signing and notarization with drag-drop signatures
        </p>

        <div style={{ display: "flex", gap: "20px", justifyContent: "center" }}>
          {/* Owner Button */}
          <button
            onClick={() => handleSelectRole("owner")}
            style={{
              padding: "20px 40px",
              fontSize: "18px",
              fontWeight: "bold",
              backgroundColor: "#4CAF50",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              transition: "all 0.3s",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "10px",
              minWidth: "200px",
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = "#45a049";
              e.target.style.transform = "scale(1.05)";
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = "#4CAF50";
              e.target.style.transform = "scale(1)";
            }}
          >
            <span style={{ fontSize: "32px" }}>📄</span>
            <span>
              I am a <strong>Document Owner</strong>
            </span>
          </button>

          {/* Notary Button */}
          <button
            onClick={() => handleSelectRole("notary")}
            style={{
              padding: "20px 40px",
              fontSize: "18px",
              fontWeight: "bold",
              backgroundColor: "#2196F3",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              transition: "all 0.3s",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "10px",
              minWidth: "200px",
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = "#0b7dda";
              e.target.style.transform = "scale(1.05)";
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = "#2196F3";
              e.target.style.transform = "scale(1)";
            }}
          >
            <span style={{ fontSize: "32px" }}>✍️</span>
            <span>
              I am a <strong>Notary</strong>
            </span>
          </button>
        </div>

        {/* Features Section */}
        <div style={{ marginTop: "50px", textAlign: "left", backgroundColor: "#f9f9f9", padding: "20px", borderRadius: "8px" }}>
          <h3 style={{ marginTop: 0 }}>✨ Features</h3>
          <ul style={{ margin: 0, paddingLeft: "20px", color: "#666" }}>
            <li>📄 Upload and view documents in real-time</li>
            <li>✍️ Draw signatures using canvas</li>
            <li>🎯 Drag & drop stamps and signatures</li>
            <li>🔄 Real-time sync between users via WebSocket</li>
            <li>🎥 Screen recording with WebRTC</li>
            <li>⏱️ Timestamp and track all actions</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
