import React, { useRef } from "react";
import SignatureCanvas from "react-signature-canvas";

const SignaturePad = ({ onSignatureGenerated, title = "Draw Your Signature" }) => {
  const sigCanvasRef = useRef(null);

  const handleClear = () => {
    sigCanvasRef.current.clear();
  };

  const handleSave = () => {
    const canvas = sigCanvasRef.current.getTrimmedCanvas();
    const signatureImage = canvas.toDataURL("image/png");
    onSignatureGenerated(signatureImage);
    console.log("Signature saved");
  };

  return (
    <div className="signature-pad" style={{ border: "2px solid #ddd", padding: "10px", borderRadius: "5px", textAlign: "center" }}>
      <h3>{title}</h3>
      <SignatureCanvas
        ref={sigCanvasRef}
        penColor="black"
        canvasProps={{
          width: 400,
          height: 200,
          className: "signature-canvas",
          style: {
            border: "1px solid #ccc",
            backgroundColor: "#fff",
            borderRadius: "3px",
            cursor: "crosshair",
          },
        }}
      />
      <div style={{ marginTop: "10px", display: "flex", gap: "10px", justifyContent: "center" }}>
        <button onClick={handleClear} style={{ padding: "8px 16px", cursor: "pointer" }}>
          Clear
        </button>
        <button onClick={handleSave} style={{ padding: "8px 16px", cursor: "pointer", backgroundColor: "#4CAF50", color: "white" }}>
          Save Signature
        </button>
      </div>
    </div>
  );
};

export default SignaturePad;
