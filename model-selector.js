const { ipcRenderer } = require("electron");
const axios = require("axios");
const { IPC_CHANNELS } = require('./js/constants');
const { API_KEYS, isMac } = require('./js/config');
const apiKeyManager = require('./js/api-key-manager');
const geminiProvider = require('./js/gemini-provider');
const ollamaProvider = require('./js/ollama-provider');
const utils = require('./js/utils');
const modalManager = require('./js/modal-manager');

const aiProviderRadios = document.querySelectorAll('input[name="aiProvider"]');
const radioLabels = document.querySelectorAll(".radio-label");
const openaiModelSelect = document.getElementById("openai-model");
const openaiModelCards = document.getElementById("openai-model-cards");
const ollamaUrlInput = document.getElementById("ollama-url");
const refreshModelsBtn = document.getElementById("refresh-models");
const testConnectionBtn = document.getElementById("test-connection");
const pullModelBtn = document.getElementById("pull-model-btn");
const saveBtn = document.getElementById("save-settings");
const cancelBtn = document.getElementById("cancel");
const messageDiv = document.getElementById("message");

const pullModelModal = document.getElementById("pull-model-modal");
const closeModalBtn = document.querySelector(".close-modal");
const modelToPullInput = document.getElementById("model-to-pull");
const pullStatusDiv = document.getElementById("pull-status");
const confirmPullBtn = document.getElementById("confirm-pull");
const cancelPullBtn = document.getElementById("cancel-pull");

let currentSettings = {};

window.currentSettings = currentSettings;
window.selectModelCard = utils.selectModelCard;
window.ipcRenderer = ipcRenderer;

async function loadCurrentSettings() {
  try {
    currentSettings = await ipcRenderer.invoke(IPC_CHANNELS.GET_CURRENT_SETTINGS);
  } catch (error) {
    console.error("Error getting current settings:", error.message);
    // Set default settings if handler is not registered
    currentSettings = {
      aiProvider: "openai",
      currentModel: "gpt-4o-mini",
      ollamaUrl: "http://127.0.0.1:11434",
    };

    // Show notification about missing handler
    messageDiv.textContent = "Settings system not fully initialized. Using default configuration.";
    messageDiv.className = "status warning";
  }

  // Set UI based on current settings
  // Update radio buttons and label styling
  radioLabels.forEach((label) => label.classList.remove("selected"));
  const selectedRadioLabel = document.getElementById(`${currentSettings.aiProvider}-radio-label`);
  if (selectedRadioLabel) {
    selectedRadioLabel.classList.add("selected");
  }

  document.querySelector(`input[name="aiProvider"][value="${currentSettings.aiProvider}"]`).checked = true;

  // Replace localhost with 127.0.0.1 for better compatibility
  const baseUrl = currentSettings.ollamaUrl || "http://127.0.0.1:11434";
  ollamaUrlInput.value = baseUrl.replace("localhost", "127.0.0.1");

  // Select the appropriate model in dropdown and card
  if (currentSettings.aiProvider === "openai") {
    utils.selectModelCard("openai", currentSettings.currentModel);
  } else if (currentSettings.aiProvider === "gemini") {
    geminiProvider.loadGeminiModels();
  }

  // Update visibility based on provider
  utils.updateSectionVisibility(currentSettings.aiProvider);

  // Load Ollama models
  if (currentSettings.aiProvider === "ollama") {
    ollamaProvider.loadOllamaModels();
  }

  // Set up OpenAI model card click handlers
  document.querySelectorAll("#openai-model-cards .model-card").forEach((card) => {
    card.addEventListener("click", () => {
      // Deselect all other cards
      document.querySelectorAll("#openai-model-cards .model-card").forEach((c) => {
        c.classList.remove("selected");
      });

      // Select this card and update the hidden select
      card.classList.add("selected");
      openaiModelSelect.value = card.getAttribute("data-model");
    });
  });
}

// Event Listeners for radio buttons
for (const radio of aiProviderRadios) {
  radio.addEventListener("change", () => {
    const provider = radio.value;
    utils.updateSectionVisibility(provider);
    
    if (provider === "ollama") {
      ollamaProvider.loadOllamaModels();
    } else if (provider === "gemini") {
      geminiProvider.loadGeminiModels();
    }
  });
}

// Event listeners for radio labels (for better UX)
radioLabels.forEach((label) => {
  label.addEventListener("click", (e) => {
    // Only handle clicks on the label itself, not on the radio input
    if (e.target !== label.querySelector('input[type="radio"]')) {
      const radio = label.querySelector('input[type="radio"]');
      radio.checked = true;

      // Trigger the change event
      const changeEvent = new Event("change");
      radio.dispatchEvent(changeEvent);
    }
  });
});

refreshModelsBtn.addEventListener("click", ollamaProvider.loadOllamaModels);
testConnectionBtn.addEventListener("click", ollamaProvider.testOllamaConnection);

// Pull model button
pullModelBtn.addEventListener("click", () => {
  // Suggest a vision model
  modelToPullInput.value = "llava:latest";
  pullStatusDiv.textContent = "";
  pullStatusDiv.className = "status";
  confirmPullBtn.disabled = false;
  pullModelModal.style.display = "block";
});

