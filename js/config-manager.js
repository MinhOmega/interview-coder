const { AI_PROVIDERS } = require("./constants");
const path = require("path");
const fs = require("fs");
const { app } = require("electron");

let OLLAMA_BASE_URL = "http://127.0.0.1:11434";
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
  const userDataPath = app ? app.getPath("userData") : "";
  return path.join(userDataPath, "interview-coder-settings.json");
};

// Load settings from file
function loadSettingsFromFile() {
  try {
    // Only proceed if we have app access (main process)
    if (!app) return false;

    const settingsFilePath = getSettingsFilePath();

    if (fs.existsSync(settingsFilePath)) {
      const settingsData = fs.readFileSync(settingsFilePath, "utf8");
      const settings = JSON.parse(settingsData);

      // Update current values
      if (settings.aiProvider) aiProvider = settings.aiProvider;
      if (settings.currentModel) currentModel = settings.currentModel;
      if (settings.ollamaUrl) OLLAMA_BASE_URL = settings.ollamaUrl.replace("localhost", "127.0.0.1");
      if (settings.responseLanguage) responseLanguage = settings.responseLanguage;

      return true;
    }
  } catch (error) {
    console.error("Error loading settings from file:", error);
  }

  return false;
}

// Save settings to file
function saveSettingsToFile(settings) {
  try {
    // Only proceed if we have app access (main process)
    if (!app) return false;

    const settingsFilePath = getSettingsFilePath();

    // First, check if there's an existing file with API keys
    let existingSettings = {};
    if (fs.existsSync(settingsFilePath)) {
      try {
        const settingsData = fs.readFileSync(settingsFilePath, "utf8");
        existingSettings = JSON.parse(settingsData);
      } catch (parseError) {
        console.error("Error parsing existing settings file:", parseError);
      }
    }

    // Preserve API key from existing settings
    const settingsToSave = {
      ...settings,
      // Keep existing API key if it exists
      apiKey: existingSettings.apiKey,
    };

    fs.writeFileSync(settingsFilePath, JSON.stringify(settingsToSave, null, 2), "utf8");
    return true;
  } catch (error) {
    console.error("Error saving settings to file:", error);
    return false;
  }
}

// Add a function to save API key to settings file
function saveApiKey(apiKey) {
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

    settings.apiKey = apiKey;
    fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2), "utf8");
    return true;
  } catch (error) {
    console.error("Error saving API key to settings:", error);
    return false;
  }
}

// Get API key from settings
function getApiKey() {
  try {
    if (!app) return null;

    const settingsFilePath = getSettingsFilePath();

    if (fs.existsSync(settingsFilePath)) {
      const settingsData = fs.readFileSync(settingsFilePath, "utf8");
      const settings = JSON.parse(settingsData);
      return settings.apiKey || null;
    }

    return null;
  } catch (error) {
    console.error("Error getting API key from settings:", error);
    return null;
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

// Get current settings
function getCurrentSettings() {
  return {
    aiProvider,
    currentModel,
    ollamaUrl: OLLAMA_BASE_URL,
    responseLanguage,
  };
}

// Update settings
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

  if (settings.responseLanguage && settings.responseLanguage !== responseLanguage) {
    responseLanguage = settings.responseLanguage;
    hasChanges = true;
  }

  // Only save to file system if there were actual changes
  if (hasChanges) {
    saveSettingsToFile(getCurrentSettings());
  }

  return getCurrentSettings();
}

// Try to load settings from file when module is loaded
loadSettingsFromFile();

module.exports = {
  getAiProvider,
  setAiProvider,
  getCurrentModel,
  setCurrentModel,
  getResponseLanguage,
  setResponseLanguage,
  getAvailableLanguages,
  getCurrentSettings,
  updateSettings,
  loadSettingsFromFile,
  saveSettingsToFile,
  getSettingsFilePath,
  saveApiKey,
  getApiKey,
};
