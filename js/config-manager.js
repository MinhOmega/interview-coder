const { AI_PROVIDERS } = require("./constants");
const fs = require("fs");
const { app } = require("electron");
const { getUserDataPath } = require("./utils");

let OLLAMA_BASE_URL = "http://127.0.0.1:11434";
let AZURE_FOUNDRY_ENDPOINT = "";
let aiProvider = AI_PROVIDERS.DEFAULT;
let currentModel = "";
let responseLanguage = "en"; // en = English

// Available language options
const LANGUAGES = {
  en: { code: "en", name: "English", nativeName: "English" },
  vi: { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt" },
  es: { code: "es", name: "Spanish", nativeName: "Español" },
  fr: { code: "fr", name: "French", nativeName: "Français" },
  de: { code: "de", name: "German", nativeName: "Deutsch" },
  ja: { code: "ja", name: "Japanese", nativeName: "日本語" },
  ko: { code: "ko", name: "Korean", nativeName: "한국어" },
  zh: { code: "zh", name: "Chinese", nativeName: "中文" },
};

// Get user data directory for settings file
const getSettingsFilePath = () => {
  return getUserDataPath("interview-coder-settings.json");
};

/**
 * Loads settings from file
 * @returns {boolean} True if settings were loaded successfully, false otherwise
 */
function loadSettingsFromFile() {
  try {
    if (!app) return false;

    const settingsFilePath = getSettingsFilePath();

    if (fs.existsSync(settingsFilePath)) {
      const settingsData = fs.readFileSync(settingsFilePath, "utf8");
      const settings = JSON.parse(settingsData);

      if (settings.aiProvider) aiProvider = settings.aiProvider;
      if (settings.currentModel) currentModel = settings.currentModel;
      if (settings.ollamaUrl) OLLAMA_BASE_URL = settings.ollamaUrl.replace("localhost", "127.0.0.1");
      if (settings.azureEndpoint) AZURE_FOUNDRY_ENDPOINT = settings.azureEndpoint;
      if (settings.responseLanguage) responseLanguage = settings.responseLanguage;

      return true;
    }
  } catch (error) {
    console.error("Error loading settings from file:", error);
  }

  return false;
}

/**
 * Saves settings to file
 * @param {Object} settings - The settings to save
 * @returns {boolean} True if settings were saved successfully, false otherwise
 */
function saveSettingsToFile(settings) {
  try {
    if (!app) return false;

    const settingsFilePath = getSettingsFilePath();

    let existingSettings = {};
    if (fs.existsSync(settingsFilePath)) {
      try {
        const settingsData = fs.readFileSync(settingsFilePath, "utf8");
        existingSettings = JSON.parse(settingsData);
      } catch (parseError) {
        console.error("Error parsing existing settings file:", parseError);
      }
    }

    const settingsToSave = {
      ...settings,
      apiKey: existingSettings.apiKey,
    };

    fs.writeFileSync(settingsFilePath, JSON.stringify(settingsToSave, null, 2), "utf8");
    return true;
  } catch (error) {
    console.error("Error saving settings to file:", error);
    return false;
  }
}

/**
 * Saves API key to settings file
 * @param {string} apiKey - The API key to save (for backward compatibility)
 * @param {string} provider - Optional provider name for provider-specific keys
 * @returns {boolean} True if API key was saved successfully, false otherwise
 */
function saveApiKey(apiKey, provider = null) {
  try {
    if (!app) return false;

    const settingsFilePath = getSettingsFilePath();

    let settings = {};
    if (fs.existsSync(settingsFilePath)) {
      try {
        const settingsData = fs.readFileSync(settingsFilePath, "utf8");
        settings = JSON.parse(settingsData);
      } catch (parseError) {
        console.error("Error parsing settings file:", parseError);
      }
    }

    // Initialize apiKeys object if it doesn't exist
    if (!settings.apiKeys) {
      settings.apiKeys = {};
    }

    // Save provider-specific API key if provider is specified
    if (provider) {
      settings.apiKeys[provider] = apiKey;
    } else {
      // For backward compatibility, also save as general apiKey
      settings.apiKey = apiKey;
    }

    fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2), "utf8");
    return true;
  } catch (error) {
    console.error("Error saving API key to settings:", error);
    return false;
  }
}

