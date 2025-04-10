require("dotenv").config();

// Check if running on macOS
const isMac = process.platform === "darwin";
const isWindows = process.platform === "win32";
const isLinux = process.platform === "linux";
const modifierKey = isMac ? "⌘" : "Ctrl";

const DEFAULT_CONFIG = {
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL
    ? process.env.OLLAMA_BASE_URL.replace("localhost", "127.0.0.1")
    : "http://127.0.0.1:11434",
  DEFAULT_MODEL: process.env.OPENAI_MODEL || "gpt-4o-mini",
  DEFAULT_GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-2.0-flash",
  DEFAULT_OLLAMA_MODEL: process.env.OLLAMA_MODEL || "deepseek-r1:14b",
  AI_PROVIDER: process.env.AI_PROVIDER || "openai",
};

// Define shortcuts configuration
const SHORTCUTS = {
  TOGGLE_VISIBILITY: {
    key: `${modifierKey}+B`,
    handler: null,
    alwaysActive: true,
  },
  PROCESS_SCREENSHOTS: {
    key: `${modifierKey}+Enter`,
    handler: null,
  },
  OPEN_SETTINGS: {
    key: `${modifierKey}+,`,
    handler: null,
  },
  MOVE_LEFT: {
    key: `${modifierKey}+Left`,
    handler: null,
  },
  MOVE_RIGHT: {
    key: `${modifierKey}+Right`,
    handler: null,
  },
  MOVE_UP: {
    key: `${modifierKey}+Up`,
    handler: null,
  },
  MOVE_DOWN: {
    key: `${modifierKey}+Down`,
    handler: null,
  },
  TAKE_SCREENSHOT: {
    key: `${modifierKey}+H`,
    handler: null,
  },
  AREA_SCREENSHOT: {
    key: `${modifierKey}+D`,
    handler: null,
  },
  MULTI_PAGE: {
    key: `${modifierKey}+A`,
    handler: null,
  },
  RESET: {
    key: `${modifierKey}+R`,
    handler: null,
  },
  QUIT: {
    key: `${modifierKey}+Q`,
    handler: null,
  },
  MODEL_SELECTION: {
    key: `${modifierKey}+M`,
    handler: null,
  },
};

// Platform-specific shortcuts and terminology
const platformSpecificShortcuts = {
  // Add platform-specific shortcuts here
};

// Default application settings
const defaultSettings = {
  aiProvider: "openai",
  openaiApiKey: "",
  geminiApiKey: "",
  ollamaBaseUrl: "http://localhost:11434",
  preferredModel: "gpt-3.5-turbo",
  theme: "system",
  fontSize: 14,
  showLineNumbers: true,
  wordWrap: true,
  enableNotifications: true,
  autoUpdate: true,
  saveHistory: true,
};

const timeouts = {
  modelList: 5000,
  completion: 60000,
  longOperation: 30000,
};

const paths = {
  settings: "settings.json",
  history: "history.json",
};

const appMetadata = {
  name: "OA Coder",
  version: "1.0.0",
  releaseDate: "2023-06-01",
  repository: "https://github.com/yourname/oa-coder",
};

module.exports = {
  DEFAULT_CONFIG,
  SHORTCUTS,
  isMac,
  isWindows,
  isLinux,
  modifierKey,
  platformSpecificShortcuts,
  defaultSettings,
  timeouts,
  paths,
  appMetadata,
};
