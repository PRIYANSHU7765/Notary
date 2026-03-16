import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import socket from "../socket/socket";

const getAuthUser = () => {
  try {
    return JSON.parse(localStorage.getItem("notary.authUser") || "null");
  } catch {
    return null;
  }
};

const OwnerSessionPage = () => {
  const [notaries, setNotaries] = useState([]);
  const [sessionId, setSessionId] = useState("");
  const [sessionDoc, setSessionDoc] = useState("");
  const [isConnected, setIsConnected] = useState(socket.connected);
  const navigate = useNavigate();

  useEffect(() => {
    const id = localStorage.getItem("notary.ownerSessionId") || "";
    setSessionId(id);

    if (!id) return;

    const authUser = getAuthUser();

    // Re-join the owner session to get live usersConnected updates
    socket.emit("joinSession", {
      roomId: id,
      role: "owner",
      userId: socket.id,
      username: authUser?.username || "Owner",
    });

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    const onUsersConnected = (users) => {
      const notaryUsers = users.filter((u) => u.role === "notary");
      setNotaries(notaryUsers);
    };

    const onDocumentShared = (data) => {
      setSessionDoc(data.fileName || "");
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("usersConnected", onUsersConnected);
    socket.on("documentShared", onDocumentShared);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("usersConnected", onUsersConnected);
      socket.off("documentShared", onDocumentShared);
    };
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#f7f8fc", fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
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
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              onClick={() => navigate("/owner/doc/dashboard")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "20px",
                color: "#4f6ef7",
                padding: "0 4px",
                lineHeight: 1,
              }}
              title="Back to Dashboard"
            >
              ←
            </button>
            <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 700, color: "#1a1a2e" }}>
              Active Sessions
            </h1>
          </div>
          {sessionId && (
            <p style={{ margin: "4px 0 0 36px", fontSize: "13px", color: "#888" }}>
              Session ID: <span style={{ fontWeight: 600, color: "#555" }}>{sessionId}</span>
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

      {/* Content */}
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
              No active sessions
            </p>
            <p style={{ fontSize: "14px", margin: 0 }}>
              No notary users are currently connected to your session.
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
            {/* Header row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 140px",
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
            </div>

            {/* Rows */}
            {notaries.map((n, idx) => (
              <div
                key={n.socketId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 140px",
                  padding: "16px 24px",
                  alignItems: "center",
                  borderBottom: idx < notaries.length - 1 ? "1px solid #f0f0f0" : "none",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#fafafa")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {/* Notary name */}
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
                    {(n.username || "N")[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "14px", color: "#1a1a2e" }}>
                      {n.username || n.userId}
                    </div>
                    <div style={{ fontSize: "11px", color: "#aaa", marginTop: "2px" }}>Notary</div>
                  </div>
                </div>

                {/* Document */}
                <div style={{ fontSize: "13px", color: "#555" }}>
                  {sessionDoc ? (
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
                        {sessionDoc}
                      </span>
                    </span>
                  ) : (
                    <span style={{ color: "#bbb", fontStyle: "italic" }}>No document shared yet</span>
                  )}
                </div>

                {/* Status */}
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default OwnerSessionPage;
