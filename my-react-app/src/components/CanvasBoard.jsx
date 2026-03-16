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
const DraggableImageElement = ({ element, onChange, onSelect, isSelected }) => {
  const image = useKonvaImage(element.image);
  const imageRef = useRef(null);
  const transformerRef = useRef(null);

  useEffect(() => {
    if (!isSelected || !transformerRef.current || !imageRef.current) return;

    transformerRef.current.nodes([imageRef.current]);
    transformerRef.current.getLayer()?.batchDraw();
  }, [isSelected, image]);

  if (!image) return null;

  return (
    <>
      <Image
        ref={imageRef}
        image={image}
        x={element.x}
        y={element.y}
        width={element.width || 100}
        height={element.height || 100}
        draggable
        onClick={() => onSelect(element.id)}
        onTap={() => onSelect(element.id)}
        onDragEnd={(e) => onChange(element.id, { x: e.target.x(), y: e.target.y() })}
        onTransformEnd={() => {
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
          });
        }}
        opacity={isSelected ? 0.8 : 1}
        stroke={isSelected ? "blue" : ""}
        strokeWidth={isSelected ? 2 : 0}
      />
      {isSelected && (
        <Transformer
          ref={transformerRef}
          rotateEnabled={false}
          enabledAnchors={[
            "top-left",
            "top-right",
            "bottom-left",
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
}) => {
  const stageRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);

  const handleElementChange = (id, updates) => {
    onElementUpdate(id, updates);
  };

  const handleKeyDown = (e) => {
    if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
      onElementRemove(selectedId);
      setSelectedId(null);
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId]);

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

    const newElement = {
      id: Date.now().toString(),
      image: data.image,
      x: safeX,
      y: safeY,
      width: defaultWidth,
      height: defaultHeight,
      type: data.type,
      user: data.user,
    };

    onElementAdd(newElement);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
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
      }}
    >
      <Stage ref={stageRef} width={canvasWidth} height={canvasHeight}>
        <Layer>
          {/* Render all elements */}
          {elements.map((element) => (
            <DraggableImageElement
              key={element.id}
              element={element}
              onChange={handleElementChange}
              onSelect={setSelectedId}
              isSelected={selectedId === element.id}
            />
          ))}
        </Layer>
      </Stage>

      {selectedId && (
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

    </div>
  );
};

export default CanvasBoard;
