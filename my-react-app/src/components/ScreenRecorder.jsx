import React, { useState, useRef } from "react";

const ScreenRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

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
        {!isRecording ? (
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
        )}
      </div>

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
