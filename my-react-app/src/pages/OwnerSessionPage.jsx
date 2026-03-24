import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import socket from "../socket/socket";
import { fetchOwnerDocuments, payOwnerDocumentSession } from "../utils/apiClient";

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
  const [activeDocumentId, setActiveDocumentId] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("idle");
  const [paymentRequest, setPaymentRequest] = useState(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("stripe");
  const [paymentCardholderName, setPaymentCardholderName] = useState("");
  const [paymentCardNumber, setPaymentCardNumber] = useState("");
  const [paymentExpiry, setPaymentExpiry] = useState("");
  const [paymentCvc, setPaymentCvc] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [isPaying, setIsPaying] = useState(false);
  const [lastPaidAmount, setLastPaidAmount] = useState(0);
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
      userId: authUser?.userId || socket.id,
      username: authUser?.username || "Owner",
      token: authUser?.token,
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

    const onAdminSessionTerminated = (data) => {
      if (!data?.sessionId || data.sessionId !== id) return;
      alert(data?.message || "Admin terminated this session.");
      setNotaries([]);
      navigate("/owner/doc/dashboard", { replace: true });
    };

    const onDocumentPaymentRequested = (data) => {
      if (!data || data.sessionId !== id) return;
      const amount = Number(data.sessionAmount || 0);
      setActiveDocumentId(String(data.documentId || ""));
      setPaymentRequest({
        documentId: String(data.documentId || ""),
        sessionId: String(data.sessionId || id),
        amount: Number.isFinite(amount) ? amount : 0,
        notaryName: String(data.notaryName || "Notary"),
      });
      setPaymentStatus("requested");
      setPaymentError("");
      setLastPaidAmount(0);
    };

    const onOwnerPaymentCompleted = (data) => {
      if (!data || data.sessionId !== id) return;
      const amount = Number(data.amountPaid || 0);
      setPaymentStatus("paid");
      setPaymentRequest((prev) =>
        prev
          ? {
              ...prev,
              amount: Number.isFinite(amount) ? amount : prev.amount,
            }
          : prev
      );
      setLastPaidAmount(Number.isFinite(amount) ? amount : 0);
      setPaymentError("");
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("usersConnected", onUsersConnected);
    socket.on("documentShared", onDocumentShared);
    socket.on("adminSessionTerminated", onAdminSessionTerminated);
    socket.on("documentPaymentRequested", onDocumentPaymentRequested);
    socket.on("ownerPaymentCompleted", onOwnerPaymentCompleted);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("usersConnected", onUsersConnected);
      socket.off("documentShared", onDocumentShared);
      socket.off("adminSessionTerminated", onAdminSessionTerminated);
      socket.off("documentPaymentRequested", onDocumentPaymentRequested);
      socket.off("ownerPaymentCompleted", onOwnerPaymentCompleted);
    };
  }, []);

  useEffect(() => {
    if (!sessionId) return;

    let disposed = false;
    const hydratePaymentState = async () => {
      try {
        const docs = await fetchOwnerDocuments({ sessionId });
        if (disposed || !Array.isArray(docs) || docs.length === 0) return;

        const paidDoc = docs.find((doc) => String(doc.paymentStatus || "").toLowerCase() === "paid");
        if (paidDoc) {
          const amount = Number(paidDoc.sessionAmount || 0);
          setActiveDocumentId(String(paidDoc.id || ""));
          setPaymentRequest({
            documentId: String(paidDoc.id || ""),
            sessionId,
            amount: Number.isFinite(amount) ? amount : 0,
            notaryName: String(paidDoc.notaryName || "Notary"),
          });
          setPaymentStatus("paid");
          setLastPaidAmount(Number.isFinite(amount) ? amount : 0);
          return;
        }

        const pendingDoc = docs.find(
          (doc) =>
            String(doc.status || "").toLowerCase() === "payment_pending" &&
            String(doc.paymentStatus || "").toLowerCase() !== "paid"
        );
        if (pendingDoc) {
          const amount = Number(pendingDoc.sessionAmount || 0);
          setActiveDocumentId(String(pendingDoc.id || ""));
          setPaymentRequest({
            documentId: String(pendingDoc.id || ""),
            sessionId,
            amount: Number.isFinite(amount) ? amount : 0,
            notaryName: String(pendingDoc.notaryName || "Notary"),
          });
          setPaymentStatus("requested");
        }
      } catch (error) {
        console.warn("[OwnerSessionPage] Failed to hydrate payment state:", error?.message || error);
      }
    };

    hydratePaymentState();
    return () => {
      disposed = true;
    };
  }, [sessionId]);

  const handlePayNow = async () => {
    if (!paymentRequest?.documentId) {
      setPaymentError("Missing document for payment. Please refresh and try again.");
      return;
    }

    const normalizedCardNumber = paymentCardNumber.replace(/\s+/g, "").trim();
    if (!paymentCardholderName.trim()) {
      setPaymentError("Cardholder name is required.");
      return;
    }
    if (!/^\d{16}$/.test(normalizedCardNumber)) {
      setPaymentError("Card number must be 16 digits.");
      return;
    }
    if (!/^(0[1-9]|1[0-2])\/[0-9]{2}$/.test(paymentExpiry.trim())) {
      setPaymentError("Expiry must be in MM/YY format.");
      return;
    }
    if (!/^\d{3,4}$/.test(paymentCvc.trim())) {
      setPaymentError("CVC must be 3 or 4 digits.");
      return;
    }

    setPaymentError("");
    setIsPaying(true);

    try {
      const transactionId = `${selectedPaymentMethod}-${Date.now()}`;
      const methodLabel = selectedPaymentMethod === "stripe" ? "stripe" : "credit_card";
      const response = await payOwnerDocumentSession(paymentRequest.documentId, {
        transactionId,
        paymentMethod: methodLabel,
      });

      const paidAmount = Number(response?.sessionAmount || paymentRequest.amount || 0);
      setPaymentStatus("paid");
      setLastPaidAmount(Number.isFinite(paidAmount) ? paidAmount : 0);
      setPaymentCardholderName("");
      setPaymentCardNumber("");
      setPaymentExpiry("");
      setPaymentCvc("");
    } catch (error) {
      setPaymentError(error?.message || "Payment failed. Please try again.");
    } finally {
      setIsPaying(false);
    }
  };

  const paymentModalVisible = paymentStatus === "requested";
  const paymentBannerVisible = paymentStatus === "requested" || paymentStatus === "paid";

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
          {paymentBannerVisible && (
            <p style={{ margin: "4px 0 0 36px", fontSize: "13px", color: "#555" }}>
              Payment: <strong>{paymentStatus === "paid" ? "Paid" : "Requested"}</strong>
              <span style={{ marginLeft: "8px" }}>
                ${Number(paymentRequest?.amount || lastPaidAmount || 0).toFixed(2)}
              </span>
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

      {paymentModalVisible && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 140,
            padding: "20px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "520px",
              background: "#ffffff",
              borderRadius: "14px",
              boxShadow: "0 18px 45px rgba(15, 23, 42, 0.28)",
              padding: "20px",
            }}
          >
            <h3 style={{ margin: "0 0 8px", color: "#0f172a" }}>Payment Required</h3>
            <p style={{ margin: "0 0 10px", color: "#475569", fontSize: "14px" }}>
              Notary marked this document as notarized. Choose payment method and complete payment.
            </p>

            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                padding: "12px",
                marginBottom: "12px",
              }}
            >
              <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>Amount Due</p>
              <p style={{ margin: "4px 0 0", fontSize: "26px", fontWeight: 800, color: "#0f172a" }}>
                ${Number(paymentRequest?.amount || 0).toFixed(2)}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#64748b" }}>
                Session: {sessionId} {activeDocumentId ? `| Document: ${activeDocumentId}` : ""}
              </p>
            </div>

            <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
              <button
                type="button"
                onClick={() => setSelectedPaymentMethod("stripe")}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: selectedPaymentMethod === "stripe" ? "2px solid #2563eb" : "1px solid #cbd5e1",
                  background: selectedPaymentMethod === "stripe" ? "#eff6ff" : "#fff",
                  color: "#1e293b",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Pay with Stripe
              </button>
              <button
                type="button"
                onClick={() => setSelectedPaymentMethod("card")}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: selectedPaymentMethod === "card" ? "2px solid #2563eb" : "1px solid #cbd5e1",
                  background: selectedPaymentMethod === "card" ? "#eff6ff" : "#fff",
                  color: "#1e293b",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Pay with Credit/Debit Card
              </button>
            </div>

            <div style={{ display: "grid", gap: "8px", marginBottom: "12px" }}>
              <input
                type="text"
                value={paymentCardholderName}
                onChange={(e) => setPaymentCardholderName(e.target.value)}
                placeholder="Cardholder name"
                style={{
                  width: "100%",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  padding: "10px 12px",
                  fontSize: "14px",
                }}
              />
              <input
                type="text"
                value={paymentCardNumber}
                onChange={(e) => setPaymentCardNumber(e.target.value.replace(/[^\d\s]/g, "").slice(0, 19))}
                placeholder="Card number (16 digits)"
                style={{
                  width: "100%",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  padding: "10px 12px",
                  fontSize: "14px",
                }}
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <input
                  type="text"
                  value={paymentExpiry}
                  onChange={(e) => setPaymentExpiry(e.target.value.replace(/[^\d/]/g, "").slice(0, 5))}
                  placeholder="MM/YY"
                  style={{
                    width: "100%",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    fontSize: "14px",
                  }}
                />
                <input
                  type="password"
                  value={paymentCvc}
                  onChange={(e) => setPaymentCvc(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
                  placeholder="CVC"
                  style={{
                    width: "100%",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    fontSize: "14px",
                  }}
                />
              </div>
            </div>

            {paymentError && (
              <p style={{ margin: "0 0 10px", color: "#b91c1c", fontSize: "13px", fontWeight: 600 }}>
                {paymentError}
              </p>
            )}

            <button
              type="button"
              onClick={handlePayNow}
              disabled={isPaying}
              style={{
                width: "100%",
                padding: "11px 12px",
                borderRadius: "8px",
                border: "none",
                backgroundColor: isPaying ? "#94a3b8" : "#16a34a",
                color: "#fff",
                fontWeight: 700,
                cursor: isPaying ? "not-allowed" : "pointer",
                fontSize: "14px",
              }}
            >
              {isPaying
                ? "Processing Payment..."
                : `Pay with ${selectedPaymentMethod === "stripe" ? "Stripe" : "Credit/Debit Card"} - $${Number(paymentRequest?.amount || 0).toFixed(2)}`}
            </button>
          </div>
        </div>
      )}

      {paymentStatus === "paid" && (
        <div
          style={{
            position: "fixed",
            bottom: "20px",
            right: "20px",
            zIndex: 120,
            background: "#16a34a",
            color: "#fff",
            padding: "12px 16px",
            borderRadius: "10px",
            boxShadow: "0 10px 24px rgba(22, 163, 74, 0.35)",
            fontWeight: 700,
            fontSize: "13px",
          }}
        >
          Payment received. Notary can now end the session.
        </div>
      )}
    </div>
  );
};

export default OwnerSessionPage;