// Modal close button
closeModalBtn.addEventListener("click", () => {
  pullModelModal.style.display = "none";
});

// Cancel pull button
cancelPullBtn.addEventListener("click", () => {
  pullModelModal.style.display = "none";
});

// Confirm pull button
confirmPullBtn.addEventListener("click", async () => {
  const modelName = modelToPullInput.value.trim();
  if (!modelName) {
    pullStatusDiv.textContent = "Please enter a model name";
    pullStatusDiv.className = "status error";
    return;
  }

  await ollamaProvider.pullOllamaModel(modelName);
});

// Close modal if clicking outside
window.addEventListener("click", (event) => {
  if (event.target === pullModelModal) {
    pullModelModal.style.display = "none";
  }
});

// Save button handler
saveBtn.addEventListener("click", async () => {
  const aiProvider = document.querySelector('input[name="aiProvider"]:checked').value;
  let currentModel;

  if (aiProvider === "openai") {
    const selectedCard = openaiModelCards.querySelector(".model-card.selected");
    currentModel = selectedCard ? selectedCard.getAttribute("data-model") : openaiModelSelect.value;
  } else if (aiProvider === "gemini") {
    const selectedCard = document.getElementById("gemini-model-cards").querySelector(".model-card.selected");
    currentModel = selectedCard ? selectedCard.getAttribute("data-model") : document.getElementById("gemini-model").value;
  } else {
    const selectedCard = document.getElementById("ollama-model-cards").querySelector(".model-card.selected");
    currentModel = selectedCard ? selectedCard.getAttribute("data-model") : document.getElementById("ollama-model").value;
  }

  // Validate selection
  if (
    aiProvider === "ollama" &&
    (!currentModel || currentModel === "loading" || currentModel === "Ollama not configured")
  ) {
    messageDiv.textContent = "Please select a valid Ollama model";
    messageDiv.className = "status error";
    return;
  }

  // For Ollama, always ensure we're using IPv4
  let ollamaUrl = ollamaUrlInput.value;
  if (aiProvider === "ollama") {
    ollamaUrl = ollamaUrl.replace("localhost", "127.0.0.1");

    // If using Ollama, test the connection first
    messageDiv.innerHTML = 'Testing Ollama connection... <span class="loading"></span>';
    messageDiv.className = "status";

    try {
      const connectionTest = await axios.get(`${ollamaUrl}/api/version`, {
        timeout: 3000,
        validateStatus: false,
      });

      if (connectionTest.status !== 200) {
        messageDiv.textContent = `Could not connect to Ollama at ${ollamaUrl}. Check if Ollama is running.`;
        messageDiv.className = "status error";
        return;
      }

      // Connection successful, continue with saving
    } catch (error) {
      messageDiv.textContent = `Connection to Ollama failed: ${error.message}`;
      messageDiv.className = "status error";
      return;
    }
  }

  // Disable the save button to prevent multiple clicks
  saveBtn.disabled = true;

  // Create settings object to save
  const settings = {
    aiProvider,
    currentModel,
    ollamaUrl,
  };

  try {
    // Update settings
    ipcRenderer.send(IPC_CHANNELS.UPDATE_MODEL_SETTINGS, settings);

    // Show success message
    messageDiv.textContent = "Settings saved!";
    messageDiv.className = "status success";

    // Try to save settings to localStorage as fallback
    try {
      localStorage.setItem("model-settings", JSON.stringify(settings));
    } catch (storageErr) {
      console.error("Could not save to localStorage:", storageErr);
    }

    // For better synchronization, force the main window to refresh model badge
    try {
      // Check if we were opened by a parent window
      if (window.opener) {
        window.opener.postMessage({ type: "model-settings-updated", settings }, "*");
      }
    } catch (e) {
      console.error("Error notifying parent window:", e);
    }

    // Close window after a brief delay
    setTimeout(() => {
      window.close();
    }, 800);
  } catch (error) {
    console.error("Error saving settings:", error);

    // Try to save settings to localStorage as fallback
    try {
      localStorage.setItem("model-settings", JSON.stringify(settings));
      messageDiv.textContent = "Settings saved locally (fallback mode).";
      messageDiv.className = "status success";

      // Re-enable save button
      saveBtn.disabled = false;
    } catch (storageErr) {
      messageDiv.textContent = "Could not save settings: " + error.message;
      messageDiv.className = "status error";
      saveBtn.disabled = false;
    }
  }
});

cancelBtn.addEventListener("click", () => {
  window.close();
});

// Setup keyboard shortcuts
function setupKeyboardShortcuts() {
  // Add event listener for the Escape key
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      window.close();
    }
  });

  // Register for keyboard events to handle shortcuts
  document.addEventListener("keydown", (e) => {
    // Allow event to propagate to text fields
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
      return;
    }

    // Don't process if some modifier keys are pressed (to avoid conflicts)
    if (e.altKey) return;

    const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

    // If Ctrl/Cmd key is pressed
    if (ctrlOrCmd) {
      switch (e.key) {
        case "b": // Toggle visibility
          ipcRenderer.send(IPC_CHANNELS.TOGGLE_VISIBILITY);
          e.preventDefault();
          break;
        case "s": // Save settings
          saveBtn.click();
          e.preventDefault();
          break;
      }
    }
  });
}

