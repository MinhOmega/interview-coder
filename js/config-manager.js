const { AI_PROVIDERS } = require("./constants");
const path = require("path");
const fs = require("fs");
const { app } = require("electron");

require("dotenv").config();

// Default values - use IPv4 address explicitly for Ollama
let OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL
  ? process.env.OLLAMA_BASE_URL.replace("localhost", "127.0.0.1")
  : "http://127.0.0.1:11434";

// Default AI provider
let aiProvider = AI_PROVIDERS.DEFAULT;

// Current model based on provider
let currentModel = "";

// Default response language is English
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
    fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2), "utf8");
    return true;
  } catch (error) {
    console.error("Error saving settings to file:", error);
    return false;
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
  if (settings.aiProvider) {
    aiProvider = settings.aiProvider;
  }

  if (settings.currentModel) {
    currentModel = settings.currentModel;
  }

  if (settings.ollamaUrl) {
    OLLAMA_BASE_URL = settings.ollamaUrl.replace("localhost", "127.0.0.1");
  }

  if (settings.responseLanguage) {
    responseLanguage = settings.responseLanguage;
  }

  // Save to file system for persistent storage
  saveSettingsToFile(getCurrentSettings());

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
};
