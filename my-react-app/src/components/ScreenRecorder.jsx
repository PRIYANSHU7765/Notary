import React, { useEffect, useRef, useState } from "react";

const ScreenRecorder = ({ role = null, sessionId = "", socket = null }) => {
  const isNotaryRole = role === "notary";
  const isOwnerRole = role === "owner";
  const canRecord = isNotaryRole;
  const canHostLiveMeeting = isNotaryRole || isOwnerRole;

  const [isRecording, setIsRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const [isLiveMeeting, setIsLiveMeeting] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [liveMeetingError, setLiveMeetingError] = useState("");
  const [cameraBoxPosition, setCameraBoxPosition] = useState({ x: 24, y: 120 });
  const [isRemoteLiveAvailable, setIsRemoteLiveAvailable] = useState(false);
  const [isOwnerJoinedLiveMeeting, setIsOwnerJoinedLiveMeeting] = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const peerConnectionsRef = useRef(new Map());
  const ownerPeerConnectionRef = useRef(null);
  const pendingIceCandidatesRef = useRef([]);

  const liveScreenStreamRef = useRef(null);
  const liveCameraStreamRef = useRef(null);
  const remoteScreenStreamRef = useRef(null);
  const remoteCameraStreamRef = useRef(null);

  const liveScreenVideoRef = useRef(null);
  const liveCameraVideoRef = useRef(null);
  const remoteScreenVideoRef = useRef(null);
  const remoteCameraVideoRef = useRef(null);

  const cameraBoxRef = useRef(null);
  const isDraggingCameraRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const ownerReceivedTrackCountRef = useRef(0);

  const isScreenLikeLabel = (label = "") => {
    const normalized = String(label).toLowerCase();
    return normalized.includes("screen") || normalized.includes("window") || normalized.includes("display") || normalized.includes("monitor");
  };

  const closeNotaryViewerPeer = (viewerSocketId) => {
    const pc = peerConnectionsRef.current.get(viewerSocketId);
    if (!pc) return;
    try {
      pc.close();
    } catch {
      // Ignore close errors.
    }
    peerConnectionsRef.current.delete(viewerSocketId);
  };

  const closeAllNotaryViewerPeers = () => {
    peerConnectionsRef.current.forEach((pc, viewerSocketId) => {
      try {
        pc.close();
      } catch {
        // Ignore close errors.
      }
      peerConnectionsRef.current.delete(viewerSocketId);
    });
  };

  const screenShareStreamRef = useRef(null);

  const startScreenShare = async () => {
    if (!canHostLiveMeeting || isScreenSharing) return;

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      screenShareStreamRef.current = screenStream;
      setIsScreenSharing(true);

      screenStream.getTracks().forEach((track) => {
        track.onended = () => {
          stopScreenShare();
        };
      });
    } catch (error) {
      console.error("Error starting screen share:", error);
      setLiveMeetingError("Failed to start screen share. Please allow screen permissions.");
    }
  };

  const stopScreenShare = () => {
    const screenStream = screenShareStreamRef.current;
    if (!screenStream) return;

    screenStream.getTracks().forEach((track) => track.stop());
    screenShareStreamRef.current = null;
    setIsScreenSharing(false);
  };

  const stopOwnerLiveMeetingView = ({ clearError = true } = {}) => {
    if (ownerPeerConnectionRef.current) {
      try {
        ownerPeerConnectionRef.current.close();
      } catch {
        // Ignore close errors.
      }
      ownerPeerConnectionRef.current = null;
    }

    pendingIceCandidatesRef.current = [];
    ownerReceivedTrackCountRef.current = 0;

    if (remoteScreenStreamRef.current) {
      remoteScreenStreamRef.current.getTracks().forEach((track) => track.stop());
      remoteScreenStreamRef.current = null;
    }

    if (remoteCameraStreamRef.current) {
      remoteCameraStreamRef.current.getTracks().forEach((track) => track.stop());
      remoteCameraStreamRef.current = null;
    }

    if (remoteScreenVideoRef.current) {
      remoteScreenVideoRef.current.srcObject = null;
    }

    if (remoteCameraVideoRef.current) {
      remoteCameraVideoRef.current.srcObject = null;
    }

    setIsOwnerJoinedLiveMeeting(false);
    if (clearError) {
      setLiveMeetingError("");
    }
  };

  const setupOwnerPeerConnection = () => {
    if (ownerPeerConnectionRef.current) {
      return ownerPeerConnectionRef.current;
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    pc.onicecandidate = (event) => {
      if (!event.candidate || !socket || !sessionId) return;
      socket.emit("liveMeetingIceCandidate", {
        sessionId,
        targetSocketId: null,
        candidate: event.candidate,
      });
    };

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (!remoteStream) return;

      const track = event.track;
      const firstTrack = ownerReceivedTrackCountRef.current === 0;
      const shouldTreatAsScreen = isScreenLikeLabel(track?.label) || firstTrack;
      ownerReceivedTrackCountRef.current += 1;

      const dedicatedStream = new MediaStream([track]);
      if (shouldTreatAsScreen) {
        remoteScreenStreamRef.current = dedicatedStream;
        if (remoteScreenVideoRef.current) {
          remoteScreenVideoRef.current.srcObject = dedicatedStream;
        }
      } else {
        remoteCameraStreamRef.current = dedicatedStream;
        if (remoteCameraVideoRef.current) {
          remoteCameraVideoRef.current.srcObject = dedicatedStream;
        }
      }
    };

    ownerPeerConnectionRef.current = pc;
    return pc;
  };

  const handleNotaryViewerJoin = async (data) => {
    const viewerSocketId = data?.viewerSocketId;
    const targetSessionId = data?.sessionId;
    if (!isNotaryRole || !isLiveMeeting || !viewerSocketId || targetSessionId !== sessionId) {
      return;
    }

    closeNotaryViewerPeer(viewerSocketId);

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    peerConnectionsRef.current.set(viewerSocketId, pc);

    pc.onicecandidate = (event) => {
      if (!event.candidate || !socket || !sessionId) return;
      socket.emit("liveMeetingIceCandidate", {
        sessionId,
        targetSocketId: viewerSocketId,
        candidate: event.candidate,
      });
    };

    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        closeNotaryViewerPeer(viewerSocketId);
      }
    };

    const screenVideoTrack = liveScreenStreamRef.current?.getVideoTracks?.()[0];
    const cameraVideoTrack = liveCameraStreamRef.current?.getVideoTracks?.()[0];
    const cameraAudioTrack = liveCameraStreamRef.current?.getAudioTracks?.()[0];

    if (screenVideoTrack) {
      pc.addTrack(screenVideoTrack, liveScreenStreamRef.current);
    }
    if (cameraVideoTrack) {
      pc.addTrack(cameraVideoTrack, liveCameraStreamRef.current);
    }
    if (cameraAudioTrack) {
      pc.addTrack(cameraAudioTrack, liveCameraStreamRef.current);
    }

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit("liveMeetingOffer", {
        sessionId,
        targetSocketId: viewerSocketId,
        offer,
      });
    } catch (error) {
      console.error("Failed to create live meeting offer:", error);
      closeNotaryViewerPeer(viewerSocketId);
    }
  };

  const stopLiveMeeting = ({ clearError = true } = {}) => {
    closeAllNotaryViewerPeers();

    if (liveScreenStreamRef.current) {
      liveScreenStreamRef.current.getTracks().forEach((track) => track.stop());
      liveScreenStreamRef.current = null;
    }

    if (liveCameraStreamRef.current) {
      liveCameraStreamRef.current.getTracks().forEach((track) => track.stop());
      liveCameraStreamRef.current = null;
    }

    if (liveScreenVideoRef.current) {
      liveScreenVideoRef.current.srcObject = null;
    }

    if (liveCameraVideoRef.current) {
      liveCameraVideoRef.current.srcObject = null;
    }

    setIsLiveMeeting(false);
    if (socket && sessionId && canHostLiveMeeting) {
      socket.emit("liveMeetingEnded", { sessionId });
    }
    if (clearError) {
      setLiveMeetingError("");
    }
  };

  const startLiveMeeting = async () => {
    if (!canHostLiveMeeting) return;

    try {
      const [screenStream, cameraStream] = await Promise.all([
        navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }),
        navigator.mediaDevices.getUserMedia({ video: true, audio: true }),
      ]);

      liveScreenStreamRef.current = screenStream;
      liveCameraStreamRef.current = cameraStream;

      const handleLiveStreamEnd = () => {
        stopLiveMeeting();
      };

      screenStream.getVideoTracks().forEach((track) => {
        track.onended = handleLiveStreamEnd;
      });

      cameraStream.getVideoTracks().forEach((track) => {
        track.onended = handleLiveStreamEnd;
      });

      setCameraBoxPosition({ x: 24, y: 120 });
      setLiveMeetingError("");
      setIsLiveMeeting(true);

      if (socket && sessionId) {
        socket.emit("liveMeetingStarted", {
          sessionId,
          screenEnabled: true,
          cameraEnabled: true,
        });
      }
    } catch (error) {
      console.error("Error starting live meeting:", error);
      stopLiveMeeting({ clearError: false });
      setLiveMeetingError("Failed to start live meeting. Please allow camera, microphone, and screen permissions.");
    }
  };

  const handleCameraDragStart = (event) => {
    if (!cameraBoxRef.current) {
      return;
    }

    const boxRect = cameraBoxRef.current.getBoundingClientRect();
    dragOffsetRef.current = {
      x: event.clientX - boxRect.left,
      y: event.clientY - boxRect.top,
    };
    isDraggingCameraRef.current = true;
    event.preventDefault();
  };

  const handleJoinOwnerLiveMeeting = async () => {
    if (!isOwnerRole || !socket || !sessionId || !isRemoteLiveAvailable) {
      return;
    }

    stopOwnerLiveMeetingView({ clearError: false });
    setLiveMeetingError("");
    setIsOwnerJoinedLiveMeeting(true);

    try {
      setupOwnerPeerConnection();
      socket.emit("liveMeetingViewerJoin", { sessionId });
    } catch (error) {
      console.error("Failed to join live meeting:", error);
      setLiveMeetingError("Unable to join live meeting right now. Please try again.");
      stopOwnerLiveMeetingView({ clearError: false });
    }
  };

  const handleLeaveOwnerLiveMeeting = () => {
    if (socket && sessionId) {
      socket.emit("liveMeetingViewerLeft", { sessionId });
    }
    stopOwnerLiveMeetingView();
  };

  useEffect(() => {
    if (!isLiveMeeting) {
      return;
    }

    if (liveScreenVideoRef.current && liveScreenStreamRef.current) {
      liveScreenVideoRef.current.srcObject = liveScreenStreamRef.current;
    }

    if (liveCameraVideoRef.current && liveCameraStreamRef.current) {
      liveCameraVideoRef.current.srcObject = liveCameraStreamRef.current;
    }
  }, [isLiveMeeting]);

  useEffect(() => {
    if (!socket || !sessionId) return;

    const onSessionStatus = (status) => {
      if (status?.sessionId !== sessionId) return;
      const nextAvailable = Boolean(status?.liveMeetingActive);
      setIsRemoteLiveAvailable(nextAvailable);
      if (!nextAvailable) {
        stopOwnerLiveMeetingView();
      }
    };

    const onLiveMeetingStarted = (data) => {
      if (data?.sessionId !== sessionId) return;
      if (isOwnerRole) {
        setIsRemoteLiveAvailable(true);
      }
    };

    const onLiveMeetingEnded = (data) => {
      if (data?.sessionId !== sessionId) return;
      if (isOwnerRole) {
        setIsRemoteLiveAvailable(false);
        stopOwnerLiveMeetingView();
      }
      if (isNotaryRole) {
        closeAllNotaryViewerPeers();
      }
    };

    const onLiveMeetingViewerJoin = (data) => {
      handleNotaryViewerJoin(data);
    };

    const onLiveMeetingViewerLeft = (data) => {
      if (!isNotaryRole || data?.sessionId !== sessionId) return;
      closeNotaryViewerPeer(data?.viewerSocketId);
    };

    const onLiveMeetingOffer = async (data) => {
      if (!isOwnerRole || data?.sessionId !== sessionId) return;
      if (data?.targetSocketId && data.targetSocketId !== socket.id) return;

      try {
        const pc = setupOwnerPeerConnection();
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("liveMeetingAnswer", {
          sessionId,
          targetSocketId: data.fromSocketId,
          answer,
        });

        const pendingCandidates = [...pendingIceCandidatesRef.current];
        pendingIceCandidatesRef.current = [];
        for (const pendingCandidate of pendingCandidates) {
          await pc.addIceCandidate(new RTCIceCandidate(pendingCandidate));
        }
      } catch (error) {
        console.error("Failed to handle live meeting offer:", error);
        setLiveMeetingError("Failed to connect to the live meeting.");
        stopOwnerLiveMeetingView({ clearError: false });
      }
    };

    const onLiveMeetingAnswer = async (data) => {
      if (!isNotaryRole || data?.sessionId !== sessionId) return;
      if (data?.targetSocketId && data.targetSocketId !== socket.id) return;

      const fromSocketId = data?.fromSocketId;
      const pc = fromSocketId ? peerConnectionsRef.current.get(fromSocketId) : null;
      if (!pc) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      } catch (error) {
        console.error("Failed to apply live meeting answer:", error);
        closeNotaryViewerPeer(fromSocketId);
      }
    };

    const onLiveMeetingIceCandidate = async (data) => {
      if (data?.sessionId !== sessionId || !data?.candidate) return;
      if (data?.targetSocketId && data.targetSocketId !== socket.id) return;

      if (isNotaryRole) {
        const fromSocketId = data?.fromSocketId;
        const pc = fromSocketId ? peerConnectionsRef.current.get(fromSocketId) : null;
        if (!pc) return;
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (error) {
          console.warn("Failed to add viewer ICE candidate:", error);
        }
        return;
      }

      if (isOwnerRole) {
        const pc = ownerPeerConnectionRef.current;
        if (!pc || !pc.remoteDescription) {
          pendingIceCandidatesRef.current.push(data.candidate);
          return;
        }
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (error) {
          console.warn("Failed to add host ICE candidate:", error);
        }
      }
    };

    socket.on("sessionStatus", onSessionStatus);
    socket.on("liveMeetingStarted", onLiveMeetingStarted);
    socket.on("liveMeetingEnded", onLiveMeetingEnded);
    socket.on("liveMeetingViewerJoin", onLiveMeetingViewerJoin);
    socket.on("liveMeetingViewerLeft", onLiveMeetingViewerLeft);
    socket.on("liveMeetingOffer", onLiveMeetingOffer);
    socket.on("liveMeetingAnswer", onLiveMeetingAnswer);
    socket.on("liveMeetingIceCandidate", onLiveMeetingIceCandidate);

    return () => {
      socket.off("sessionStatus", onSessionStatus);
      socket.off("liveMeetingStarted", onLiveMeetingStarted);
      socket.off("liveMeetingEnded", onLiveMeetingEnded);
      socket.off("liveMeetingViewerJoin", onLiveMeetingViewerJoin);
      socket.off("liveMeetingViewerLeft", onLiveMeetingViewerLeft);
      socket.off("liveMeetingOffer", onLiveMeetingOffer);
      socket.off("liveMeetingAnswer", onLiveMeetingAnswer);
      socket.off("liveMeetingIceCandidate", onLiveMeetingIceCandidate);
    };
  }, [socket, sessionId, isOwnerRole, isNotaryRole, isLiveMeeting]);

  useEffect(() => {
    const handleMouseMove = (event) => {
      if (!isNotaryRole || !isDraggingCameraRef.current || !cameraBoxRef.current) {
        return;
      }

      const boxWidth = cameraBoxRef.current.offsetWidth;
      const boxHeight = cameraBoxRef.current.offsetHeight;

      const unclampedX = event.clientX - dragOffsetRef.current.x;
      const unclampedY = event.clientY - dragOffsetRef.current.y;

      const maxX = Math.max(0, window.innerWidth - boxWidth);
      const maxY = Math.max(0, window.innerHeight - boxHeight);

      setCameraBoxPosition({
        x: Math.max(0, Math.min(unclampedX, maxX)),
        y: Math.max(0, Math.min(unclampedY, maxY)),
      });
    };

    const handleMouseUp = () => {
      isDraggingCameraRef.current = false;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  useEffect(() => {
    return () => {
      stopLiveMeeting();
      stopOwnerLiveMeetingView();
    };
  }, []);

  const startRecording = async () => {
    try {
      // Get screen display stream
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { mediaSource: "screen" },
      });

      // Get audio stream
      let audioStream = null;
      try {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        console.warn("Audio permission denied, recording video only", e);
      }

      // Combine audio and video
      const audioTracks = audioStream ? audioStream.getAudioTracks() : [];
      const videoTracks = screenStream.getVideoTracks();
      const combinedStream = new MediaStream([...videoTracks, ...audioTracks]);

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: "video/webm;codecs=vp9",
      });

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);

        // Stop all tracks
        screenStream.getTracks().forEach((track) => track.stop());
        if (audioStream) audioStream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Error starting screen recording:", error);
      alert("Failed to start screen recording. Make sure you granted permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const downloadRecording = () => {
    if (recordedUrl) {
      const a = document.createElement("a");
      a.href = recordedUrl;
      a.download = `notarization-session-${Date.now()}.webm`;
      a.click();
    }
  };

  return (
    <div
      className="screen-recorder"
      style={{
        padding: "15px",
        backgroundColor: "#fff3cd",
        borderRadius: "5px",
        marginBottom: "15px",
        border: "1px solid #ffc107",
      }}
    >
      <h4 style={{ margin: "0 0 10px 0" }}>🎥 Screen Recording</h4>

      <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
        {canRecord ? (
          !isRecording ? (
            <button
              onClick={startRecording}
              style={{
                padding: "8px 16px",
                backgroundColor: "#f44336",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              🔴 Start Recording
            </button>
          ) : (
            <button
              onClick={stopRecording}
              style={{
                padding: "8px 16px",
                backgroundColor: "#ff9800",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              ⏹️ Stop Recording
            </button>
          )
        ) : isOwnerRole ? (
          <div style={{ color: "#555", alignSelf: "center" }}>
            {/* Owner only sees screen share controls; no waiting text */}
          </div>
        ) : (
          <div style={{ color: "#555", fontStyle: "italic", alignSelf: "center" }}>
            Screen recorder is disabled for this role.
          </div>
        )}

        {canHostLiveMeeting && !isScreenSharing ? (
          <button
            onClick={startScreenShare}
            style={{
              padding: "8px 16px",
              backgroundColor: "#1976d2",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            🖥️ Start Screen Share
          </button>
        ) : null}

        {canHostLiveMeeting && isScreenSharing ? (
          <button
            onClick={stopScreenShare}
            style={{
              padding: "8px 16px",
              backgroundColor: "#455a64",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            ⏹️ Stop Screen Share
          </button>
        ) : null}

        {isNotaryRole && !isLiveMeeting ? (
          <button
            onClick={startLiveMeeting}
            style={{
              padding: "8px 16px",
              backgroundColor: "#1e88e5",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            🎥 Start Live Meeting
          </button>
        ) : null}

        {isNotaryRole && isLiveMeeting ? (
          <button
            onClick={stopLiveMeeting}
            style={{
              padding: "8px 16px",
              backgroundColor: "#455a64",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            ⏹️ Stop Screen Share
          </button>
        ) : null}

        {isOwnerRole && isRemoteLiveAvailable && !isOwnerJoinedLiveMeeting ? (
          <button
            onClick={handleJoinOwnerLiveMeeting}
            style={{
              padding: "8px 16px",
              backgroundColor: "#1e88e5",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            📹 Join the live meeting
          </button>
        ) : null}

        {isOwnerRole && isOwnerJoinedLiveMeeting ? (
          <button
            onClick={handleLeaveOwnerLiveMeeting}
            style={{
              padding: "8px 16px",
              backgroundColor: "#455a64",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            ⏹️ Leave live meeting
          </button>
        ) : null}

        {isOwnerRole && !isRemoteLiveAvailable ? (
          <span style={{ alignSelf: "center", fontSize: "13px", color: "#6b7280", fontWeight: 600 }}>
            Waiting for notary to start live meeting
          </span>
        ) : null}
      </div>

      {isNotaryRole && isLiveMeeting && (
        <div
          style={{
            position: "relative",
            height: "240px",
            marginBottom: "10px",
            backgroundColor: "#111",
            border: "1px solid #263238",
            borderRadius: "6px",
            overflow: "hidden",
          }}
        >
          <video
            ref={liveScreenVideoRef}
            autoPlay
            playsInline
            muted
            style={{ width: "100%", height: "100%", objectFit: "contain", backgroundColor: "#000" }}
          />

          <div
            style={{
              position: "absolute",
              top: "8px",
              left: "8px",
              padding: "4px 8px",
              borderRadius: "4px",
              backgroundColor: "rgba(0,0,0,0.65)",
              color: "#fff",
              fontSize: "12px",
              fontWeight: "bold",
            }}
          >
            Shared Screen
          </div>
        </div>
      )}

      {isNotaryRole && isLiveMeeting && (
        <div
          ref={cameraBoxRef}
          style={{
            position: "fixed",
            left: `${cameraBoxPosition.x}px`,
            top: `${cameraBoxPosition.y}px`,
            width: "280px",
            backgroundColor: "#111",
            borderRadius: "6px",
            overflow: "hidden",
            boxShadow: "0 8px 20px rgba(0,0,0,0.35)",
            zIndex: 2500,
          }}
        >
          <div
            onMouseDown={handleCameraDragStart}
            style={{
              color: "#fff",
              padding: "6px 8px",
              fontSize: "12px",
              backgroundColor: "#263238",
              cursor: "move",
              userSelect: "none",
            }}
          >
            Notary Camera (Drag)
          </div>
          <video ref={liveCameraVideoRef} autoPlay playsInline muted style={{ width: "100%", display: "block", height: "160px", objectFit: "cover" }} />
        </div>
      )}

      {isOwnerRole && isOwnerJoinedLiveMeeting && (
        <div
          style={{
            backgroundColor: "#111",
            border: "1px solid #263238",
            borderRadius: "6px",
            overflow: "hidden",
            minHeight: "240px",
            marginBottom: "10px",
          }}
        >
          <div
            style={{
              color: "#fff",
              padding: "6px 8px",
              fontSize: "12px",
              backgroundColor: "#263238",
              fontWeight: "bold",
            }}
          >
            Notary Shared Screen
          </div>
          <video ref={remoteScreenVideoRef} autoPlay playsInline style={{ width: "100%", display: "block", minHeight: "240px", objectFit: "contain", backgroundColor: "#000" }} />
        </div>
      )}

      {liveMeetingError && (
        <p style={{ color: "#c62828", margin: "0 0 10px 0", fontWeight: "bold" }}>{liveMeetingError}</p>
      )}

      {recordedUrl && (
        <div>
          <p style={{ margin: "10px 0 5px 0", fontWeight: "bold" }}>✅ Recording Ready:</p>
          <video
            src={recordedUrl}
            controls
            style={{
              width: "100%",
              maxHeight: "200px",
              borderRadius: "4px",
              marginBottom: "10px",
            }}
          />
          <button
            onClick={downloadRecording}
            style={{
              width: "100%",
              padding: "8px",
              backgroundColor: "#4CAF50",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            ⬇️ Download Recording
          </button>
          <button
            onClick={() => setRecordedUrl(null)}
            style={{
              width: "100%",
              marginTop: "5px",
              padding: "8px",
              backgroundColor: "#ccc",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        </div>
      )}

      {isRecording && <p style={{ color: "red", margin: "5px 0 0 0", fontWeight: "bold" }}>● Recording in progress...</p>}
    </div>
  );
};

export default ScreenRecorder;
