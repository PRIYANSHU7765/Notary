import React, { useEffect, useRef, useState } from "react";
import { uploadSessionRecording } from "../utils/apiClient";

const ScreenRecorder = ({ role = null, sessionId = "", socket = null }) => {
  const isNotaryRole = role === "notary";
  const isOwnerRole = role === "owner";
  const canHostLiveMeeting = isNotaryRole || isOwnerRole;

  const [isRecording, setIsRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const [uploadedRecordingUrl, setUploadedRecordingUrl] = useState("");
  const [isUploadingRecording, setIsUploadingRecording] = useState(false);
  const [recordingUploadError, setRecordingUploadError] = useState("");
  const [isLiveMeeting, setIsLiveMeeting] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteScreenSharing, setRemoteScreenSharing] = useState(false);
  const [liveMeetingError, setLiveMeetingError] = useState("");
  const [remoteCameraStreamState, setRemoteCameraStreamState] = useState(null);
  const [remoteScreenStreamState, setRemoteScreenStreamState] = useState(null);
  const [ownerLocalCameraStreamState, setOwnerLocalCameraStreamState] = useState(null);
  const [isRemoteLiveAvailable, setIsRemoteLiveAvailable] = useState(false);
  const [isOwnerJoinedLiveMeeting, setIsOwnerJoinedLiveMeeting] = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const recordingStartedAtRef = useRef(null);

  const peerConnectionsRef = useRef(new Map());
  const ownerPeerConnectionRef = useRef(null);
  const pendingIceCandidatesRef = useRef([]);

  const liveCameraStreamRef = useRef(null);
  const ownerLocalCameraStreamRef = useRef(null);
  const remoteCameraStreamRef = useRef(null);
  const liveScreenStreamRef = useRef(null);
  const remoteScreenStreamRef = useRef(null);
  const screenShareTrackRef = useRef(null);

  const liveCameraVideoRef = useRef(null);
  const ownerLocalCameraVideoRef = useRef(null);
  const remoteCameraVideoRef = useRef(null);
  const liveScreenVideoRef = useRef(null);
  const remoteScreenVideoRef = useRef(null);

  const cameraBoxRef = useRef(null);
  const ownerBoxRef = useRef(null);

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
    if (!canHostLiveMeeting || isScreenSharing || remoteScreenSharing) return;

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      liveScreenStreamRef.current = screenStream;
      setIsScreenSharing(true);

      const screenVideoTrack = screenStream.getVideoTracks()[0];
      screenShareTrackRef.current = screenVideoTrack;

      screenVideoTrack.onended = () => {
        stopScreenShare();
      };

      if (isLiveMeeting) {
        if (isNotaryRole) {
          peerConnectionsRef.current.forEach((pc) => {
            if (screenVideoTrack) {
              pc.addTrack(screenVideoTrack, screenStream);
            }
          });
        }
        if (isOwnerRole && ownerPeerConnectionRef.current) {
          if (screenVideoTrack) {
            ownerPeerConnectionRef.current.addTrack(screenVideoTrack, screenStream);
          }
        }
      }

      if (socket && sessionId) {
        socket.emit("screenShareStarted", { sessionId, role });
      }
    } catch (error) {
      if (error.name === "NotAllowedError") {
        console.log("Screen share cancelled by user");
      } else {
        console.error("Error starting screen share:", error);
        setLiveMeetingError("Failed to start screen share. Please allow screen permissions.");
      }
    }
  };

  const stopScreenShare = () => {
    if (liveScreenStreamRef.current) {
      liveScreenStreamRef.current.getTracks().forEach((track) => track.stop());
      liveScreenStreamRef.current = null;
    }
    screenShareTrackRef.current = null;
    setIsScreenSharing(false);

    if (isLiveMeeting) {
      if (isNotaryRole) {
        peerConnectionsRef.current.forEach((pc) => {
          const senders = pc.getSenders();
          senders.forEach((sender) => {
            if (sender.track?.kind === "video" && sender.track !== liveCameraStreamRef.current?.getVideoTracks()[0]) {
              pc.removeTrack(sender);
            }
          });
        });
      }
      if (isOwnerRole && ownerPeerConnectionRef.current) {
        const senders = ownerPeerConnectionRef.current.getSenders();
        senders.forEach((sender) => {
          if (sender.track?.kind === "video" && sender.track !== ownerLocalCameraStreamRef.current?.getVideoTracks()[0]) {
            ownerPeerConnectionRef.current.removeTrack(sender);
          }
        });
      }
    }

    if (socket && sessionId) {
      socket.emit("screenShareStopped", { sessionId, role });
    }
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

    if (ownerLocalCameraStreamRef.current) {
      ownerLocalCameraStreamRef.current.getTracks().forEach((track) => track.stop());
      ownerLocalCameraStreamRef.current = null;
    }

    if (remoteCameraStreamRef.current) {
      remoteCameraStreamRef.current.getTracks().forEach((track) => track.stop());
      remoteCameraStreamRef.current = null;
    }

    if (ownerLocalCameraVideoRef.current) {
      ownerLocalCameraVideoRef.current.srcObject = null;
    }

    if (remoteCameraVideoRef.current) {
      remoteCameraVideoRef.current.srcObject = null;
    }

    setOwnerLocalCameraStreamState(null);
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
      if (track.kind === "video") {
        const isScreen = track.label.toLowerCase().includes("screen");
        if (isScreen) {
          const screenStream = new MediaStream([track]);
          remoteScreenStreamRef.current = screenStream;
          setRemoteScreenStreamState(screenStream);
          if (remoteScreenVideoRef.current) {
            remoteScreenVideoRef.current.srcObject = screenStream;
          }
        } else {
          const camStream = remoteStream;
          remoteCameraStreamRef.current = camStream;
          setRemoteCameraStreamState(camStream);
          if (remoteCameraVideoRef.current) {
            remoteCameraVideoRef.current.srcObject = camStream;
          }
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

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (!remoteStream) return;

      const track = event.track;
      if (track.kind === "video") {
        const isScreen = track.label.toLowerCase().includes("screen");
        if (isScreen) {
          const screenStream = new MediaStream([track]);
          remoteScreenStreamRef.current = screenStream;
          setRemoteScreenStreamState(screenStream);
          if (remoteScreenVideoRef.current) {
            remoteScreenVideoRef.current.srcObject = screenStream;
          }
        } else {
          const camStream = remoteStream;
          remoteCameraStreamRef.current = camStream;
          setRemoteCameraStreamState(camStream);
          if (remoteCameraVideoRef.current) {
            remoteCameraVideoRef.current.srcObject = camStream;
          }
        }
      }
    };

    const cameraVideoTrack = liveCameraStreamRef.current?.getVideoTracks?.()[0];
    const cameraAudioTrack = liveCameraStreamRef.current?.getAudioTracks?.()[0];

    if (cameraVideoTrack && liveCameraStreamRef.current) {
      pc.addTrack(cameraVideoTrack, liveCameraStreamRef.current);
    }
    if (cameraAudioTrack && liveCameraStreamRef.current) {
      pc.addTrack(cameraAudioTrack, liveCameraStreamRef.current);
    }

    if (isScreenSharing && liveScreenStreamRef.current) {
      const screenVideoTrack = liveScreenStreamRef.current?.getVideoTracks?.()[0];
      if (screenVideoTrack) {
        pc.addTrack(screenVideoTrack, liveScreenStreamRef.current);
      }
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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      stopRecording();
    }

    closeAllNotaryViewerPeers();

    if (liveCameraStreamRef.current) {
      liveCameraStreamRef.current.getTracks().forEach((track) => track.stop());
      liveCameraStreamRef.current = null;
    }

    if (remoteCameraStreamRef.current) {
      remoteCameraStreamRef.current.getTracks().forEach((track) => track.stop());
      remoteCameraStreamRef.current = null;
    }

    if (liveCameraVideoRef.current) {
      liveCameraVideoRef.current.srcObject = null;
    }

    if (remoteCameraVideoRef.current) {
      remoteCameraVideoRef.current.srcObject = null;
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
      const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

      liveCameraStreamRef.current = cameraStream;

      const handleLiveStreamEnd = () => {
        stopLiveMeeting();
      };

      cameraStream.getVideoTracks().forEach((track) => {
        track.onended = handleLiveStreamEnd;
      });

      // camera box is fixed layout; no dynamic position updates needed
      setLiveMeetingError("");
      setIsLiveMeeting(true);

      if (isNotaryRole) {
        const recordingStarted = await startRecording();
        if (!recordingStarted) {
          stopLiveMeeting({ clearError: false });
          setLiveMeetingError("Live meeting requires recording permission. Please allow screen capture and try again.");
          return;
        }
      }

      if (socket && sessionId) {
        socket.emit("liveMeetingStarted", {
          sessionId,
          screenEnabled: false,
          cameraEnabled: true,
        });
      }
    } catch (error) {
      console.error("Error starting live meeting:", error);
      stopLiveMeeting({ clearError: false });
      setLiveMeetingError("Failed to start live meeting. Please allow camera and microphone permissions.");
    }
  };
  const handleJoinOwnerLiveMeeting = async () => {
    if (!isOwnerRole || !socket || !sessionId || !isRemoteLiveAvailable) {
      return;
    }

    stopOwnerLiveMeetingView({ clearError: false });
    setLiveMeetingError("");
    setIsOwnerJoinedLiveMeeting(true);

    try {
      const ownerCameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      ownerLocalCameraStreamRef.current = ownerCameraStream;
      setOwnerLocalCameraStreamState(ownerCameraStream);
      if (ownerLocalCameraVideoRef.current) {
        ownerLocalCameraVideoRef.current.srcObject = ownerCameraStream;
      }

      setupOwnerPeerConnection();
      socket.emit("liveMeetingViewerJoin", { sessionId });
    } catch (error) {
      console.error("Failed to join live meeting:", error);
      setLiveMeetingError("Unable to join live meeting right now. Please allow camera and microphone permissions.");
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
    if (liveCameraVideoRef.current && liveCameraStreamRef.current) {
      liveCameraVideoRef.current.srcObject = liveCameraStreamRef.current;
    }

    if (ownerLocalCameraVideoRef.current && ownerLocalCameraStreamRef.current) {
      ownerLocalCameraVideoRef.current.srcObject = ownerLocalCameraStreamRef.current;
    }

    if (remoteCameraVideoRef.current && remoteCameraStreamState) {
      remoteCameraVideoRef.current.srcObject = remoteCameraStreamState;
    }

    if (remoteScreenVideoRef.current && remoteScreenStreamState) {
      remoteScreenVideoRef.current.srcObject = remoteScreenStreamState;
    }
  }, [isLiveMeeting, isOwnerJoinedLiveMeeting, remoteCameraStreamState, remoteScreenStreamState]);

  useEffect(() => {
    if (!socket || !sessionId) return;

    const onSessionStatus = (status) => {
      if (status?.sessionId !== sessionId) return;
      const nextAvailable = Boolean(status?.liveMeetingActive);
      setIsRemoteLiveAvailable(nextAvailable);
      if (isOwnerRole) {
        setIsLiveMeeting(nextAvailable);
      }
      if (!nextAvailable) {
        stopOwnerLiveMeetingView();
      }
    };

    const onLiveMeetingStarted = (data) => {
      if (data?.sessionId !== sessionId) return;
      if (isOwnerRole) {
        setIsRemoteLiveAvailable(true);
        setIsLiveMeeting(true);
      }
    };

    const onLiveMeetingEnded = (data) => {
      if (data?.sessionId !== sessionId) return;
      if (isOwnerRole) {
        setIsRemoteLiveAvailable(false);
        setIsLiveMeeting(false);
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
        const ownerVideoTrack = ownerLocalCameraStreamRef.current?.getVideoTracks?.()[0];
        const ownerAudioTrack = ownerLocalCameraStreamRef.current?.getAudioTracks?.()[0];

        if (ownerVideoTrack) {
          pc.addTrack(ownerVideoTrack, ownerLocalCameraStreamRef.current);
        }
        if (ownerAudioTrack) {
          pc.addTrack(ownerAudioTrack, ownerLocalCameraStreamRef.current);
        }

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

    const onScreenShareStarted = (data) => {
      if (data?.sessionId !== sessionId) return;
      if (data?.role === role) return;
      setRemoteScreenSharing(true);
    };

    const onScreenShareStopped = (data) => {
      if (data?.sessionId !== sessionId) return;
      if (data?.role === role) return;
      setRemoteScreenSharing(false);
    };

    socket.on("sessionStatus", onSessionStatus);
    socket.on("liveMeetingStarted", onLiveMeetingStarted);
    socket.on("liveMeetingEnded", onLiveMeetingEnded);
    socket.on("liveMeetingViewerJoin", onLiveMeetingViewerJoin);
    socket.on("liveMeetingViewerLeft", onLiveMeetingViewerLeft);
    socket.on("liveMeetingOffer", onLiveMeetingOffer);
    socket.on("liveMeetingAnswer", onLiveMeetingAnswer);
    socket.on("liveMeetingIceCandidate", onLiveMeetingIceCandidate);
    socket.on("screenShareStarted", onScreenShareStarted);
    socket.on("screenShareStopped", onScreenShareStopped);

    return () => {
      socket.off("sessionStatus", onSessionStatus);
      socket.off("liveMeetingStarted", onLiveMeetingStarted);
      socket.off("liveMeetingEnded", onLiveMeetingEnded);
      socket.off("liveMeetingViewerJoin", onLiveMeetingViewerJoin);
      socket.off("liveMeetingViewerLeft", onLiveMeetingViewerLeft);
      socket.off("liveMeetingOffer", onLiveMeetingOffer);
      socket.off("liveMeetingAnswer", onLiveMeetingAnswer);
      socket.off("liveMeetingIceCandidate", onLiveMeetingIceCandidate);
      socket.off("screenShareStarted", onScreenShareStarted);
      socket.off("screenShareStopped", onScreenShareStopped);
    };
  }, [socket, sessionId, isOwnerRole, isNotaryRole, isLiveMeeting]);


  useEffect(() => {
    return () => {
      stopLiveMeeting();
      stopOwnerLiveMeetingView();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl);
      }
    };
  }, [recordedUrl]);

  const blobToDataUrl = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read recording blob."));
      reader.readAsDataURL(blob);
    });

  const uploadRecordingBlob = async (blob, endedAtMs) => {
    setIsUploadingRecording(true);
    setRecordingUploadError("");
    setUploadedRecordingUrl("");

    const startedAtMs = recordingStartedAtRef.current || endedAtMs;
    const fileName = `notary-session-${sessionId || "unknown"}-${Date.now()}.webm`;
    const dataUrl = await blobToDataUrl(blob);

    const response = await uploadSessionRecording({
      sessionId,
      role,
      fileName,
      mimeType: blob.type || "video/webm",
      dataUrl,
      startedAt: new Date(startedAtMs).toISOString(),
      endedAt: new Date(endedAtMs).toISOString(),
      durationMs: Math.max(0, endedAtMs - startedAtMs),
    });

    const linkedUrl =
      response?.recording?.shareUrl ||
      response?.recording?.providerUrl ||
      response?.recording?.webUrl ||
      "";

    setUploadedRecordingUrl(linkedUrl);
    setIsUploadingRecording(false);
  };

  const startRecording = async () => {
    try {
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl);
      }
      setRecordedUrl(null);
      setUploadedRecordingUrl("");
      setRecordingUploadError("");

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
        const endedAtMs = Date.now();
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);

        // Stop all tracks
        screenStream.getTracks().forEach((track) => track.stop());
        if (audioStream) audioStream.getTracks().forEach((track) => track.stop());

        uploadRecordingBlob(blob, endedAtMs).catch((error) => {
          console.error("Failed to upload recording:", error);
          setIsUploadingRecording(false);
          setRecordingUploadError(error?.message || "Failed to upload recording to OneDrive.");
        });
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      recordingStartedAtRef.current = Date.now();
      setIsRecording(true);
      return true;
    } catch (error) {
      console.error("Error starting screen recording:", error);
      return false;
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      setIsRecording(false);
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
        {isOwnerRole ? (
          <div style={{ color: "#555", alignSelf: "center" }}>
            {/* Owner only sees screen share controls; no waiting text */}
          </div>
        ) : (
          <div style={{ color: "#555", fontStyle: "italic", alignSelf: "center" }}>
            Recording starts automatically with live meeting and stops when the meeting ends.
          </div>
        )}

        {/* Screen share initiation is disabled in both dashboards per request */}

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

        {canHostLiveMeeting && remoteScreenSharing && !isScreenSharing ? (
          <span style={{ alignSelf: "center", fontSize: "13px", color: "#f57c00", fontWeight: 600 }}>
            🔒 Screen share in use by other participant
          </span>
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
            ⏹️ Stop Live Meeting
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

      {(isLiveMeeting && (isNotaryRole || (isOwnerRole && isOwnerJoinedLiveMeeting))) && (
        <div
          ref={ownerBoxRef}
          style={{
            position: "fixed",
            right: "24px",
            top: "370px",
            width: "280px",
            backgroundColor: "#111",
            borderRadius: "6px",
            overflow: "hidden",
            boxShadow: "0 8px 20px rgba(0,0,0,0.35)",
            zIndex: 2500,
          }}
        >
          <div
            style={{
              color: "#fff",
              padding: "6px 8px",
              fontSize: "12px",
              backgroundColor: "#263238",
              userSelect: "none",
              fontWeight: "bold",
            }}
          >
            {isNotaryRole ? "Owner Camera" : "Owner Camera (You)"}
          </div>
          {(isNotaryRole ? remoteCameraStreamState : ownerLocalCameraStreamState) ? (
            <video
              ref={isNotaryRole ? remoteCameraVideoRef : ownerLocalCameraVideoRef}
              autoPlay
              playsInline
              muted={!isNotaryRole}
              style={{ width: "100%", display: "block", height: "160px", objectFit: "cover" }}
            />
          ) : (
            <div style={{ color: "#fff", padding: "12px", textAlign: "center" }}>
              Waiting for owner camera...
            </div>
          )}
        </div>
      )}

      {(isLiveMeeting && (isNotaryRole || (isOwnerRole && isOwnerJoinedLiveMeeting))) && (
        <div
          ref={cameraBoxRef}
          style={{
            position: "fixed",
            right: "24px",
            top: "170px",
            width: "280px",
            backgroundColor: "#111",
            borderRadius: "6px",
            overflow: "hidden",
            boxShadow: "0 8px 20px rgba(0,0,0,0.35)",
            zIndex: 2500,
          }}
        >
          <div
            style={{
              color: "#fff",
              padding: "6px 8px",
              fontSize: "12px",
              backgroundColor: "#263238",
              userSelect: "none",
              fontWeight: "bold",
            }}
          >
            {isNotaryRole ? "Notary Camera (You)" : "Notary Camera"}
          </div>
          {isNotaryRole ? (
            <video
              ref={liveCameraVideoRef}
              autoPlay
              playsInline
              muted
              style={{ width: "100%", display: "block", height: "160px", objectFit: "cover" }}
            />
          ) : remoteCameraStreamState ? (
            <video
              ref={remoteCameraVideoRef}
              autoPlay
              playsInline
              style={{ width: "100%", display: "block", height: "160px", objectFit: "cover" }}
            />
          ) : (
            <div style={{ color: "#fff", padding: "12px", textAlign: "center" }}>
              Waiting for notary camera...
            </div>
          )}
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
          {isUploadingRecording ? (
            <p style={{ margin: "4px 0 0 0", color: "#0d47a1", fontWeight: "bold" }}>
              Uploading recording to OneDrive...
            </p>
          ) : null}
          {!isUploadingRecording && uploadedRecordingUrl ? (
            <a
              href={uploadedRecordingUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: "#0d47a1", fontWeight: "bold", textDecoration: "none" }}
            >
              Open recording in OneDrive
            </a>
          ) : null}
          {!isUploadingRecording && recordingUploadError ? (
            <p style={{ margin: "4px 0 0 0", color: "#c62828", fontWeight: "bold" }}>
              {recordingUploadError}
            </p>
          ) : null}
        </div>
      )}

      {isRecording && <p style={{ color: "red", margin: "5px 0 0 0", fontWeight: "bold" }}>● Recording in progress...</p>}
    </div>
  );
};

export default ScreenRecorder;
