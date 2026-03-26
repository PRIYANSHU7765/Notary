import React, { useRef, useState, useEffect } from "react";
import { Stage, Layer, Image, Transformer } from "react-konva";
import SignaturePad from "./SignaturePad";

// Custom hook to load images
const useKonvaImage = (src) => {
  const [image, setImage] = useState(null);

  useEffect(() => {
    if (!src) return;

    const img = new window.Image();
    img.src = src;
    img.onload = () => setImage(img);
  }, [src]);

  return image;
};

// Draggable Image Component
const DraggableImageElement = ({ element, onChange, onSelect, isSelected, notaryAssetBoxes = [], currentUserRole = 'owner', onInvalidDrag }) => {
  const image = useKonvaImage(element.image);
  const imageRef = useRef(null);
  const transformerRef = useRef(null);
  const originalPosRef = useRef({ x: element.x, y: element.y });

  useEffect(() => {
    originalPosRef.current = { x: element.x, y: element.y };
  }, [element.id]);

  useEffect(() => {
    if (!isSelected || !transformerRef.current || !imageRef.current) return;

    transformerRef.current.nodes([imageRef.current]);
    transformerRef.current.getLayer()?.batchDraw();
  }, [isSelected, image]);

  if (!image) return null;

  const handleDragEnd = (e) => {
    const newX = e.target.x();
    const newY = e.target.y();
    const newW = element.width || 100;
    const newH = element.height || 100;

    // For owner, validate that the element stays inside a notary box
    if (currentUserRole === "owner" && element.user === "owner") {
      const isInsideBox = notaryAssetBoxes.some((box) => {
        const boxX = Number(box.x) || 0;
        const boxY = Number(box.y) || 0;
        const boxW = Number(box.width) || 0;
        const boxH = Number(box.height) || 0;

        return (
          newX >= boxX &&
          newX + newW <= boxX + boxW &&
          newY >= boxY &&
          newY + newH <= boxY + boxH
        );
      });

      if (!isInsideBox) {
        onInvalidDrag?.("Place it in the box");
        // Revert to original position
        e.target.x(originalPosRef.current.x);
        e.target.y(originalPosRef.current.y);
        return;
      }
    }

    onChange(element.id, { x: newX, y: newY });
  };

  return (
    <>
      <Image
        ref={imageRef}
        image={image}
        x={element.x}
        y={element.y}
        width={element.width || 100}
        height={element.height || 100}
        draggable={currentUserRole === "notary" || element.user === currentUserRole}
        onClick={() => onSelect(element.id)}
        onTap={() => onSelect(element.id)}
        onDragEnd={handleDragEnd}
        onTransformEnd={() => {
          // Only allow transform if user owns the asset or is notary (notary can transform anything)
          if (currentUserRole !== "notary" && element.user !== currentUserRole) {
            return;
          }

          const node = imageRef.current;
          if (!node) return;

          const scaleX = node.scaleX();
          const scaleY = node.scaleY();

          node.scaleX(1);
          node.scaleY(1);

          const minSize = 24;
          onChange(element.id, {
            x: node.x(),
            y: node.y(),
            width: Math.max(minSize, node.width() * scaleX),
            height: Math.max(minSize, node.height() * scaleY),
            rotation: node.rotation(),
          });
        }}
        rotation={element.rotation || 0}
        opacity={isSelected ? 0.8 : 1}
        stroke={isSelected ? "blue" : ""}
        strokeWidth={isSelected ? 2 : 0}
      />
      {isSelected && (currentUserRole === "notary" || element.user === currentUserRole) && (
        <Transformer
          ref={transformerRef}
          rotateEnabled={true}
          keepRatio={false}
          enabledAnchors={[
            "top-left",
            "top-center",
            "top-right",
            "middle-left",
            "middle-right",
            "bottom-left",
            "bottom-center",
            "bottom-right",
          ]}
          boundBoxFunc={(oldBox, newBox) => {
            const minSize = 24;
            if (Math.abs(newBox.width) < minSize || Math.abs(newBox.height) < minSize) {
              return oldBox;
            }
            return newBox;
          }}
        />
      )}
    </>
  );
};

