import React, { useState, useEffect, useRef } from "react";
import { useElectron, sendIpcMessage } from "../hooks/useElectron";
import { toast, ToastContainer } from "react-toastify";
import { TopToolbar } from "./ui/TopToolbar";
import { LoadingContent } from "./ui/LoadingContent";
import { ResultContent } from "./ui/ResultContent";
import { InstructionBanner } from "./ui/InstructionBanner";
import { ModelBadge } from "./ui/ModelBadge";
import { ContextActions } from "./ui/ContextActions";
import { ModelSelector } from "./ModelSelector";
import { AreaSelector } from "./ui/AreaSelector";
import { MultiScreenshotManager } from "./ui/MultiScreenshotManager";
import screenshotService, { Screenshot } from "../services/ScreenshotService";
import "../styles/AppContainer.css";
import "../styles/ClassicApp.css";
import "react-toastify/dist/ReactToastify.css";

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

  // Streaming support
  const streamBufferRef = useRef("");

  // Screenshot states
  const [isAreaSelecting, setIsAreaSelecting] = useState(false);
  const [isMultiMode, setIsMultiMode] = useState(false);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);

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

      // If we were in multi-mode, exit it after processing
      if (isMultiMode) {
        setIsMultiMode(false);
        screenshotService.setMultiMode(false);
      }
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

      // Also clear screenshots
      setScreenshots([]);
      screenshotService.clearAll();
      setIsMultiMode(false);
    });

    // View state updates
    const updateViewUnsubscribe = ipcRenderer.on("update-view", (newView: "queue" | "solutions" | "debug") => {
      setView(newView);
    });

    const resetViewUnsubscribe = ipcRenderer.on("reset-view", () => {
      setView("queue");
      setAnalysisResult("");
      setHasContent(false);
      setScreenshots([]);
      screenshotService.clearAll();
      setIsMultiMode(false);
    });

    // Screenshot events
    const screenshotTakenUnsubscribe = ipcRenderer.on("screenshot-data", (data: string) => {
      const screenshot = screenshotService.addScreenshot(data);
      setScreenshots(screenshotService.getScreenshots());
      toast.success(`Screenshot taken`);

      // If in multi-mode, don't auto-process
      if (!isMultiMode) {
        handleProcessScreenshots();
      }
    });

    const areaScreenshotDataUnsubscribe = ipcRenderer.on("area-screenshot-data", (data: string) => {
      const screenshot = screenshotService.addScreenshot(data);
      setScreenshots(screenshotService.getScreenshots());
      toast.success(`Area screenshot taken`);

      // If in multi-mode, don't auto-process
      if (!isMultiMode) {
        handleProcessScreenshots();
      }
    });

    const deleteLastScreenshotUnsubscribe = ipcRenderer.on("delete-last-screenshot", () => {
      // Remove the last screenshot
      const allScreenshots = screenshotService.getScreenshots();
      if (allScreenshots.length > 0) {
        const lastId = allScreenshots[allScreenshots.length - 1].id;
        screenshotService.removeScreenshot(lastId);
        setScreenshots(screenshotService.getScreenshots());
      }
      toast.info("Last screenshot deleted");
    });

    // Multi-mode events
    const startMultiModeUnsubscribe = ipcRenderer.on("start-multi-mode", () => {
      setIsMultiMode(true);
      screenshotService.setMultiMode(true);

      // Clear existing screenshots if any
      if (screenshotService.getCount() > 0) {
        screenshotService.clearAll();
        setScreenshots([]);
      }

      toast.info("Multi-screenshot mode activated. Take multiple screenshots and process them together.");
    });

    // Area selection events
    const startAreaCaptureUnsubscribe = ipcRenderer.on("start-area-capture", () => {
      setIsAreaSelecting(true);
      toast.info("Select an area to capture");
    });

    // Model selector events
    const showModelSelectorUnsubscribe = ipcRenderer.on("show-model-selector", () => {
      setShowModelSelector(true);
      toast.info("Opening model selector");
    });

    // Notification events
    const handleNotificationAction = (actionId: string, actionData: any) => {
      if (actionId === "open-directory") {
        sendIpcMessage("open-directory", actionData);
      }
    };

    const notificationUnsubscribe = ipcRenderer.on(
      "notification",
      (data: { body: string; type: string; actions?: Array<{ id: string; label: string; data: any }> }) => {
        if (data.actions && data.actions.length > 0) {
          // Create a custom toast with actions
          const toastMethod =
            data.type === "success"
              ? toast.success
              : data.type === "error"
              ? toast.error
              : data.type === "warning"
              ? toast.warning
              : toast.info;

          toastMethod(
            <div className="notification-with-actions">
              <div className="notification-body">{data.body}</div>
              <div className="notification-actions">
                {data.actions.map((action) => (
                  <button
                    key={action.id}
                    className={`action-button ${action.id}`}
                    onClick={() => handleNotificationAction(action.id, action.data)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>,
          );
        } else {
          // Regular toast without actions
          switch (data.type) {
            case "success":
              toast.success(data.body);
              break;
            case "error":
              toast.error(data.body);
              break;
            case "warning":
              toast.warning(data.body);
              break;
            case "info":
            default:
              toast.info(data.body);
              break;
          }
        }
      },
    );

    const warningUnsubscribe = ipcRenderer.on("warning", (message: string) => {
      toast.warning(message);
    });

    const errorUnsubscribe = ipcRenderer.on("error", (message: string) => {
      toast.error(message);
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

      // If we were in multi-mode, exit it after processing
      if (isMultiMode) {
        setIsMultiMode(false);
        screenshotService.setMultiMode(false);
      }
    });

    // Just listen for ESC key to close model selector - everything else is handled by Electron
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showModelSelector) {
          setShowModelSelector(false);
        }
        if (isAreaSelecting) {
          setIsAreaSelecting(false);
        }
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
      areaScreenshotDataUnsubscribe();
      deleteLastScreenshotUnsubscribe();
      startMultiModeUnsubscribe();
      startAreaCaptureUnsubscribe();
      showModelSelectorUnsubscribe();
      notificationUnsubscribe();
      warningUnsubscribe();
      errorUnsubscribe();
      streamStartUnsubscribe();
      streamChunkUnsubscribe();
      streamUpdateUnsubscribe();
      streamEndUnsubscribe();

      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [ipcRenderer, showModelSelector, isAreaSelecting, isMultiMode]);

  // Handlers for toolbar actions
  const handleToggleVisibility = () => {
    sendIpcMessage("toggle-visibility");
  };

  const handleProcessScreenshots = () => {
    if (screenshots.length === 0) {
      toast.warning("No screenshots to process. Take a screenshot first.");
      return;
    }

    setIsLoading(true);
    sendIpcMessage(
      "process-screenshots-with-ai",
      screenshots.map((s) => s.data),
    );
  };

  const handleTakeScreenshot = async () => {
    try {
      setIsLoading(true);
      await screenshotService.takeFullScreenshot();
      // The event handler will update the UI
    } catch (error) {
      console.error("Error taking screenshot:", error);
      toast.error("Failed to take screenshot");
      setIsLoading(false);
    }
  };

  const handleAreaScreenshot = () => {
    setIsAreaSelecting(true);
  };

  const handleCancelAreaSelection = () => {
    setIsAreaSelecting(false);
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

  // Multi-screenshot mode handlers
  const handleStartMultiMode = () => {
    setIsMultiMode(true);
    screenshotService.setMultiMode(true);

    // Clear existing screenshots if any
    if (screenshotService.getCount() > 0) {
      screenshotService.clearAll();
      setScreenshots([]);
    }

    toast.info("Multi-screenshot mode activated. Take multiple screenshots and process them together.");
    setInstruction("Multi-mode: Take screenshots with Cmd+A, process with Cmd+Enter");
    setIsInstructionVisible(true);
  };

  const handleExitMultiMode = () => {
    setIsMultiMode(false);
    screenshotService.setMultiMode(false);

    if (screenshots.length > 0) {
      // Ask if user wants to process screenshots before exiting
      if (window.confirm("Do you want to process the screenshots before exiting multi-mode?")) {
        handleProcessScreenshots();
      } else {
        // Clear screenshots
        screenshotService.clearAll();
        setScreenshots([]);
      }
    }

    setInstruction("Use Cmd+H to take a screenshot");
    setIsInstructionVisible(true);
  };

  const handleAddScreenshotToMultiMode = async () => {
    try {
      await screenshotService.takeFullScreenshot();
      // The event handler will update the UI
    } catch (error) {
      console.error("Error adding screenshot to multi-mode:", error);
      toast.error("Failed to add screenshot");
    }
  };

  const handleRemoveScreenshot = (id: string) => {
    screenshotService.removeScreenshot(id);
    setScreenshots(screenshotService.getScreenshots());
  };

  // Handle context actions
  const handleAddContextScreenshot = () => {
    sendIpcMessage("add-context-screenshot");
  };

  const handleReportError = () => {
    const errorDescription = prompt("Please describe the error in the solution:");
    if (errorDescription && errorDescription.trim() !== "") {
      screenshotService.reportSolutionError(errorDescription);
    }
  };

  // Render the appropriate view based on mode
  return (
    <>
      {showModelSelector && <ModelSelector onClose={handleCloseSettings} />}
      {isAreaSelecting && <AreaSelector onCancel={handleCancelAreaSelection} />}

      <div className={`app-container ${!isWindowVisible ? "invisible-mode" : ""}`}>
        {/* Top toolbar - always visible */}
        <TopToolbar
          onToggleVisibility={handleToggleVisibility}
          onProcess={handleProcessScreenshots}
          onAutoScreenshot={handleTakeScreenshot}
          onAreaScreenshot={handleAreaScreenshot}
          onReset={handleReset}
          onSettings={handleOpenSettings}
          onStartMultiMode={handleStartMultiMode}
          isMultiMode={isMultiMode}
          onExitMultiMode={handleExitMultiMode}
        />

        {/* Multi-screenshot manager */}
        {isMultiMode && (
          <MultiScreenshotManager
            screenshots={screenshots}
            onRemoveScreenshot={handleRemoveScreenshot}
            onProcessScreenshots={handleProcessScreenshots}
            onAddMoreScreenshot={handleAddScreenshotToMultiMode}
          />
        )}

        {/* Content container */}
        <div className="content-container">
          {/* Instruction banner */}
          {/* {isInstructionVisible && <InstructionBanner instruction={instruction} />} */}

          {/* Loading content */}
          {isLoading && <LoadingContent message="Processing your screenshot..." />}

          {/* Result content */}
          {hasContent && !isLoading && (
            <div className="result-wrapper">
              <ResultContent markdownContent={analysisResult} />
              <ContextActions onAddContext={handleAddContextScreenshot} onReportError={handleReportError} />
            </div>
          )}

          {/* Model badge - always visible */}
          <ModelBadge onOpenSettings={handleOpenSettings} />
        </div>

        {/* Toast container for notifications */}
        <ToastContainer
          position="bottom-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop={true}
          closeOnClick
          pauseOnFocusLoss={false}
          draggable
          pauseOnHover
          theme="dark"
        />
      </div>
    </>
  );
};

export default AppContainer;
