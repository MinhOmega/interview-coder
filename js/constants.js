const AI_PROVIDERS = {
  OPENAI: "openai",
  GEMINI: "gemini",
  OLLAMA: "ollama",
};

const IPC_CHANNELS = {
  UPDATE_INSTRUCTION: "update-instruction",
  HIDE_INSTRUCTION: "hide-instruction",
  UPDATE_VISIBILITY: "update-visibility",
  TOGGLE_VISIBILITY: "toggle-visibility",
  NOTIFICATION: "notification",
  WARNING: "warning",
  ERROR: "error",
  LOADING: "loading",
  ANALYSIS_RESULT: "analysis-result",
  STREAM_START: "stream-start",
  STREAM_CHUNK: "stream-chunk",
  STREAM_UPDATE: "stream-update",
  STREAM_END: "stream-end",
  CLEAR_RESULT: "clear-result",
  MODEL_CHANGED: "model-changed",
  SCREEN_SHARING_DETECTED: "screen-sharing-detected",
  GET_CURRENT_SETTINGS: "get-current-settings",
  SHOW_CONTEXT_MENU: "show-context-menu",
  TOGGLE_DEVTOOLS: "toggle-devtools",
  UPDATE_MODEL_SETTINGS: "update-model-settings",
  SCREENSHOT_READY_FOR_PROCESSING: "screenshot-ready-for-processing",
  GET_OLLAMA_MODELS: "get-ollama-models",
};

module.exports = {
  AI_PROVIDERS,
  IPC_CHANNELS,
};
