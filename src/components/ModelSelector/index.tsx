import React, { useEffect, useState } from "react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { invokeIpcMethod, useElectron } from "../../hooks/useElectron";
import { GeminiSection } from "./GeminiSection";
import "./ModelSelector.css";
import { OllamaSection } from "./OllamaSection";
import { OpenAISection } from "./OpenAISection";
import { ProviderSection } from "./ProviderSection";

interface ModelSelectorProps {
  onClose: () => void;
}

interface ModelSettings {
  aiProvider: string;
  currentModel: string;
  ollamaUrl?: string;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ onClose }) => {
  const { ipcRenderer } = useElectron();
  const [settings, setSettings] = useState<ModelSettings>({
    aiProvider: "openai",
    currentModel: "gpt-4o-mini",
    ollamaUrl: "http://127.0.0.1:11434",
  });
  const [isSaving, setIsSaving] = useState(false);

  // Load current settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const currentSettings = await invokeIpcMethod<ModelSettings>("get-current-settings");
        if (currentSettings) {
          setSettings(currentSettings);
        }
      } catch (error) {
        console.error("Error getting current settings:", error);
        toast.warning("Settings system not fully initialized. Using default configuration.");

        // Try to get settings from localStorage as fallback
        try {
          const savedSettings = localStorage.getItem("model-settings");
          if (savedSettings) {
            setSettings(JSON.parse(savedSettings));
          }
        } catch (localStorageErr) {
          console.error("Error retrieving from localStorage:", localStorageErr);
        }
      }
    };

    loadSettings();

    // Close on ESC key
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Handle provider change
  const handleProviderChange = (provider: string) => {
    setSettings((prev) => ({ ...prev, aiProvider: provider }));
  };

  // Handle model selection change
  const handleModelChange = (model: string) => {
    setSettings((prev) => ({ ...prev, currentModel: model }));
  };

  // Handle Ollama URL change
  const handleOllamaUrlChange = (url: string) => {
    setSettings((prev) => ({ ...prev, ollamaUrl: url }));
  };

  // Handle save button click
  const handleSave = async () => {
    setIsSaving(true);

    try {
      // Ensure we always use IPv4 for Ollama
      let { aiProvider, currentModel, ollamaUrl } = settings;

      if (aiProvider === "ollama" && ollamaUrl) {
        ollamaUrl = ollamaUrl.replace("localhost", "127.0.0.1");

        // Test Ollama connection if using Ollama
        toast.info("Testing Ollama connection...");

        try {
          const response = await fetch(`${ollamaUrl}/api/version`, { method: "GET" });

          if (!response.ok) {
            toast.error(`Could not connect to Ollama at ${ollamaUrl}. Check if Ollama is running.`);
            setIsSaving(false);
            return;
          }
        } catch (error) {
          console.error("Ollama connection error:", error);
          toast.error(`Connection to Ollama failed: ${(error as Error).message}`);
          setIsSaving(false);
          return;
        }
      }

      // Update settings
      if (ipcRenderer) {
        ipcRenderer.send("update-model-settings", {
          aiProvider,
          currentModel,
          ollamaUrl,
        });

        toast.success("Settings saved!");
      } else {
        // Fallback to localStorage if IPC is not available
        localStorage.setItem("model-settings", JSON.stringify(settings));
      }

      // Dispatch a custom event for other components to listen for
      const event = new CustomEvent('model-settings-updated', { 
        detail: settings 
      });
      window.dispatchEvent(event);

      // Notify any parent windows about the update
      try {
        window.opener?.postMessage(
          {
            type: "model-settings-updated",
            settings,
          },
          "*",
        );
      } catch (e) {
        console.error("Error notifying parent window:", e);
      }

      // Close after a delay
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error(`Could not save settings: ${(error as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle clicking outside to close
  const handleOutsideClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="model-selector-container" onClick={handleOutsideClick}>
      <div className="model-selector-content">
        <h1>Select AI Model</h1>

        <ProviderSection selectedProvider={settings.aiProvider} onProviderChange={handleProviderChange} />

        {settings.aiProvider === "openai" && (
          <div className="section" id="openai-section">
            <OpenAISection currentModel={settings.currentModel} onModelChange={handleModelChange} />
          </div>
        )}

        {settings.aiProvider === "ollama" && (
          <div className="section" id="ollama-section">
            <OllamaSection
              currentModel={settings.currentModel}
              ollamaUrl={settings.ollamaUrl || "http://127.0.0.1:11434"}
              onModelChange={handleModelChange}
              onOllamaUrlChange={handleOllamaUrlChange}
            />
          </div>
        )}

        {settings.aiProvider === "gemini" && (
          <div className="section" id="gemini-section">
            <GeminiSection currentModel={settings.currentModel} onModelChange={handleModelChange} />
          </div>
        )}

        <div className="flex justify-between mt-6">
          <button className={`btn-success ${isSaving ? "disabled" : ""}`} onClick={handleSave} disabled={isSaving}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ marginRight: "6px" }}
            >
              <path
                d="M5 12L10 17L19 8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {isSaving ? "Saving..." : "Save Settings"}
          </button>

          <button className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>

        <ToastContainer
          position="top-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
        />
      </div>
    </div>
  );
};
