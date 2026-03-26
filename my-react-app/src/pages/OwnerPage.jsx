import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { pdfjs } from "react-pdf";
import { generateNotarizedPdfBytes } from "../utils/pdfUtils";
import PdfViewer from "../components/PdfViewer";
import SidebarAssets from "../components/SidebarAssets";
import CanvasBoard from "../components/CanvasBoard";
import ScreenRecorder from "../components/ScreenRecorder";
import socket from "../socket/socket";
import { fetchOwnerDocuments, payOwnerDocumentSession } from "../utils/apiClient";

const EDITOR_WIDTH = 900;
const EDITOR_HEIGHT = 1300;

const getOwnerElementsStorageKey = (sessionId) => `signer.elements.${sessionId}`;

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
  const pdfScrollRef = useRef(null);
  
  // Redirect to dashboard if no sessionId in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("sessionId");
    
    if (!sessionId) {
      navigate("/signer/doc/dashboard", { replace: true });
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
  const [activeDocumentId, setActiveDocumentId] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("idle");
  const [paymentRequest, setPaymentRequest] = useState(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("stripe");
  const [paymentCardholderName, setPaymentCardholderName] = useState("");
  const [paymentCardNumber, setPaymentCardNumber] = useState("");
  const [paymentExpiry, setPaymentExpiry] = useState("");
  const [paymentCvc, setPaymentCvc] = useState("");
  const [isPaying, setIsPaying] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [lastPaidAmount, setLastPaidAmount] = useState(0);
  const hasJoinedSessionRef = useRef(false);
  const sessionIdRef = useRef(null);

  const authUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('notary.authUser') || 'null') || {};
    } catch {
      return {};
    }
  })();

  // Keep sessionId ref in sync with state
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Track backend connection status
  useEffect(() => {
    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    
    const onAuthError = (data) => {
      console.error('❌ [SIGNER] Auth error:', data?.message);
      alert(`Authentication error: ${data?.message || 'Please login again'}`);
      navigate("/auth", { replace: true });
    };
    
    const onSessionTerminated = (data) => {
      console.warn('⚠️ [SIGNER] Session terminated:', data?.message);
      alert(data?.message || 'This session has been terminated.');
      navigate("/signer/doc/dashboard", { replace: true });
    };
    
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("authError", onAuthError);
    socket.on("sessionTerminated", onSessionTerminated);
    
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("authError", onAuthError);
      socket.off("sessionTerminated", onSessionTerminated);
    };
  }, [navigate]);

  // Initialize session ID from URL or storage once on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomIdFromUrl = params.get("sessionId");
    const roomIdFromStorage = localStorage.getItem("notary.signerSessionId");
    const resolvedRoomId = roomIdFromUrl || roomIdFromStorage;

    if (resolvedRoomId) {
      setSessionId(resolvedRoomId);
      localStorage.setItem("notary.signerSessionId", resolvedRoomId);
      localStorage.setItem("notary.lastSessionId", resolvedRoomId);
    }
  }, []);

  // Main socket setup: register listeners and join session
  useEffect(() => {
    if (!sessionId) {
      console.log('📡 [SIGNER] No sessionId, waiting for proper session');
      return;
    }

    if (hasJoinedSessionRef.current) {
      console.log('📡 [SIGNER] Already joined, skipping duplicate join');
      return;
    }

    console.log('📡 [SIGNER] Setting up socket listeners for session:', sessionId);
    const params = new URLSearchParams(window.location.search);
    params.set("role", "signer");
    params.set("sessionId", sessionId);
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);

    hasJoinedSessionRef.current = true;
    console.log('📡 [SIGNER] Joining session:', { roomId: sessionId, role: 'signer', userId: authUser.userId });
    socket.emit("joinSession", {
      roomId: sessionId,
      role: "signer",
      userId: authUser.userId || socket.id,
      username: authUser.username || "Signer",
      token: authUser.token,
    });

    // Register all socket listeners - these will be attached once per session
    const onElementAdded = (element) => {
      console.log("✏️ [SIGNER] Notary added element:", element);
      setElements((prev) => [...prev, element]);
    };

    const onElementUpdated = (updatedElement) => {
      console.log("🔄 [SIGNER] Notary updated element:", updatedElement.id);
      setElements((prev) =>
        prev.map((el) => (el.id === updatedElement.id ? updatedElement : el))
      );
    };

    const onElementRemoved = (elementId) => {
      console.log("🗑️ [SIGNER] Notary removed element:", elementId);
      setElements((prev) => prev.filter((el) => el.id !== elementId));
    };

    const onUsersConnected = (users) => {
      console.log("👥 [SIGNER] Users connected:", users);
      setConnectedUsers(users);
      const notary = users.find(u => u.role === 'notary');
      setNotaryConnected(!!notary);
    };

    const onSessionStatus = (status) => {
      console.log("📊 [SIGNER] Session status:", status);
      setSessionStatus(status);
      setNotaryConnected(status.notaryConnected);
    };

    const onDocumentShared = (data) => {
      console.log("📄 [SIGNER] Document shared by notary:", data.fileName);
      setUploadedFile(data.pdfDataUrl);
      setUploadedFileName(data.fileName || "document.pdf");
    };

    const onDocumentScrolled = (data) => {
      console.log('[SIGNER SCROLL] Received documentScrolled event:', JSON.stringify(data));
      const scrollTarget = editorScrollRef.current || pdfScrollRef.current;
      if (!scrollTarget) {
        console.warn('[SIGNER SCROLL] ❌ No scroll target found');
        return;
      }
      console.log('[SIGNER SCROLL] ✅ Found scroll target, applying scroll');
      
      if (data?.scrollRatio === undefined && data?.scrollPosition === undefined) {
        console.warn('[SIGNER SCROLL] No scroll metrics in data');
        return;
      }

      const maxScrollable = Math.max(scrollTarget.scrollHeight - scrollTarget.clientHeight, 0);
      const nextScrollTop = data?.scrollRatio !== undefined
        ? maxScrollable * Number(data.scrollRatio)
        : Number(data.scrollPosition);
      const finalScrollTop = Number.isFinite(nextScrollTop) ? nextScrollTop : 0;
      scrollTarget.scrollTop = finalScrollTop;
    };

    const onAdminSessionTerminated = (data) => {
      if (!data?.sessionId || data.sessionId !== sessionIdRef.current) return;
      alert(data?.message || "Admin terminated this session.");
      navigate("/signer/doc/dashboard", { replace: true });
    };

    const onDocumentPaymentRequested = (data) => {
      if (!data || data.sessionId !== sessionIdRef.current) return;
      const amount = Number(data.sessionAmount || 0);
      setActiveDocumentId(String(data.documentId || ""));
      setPaymentRequest({
        documentId: String(data.documentId || ""),
        sessionId: String(data.sessionId || sessionIdRef.current),
        amount: Number.isFinite(amount) ? amount : 0,
        notaryName: String(data.notaryName || "Notary"),
      });
      setPaymentStatus("requested");
      setPaymentError("");
      setLastPaidAmount(0);
    };

    const onOwnerPaymentCompleted = (data) => {
      if (!data || data.sessionId !== sessionIdRef.current) return;
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

    // Attach all listeners
    socket.on("elementAdded", onElementAdded);
    socket.on("elementUpdated", onElementUpdated);
    socket.on("elementRemoved", onElementRemoved);
    socket.on("usersConnected", onUsersConnected);
    socket.on("sessionStatus", onSessionStatus);
    socket.on("documentShared", onDocumentShared);
    socket.on("documentScrolled", onDocumentScrolled);
    socket.on("adminSessionTerminated", onAdminSessionTerminated);
    socket.on("documentPaymentRequested", onDocumentPaymentRequested);
    socket.on("ownerPaymentCompleted", onOwnerPaymentCompleted);

    return () => {
      socket.off("elementAdded", onElementAdded);
      socket.off("elementUpdated", onElementUpdated);
      socket.off("elementRemoved", onElementRemoved);
      socket.off("usersConnected", onUsersConnected);
      socket.off("sessionStatus", onSessionStatus);
      socket.off("documentShared", onDocumentShared);
      socket.off("documentScrolled", onDocumentScrolled);
      socket.off("adminSessionTerminated", onAdminSessionTerminated);
      socket.off("documentPaymentRequested", onDocumentPaymentRequested);
      socket.off("ownerPaymentCompleted", onOwnerPaymentCompleted);
    };
  }, [sessionId, navigate]);

  // Load signer elements from localStorage when sessionId is available
  useEffect(() => {
    if (sessionId) {
      const savedElements = loadOwnerElements(sessionId);
      setElements(savedElements);
    } else {
      // Reset join flag when leaving session
      hasJoinedSessionRef.current = false;
    }
  }, [sessionId]);

  // Cleanup: Notify when signer leaves the session
  useEffect(() => {
    return () => {
      if (sessionIdRef.current) {
        socket.emit("ownerLeftSession", { sessionId: sessionIdRef.current });
        localStorage.removeItem("notary.signerSessionId");
        hasJoinedSessionRef.current = false;
      }
    };
  }, []);

  // Handle socket reconnection: automatically rejoin the session room
  useEffect(() => {
    if (!sessionId) return;

    const handleReconnect = () => {
      console.log('📡 [SIGNER] Socket reconnected, checking session status:', sessionIdRef.current);
      
      // If we were supposed to be in a session, rejoin
      if (sessionIdRef.current && !hasJoinedSessionRef.current) {
        hasJoinedSessionRef.current = true;
        console.log('📡 [SIGNER] Auto-rejoining session after reconnect:', sessionIdRef.current);
        socket.emit("joinSession", {
          roomId: sessionIdRef.current,
          role: "signer",
          userId: authUser.userId || socket.id,
          username: authUser.username || "Signer",
          token: authUser.token,
        });
      }
    };

    socket.on('connect', handleReconnect);

    return () => {
      socket.off('connect', handleReconnect);
    };
  }, [sessionId]);

  // Hydrate payment request state from server on session join
  useEffect(() => {
    if (!sessionId) return;

    let disposed = false;
    const hydratePaymentRequest = async () => {
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
        console.warn("[OwnerPage] Failed to hydrate payment request:", error?.message || error);
      }
    };

    hydratePaymentRequest();
    return () => {
      disposed = true;
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
        user: "signer",
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
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Sidebar */}
      <SidebarAssets
        userRole="signer"
        sessionId={sessionId}
        userId={authUser.userId}
        showAssets={true}
        uploadedAsset={uploadedAsset}
        sourcePdfDataUrl={typeof uploadedFile === "string" ? uploadedFile : ""}
        allowSignatureExtraction
      />

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "15px", overflowY: "auto" }}>
        {/* Header */}
        <div style={{ marginBottom: "15px", backgroundColor: "#e3f2fd", padding: "15px", borderRadius: "5px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
            <h2 style={{ margin: 0 }}>📄 Signer Dashboard</h2>
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
          {paymentBannerVisible && (
            <p style={{ margin: "4px 0" }}>
              <strong>Payment:</strong>{" "}
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  marginLeft: "6px",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  fontSize: "12px",
                  fontWeight: "bold",
                  backgroundColor: paymentStatus === "paid" ? "#e8f5e9" : "#fff3e0",
                  color: paymentStatus === "paid" ? "#2e7d32" : "#e65100",
                  border: paymentStatus === "paid" ? "1px solid #a5d6a7" : "1px solid #ffe0b2",
                }}
              >
                {paymentStatus === "paid" ? "● Paid" : "● Payment requested"}
              </span>
              <span style={{ marginLeft: "8px", color: "#334155", fontWeight: 600 }}>
                ${Number(paymentRequest?.amount || lastPaidAmount || 0).toFixed(2)}
              </span>
            </p>
          )}
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

        <ScreenRecorder role="signer" sessionId={sessionId || ""} socket={socket} />

        {/* Main Content Area */}
        <div style={{ flex: 1, minWidth: 0, backgroundColor: "#f2f2f2", padding: "12px" }}>
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
                  backgroundColor: "#f2f2f2",
                  overflow: "hidden",
                }}
              >
                <PdfViewer
                  file={uploadedFile}
                  scrollContainerRef={pdfScrollRef}
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
                    currentUserRole="signer"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
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
              Notary marked this document as notarized. Complete payment to let the notary end the session.
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

export default OwnerPage;
