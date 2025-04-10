const { AI_PROVIDERS } = require("./constants");

let OLLAMA_BASE_URL = "http://127.0.0.1:11434";

const DEFAULT_MODEL = AI_PROVIDERS.OLLAMA;
const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";
const DEFAULT_OLLAMA_MODEL = "deepseek-r1:14b";

let aiProvider = AI_PROVIDERS.DEFAULT;

let currentModel =
  aiProvider === AI_PROVIDERS.OPENAI
    ? DEFAULT_MODEL
    : aiProvider === AI_PROVIDERS.GEMINI
    ? DEFAULT_GEMINI_MODEL
    : DEFAULT_OLLAMA_MODEL;

function getOllamaBaseUrl() {
  return OLLAMA_BASE_URL;
}

function getDefaultModel() {
  return DEFAULT_MODEL;
}

function getDefaultGeminiModel() {
  return DEFAULT_GEMINI_MODEL;
}

function getDefaultOllamaModel() {
  return DEFAULT_OLLAMA_MODEL;
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

// Get current settings
function getCurrentSettings() {
  return {
    aiProvider,
    currentModel,
    ollamaUrl: OLLAMA_BASE_URL,
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

  return getCurrentSettings();
}

module.exports = {
  getOllamaBaseUrl,
  getDefaultModel,
  getDefaultGeminiModel,
  getDefaultOllamaModel,
  getAiProvider,
  setAiProvider,
  getCurrentModel,
  setCurrentModel,
  getCurrentSettings,
  updateSettings,
};
