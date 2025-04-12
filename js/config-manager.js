const { AI_PROVIDERS } = require("./constants");

require("dotenv").config();

// Default values - use IPv4 address explicitly for Ollama
let OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL
  ? process.env.OLLAMA_BASE_URL.replace("localhost", "127.0.0.1")
  : "http://127.0.0.1:11434";

// Default AI provider
let aiProvider = AI_PROVIDERS.DEFAULT;

// Current model based on provider
let currentModel = "";

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
  getAiProvider,
  setAiProvider,
  getCurrentModel,
  setCurrentModel,
  getCurrentSettings,
  updateSettings,
};
