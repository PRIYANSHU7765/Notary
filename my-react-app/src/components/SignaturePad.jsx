import React, { useRef, useState } from "react";

const SignaturePad = ({ onSave, onSignatureGenerated, title = "Draw Your Signature" }) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const canvas = canvasRef.current;
      const signatureImage = canvas.toDataURL("image/png");
      console.log("✍️ Signature image generated, length:", signatureImage.length);
      const saveFn = onSave || onSignatureGenerated;
      if (!saveFn) {
        throw new Error('No save callback provided');
      }
      await saveFn(signatureImage);
      console.log("✅ Signature saved successfully");
    } catch (error) {
      console.error("❌ Error in handleSave:", error);
      alert("Error saving signature: " + (error?.message || error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="signature-pad" style={{ border: "2px solid #ddd", padding: "10px", borderRadius: "5px", textAlign: "center" }}>
      <h3>{title}</h3>
      <canvas
        ref={canvasRef}
        width={400}
        height={200}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        style={{
          border: "1px solid #ccc",
          backgroundColor: "#fff",
          borderRadius: "3px",
          cursor: "crosshair",
          display: "block",
          margin: "10px auto",
        }}
      />
      <div style={{ marginTop: "10px", display: "flex", gap: "10px", justifyContent: "center" }}>
        <button onClick={handleClear} style={{ padding: "8px 16px", cursor: "pointer" }}>
          Clear
        </button>
        <button 
          onClick={handleSave} 
          disabled={isSaving}
          style={{ 
            padding: "8px 16px", 
            cursor: isSaving ? "not-allowed" : "pointer",
            backgroundColor: isSaving ? "#ccc" : "#4CAF50", 
            color: "white",
            opacity: isSaving ? 0.6 : 1,
          }}
        >
          {isSaving ? "Saving..." : "Save Signature"}
        </button>
      </div>
    </div>
  );
};

export default SignaturePad;
