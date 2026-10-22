const fs = require("fs");
const { app } = require("electron");
const { AI_PROVIDERS } = require("./constants");
const { getAppPath, getUserDataPath } = require("./utils");
const {
  getConfigPath,
  mergeConfigs,
  readProjectConfig,
  writeProjectConfigAtomic,
} = require("./project-config");
const {
  DEFAULT_RESPONSE_PROFILE,
  DEFAULT_CUSTOM_MAX_OUTPUT_TOKENS,
  getEffectiveMaxOutputTokens,
} = require("./response-profiles");

const DEFAULT_SETTINGS = {
  aiProvider: AI_PROVIDERS.DEFAULT,
  currentModel: "",
  ollamaUrl: "http://127.0.0.1:11434",
  azureEndpoint: "",
  responseLanguage: "en",
  responseProfile: DEFAULT_RESPONSE_PROFILE,
  customMaxOutputTokens: DEFAULT_CUSTOM_MAX_OUTPUT_TOKENS,
  apiKeys: {},
};

const LANGUAGES = {
  en: { code: "en", name: "English", nativeName: "English" },
  vi: { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt" },
  es: { code: "es", name: "Spanish", nativeName: "Español" },
  fr: { code: "fr", name: "French", nativeName: "Français" },
  de: { code: "de", name: "German", nativeName: "Deutsch" },
  ja: { code: "ja", name: "Japanese", nativeName: "日本語" },
  ko: { code: "ko", name: "Korean", nativeName: "한국어" },
  zh: { code: "zh", name: "Chinese", nativeName: "中文" },
  ru: { code: "ru", name: "Russian", nativeName: "Русский" },
};

let settings = { ...DEFAULT_SETTINGS, apiKeys: {} };
let lastConfigError = null;

const getSettingsFilePath = () => getUserDataPath("interview-coder-settings.json");
const getProjectSettingsFilePath = () => getConfigPath(
  Boolean(app && app.isPackaged),
  getAppPath("userData", ""),
  process.cwd(),
);

function readLegacySettings() {
  const settingsFilePath = getSettingsFilePath();
  if (!settingsFilePath || !fs.existsSync(settingsFilePath)) return {};

  try {
    return JSON.parse(fs.readFileSync(settingsFilePath, "utf8"));
  } catch (error) {
    console.error("Error loading legacy settings:", error.message);
    return {};
  }
}

function loadSettingsFromFile() {
  const legacySettings = readLegacySettings();
  let projectSettings = {};

  try {
    projectSettings = readProjectConfig(getProjectSettingsFilePath()) || {};
    lastConfigError = null;
  } catch (error) {
    lastConfigError = error;
    console.error(error.message);
  }

  settings = mergeConfigs(DEFAULT_SETTINGS, legacySettings, projectSettings);
  if (settings.ollamaUrl) settings.ollamaUrl = settings.ollamaUrl.replace("localhost", "127.0.0.1");
  return !lastConfigError;
}

function saveProjectSettings(updates) {
  const filePath = getProjectSettingsFilePath();
  const existing = readProjectConfig(filePath) || {};
  const next = mergeConfigs(existing, updates);
  writeProjectConfigAtomic(filePath, next);
  settings = mergeConfigs(settings, next);
  lastConfigError = null;
  return true;
}

function saveSettingsToFile(updates) {
  try {
    return saveProjectSettings(updates);
  } catch (error) {
    lastConfigError = error;
    console.error(error.message);
    return false;
  }
}

function saveApiKey(apiKey, provider = null) {
  try {
    const keyUpdates = provider
      ? { apiKeys: { ...settings.apiKeys, [provider]: apiKey } }
      : { apiKey };
    return saveProjectSettings(keyUpdates);
  } catch (error) {
    lastConfigError = error;
    console.error(error.message);
    return false;
  }
}

function getApiKey(provider = null) {
  if (provider && settings.apiKeys && settings.apiKeys[provider]) return settings.apiKeys[provider];
  return settings.apiKey || null;
}

function getAllApiKeys() {
  return { ...(settings.apiKeys || {}) };
}

function getAiProvider() {
  return settings.aiProvider;
}

function setAiProvider(provider) {
  settings.aiProvider = provider;
  return provider;
}

function getCurrentModel() {
  return settings.currentModel;
}

function setCurrentModel(model) {
  settings.currentModel = model;
  return model;
}

function getResponseLanguage() {
  return settings.responseLanguage;
}

function setResponseLanguage(language) {
  settings.responseLanguage = language;
  return language;
}

function getResponseProfile() {
  return settings.responseProfile || DEFAULT_RESPONSE_PROFILE;
}

function getCustomMaxOutputTokens() {
  return settings.customMaxOutputTokens ?? DEFAULT_CUSTOM_MAX_OUTPUT_TOKENS;
}

function getMaxOutputTokens() {
  return getEffectiveMaxOutputTokens(getResponseProfile(), getCustomMaxOutputTokens());
}

function getAvailableLanguages() {
  return LANGUAGES;
}

function getAzureEndpoint() {
  return settings.azureEndpoint;
}

function setAzureEndpoint(endpoint) {
  settings.azureEndpoint = endpoint;
  return endpoint;
}

function getCurrentSettings() {
  const { apiKeys, apiKey, ...publicSettings } = settings;
  return {
    ...publicSettings,
    effectiveMaxOutputTokens: getMaxOutputTokens(),
    configError: lastConfigError ? lastConfigError.message : null,
  };
}

function getMergedSettings() {
  return mergeConfigs(settings);
}

function getLastConfigError() {
  return lastConfigError;
}

function updateSettings(updates) {
  const normalizedUpdates = { ...updates };
  if (normalizedUpdates.ollamaUrl) {
    normalizedUpdates.ollamaUrl = normalizedUpdates.ollamaUrl.replace("localhost", "127.0.0.1");
  }

  saveProjectSettings(normalizedUpdates);
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
  getResponseProfile,
  getCustomMaxOutputTokens,
  getMaxOutputTokens,
  getAvailableLanguages,
  getAzureEndpoint,
  setAzureEndpoint,
  getCurrentSettings,
  getMergedSettings,
  getLastConfigError,
  updateSettings,
  loadSettingsFromFile,
  saveSettingsToFile,
  getSettingsFilePath,
  getProjectSettingsFilePath,
  saveApiKey,
  getApiKey,
  getAllApiKeys,
};
