import React, { useState, useEffect, useRef } from "react";
import { useElectron, sendIpcMessage } from "../hooks/useElectron";
import { TopToolbar } from "./ui/TopToolbar";
import { LoadingContent } from "./ui/LoadingContent";
import { ResultContent } from "./ui/ResultContent";
import { InstructionBanner } from "./ui/InstructionBanner";
import { ModelBadge } from "./ui/ModelBadge";
import { NotificationContainer } from "./ui/NotificationContainer";
import { ContextActions } from "./ui/ContextActions";
import { ModelSelector } from "./ModelSelector";
import "../styles/AppContainer.css";
import "../styles/ClassicApp.css";

interface Notification {
  id: string;
  type: string;
  message: string;
}

const AppContainer: React.FC = () => {
  // App view state
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [isWindowVisible, setIsWindowVisible] = useState(true);
  
  // Content states
  const [instruction, setInstruction] = useState<string>("Use Cmd+H to take a screenshot");
  const [isInstructionVisible, setIsInstructionVisible] = useState(true);
  const [analysisResult, setAnalysisResult] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [view, setView] = useState<"queue" | "solutions" | "debug">("queue");
  
  // Notifications
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const notificationTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  
  // Streaming support
  const streamBufferRef = useRef("");
  
  const { ipcRenderer } = useElectron();
  
  // Main effect for IPC event handling
  useEffect(() => {
    if (!ipcRenderer) return;

    // Set up core IPC listeners
    const updateInstructionUnsubscribe = ipcRenderer.on("update-instruction", (instruction: string) => {
      setInstruction(instruction);
      setIsInstructionVisible(true);
    });
    
    const hideInstructionUnsubscribe = ipcRenderer.on("hide-instruction", () => {
      setIsInstructionVisible(false);
    });
    
    const updateVisibilityUnsubscribe = ipcRenderer.on("update-visibility", (isVisible: boolean) => {
      setIsWindowVisible(isVisible);
      document.body.classList.toggle("invisible-mode", !isVisible);
    });
    
    // Content-related events
    const analysisResultUnsubscribe = ipcRenderer.on("analysis-result", (result: string) => {
      setAnalysisResult(result);
      setIsLoading(false);
      setHasContent(!!result);
    });
    
    const loadingUnsubscribe = ipcRenderer.on("loading", (isLoading: boolean) => {
      setIsLoading(isLoading);
      if (isLoading) {
        setAnalysisResult("");
        setHasContent(false);
      }
    });
    
    const clearResultUnsubscribe = ipcRenderer.on("clear-result", () => {
      setAnalysisResult("");
      setHasContent(false);
    });

    // View state updates
    const updateViewUnsubscribe = ipcRenderer.on("update-view", (newView: "queue" | "solutions" | "debug") => {
      setView(newView);
    });
    
    const resetViewUnsubscribe = ipcRenderer.on("reset-view", () => {
      setView("queue");
      setAnalysisResult("");
      setHasContent(false);
    });
    
    // Screenshot events
    const screenshotTakenUnsubscribe = ipcRenderer.on("screenshot-taken", (data: { path: string, preview: string }) => {
      addNotification(`Screenshot taken: ${data.path}`, "success");
    });
    
    const deleteLastScreenshotUnsubscribe = ipcRenderer.on("delete-last-screenshot", () => {
      addNotification("Last screenshot deleted", "info");
    });
    
    // Model selector events
    const showModelSelectorUnsubscribe = ipcRenderer.on("show-model-selector", () => {
      setShowModelSelector(true);
      addNotification("Opening model selector", "info");
    });
    
    // Notification events
    const notificationUnsubscribe = ipcRenderer.on("notification", (data: { body: string; type: string }) => {
      addNotification(data.body, data.type);
    });
    
    const warningUnsubscribe = ipcRenderer.on("warning", (message: string) => {
      addNotification(message, "warning");
    });
    
    const errorUnsubscribe = ipcRenderer.on("error", (message: string) => {
      addNotification(message, "error");
    });
    
    // Streaming support
    const streamStartUnsubscribe = ipcRenderer.on("stream-start", () => {
      streamBufferRef.current = "";
      setAnalysisResult("");
      setIsLoading(false);
    });
    
    const streamChunkUnsubscribe = ipcRenderer.on("stream-chunk", (chunk: string) => {
      streamBufferRef.current += chunk;
      setAnalysisResult(streamBufferRef.current);
      setHasContent(true);
    });
    
    const streamUpdateUnsubscribe = ipcRenderer.on("stream-update", (fullText: string) => {
      streamBufferRef.current = fullText;
      setAnalysisResult(streamBufferRef.current);
      setHasContent(true);
    });
    
    const streamEndUnsubscribe = ipcRenderer.on("stream-end", () => {
      setAnalysisResult(streamBufferRef.current);
      streamBufferRef.current = "";
      setIsInstructionVisible(false);
      setHasContent(true);
    });
    
    // Just listen for ESC key to close model selector - everything else is handled by Electron
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showModelSelector) {
        setShowModelSelector(false);
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    
    // Cleanup all listeners on unmount
    return () => {
      updateInstructionUnsubscribe();
      hideInstructionUnsubscribe();
      updateVisibilityUnsubscribe();
      analysisResultUnsubscribe();
      loadingUnsubscribe();
      clearResultUnsubscribe();
      updateViewUnsubscribe();
      resetViewUnsubscribe();
      screenshotTakenUnsubscribe();
      deleteLastScreenshotUnsubscribe();
      showModelSelectorUnsubscribe();
      notificationUnsubscribe();
      warningUnsubscribe();
      errorUnsubscribe();
      streamStartUnsubscribe();
      streamChunkUnsubscribe();
      streamUpdateUnsubscribe();
      streamEndUnsubscribe();
      
      window.removeEventListener("keydown", handleKeyDown);
      
      // Clear any remaining notification timeouts
      notificationTimeoutsRef.current.forEach((timeout) => {
        clearTimeout(timeout);
      });
    };
  }, [ipcRenderer, showModelSelector]);

  // Function to add a notification with automatic removal
  const addNotification = (message: string, type: string = "success") => {
    const id = Date.now().toString();
    setNotifications((prev) => [...prev, { id, message, type }]);
    
    // Set timeout to remove notification after 5 seconds
    const timeout = setTimeout(() => {
      setNotifications((prev) => prev.filter((notification) => notification.id !== id));
      notificationTimeoutsRef.current.delete(id);
    }, 5000);
    
    notificationTimeoutsRef.current.set(id, timeout);
  };

  // Handlers for toolbar actions
  const handleToggleVisibility = () => {
    sendIpcMessage("toggle-visibility");
  };
  
  const handleProcessScreenshots = () => {
    sendIpcMessage("process-screenshots");
  };
  
  const handleTakeScreenshot = () => {
    sendIpcMessage("take-screenshot");
  };
  
  const handleReset = () => {
    sendIpcMessage("reset-process");
  };
  
  const handleOpenSettings = () => {
    setShowModelSelector(true);
  };
  
  const handleCloseSettings = () => {
    setShowModelSelector(false);
  };

  // Handle context actions
  const handleAddContextScreenshot = () => {
    sendIpcMessage("add-context-screenshot");
  };

  const handleReportError = () => {
    const errorDescription = prompt("Please describe the error in the solution:");
    if (errorDescription && errorDescription.trim() !== "") {
      sendIpcMessage("report-solution-error", errorDescription);
    }
  };

  // Render the appropriate view based on mode
  return (
    <>
      {showModelSelector && <ModelSelector onClose={handleCloseSettings} />}
      
      <div className={`app-container ${!isWindowVisible ? "invisible-mode" : ""}`}>
        {/* Top toolbar - always visible */}
        <TopToolbar
          onToggleVisibility={handleToggleVisibility}
          onProcess={handleProcessScreenshots}
          onAutoScreenshot={handleTakeScreenshot}
          onReset={handleReset}
          onSettings={handleOpenSettings}
        />

        {/* Content container */}
        <div className="content-container">
          {/* Instructions banner */}
          <InstructionBanner message={instruction} isVisible={isInstructionVisible} />

          {/* Main content area - shows analysis results */}
          <div className="content-area">
            <div className="main-content">
              {isLoading ? (
                <LoadingContent />
              ) : hasContent ? (
                <ResultContent markdown={analysisResult} />
              ) : (
                <div className="default-content">
                  <h2>Interview Coder</h2>
                  <p>Key Shortcuts:</p>
                  <ul>
                    <li>Cmd+H: Take screenshot</li>
                    <li>Cmd+Enter: Process screenshots</li>
                    <li>Cmd+R: Reset</li>
                    <li>Cmd+B: Toggle visibility</li>
                    <li>Cmd+L: Delete last screenshot</li>
                    <li>Cmd+[/]: Adjust opacity</li>
                    <li>Cmd+Arrow Keys: Move window</li>
                    <li>Cmd+Q: Quit application</li>
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Bottom UI elements */}
          {hasContent && <ContextActions onAddContext={handleAddContextScreenshot} onReportError={handleReportError} />}
          
          <ModelBadge />

          {/* Notifications - always visible */}
          <NotificationContainer notifications={notifications} />
        </div>
      </div>
    </>
  );
};

export default AppContainer;
