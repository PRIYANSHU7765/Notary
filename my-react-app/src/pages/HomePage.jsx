import React, { useState } from "react";
import OwnerPage from "./OwnerPage";
import NotaryPage from "./NotaryPage";

const HomePage = () => {
  const [selectedRole, setSelectedRole] = useState(null);

  if (selectedRole === "owner") {
    return <OwnerPage />;
  }

  if (selectedRole === "notary") {
    return <NotaryPage />;
  }

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
            onClick={() => setSelectedRole("owner")}
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
            onClick={() => setSelectedRole("notary")}
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
