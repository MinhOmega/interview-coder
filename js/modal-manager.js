const { API_KEYS } = require("./config");
const { ipcRenderer } = require("electron");
const { IPC_CHANNELS } = require("./constants");

let currentProvider = null;

// Show API key modal
function showApiKeyModal(provider) {
  const apiKeyModal = document.getElementById("api-key-modal");
  const modalTitle = document.getElementById("api-key-modal-title");
  const modalMessage = document.getElementById("api-key-modal-message");
  const modalApiKeyInput = document.getElementById("modal-api-key");

  currentProvider = provider;

  modalTitle.textContent = API_KEYS[provider].modalTitle;
  modalMessage.textContent = API_KEYS[provider].modalMessage;
  modalApiKeyInput.value = API_KEYS[provider].key;

  apiKeyModal.style.display = "block";
}

// Save API key from modal
function saveApiKeyFromModal() {
  const modalApiKeyInput = document.getElementById("modal-api-key");
  const key = modalApiKeyInput.value.trim();

  if (!key) {
    const modalApiKeyStatus = document.getElementById("modal-api-key-status");
    modalApiKeyStatus.textContent = "API key is required";
    modalApiKeyStatus.className = "api-key-status error";
    return false;
  }

  if (currentProvider) {
    // Store the key for both providers for consistency
    API_KEYS.openai.key = key;
    API_KEYS.gemini.key = key;

    // Save to settings via IPC
    ipcRenderer
      .invoke(IPC_CHANNELS.SAVE_API_KEY, key)
      .then((success) => {
        if (success) {
          // Initialize the client with the key
          ipcRenderer.invoke(IPC_CHANNELS.INITIALIZE_AI_CLIENT, currentProvider, key);

          // Update status in provider's section if it exists
          const statusElement = document.getElementById(API_KEYS[currentProvider].statusId);
          if (statusElement) {
            statusElement.textContent = "API key saved successfully";
            statusElement.className = "api-key-status success";
          }

          // Close the modal
          closeApiKeyModal();

          // Update input fields with masked key
          const maskedKey = maskApiKey(key);

          const openaiKeyInput = document.getElementById(API_KEYS.openai.inputId);
          if (openaiKeyInput) {
            openaiKeyInput.value = maskedKey;
          }

          const geminiKeyInput = document.getElementById(API_KEYS.gemini.inputId);
          if (geminiKeyInput) {
            geminiKeyInput.value = maskedKey;
          }
        }
      })
      .catch((err) => {
        console.error("Error saving API key:", err);
        const modalApiKeyStatus = document.getElementById("modal-api-key-status");
        modalApiKeyStatus.textContent = "Error saving API key";
        modalApiKeyStatus.className = "api-key-status error";
      });
  }

  return true;
}

// Mask API key for display
function maskApiKey(key) {
  if (!key || key.length < 8) return key;
  const firstFour = key.substring(0, 4);
  const lastFour = key.substring(key.length - 4);
  const maskedLength = key.length - 8;
  return firstFour + "*".repeat(maskedLength) + lastFour;
}

// Close API key modal
function closeApiKeyModal() {
  const apiKeyModal = document.getElementById("api-key-modal");
  apiKeyModal.style.display = "none";

  // Clear status message
  const modalApiKeyStatus = document.getElementById("modal-api-key-status");
  if (modalApiKeyStatus) {
    modalApiKeyStatus.textContent = "";
  }
}

// Handle provider selection with API key check
function handleProviderSelection(provider) {
  if ((provider === "openai" || provider === "gemini") && !API_KEYS[provider].key.trim()) {
    showApiKeyModal(provider);
    return false;
  }
  return true;
}

module.exports = {
  showApiKeyModal,
  saveApiKeyFromModal,
  closeApiKeyModal,
  handleProviderSelection,
  maskApiKey,
};
