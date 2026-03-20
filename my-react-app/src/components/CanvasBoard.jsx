import React, { useRef, useState, useEffect } from "react";
import { Stage, Layer, Image, Transformer } from "react-konva";

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

  const selectedElement = elements.find((el) => el.id === selectedId);
  const notaryAssetBoxes = elements.filter((el) => el.type === "box" && el.user === "notary");
  // Notary can delete any asset; Owner can only delete their own
  const canDelete = !selectedElement || currentUserRole === 'notary' || selectedElement.user === currentUserRole;

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
