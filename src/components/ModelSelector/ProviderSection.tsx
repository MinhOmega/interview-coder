import React from "react";

interface ProviderSectionProps {
  selectedProvider: string;
  onProviderChange: (provider: string) => void;
}

export const ProviderSection: React.FC<ProviderSectionProps> = ({ selectedProvider, onProviderChange }) => {
  return (
    <div className="section" id="provider-section">
      <h2>AI Provider</h2>
      <div className="radio-group">
        <label
          className={`radio-label ${selectedProvider === "openai" ? "selected" : ""}`}
          id="openai-radio-label"
          onClick={() => onProviderChange("openai")}
        >
          <input
            type="radio"
            name="aiProvider"
            value="openai"
            checked={selectedProvider === "openai"}
            onChange={() => onProviderChange("openai")}
          />
          <span>OpenAI</span>
          <span className="provider-badge openai">Requires API Key</span>
        </label>

        <label
          className={`radio-label ${selectedProvider === "ollama" ? "selected" : ""}`}
          id="ollama-radio-label"
          onClick={() => onProviderChange("ollama")}
        >
          <input
            type="radio"
            name="aiProvider"
            value="ollama"
            checked={selectedProvider === "ollama"}
            onChange={() => onProviderChange("ollama")}
          />
          <span>Ollama</span>
          <span className="provider-badge ollama">Local, free</span>
        </label>

        <label
          className={`radio-label ${selectedProvider === "gemini" ? "selected" : ""}`}
          id="gemini-radio-label"
          onClick={() => onProviderChange("gemini")}
        >
          <input
            type="radio"
            name="aiProvider"
            value="gemini"
            checked={selectedProvider === "gemini"}
            onChange={() => onProviderChange("gemini")}
          />
          <span>Gemini</span>
          <span className="provider-badge gemini">Google AI, Requires API Key</span>
        </label>
      </div>
    </div>
  );
};