// Setup API key input handlers
function setupApiKeyInputs() {
  // Setup API key input for OpenAI
  const openaiApiKeyInput = document.getElementById(API_KEYS.openai.inputId);
  if (openaiApiKeyInput) {
    openaiApiKeyInput.addEventListener('input', (e) => {
      const key = e.target.value.trim();
      if (key) {
        // Store the full key
        API_KEYS.openai.key = key;
        
        // Mask the key in the input
        const maskedKey = apiKeyManager.maskApiKey(key);
        if (openaiApiKeyInput.value !== maskedKey) {
          openaiApiKeyInput.value = maskedKey;
        }
        
        // Save the key
        apiKeyManager.saveApiKey('openai', key);
        
        // Auto-fetch models if key is long enough
        if (key.length >= 32) { // Minimum length for API keys
          apiKeyManager.validateAndFetchModels('openai', key, () => {
            // Nothing to do for OpenAI model fetching
          });
        }
      } else {
        apiKeyManager.updateApiKeyStatus('openai', 'API key is required', 'error');
      }
    });
  }

  // Setup API key input for Gemini
  const geminiApiKeyInput = document.getElementById(API_KEYS.gemini.inputId);
  if (geminiApiKeyInput) {
    geminiApiKeyInput.addEventListener('input', (e) => {
      const key = e.target.value.trim();
      if (key) {
        // Store the full key
        API_KEYS.gemini.key = key;
        
        // Mask the key in the input
        const maskedKey = apiKeyManager.maskApiKey(key);
        if (geminiApiKeyInput.value !== maskedKey) {
          geminiApiKeyInput.value = maskedKey;
        }
        
        // Save the key
        apiKeyManager.saveApiKey('gemini', key);
        
        // Auto-fetch models if key is long enough
        if (key.length >= 32) { // Minimum length for API keys
          apiKeyManager.validateAndFetchModels('gemini', key, geminiProvider.loadGeminiModels);
        }
      } else {
        apiKeyManager.updateApiKeyStatus('gemini', 'API key is required', 'error');
      }
    });
  }

  // Modal API key input handler
  const modalApiKeyInput = document.getElementById('modal-api-key');
  if (modalApiKeyInput) {
    modalApiKeyInput.addEventListener('input', (e) => {
      const modalApiKeyStatus = document.getElementById('modal-api-key-status');
      const key = e.target.value.trim();
      if (key) {
        modalApiKeyStatus.textContent = '';
      } else {
        modalApiKeyStatus.textContent = 'API key is required';
        modalApiKeyStatus.className = 'api-key-status error';
      }
    });
  }
  
  // Add toggle functionality for password fields
  function setupPasswordToggle(toggleId, inputId) {
    const toggleBtn = document.getElementById(toggleId);
    const inputField = document.getElementById(inputId);
    
    if (toggleBtn && inputField) {
      toggleBtn.addEventListener('click', () => {
        const showIcon = toggleBtn.querySelector('.show-password-icon');
        const hideIcon = toggleBtn.querySelector('.hide-password-icon');
        
        // Toggle password visibility
        if (inputField.type === 'password') {
          inputField.type = 'text';
          showIcon.classList.add('hidden');
          hideIcon.classList.remove('hidden');
        } else {
          inputField.type = 'password';
          showIcon.classList.remove('hidden');
          hideIcon.classList.add('hidden');
        }
      });
    }
  }
  
  // Setup toggle buttons for all API key inputs
  setupPasswordToggle('toggle-openai-key', 'openai-api-key');
  setupPasswordToggle('toggle-gemini-key', 'gemini-api-key');
  setupPasswordToggle('toggle-modal-key', 'modal-api-key');
}

// Initialize the application
function initialize() {
  // Load saved API keys
  apiKeyManager.loadApiKeys();
  
  // Set up API key input handlers
  setupApiKeyInputs();
  
  // Initialize modals
  modalManager.initializeModals();
  
  // Set up keyboard shortcuts
  setupKeyboardShortcuts();
  
  // Listen for visibility updates from main process
  ipcRenderer.on(IPC_CHANNELS.UPDATE_VISIBILITY, (event, isVisible) => {
    document.body.style.opacity = isVisible ? "1" : "0";
  });
  
  // Load current settings
  loadCurrentSettings();
  
  // Run once on page load to adjust UI
  utils.adjustUIForScreenSize();
  
  // Handle window resize events to adjust UI
  let resizeTimeout;
  window.addEventListener("resize", () => {
    // Debounce resize events
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      utils.adjustUIForScreenSize();
    }, 250);
  });
}

// Start initialization when DOM is loaded
document.addEventListener('DOMContentLoaded', initialize);

// Export for use in other parts of the application
window.API_KEYS = API_KEYS;
window.showApiKeyModal = modalManager.showApiKeyModal;