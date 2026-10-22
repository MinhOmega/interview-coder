const { API_KEYS } = require("./config");
const { ipcRenderer } = require("electron");
const { IPC_CHANNELS } = require("./constants");

function maskApiKey(key) {
  if (!key || key.length < 8) return key;
  const firstFour = key.substring(0, 4);
  const lastFour = key.substring(key.length - 4);
  const maskedLength = key.length - 8;
  return firstFour + "*".repeat(maskedLength) + lastFour;
}

function updateApiKeyStatus(provider, message, type = "info") {
  const statusElement = document.getElementById(API_KEYS[provider].statusId);
  if (statusElement) {
    statusElement.textContent = message;
    statusElement.className = `api-key-status ${type}`;
  }
}

function saveApiKey(provider, key) {
  API_KEYS[provider].key = key;

  // Save to settings file via IPC with provider information
  ipcRenderer
    .invoke(IPC_CHANNELS.SAVE_API_KEY, key, provider)
    .then((success) => {
      if (success) {
        updateApiKeyStatus(provider, "API key saved successfully", "success");
      } else {
        updateApiKeyStatus(provider, "Failed to save API key", "error");
      }
    })
    .catch((err) => {
      console.error("Error saving API key:", err);
      updateApiKeyStatus(provider, "Error saving API key", "error");
    });
}

function loadApiKeys() {
  // Request all provider-specific API keys from the main process
  return ipcRenderer
    .invoke(IPC_CHANNELS.GET_ALL_API_KEYS)
    .then((apiKeys) => {
      const providerKeys = apiKeys && typeof apiKeys === "object" ? apiKeys : {};
      Object.keys(API_KEYS).forEach((provider) => {
        if (providerKeys[provider]) {
          API_KEYS[provider].key = providerKeys[provider];
          const input = document.getElementById(API_KEYS[provider].inputId);
          if (input) {
            input.value = maskApiKey(providerKeys[provider]);
            updateApiKeyStatus(provider, "API key loaded successfully", "success");
          }
        }
      });

      const legacyProviders = ["openai", "gemini"].filter((provider) => !providerKeys[provider]);
      if (legacyProviders.length === 0) return;

      return ipcRenderer.invoke(IPC_CHANNELS.GET_API_KEY).then((apiKey) => {
        if (!apiKey) return;
        legacyProviders.forEach((provider) => {
          API_KEYS[provider].key = apiKey;
          const input = document.getElementById(API_KEYS[provider].inputId);
          if (input) {
            input.value = maskApiKey(apiKey);
            updateApiKeyStatus(provider, "API key loaded successfully", "success");
          }
        });
      }).catch((err) => {
        console.error("Error loading legacy API key:", err);
      });
    })
    .catch((err) => {
      console.error("Error loading API keys:", err);
    });
}

function hasValidApiKey(provider) {
  return API_KEYS[provider] && API_KEYS[provider].key.trim() !== "";
}

async function validateAndFetchModels(provider, key, loadModelsCallback) {
  try {
    if (provider === "openai") {
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        updateApiKeyStatus(provider, "API key is valid", "success");
        if (loadModelsCallback) {
          loadModelsCallback();
        }
      } else {
        updateApiKeyStatus(provider, "Invalid API key", "error");
      }
    } else if (provider === "gemini") {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
      );
      if (response.ok) {
        updateApiKeyStatus(provider, "API key is valid", "success");
        if (loadModelsCallback) loadModelsCallback();
      } else if (response.status === 429) {
        updateApiKeyStatus(provider, "API quota or rate limit exceeded", "error");
      } else if (response.status === 400 || response.status === 401 || response.status === 403) {
        updateApiKeyStatus(provider, "Invalid or unauthorized API key", "error");
      } else {
        updateApiKeyStatus(provider, `Gemini validation failed (${response.status})`, "error");
      }
    }
  } catch (error) {
    console.error(`Error validating ${provider} API key:`, error);
    updateApiKeyStatus(provider, `Error: ${error.message}`, "error");
  }
}

module.exports = {
  maskApiKey,
  updateApiKeyStatus,
  saveApiKey,
  loadApiKeys,
  hasValidApiKey,
  validateAndFetchModels,
};
