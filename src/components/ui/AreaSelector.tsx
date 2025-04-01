import React, { useState, useRef, useEffect } from "react";
import { sendIpcMessage } from "../../hooks/useElectron";
import "../../styles/AreaSelector.css";

interface Point {
  x: number;
  y: number;
}

interface AreaSelectorProps {
  onCancel: () => void;
}

export const AreaSelector: React.FC<AreaSelectorProps> = ({ onCancel }) => {
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [endPoint, setEndPoint] = useState<Point | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);

  // Handle mouse down to start selection
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsSelecting(true);
    setStartPoint({ x: e.clientX, y: e.clientY });
    setEndPoint({ x: e.clientX, y: e.clientY });
  };

  // Handle mouse move to update selection area
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isSelecting) return;
    setEndPoint({ x: e.clientX, y: e.clientY });
  };

  // Handle mouse up to finish selection
  const handleMouseUp = () => {
    if (!isSelecting || !startPoint || !endPoint) return;
    setIsSelecting(false);
    
    // Calculate the selected area
    const selectedArea = {
      x: Math.min(startPoint.x, endPoint.x),
      y: Math.min(startPoint.y, endPoint.y),
      width: Math.abs(endPoint.x - startPoint.x),
      height: Math.abs(endPoint.y - startPoint.y),
    };
    
    // Ensure we have a minimum selection size
    if (selectedArea.width < 10 || selectedArea.height < 10) {
      onCancel();
      return;
    }
    
    // Capture the selected area
    sendIpcMessage("capture-selected-area", selectedArea);
    onCancel();
  };

  // Handle keyboard events for ESC to cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  // Calculate selection rectangle style
  const getSelectionStyle = () => {
    if (!startPoint || !endPoint) return {};
    
    return {
      left: Math.min(startPoint.x, endPoint.x),
      top: Math.min(startPoint.y, endPoint.y),
      width: Math.abs(endPoint.x - startPoint.x),
      height: Math.abs(endPoint.y - startPoint.y),
    };
  };

  return (
    <div 
      className="area-selector-overlay"
      ref={selectorRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <div className="area-selector-instructions">
        Click and drag to select an area
      </div>
      
      {startPoint && endPoint && (
        <div className="area-selection" style={getSelectionStyle()}>
          <div className="selection-size">
            {Math.abs(endPoint.x - startPoint.x)} x {Math.abs(endPoint.y - startPoint.y)}
          </div>
        </div>
      )}
    </div>
  );
}; 