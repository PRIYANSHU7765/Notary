import React, { useRef, useState, useEffect } from "react";
import { Stage, Layer, Image, Text } from "react-konva";

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
const DraggableImageElement = ({ element, onDragEnd, onSelect, isSelected }) => {
  const image = useKonvaImage(element.image);

  if (!image) return null;

  return (
    <Image
      image={image}
      x={element.x}
      y={element.y}
      width={element.width || 100}
      height={element.height || 100}
      draggable
      onClick={() => onSelect(element.id)}
      onDragEnd={(e) => onDragEnd(element.id, e.target.x(), e.target.y())}
      opacity={isSelected ? 0.8 : 1}
      stroke={isSelected ? "blue" : ""}
      strokeWidth={isSelected ? 2 : 0}
    />
  );
};

const CanvasBoard = ({ elements, onElementAdd, onElementUpdate, onElementRemove, canvasWidth = 800, canvasHeight = 600 }) => {
  const stageRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);

  const handleDragEnd = (id, x, y) => {
    onElementUpdate(id, { x, y });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Delete" && selectedId) {
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
    const data = JSON.parse(e.dataTransfer.getData("application/json"));
    
    const stage = stageRef.current.getStage();
    const point = stage.getPointerPosition();

    const newElement = {
      id: Date.now().toString(),
      image: data.image,
      x: point.x,
      y: point.y,
      width: 100,
      height: 100,
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
        border: "2px solid #333",
        borderRadius: "5px",
        backgroundColor: "#f9f9f9",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
      }}
    >
      <Stage ref={stageRef} width={canvasWidth} height={canvasHeight}>
        <Layer>
          {/* Background rectangle */}
          <Text x={10} y={10} text="Drop signatures & stamps here" fontSize={14} fill="#999" />

          {/* Render all elements */}
          {elements.map((element) => (
            <DraggableImageElement
              key={element.id}
              element={element}
              onDragEnd={handleDragEnd}
              onSelect={setSelectedId}
              isSelected={selectedId === element.id}
            />
          ))}
        </Layer>
      </Stage>

      {/* Help text */}
      <div style={{ position: "absolute", bottom: 10, left: 10, fontSize: "12px", color: "#666" }}>
        💡 Drag signatures from sidebar • Click to select • Press Delete to remove
      </div>
    </div>
  );
};

export default CanvasBoard;
