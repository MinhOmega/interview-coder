const AI_PROVIDERS = {
  OPENAI: "openai",
  GEMINI: "gemini",
  OLLAMA: "ollama",
  DEFAULT: "AI",
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
  DEV_RELOAD: "dev-reload",
  SCROLL_CONTENT: "scroll-content",
  RESIZE_WINDOW: "resize-window",
  MOVE_WINDOW: "move-window",
  QUIT_APP: "quit-app",
  SAVE_API_KEY: "save-api-key",
  GET_API_KEY: "get-api-key",
  INITIALIZE_AI_CLIENT: "initialize-ai-client",
};

module.exports = {
  AI_PROVIDERS,
  IPC_CHANNELS,
};