/**
 * Gets API key from settings
 * @param {string} provider - Optional provider name for provider-specific keys
 * @returns {string|null} The API key or null if it doesn't exist
 */
function getApiKey(provider = null) {
  try {
    if (!app) return null;

    const settingsFilePath = getSettingsFilePath();

    if (fs.existsSync(settingsFilePath)) {
      const settingsData = fs.readFileSync(settingsFilePath, "utf8");
      const settings = JSON.parse(settingsData);

      // If provider is specified, try to get provider-specific key
      if (provider && settings.apiKeys && settings.apiKeys[provider]) {
        return settings.apiKeys[provider];
      }

      // Fall back to general apiKey for backward compatibility
      return settings.apiKey || null;
    }

    return null;
  } catch (error) {
    console.error("Error getting API key from settings:", error);
    return null;
  }
}

/**
 * Gets all API keys from settings
 * @returns {Object} Object containing all API keys
 */
function getAllApiKeys() {
  try {
    if (!app) return {};

    const settingsFilePath = getSettingsFilePath();

    if (fs.existsSync(settingsFilePath)) {
      const settingsData = fs.readFileSync(settingsFilePath, "utf8");
      const settings = JSON.parse(settingsData);
      return settings.apiKeys || {};
    }

    return {};
  } catch (error) {
    console.error("Error getting all API keys from settings:", error);
    return {};
  }
}

function getAiProvider() {
  return aiProvider;
}

function setAiProvider(provider) {
  aiProvider = provider;
  return aiProvider;
}

function getCurrentModel() {
  return currentModel;
}

function setCurrentModel(model) {
  currentModel = model;
  return currentModel;
}

function getResponseLanguage() {
  return responseLanguage;
}

function setResponseLanguage(language) {
  responseLanguage = language;
  return responseLanguage;
}

function getAvailableLanguages() {
  return LANGUAGES;
}

function getAzureEndpoint() {
  return AZURE_FOUNDRY_ENDPOINT;
}

function setAzureEndpoint(endpoint) {
  AZURE_FOUNDRY_ENDPOINT = endpoint;
  return AZURE_FOUNDRY_ENDPOINT;
}

// Get current settings
function getCurrentSettings() {
  return {
    aiProvider,
    currentModel,
    ollamaUrl: OLLAMA_BASE_URL,
    azureEndpoint: AZURE_FOUNDRY_ENDPOINT,
    responseLanguage,
  };
}

function updateSettings(settings) {
  let hasChanges = false;

  if (settings.aiProvider && settings.aiProvider !== aiProvider) {
    aiProvider = settings.aiProvider;
    hasChanges = true;
  }

  if (settings.currentModel && settings.currentModel !== currentModel) {
    currentModel = settings.currentModel;
    hasChanges = true;
  }

  if (settings.ollamaUrl) {
    const normalizedUrl = settings.ollamaUrl.replace("localhost", "127.0.0.1");
    if (normalizedUrl !== OLLAMA_BASE_URL) {
      OLLAMA_BASE_URL = normalizedUrl;
      hasChanges = true;
    }
  }

  if (settings.azureEndpoint && settings.azureEndpoint !== AZURE_FOUNDRY_ENDPOINT) {
    AZURE_FOUNDRY_ENDPOINT = settings.azureEndpoint;
    hasChanges = true;
  }

  if (settings.responseLanguage && settings.responseLanguage !== responseLanguage) {
    responseLanguage = settings.responseLanguage;
    hasChanges = true;
  }

  if (hasChanges) {
    saveSettingsToFile(getCurrentSettings());
  }

  return getCurrentSettings();
}

loadSettingsFromFile();

module.exports = {
  getAiProvider,
  setAiProvider,
  getCurrentModel,
  setCurrentModel,
  getResponseLanguage,
  setResponseLanguage,
  getAvailableLanguages,
  getAzureEndpoint,
  setAzureEndpoint,
  getCurrentSettings,
  updateSettings,
  loadSettingsFromFile,
  saveSettingsToFile,
  getSettingsFilePath,
  saveApiKey,
  getApiKey,
  getAllApiKeys,
};