const CanvasBoard = ({
  elements,
  onElementAdd,
  onElementUpdate,
  onElementRemove,
  canvasWidth = 800,
  canvasHeight = 600,
  overlayMode = false,
  isAssetBoxMode = false,
  onCreateAssetBox,
  currentUserRole = 'owner',
}) => {
  const stageRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  const [toastMessage, setToastMessage] = useState("");
  const toastTimerRef = useRef(null);

  const showToast = (message) => {
    setToastMessage(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage("");
      toastTimerRef.current = null;
    }, 2200);
  };

  const [boxTextInput, setBoxTextInput] = useState("");
  const [showBoxTextModal, setShowBoxTextModal] = useState(false);
  const [showBoxSignatureModal, setShowBoxSignatureModal] = useState(false);

  const selectedElement = elements.find((el) => el.id === selectedId);
  const notaryAssetBoxes = elements.filter((el) => el.type === "box" && el.user === "notary");
  // Notary can delete any asset; Owner can only delete their own
  const canDelete = !selectedElement || currentUserRole === 'notary' || selectedElement.user === currentUserRole;

  const createTextAssetImage = (text) => {
    const escapedText = (text || "Text").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
    const svg = `<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 360 90\"><text x=\"18\" y=\"56\" font-family=\"Segoe UI, Arial, sans-serif\" font-size=\"28\" font-weight=\"700\" fill=\"#111827\">${escapedText}</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  };

  const createSignatureAssetImage = (text) => {
    const escapedText = (text || "Signature").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
    const svg = `<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 300 90\"><text x=\"12\" y=\"52\" font-family=\"cursive, Segoe Print, Arial\" font-size=\"36\" fill=\"#0f172a\">${escapedText}</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  };

  const openAddTextBoxModal = () => {
    if (!selectedElement || selectedElement.type !== 'box' || selectedElement.user !== 'notary') return;
    setBoxTextInput("");
    setShowBoxTextModal(true);
  };

  const openAddSignatureModal = () => {
    if (!selectedElement || selectedElement.type !== 'box' || selectedElement.user !== 'notary') return;
    setShowBoxSignatureModal(true);
  };

  const addTextAssetToSelectedBox = (text) => {
    if (!selectedElement || selectedElement.type !== 'box' || selectedElement.user !== 'notary') return;

    const margin = 8;
    const width = Math.max(72, (selectedElement.width || 100) - margin * 2);
    const height = Math.max(36, (selectedElement.height || 80) / 4);

    const newTextElement = {
      id: `text-${Date.now()}`,
      image: createTextAssetImage(text || 'New Text'),
      x: (selectedElement.x || 0) + margin,
      y: (selectedElement.y || 0) + margin,
      width,
      height,
      type: 'text',
      user: 'owner',
    };

    onElementAdd(newTextElement);
    setSelectedId(null);
  };

  const addSignatureAssetToSelectedBox = (signatureImage) => {
    if (!selectedElement || selectedElement.type !== 'box' || selectedElement.user !== 'notary') return;

    const margin = 8;
    const width = Math.max(72, (selectedElement.width || 100) - margin * 2);
    const height = Math.max(40, (selectedElement.height || 80) / 3);

    const newSignatureElement = {
      id: `signature-${Date.now()}`,
      image: signatureImage || createSignatureAssetImage('Owner'),
      x: (selectedElement.x || 0) + margin,
      y: (selectedElement.y || 0) + (selectedElement.height || 80) - height - margin,
      width,
      height,
      type: 'signature',
      user: 'owner',
    };

    onElementAdd(newSignatureElement);
    setSelectedId(null);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const handleElementChange = (id, updates) => {
    onElementUpdate(id, updates);
  };

  const handleKeyDown = (e) => {
    if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
      onElementRemove(selectedId);
      setSelectedId(null);
    }
    if (e.key === "Escape" && isAssetBoxMode) {
      onCreateAssetBox?.(null);
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, isAssetBoxMode]);

  // Handle dropping from sidebar
  const handleDrop = (e) => {
    e.preventDefault();
    let data = null;

    try {
      const raw = e.dataTransfer.getData("application/json");
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }

    if (!data?.image) return;

    const stage = stageRef.current?.getStage();
    if (!stage) return;

    // Align drop coordinates to the Konva stage even when dragged from external DOM nodes.
    stage.setPointersPositions(e.nativeEvent);
    const pointer = stage.getPointerPosition();
    const rect = stage.container().getBoundingClientRect();
    const xFromEvent = e.clientX - rect.left;
    const yFromEvent = e.clientY - rect.top;

    const rawX = pointer?.x ?? xFromEvent;
    const rawY = pointer?.y ?? yFromEvent;
    const safeX = Math.max(0, Math.min(rawX, canvasWidth - 1));
    const safeY = Math.max(0, Math.min(rawY, canvasHeight - 1));

    const defaultWidth = Math.max(24, Number(data.width) || 100);
    const defaultHeight = Math.max(24, Number(data.height) || 100);

    let nextX = safeX;
    let nextY = safeY;
    let nextWidth = defaultWidth;
    let nextHeight = defaultHeight;

    if (currentUserRole === "owner") {
      if (notaryAssetBoxes.length === 0) {
        showToast("Wait for notary to create asset box");
        return;
      }

      const targetBox = notaryAssetBoxes.find((box) => {
        const boxX = Number(box.x) || 0;
        const boxY = Number(box.y) || 0;
        const boxW = Number(box.width) || 0;
        const boxH = Number(box.height) || 0;

        return (
          safeX >= boxX &&
          safeX <= boxX + boxW &&
          safeY >= boxY &&
          safeY <= boxY + boxH
        );
      });

      if (!targetBox) {
        showToast("Place it in the box");
        return;
      }

      // Fit owner asset completely inside the target notary box.
      const boxX = Number(targetBox.x) || 0;
      const boxY = Number(targetBox.y) || 0;
      const boxW = Math.max(24, Number(targetBox.width) || 0);
      const boxH = Math.max(24, Number(targetBox.height) || 0);
      const boxPadding = Math.min(8, boxW * 0.08, boxH * 0.08);
      const innerW = Math.max(24, boxW - boxPadding * 2);
      const innerH = Math.max(24, boxH - boxPadding * 2);

      const elementAspect = defaultWidth / defaultHeight;
      const boxAspect = innerW / innerH;

      if (elementAspect > boxAspect) {
        nextWidth = innerW;
        nextHeight = Math.max(24, innerW / elementAspect);
      } else {
        nextHeight = innerH;
        nextWidth = Math.max(24, innerH * elementAspect);
      }

      nextX = boxX + (boxW - nextWidth) / 2;
      nextY = boxY + (boxH - nextHeight) / 2;
    }

    const newElement = {
      id: Date.now().toString(),
      image: data.image,
      x: nextX,
      y: nextY,
      width: nextWidth,
      height: nextHeight,
      type: data.type,
      user: data.user,
    };

    onElementAdd(newElement);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleStageClick = (e) => {
    if (isAssetBoxMode) {
      const stage = stageRef.current?.getStage();
      if (!stage) return;

      stage.setPointersPositions(e.nativeEvent);
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      onCreateAssetBox?.(pointer.x, pointer.y);
      return;
    }

    // Deselect when clicking on empty stage area (not on elements)
    if (e.target === e.target.getStage()) {
      setSelectedId(null);
    }
  };

  return (
    <div
      className="canvas-board"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      style={{
        border: overlayMode ? "none" : "2px solid #333",
        borderRadius: "5px",
        backgroundColor: overlayMode ? "transparent" : "#f9f9f9",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
        cursor: isAssetBoxMode ? "crosshair" : "default",
      }}
    >
      <Stage ref={stageRef} width={canvasWidth} height={canvasHeight} onClick={handleStageClick} style={{ cursor: isAssetBoxMode ? "crosshair" : "default" }}>
        <Layer>
          {/* Render all elements */}
          {elements.map((element) => (
            <DraggableImageElement
              key={element.id}
              element={element}
              onChange={handleElementChange}
              onSelect={setSelectedId}
              isSelected={selectedId === element.id}
              notaryAssetBoxes={notaryAssetBoxes}
              currentUserRole={currentUserRole}
              onInvalidDrag={showToast}
            />
          ))}
        </Layer>
      </Stage>

      {selectedId && canDelete && (
        <button
          type="button"
          onClick={() => {
            onElementRemove(selectedId);
            setSelectedId(null);
          }}
          style={{
            position: "absolute",
            top: "10px",
            right: "10px",
            zIndex: 20,
            backgroundColor: "#dc2626",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            padding: "6px 10px",
            fontSize: "12px",
            fontWeight: "bold",
            cursor: "pointer",
          }}
          title="Delete selected asset"
        >
          Delete Selected
        </button>
      )}

      {selectedElement && selectedElement.type === 'box' && selectedElement.user === 'notary' && currentUserRole === 'owner' && (
        <div
          style={{
            position: 'absolute',
            left: Math.min((selectedElement.x || 0) + (selectedElement.width || 0) + 10, canvasWidth - 170),
            top: Math.min(selectedElement.y || 0, canvasHeight - 140),
            zIndex: 25,
            backgroundColor: '#fff',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            padding: '8px',
            boxShadow: '0 10px 24px rgba(0,0,0,0.18)',
            minWidth: '150px',
          }}
        >
          <div style={{ marginBottom: '6px', fontSize: '12px', fontWeight: 700, color: '#1f2937' }}>
            Box actions
          </div>
          <button
            type="button"
            onClick={openAddTextBoxModal}
            style={{
              width: '100%',
              marginBottom: '5px',
              borderRadius: '5px',
              border: '1px solid #60a5fa',
              background: '#eff6ff',
              color: '#1d4ed8',
              padding: '6px 8px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Add text box
          </button>
          <button
            type="button"
            onClick={openAddSignatureModal}
            style={{
              width: '100%',
              borderRadius: '5px',
              border: '1px solid #34d399',
              background: '#ecfdf5',
              color: '#065f46',
              padding: '6px 8px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Add signature
          </button>
        </div>
      )}

      {showBoxTextModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1001,
          }}
        >
          <div
            style={{
              width: 'max(320px, min(90vw, 420px))',
              background: '#fff',
              borderRadius: '10px',
              padding: '18px',
              boxShadow: '0 12px 30px rgba(0,0,0,0.25)',
            }}
          >
            <h3 style={{ margin: '0 0 12px', color: '#334155' }}>Add Text Asset</h3>
            <input
              value={boxTextInput}
              onChange={(e) => setBoxTextInput(e.target.value)}
              placeholder="Enter text"
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                marginBottom: '12px',
                boxSizing: 'border-box',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  addTextAssetToSelectedBox(boxTextInput);
                  setShowBoxTextModal(false);
                  setBoxTextInput('');
                }
              }}
              autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => {
                  setShowBoxTextModal(false);
                  setBoxTextInput('');
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#f1f5f9',
                  color: '#334155',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  addTextAssetToSelectedBox(boxTextInput);
                  setShowBoxTextModal(false);
                  setBoxTextInput('');
                }}
                disabled={!boxTextInput.trim()}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: boxTextInput.trim() ? '#16a34a' : '#94a3b8',
                  color: '#fff',
                  cursor: boxTextInput.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {showBoxSignatureModal && selectedElement && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1001,
          }}
        >
          <div
            style={{
              width: 'max(340px, min(95vw, 520px))',
              background: '#fff',
              borderRadius: '10px',
              padding: '16px',
              boxShadow: '0 12px 28px rgba(0,0,0,0.26)',
            }}
          >
            <h3 style={{ margin: '0 0 10px', color: '#334155' }}>Draw Owner Signature</h3>
            <SignaturePad
              onSignatureGenerated={(imageUrl) => {
                addSignatureAssetToSelectedBox(imageUrl);
                setShowBoxSignatureModal(false);
              }}
              title="Draw signature"
            />
            <button
              onClick={() => setShowBoxSignatureModal(false)}
              style={{
                width: '100%',
                marginTop: '8px',
                padding: '10px',
                borderRadius: '8px',
                border: 'none',
                background: '#dc2626',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {selectedId && !canDelete && (
        <div
          style={{
            position: "absolute",
            top: "10px",
            right: "10px",
            zIndex: 20,
            backgroundColor: "#fca5ac",
            color: "#7c2d3b",
            border: "1px solid #dc2626",
            borderRadius: "6px",
            padding: "8px 12px",
            fontSize: "12px",
            fontWeight: "bold",
          }}
          title="Only the user who added this asset can delete it"
        >
          ⚠️ Cannot delete (added by {selectedElement?.user})
        </div>
      )}

      {toastMessage && (
        <div
          style={{
            position: "fixed",
            top: "18px",
            right: "18px",
            zIndex: 9999,
            backgroundColor: "rgba(17, 24, 39, 0.95)",
            color: "#fff",
            padding: "14px 18px",
            borderRadius: "12px",
            fontSize: "14px",
            fontWeight: "700",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            minWidth: "220px",
            boxShadow: "0 12px 30px rgba(0,0,0,0.25)",
            textAlign: "center",
          }}
          role="status"
          aria-live="polite"
        >
          {toastMessage}
        </div>
      )}

    </div>
  );
};

export default CanvasBoard;
