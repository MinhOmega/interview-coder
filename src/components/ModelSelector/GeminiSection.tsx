import React, { useState, useEffect } from "react";

interface GeminiSectionProps {
  currentModel: string;
  onModelChange: (model: string) => void;
}

interface GeminiModel {
  name: string;
  displayName: string;
  description?: string;
  inputTokenLimit?: number;
  supportedGenerationMethods: string[];
  inputSupportedMimeTypes?: string[];
  hasVision?: boolean;
}

// Add type declaration for Electron window interface
declare global {
  interface Window {
    electron?: {
      getEnvVariable: (key: string) => Promise<string | undefined>;
      ipcRenderer: {
        invoke: (channel: string, ...args: any[]) => Promise<any>;
        send: (channel: string, ...args: any[]) => void;
        on: (channel: string, callback: (...args: any[]) => void) => () => void;
        removeListener: (channel: string, callback: (...args: any[]) => void) => void;
      };
    };
    api?: {
      invoke: (channel: string, ...args: any[]) => Promise<any>;
    };
  }
}

// Function to safely get environment variables in an Electron app
const getEnvVariable = async (key: string): Promise<string | undefined> => {
  // First try using the IPC channel to securely get variables from main process
  if (typeof window !== 'undefined' && window.electron?.ipcRenderer) {
    try {
      return await window.electron.ipcRenderer.invoke('get-env-variable', key);
    } catch (error) {
      console.error(`Error getting environment variable via IPC: ${key}`, error);
    }
  }
  
  // For direct window electron access
  if (typeof window !== 'undefined' && window.api) {
    try {
      return await window.api.invoke('get-env-variable', key);
    } catch (error) {
      console.error(`Error invoking get-env-variable for ${key}:`, error);
    }
  }
  
  // For Vite, environment variables are prefixed with VITE_
  if (typeof import.meta !== 'undefined') {
    try {
      // Use type assertion for Vite's import.meta.env
      const env = (import.meta as any).env;
      const viteKey = `VITE_${key}`;
      if (env && env[viteKey]) {
        return env[viteKey];
      }
    } catch (error) {
      console.error(`Error accessing Vite env variables for ${key}:`, error);
    }
  }
  
  console.warn(`Could not find environment variable: ${key}. Please ensure it's defined in your .env file.`);
  return undefined;
};

