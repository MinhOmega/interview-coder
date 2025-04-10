// Configuration manager for the application
// Handles default values and configuration settings

require("dotenv").config();

// Default values - use IPv4 address explicitly for Ollama
let OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL
  ? process.env.OLLAMA_BASE_URL.replace("localhost", "127.0.0.1")
  : "http://127.0.0.1:11434";

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL || "deepseek-r1:14b";

// Default AI provider
let aiProvider = process.env.AI_PROVIDER || "openai";

// Current model based on provider
let currentModel =
  aiProvider === "openai" ? DEFAULT_MODEL : aiProvider === "gemini" ? DEFAULT_GEMINI_MODEL : DEFAULT_OLLAMA_MODEL;

// Accessor functions
function getOllamaBaseUrl() {
  return OLLAMA_BASE_URL;
}

function setOllamaBaseUrl(url) {
  OLLAMA_BASE_URL = url.replace("localhost", "127.0.0.1");
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
  setOllamaBaseUrl,
  getDefaultModel,
  getDefaultGeminiModel,
  getDefaultOllamaModel,
  getAiProvider,
  setAiProvider,
  getCurrentModel,
  setCurrentModel,
  getCurrentSettings,
  updateSettings
}; 