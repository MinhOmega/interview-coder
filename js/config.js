const API_KEYS = {
  openai: {
    key: "",
    storageKey: "openai_api_key",
    inputId: "openai-api-key",
    statusId: "openai-key-status",
    toggleId: "toggle-openai-key",
    modalTitle: "OpenAI API Key Required",
    modalMessage: "Please enter your OpenAI API key to use OpenAI models.",
  },
  gemini: {
    key: "",
    storageKey: "gemini_api_key",
    inputId: "gemini-api-key",
    statusId: "gemini-key-status",
    toggleId: "toggle-gemini-key",
    modalTitle: "Gemini API Key Required",
    modalMessage: "Please enter your Gemini API key to use Gemini models.",
  },
};

const isMac = process.platform === "darwin";
const isLinux = process.platform === "linux";
const isWindows = process.platform === "win32";
const modifierKey = isMac ? "Command" : "Ctrl";

module.exports = {
  API_KEYS,
  isMac,
  isLinux,
  isWindows,
  modifierKey,
};
