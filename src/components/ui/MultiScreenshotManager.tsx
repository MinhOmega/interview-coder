import React from "react";
import { sendIpcMessage } from "../../hooks/useElectron";
import "../../styles/MultiScreenshotManager.css";

interface Screenshot {
  id: string;
  preview: string;
  timestamp: number;
}

interface MultiScreenshotManagerProps {
  screenshots: Screenshot[];
  onRemoveScreenshot: (id: string) => void;
  onProcessScreenshots: () => void;
  onAddMoreScreenshot: () => void;
}

export const MultiScreenshotManager: React.FC<MultiScreenshotManagerProps> = ({
  screenshots,
  onRemoveScreenshot,
  onProcessScreenshots,
  onAddMoreScreenshot
}) => {
  // If no screenshots, don't render anything
  if (screenshots.length === 0) return null;
  
  return (
    <div className="multi-screenshot-manager">
      <div className="multi-screenshot-header">
        <h3>Multi-screenshot Mode ({screenshots.length} screenshots)</h3>
        <div className="multi-screenshot-actions">
          <button 
            className="add-screenshot-button" 
            onClick={onAddMoreScreenshot}
          >
            Add Screenshot
          </button>
          <button 
            className="process-screenshots-button" 
            onClick={onProcessScreenshots}
          >
            Process All
          </button>
        </div>
      </div>
      
      <div className="screenshot-grid">
        {screenshots.map((screenshot) => (
          <div className="screenshot-item" key={screenshot.id}>
            <div className="screenshot-preview">
              <img src={screenshot.preview} alt="Screenshot preview" />
            </div>
            <div className="screenshot-info">
              <span>{new Date(screenshot.timestamp).toLocaleTimeString()}</span>
              <button 
                className="remove-screenshot" 
                onClick={() => onRemoveScreenshot(screenshot.id)}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      
      <div className="screenshot-help-text">
        <p>Press Cmd+A (or Ctrl+A) to add more screenshots, or Cmd+Enter to analyze all.</p>
      </div>
    </div>
  );
}; 