export const GeminiSection: React.FC<GeminiSectionProps> = ({ currentModel, onModelChange }) => {
  const [models, setModels] = useState<GeminiModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Loading Gemini models...");
  const [statusType, setStatusType] = useState<"success" | "error" | "warning" | "">("");

  // Fetch Gemini models on component mount
  useEffect(() => {
    fetchGeminiModels();
  }, []);

  // Function to fetch Gemini models from the API
  const fetchGeminiModels = async () => {
    setLoading(true);
    setStatus("Loading Gemini models...");
    setStatusType("");

    try {
      // Get API key from environment variables
      const geminiApiKey = await getEnvVariable('GEMINI_API_KEY');

      if (!geminiApiKey) {
        setStatus("Error: No Gemini API key found. Please add it to your environment variables");
        setStatusType("error");
        setLoading(false);
        return;
      }

      // Make API request to get available models
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiApiKey}`);
      const data = await response.json();

      if (data && data.models) {
        // Filter for Gemini models
        const geminiModels = data.models.filter(
          (model: any) =>
            model.name.includes("gemini") &&
            !model.name.includes("embedding") &&
            model.supportedGenerationMethods.includes("generateContent"),
        );

        if (geminiModels.length === 0) {
          setStatus("No Gemini models found");
          setStatusType("error");
          setLoading(false);
          return;
        }

        // Process models to add hasVision flag and normalize structure
        const processedModels = geminiModels.map(
          (model: {
            name: string;
            displayName: string;
            description?: string;
            inputTokenLimit?: number;
            supportedGenerationMethods: string[];
            inputSupportedMimeTypes?: string[];
          }) => {
            const modelId = model.name.replace("models/", "");
            const hasVision =
              model.supportedGenerationMethods.includes("generateContent") &&
              model.inputSupportedMimeTypes &&
              model.inputSupportedMimeTypes.some((mime: string) => mime.includes("image"));

            return {
              ...model,
              id: modelId,
              hasVision,
            };
          },
        );

        // Group models by family (1.5, 2.0, etc.) for sorting
        const modelFamilies: Record<string, any[]> = {};
        processedModels.forEach(
          (model: {
            name: string;
            displayName: string;
            id: string;
            hasVision: boolean;
            description?: string;
            inputTokenLimit?: number;
            supportedGenerationMethods: string[];
            inputSupportedMimeTypes?: string[];
          }) => {
            const modelName = model.displayName.toLowerCase();
            let family = "other";

            if (modelName.includes("1.5")) family = "1.5";
            else if (modelName.includes("2.0")) family = "2.0";
            else if (modelName.includes("2.5")) family = "2.5";

            if (!modelFamilies[family]) modelFamilies[family] = [];
            modelFamilies[family].push(model);
          },
        );

        // Sort models within families
        for (const family in modelFamilies) {
          if (modelFamilies[family].length > 0) {
            modelFamilies[family].sort((a, b) => {
              const aName = a.displayName.toLowerCase();
              const bName = b.displayName.toLowerCase();

              // Flash models first (faster/cheaper)
              if (aName.includes("flash") && !bName.includes("flash")) return -1;
              if (!aName.includes("flash") && bName.includes("flash")) return 1;

              // Then Pro models
              if (aName.includes("pro") && !bName.includes("pro")) return aName.includes("flash") ? -1 : 1;
              if (!aName.includes("pro") && bName.includes("pro")) return bName.includes("flash") ? 1 : -1;

              return aName.localeCompare(bName);
            });
          }
        }

        // Merge all sorted families into a single array
        const sortedModels: any[] = [];
        ["1.5", "2.0", "2.5", "other"].forEach((family) => {
          if (modelFamilies[family]) {
            sortedModels.push(...modelFamilies[family]);
          }
        });

        setModels(sortedModels);
        setStatus(`${sortedModels.length} Gemini models available`);
        setStatusType("success");

        // Select the current model if it exists
        if (currentModel && !sortedModels.some((m) => m.name.replace("models/", "") === currentModel)) {
          // Default to a recommended model if the current one isn't available
          const defaultModel = sortedModels.find(
            (model) => model.name.includes("gemini-1.5-flash") || model.name.includes("gemini-pro"),
          );

          if (defaultModel) {
            const modelId = defaultModel.name.replace("models/", "");
            onModelChange(modelId);
          } else if (sortedModels.length > 0) {
            // Fall back to the first model
            const modelId = sortedModels[0].name.replace("models/", "");
            onModelChange(modelId);
          }
        }
      } else {
        setStatus("Error: Invalid response from Gemini API");
        setStatusType("error");
      }
    } catch (error) {
      console.error("Error fetching Gemini models:", error);
      setStatus(`Error: ${(error as Error).message}`);
      setStatusType("error");
    } finally {
      setLoading(false);
    }
  };

  // Format token limit for display
  const formatTokenLimit = (limit?: number): string => {
    if (!limit) return "";

    if (limit >= 1000000) {
      return (limit / 1000000).toFixed(1) + "M";
    } else if (limit >= 1000) {
      return (limit / 1000).toFixed(0) + "K";
    }
    return limit.toString();
  };

  return (
    <>
      <h2>Gemini Models</h2>

      <div id="gemini-loading" className={`flex justify-between items-center ${statusType}`}>
        {loading ? (
          <span>
            Loading Gemini models... <span className="loading"></span>
          </span>
        ) : (
          <span>{status}</span>
        )}
        <button className="btn-primary" onClick={fetchGeminiModels} disabled={loading}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ marginRight: "6px" }}
          >
            <path
              d="M20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12C4 7.58172 7.58172 4 12 4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path d="M16 4H12V8H16V4Z" fill="currentColor" />
          </svg>
          Refresh Models
        </button>
      </div>

      <div className="model-cards" id="gemini-model-cards" style={{ display: loading ? "none" : "grid" }}>
        {models.map((model) => {
          const modelId = model.name.replace("models/", "");
          return (
            <div
              key={modelId}
              className={`model-card ${currentModel === modelId ? "selected" : ""}`}
              data-model={modelId}
              onClick={() => onModelChange(modelId)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onModelChange(modelId);
                }
              }}
            >
              <div className="model-card-title">{model.displayName}</div>
              <div className="model-card-description">{model.description || "Google AI model"}</div>

              {model.inputTokenLimit && (
                <div className="model-card-badge">{formatTokenLimit(model.inputTokenLimit)} tokens</div>
              )}

              {model.hasVision && (
                <div className={`model-card-badge vision ${model.inputTokenLimit ? "second" : ""}`}>Vision</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="helper-text mt-2">Google Gemini requires an API key from Google AI Studio.</div>
    </>
  );
};
