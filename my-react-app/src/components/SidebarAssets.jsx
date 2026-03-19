import React, { useState, useEffect, useRef } from "react";
import SignaturePad from "./SignaturePad";
import { deleteAsset, deleteSignature, fetchAssets, fetchSignatures, saveAsset, saveSignature } from "../utils/apiClient";

const BASE_ASSETS = [
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
];

const getHiddenAssetsStorageKey = (role) => `notary.hiddenAssets.${role}`;

const loadHiddenAssetIds = (role) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(getHiddenAssetsStorageKey(role)) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getBaseAssets = (role) => {
  const hidden = new Set(loadHiddenAssetIds(role));
  return BASE_ASSETS.filter((asset) => !hidden.has(asset.id));
};

const escapeXml = (value = "") =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");

const createTextAssetImage = (text) => {
  const safeText = escapeXml(text);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 90"><text x="18" y="56" font-family="Segoe UI, Arial, sans-serif" font-size="36" font-weight="700" fill="#111827">${safeText}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const SidebarAssets = ({
  userRole,
  sessionId,
  userId,
  onAssetGenerated,
  showAssets = true,
  uploadedAsset,
  uploadedAssets = [],
  onAssetBoxClick,
  assetScopeKey = "default",
}) => {
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [showTextModal, setShowTextModal] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [assets, setAssets] = useState(() => getBaseAssets(userRole));
  const persistedAssetIdsRef = useRef(new Set());

  useEffect(() => {
    setAssets(getBaseAssets(userRole));
    setShowSignaturePad(false);
    setShowTextModal(false);
    setTextInput("");
  }, [userRole, assetScopeKey]);

  // Reset session-scoped assets when we switch sessions
  useEffect(() => {
    setAssets(getBaseAssets(userRole));
    persistedAssetIdsRef.current = new Set();
  }, [sessionId, userRole]);

  // Fetch saved signatures from backend on mount
  useEffect(() => {
    const loadSignatures = async () => {
      try {
        const savedSignatures = await fetchSignatures(userRole, { userId });
        console.log('[SidebarAssets] ✅ Loaded', savedSignatures.length, 'signatures');
        
        // Add saved signatures to assets with the proper structure
        const formattedSignatures = savedSignatures.map(sig => ({
          id: sig.id,
          name: sig.name,
          type: "signature",
          image: sig.image,
          user: sig.userRole,
        }));

        const hidden = new Set(loadHiddenAssetIds(userRole));
        setAssets(prev => {
          const existingIds = new Set(prev.map((asset) => asset.id));
          const uniqueNewAssets = formattedSignatures.filter(
            (asset) => !existingIds.has(asset.id) && !hidden.has(asset.id)
          );
          return [...prev, ...uniqueNewAssets];
        });
      } catch (error) {
        console.error('[SidebarAssets] Error loading signatures:', error);
      }
    };

    loadSignatures();
  }, [userRole, assetScopeKey]);

  // Fetch saved non-signature assets from backend on mount.
  useEffect(() => {
    const loadAssets = async () => {
      try {
        const savedAssets = await fetchAssets(userRole, { userId, sessionId });
        const hidden = new Set(loadHiddenAssetIds(userRole));

        const formattedAssets = savedAssets
          .map((asset) => ({
            id: asset.id,
            name: asset.name,
            type: asset.type,
            image: asset.image,
            text: asset.text,
            width: asset.width || undefined,
            height: asset.height || undefined,
            user: asset.userRole,
          }))
          .filter((asset) => !hidden.has(asset.id));

        formattedAssets.forEach((asset) => persistedAssetIdsRef.current.add(asset.id));

        setAssets((prev) => {
          const existingIds = new Set(prev.map((asset) => asset.id));
          const uniqueNewAssets = formattedAssets.filter((asset) => !existingIds.has(asset.id));
          return [...prev, ...uniqueNewAssets];
        });
      } catch (error) {
        console.error('[SidebarAssets] Error loading assets:', error);
      }
    };

    loadAssets();
  }, [userRole, sessionId, userId, assetScopeKey]);

  // Add uploaded document as asset whenever it changes
  useEffect(() => {
    if (!uploadedAsset) return;

    const hidden = new Set(loadHiddenAssetIds(userRole));
    if (hidden.has(uploadedAsset.id)) return;

    setAssets((prev) => {
      if (prev.some((a) => a.id === uploadedAsset.id)) return prev;
      return [...prev, uploadedAsset];
    });

    if (sessionId && userId && !persistedAssetIdsRef.current.has(uploadedAsset.id)) {
      saveAsset({
        id: uploadedAsset.id,
        sessionId,
        userId,
        username: (() => {
          try {
            return JSON.parse(localStorage.getItem('notary.authUser') || 'null')?.username;
          } catch {
            return null;
          }
        })(),
        name: uploadedAsset.name,
        type: uploadedAsset.type,
        image: uploadedAsset.image,
        text: uploadedAsset.text,
        width: uploadedAsset.width,
        height: uploadedAsset.height,
        userRole,
      })
        .then(() => persistedAssetIdsRef.current.add(uploadedAsset.id))
        .catch((error) => console.warn('[SidebarAssets] Failed to persist uploaded asset:', error?.message || error));
    }
  }, [uploadedAsset, userRole]);

  // Add all previously uploaded assets (from localStorage) when component mounts or uploadedAssets changes
  useEffect(() => {
    if (!uploadedAssets || uploadedAssets.length === 0) return;

    const hidden = new Set(loadHiddenAssetIds(userRole));

    setAssets((prev) => {
      const newAssets = uploadedAssets.filter(
        (asset) => !hidden.has(asset.id) && !prev.some((a) => a.id === asset.id)
      );

      if (sessionId && userId) {
        newAssets.forEach((asset) => {
          if (persistedAssetIdsRef.current.has(asset.id)) return;
          saveAsset({
            id: asset.id,
            sessionId,
            userId,
            username: (() => {
              try {
                return JSON.parse(localStorage.getItem('notary.authUser') || 'null')?.username;
              } catch {
                return null;
              }
            })(),
            name: asset.name,
            type: asset.type,
            image: asset.image,
            text: asset.text,
            width: asset.width,
            height: asset.height,
            userRole,
          })
            .then(() => persistedAssetIdsRef.current.add(asset.id))
            .catch((error) => console.warn('[SidebarAssets] Failed to persist uploaded assets:', error?.message || error));
        });
      }

      return [...prev, ...newAssets];
    });
  }, [uploadedAssets, userRole, sessionId, userId]);

  const handleDragStart = (e, asset) => {
    // Prevent dragging when clicking the delete button
    if (e.target.hasAttribute('data-delete-btn') || e.target.closest('[data-delete-btn]')) {
      e.preventDefault();
      return;
    }
    
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({
        id: asset.id,
        name: asset.name,
        type: asset.type,
        image: asset.image,
        text: asset.text,
        width: asset.width,
        height: asset.height,
        user: asset.user,
      })
    );
  };

  const handleSignatureGenerated = async (signatureImage) => {
    const newAsset = {
      id: `signature-${userRole}-${Date.now()}`,
      name: `${userRole.charAt(0).toUpperCase() + userRole.slice(1)} Signature (${new Date().toLocaleTimeString()})`,
      type: "signature",
      image: signatureImage,
      user: userRole,
    };

    console.log("📝 Creating new asset:", newAsset.id);
    
    // Add to UI immediately for instant feedback
    setAssets(prev => [...prev, newAsset]);
    onAssetGenerated?.(newAsset);

    // Save to backend asynchronously (only when we have session + user context)
    if (sessionId && userId) {
      try {
        console.log("💾 Saving signature to MongoDB...");
        const authUsername = (() => {
          try {
            return JSON.parse(localStorage.getItem('notary.authUser') || 'null')?.username;
          } catch {
            return undefined;
          }
        })();

        const result = await saveSignature({
          id: newAsset.id,
          sessionId,
          userId,
          username: authUsername,
          name: newAsset.name,
          image: signatureImage,
          userRole: userRole,
        });
        console.log("✅ Signature saved to backend successfully:", result.id);
      } catch (error) {
        console.error("❌ Error saving signature to backend:", error);
        console.warn("Signature is saved locally but backend persistence failed.");
      }
    } else {
      console.warn('Skipping backend signature save: missing sessionId or userId');
    }

    setShowSignaturePad(false);
  };

  const handleDeleteAsset = async (assetId) => {
    console.log("🗑️ Deleting asset:", assetId);

    const assetToDelete = assets.find((asset) => asset.id === assetId);
    const nextHiddenAssetIds = Array.from(new Set([...loadHiddenAssetIds(userRole), assetId]));
    localStorage.setItem(getHiddenAssetsStorageKey(userRole), JSON.stringify(nextHiddenAssetIds));

    setAssets(prev => {
      const updated = prev.filter(asset => asset.id !== assetId);
      console.log("📦 Assets after delete:", updated.length);
      return updated;
    });

    if (assetToDelete?.type === "signature") {
      try {
        await deleteSignature(assetId);
      } catch (error) {
        console.warn("[SidebarAssets] Signature delete not persisted on backend:", error?.message || error);
      }
    } else {
      try {
        await deleteAsset(assetId);
        persistedAssetIdsRef.current.delete(assetId);
      } catch (error) {
        console.warn("[SidebarAssets] Asset delete not persisted on backend:", error?.message || error);
      }
    }
  };

  const handleSubmitTextAsset = () => {
    const trimmed = textInput.trim();
    if (!trimmed) return;

    const previewText = trimmed.length > 30 ? `${trimmed.slice(0, 30)}...` : trimmed;
    const newAsset = {
      id: `text-${userRole}-${Date.now()}`,
      name: `Text: ${previewText}`,
      type: "text",
      image: createTextAssetImage(trimmed),
      text: trimmed,
      width: 220,
      height: 60,
      user: userRole,
    };

    setAssets((prev) => [...prev, newAsset]);
    onAssetGenerated?.(newAsset);

    if (sessionId && userId) {
      saveAsset({
        id: newAsset.id,
        sessionId,
        userId,
        username: (() => {
          try {
            return JSON.parse(localStorage.getItem('notary.authUser') || 'null')?.username;
          } catch {
            return null;
          }
        })(),
        name: newAsset.name,
        type: newAsset.type,
        image: newAsset.image,
        text: newAsset.text,
        width: newAsset.width,
        height: newAsset.height,
        userRole,
      })
        .then(() => persistedAssetIdsRef.current.add(newAsset.id))
        .catch((error) => console.warn('[SidebarAssets] Failed to persist text asset:', error?.message || error));
    }

    setTextInput("");
    setShowTextModal(false);
  };

  // Filter assets based on user role
  const visibleAssets = assets.filter(asset => {
    // For all users, show their own drawn signatures, uploaded images, and added text assets
    if ((asset.type === "signature" || asset.type === "image" || asset.type === "text") && asset.user === userRole) {
      return true;
    }

    // For notary only, show pre-made stamps and notary/owner assets
    if (userRole === "notary") {
      return asset.user === "notary" || asset.user === "owner";
    }

    // For owner, only show their own assets
    return false;
  });

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
        <>
          <button
            onClick={() => setShowSignaturePad(true)}
            style={{
              width: "100%",
              padding: "10px",
              marginBottom: "8px",
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
          <button
            onClick={() => setShowTextModal(true)}
            style={{
              width: "100%",
              padding: "10px",
              marginBottom: "15px",
              backgroundColor: "#0ea5a4",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            🅰️ Add Text
          </button>
          {userRole === "notary" && (
            <button
              onClick={() => onAssetBoxClick?.()}
              style={{
                width: "100%",
                padding: "10px",
                marginBottom: "15px",
                backgroundColor: "#7c3aed",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              📦 Add Asset Box
            </button>
          )}
        </>
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

      {/* Add Text Modal */}
      {showTextModal && (
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
              maxWidth: "420px",
              width: "calc(100% - 30px)",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: "10px" }}>Add Text Asset</h3>
            <input
              type="text"
              placeholder="Enter text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmitTextAsset();
              }}
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #d1d5db",
                borderRadius: "4px",
                marginBottom: "12px",
                boxSizing: "border-box",
              }}
              autoFocus
            />
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  setTextInput("");
                  setShowTextModal(false);
                }}
                style={{
                  padding: "8px 14px",
                  backgroundColor: "#e5e7eb",
                  color: "#111827",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitTextAsset}
                disabled={!textInput.trim()}
                style={{
                  padding: "8px 14px",
                  backgroundColor: textInput.trim() ? "#16a34a" : "#9ca3af",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: textInput.trim() ? "pointer" : "not-allowed",
                  fontWeight: "bold",
                }}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Asset List */}
      {showAssets && (
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
                position: "relative",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#e8f4f8";
                const deleteBtn = e.currentTarget.querySelector('[data-delete-btn]');
                if (deleteBtn) deleteBtn.style.display = "block";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "white";
                const deleteBtn = e.currentTarget.querySelector('[data-delete-btn]');
                if (deleteBtn) deleteBtn.style.display = "none";
              }}
            >
              <button
                data-delete-btn
                draggable={false}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDragStart={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  console.log("🖱️ Delete button clicked for:", asset.id);
                  e.preventDefault();
                  e.stopPropagation();
                  handleDeleteAsset(asset.id);
                }}
                style={{
                  position: "absolute",
                  top: "5px",
                  right: "5px",
                  background: "#dc2626",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  width: "28px",
                  height: "28px",
                  cursor: "pointer",
                  display: "none",
                  fontWeight: "bold",
                  fontSize: "14px",
                  padding: "0",
                  lineHeight: "1",
                  transition: "background 0.2s",
                  zIndex: 10,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#b91c1c";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#dc2626";
                }}
                title="Delete this asset"
              >
                🗑️
              </button>
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
      )}
    </div>
  );
};

export default SidebarAssets;

