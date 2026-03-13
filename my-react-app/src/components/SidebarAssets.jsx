import React, { useState } from "react";
import SignaturePad from "./SignaturePad";

const SidebarAssets = ({ userRole, onAssetGenerated }) => {
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [assets, setAssets] = useState([
    {
      id: "stamp-official",
      name: "Official Stamp",
      type: "stamp",
      image: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='45' fill='none' stroke='red' stroke-width='3'/%3E%3Ctext x='50' y='55' text-anchor='middle' font-size='12' fill='red' font-weight='bold'%3ENOTARIZED%3C/text%3E%3C/svg%3E",
      user: "notary",
    },
    {
      id: "stamp-approved",
      name: "Approved Stamp",
      type: "stamp",
      image: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='45' fill='none' stroke='green' stroke-width='3'/%3E%3Ctext x='50' y='55' text-anchor='middle' font-size='12' fill='green' font-weight='bold'%3EAPPROVED%3C/text%3E%3C/svg%3E",
      user: "notary",
    },
    {
      id: "signature-owner",
      name: "Owner Signature",
      type: "signature",
      image:
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 50'%3E%3Ctext x='10' y='35' font-family='cursive' font-size='32' fill='black'%3EOwner%3C/text%3E%3C/svg%3E",
      user: "owner",
    },
    {
      id: "signature-notary",
      name: "Notary Signature",
      type: "signature",
      image:
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 50'%3E%3Ctext x='10' y='35' font-family='cursive' font-size='32' fill='blue'%3ENotary%3C/text%3E%3C/svg%3E",
      user: "notary",
    },
  ]);

  const handleDragStart = (e, asset) => {
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({
        id: asset.id,
        name: asset.name,
        type: asset.type,
        image: asset.image,
        user: asset.user,
      })
    );
  };

  const handleSignatureGenerated = (signatureImage) => {
    const newAsset = {
      id: `signature-${userRole}-${Date.now()}`,
      name: `${userRole} Signature (${new Date().toLocaleTimeString()})`,
      type: "signature",
      image: signatureImage,
      user: userRole,
    };

    setAssets([...assets, newAsset]);
    onAssetGenerated?.(newAsset);
    setShowSignaturePad(false);
  };

  // Filter assets based on user role
  const visibleAssets = assets.filter(
    (asset) => asset.user === userRole || asset.user === "owner" || asset.user === "notary"
  );

  return (
    <div
      className="sidebar-assets"
      style={{
        width: "220px",
        backgroundColor: "#f5f5f5",
        borderRight: "2px solid #ddd",
        padding: "15px",
        overflowY: "auto",
        height: "100vh",
      }}
    >
      <h3 style={{ marginTop: 0 }}>📦 Assets</h3>

      {/* Draw Signature Button */}
      {!showSignaturePad && (
        <button
          onClick={() => setShowSignaturePad(true)}
          style={{
            width: "100%",
            padding: "10px",
            marginBottom: "15px",
            backgroundColor: "#2196F3",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          ✏️ Draw Signature
        </button>
      )}

      {/* Signature Pad Modal */}
      {showSignaturePad && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              padding: "20px",
              borderRadius: "8px",
              boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
              maxWidth: "500px",
            }}
          >
            <SignaturePad onSignatureGenerated={handleSignatureGenerated} title={`Draw ${userRole} Signature`} />
            <button
              onClick={() => setShowSignaturePad(false)}
              style={{
                width: "100%",
                marginTop: "10px",
                padding: "8px",
                backgroundColor: "#f44336",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Asset List */}
      <div>
        <h4>Draggable Assets</h4>
        {visibleAssets.map((asset) => (
          <div
            key={asset.id}
            draggable
            onDragStart={(e) => handleDragStart(e, asset)}
            style={{
              padding: "10px",
              margin: "8px 0",
              backgroundColor: "white",
              border: "1px solid #ccc",
              borderRadius: "4px",
              cursor: "grab",
              userSelect: "none",
              transition: "all 0.2s",
              fontSize: "12px",
            }}
            onMouseEnter={(e) => (e.target.style.backgroundColor = "#e8f4f8")}
            onMouseLeave={(e) => (e.target.style.backgroundColor = "white")}
          >
            <strong>{asset.name}</strong>
            <br />
            <small style={{ color: "#666" }}>Type: {asset.type}</small>
            <img
              src={asset.image}
              alt={asset.name}
              style={{
                maxWidth: "100%",
                height: "40px",
                marginTop: "5px",
                borderRadius: "2px",
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default SidebarAssets;
