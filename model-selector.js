const { ipcRenderer } = require("electron");
const axios = require("axios");
const { IPC_CHANNELS, AI_PROVIDERS } = require("./js/constants");
const { API_KEYS, isMac } = require("./js/config");
const apiKeyManager = require("./js/api-key-manager");
const geminiProvider = require("./js/gemini-provider");
const ollamaProvider = require("./js/ollama-provider");
const utils = require("./js/utils");
const modalManager = require("./js/modal-manager");
const configManager = require("./js/config-manager");
const log = require("electron-log");

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

// Language selector elements
const languageSelect = document.getElementById("response-language");
const languageCardsContainer = document.getElementById("language-cards");
const sectionToggles = document.querySelectorAll(".section-toggle");

let currentSettings = {};

window.currentSettings = currentSettings;
window.selectModelCard = utils.selectModelCard;
window.ipcRenderer = ipcRenderer;

async function loadCurrentSettings() {
  try {
    currentSettings = await ipcRenderer.invoke(IPC_CHANNELS.GET_CURRENT_SETTINGS);
  } catch (error) {
    log.error("Error getting current settings:", error.message);
    // Set default settings if handler is not registered
    currentSettings = configManager.getCurrentSettings();

    // Show notification about missing handler
    messageDiv.textContent = "Settings system not fully initialized. Using default configuration.";
    messageDiv.className = "status warning";
  }

  // Set UI based on current settings
  // Update radio buttons and label styling
  radioLabels.forEach((label) => label.classList.remove("selected"));

  // Only select a radio button if a provider is specified
  if (currentSettings.aiProvider && currentSettings.aiProvider !== "AI") {
    const selectedRadioLabel = document.getElementById(`${currentSettings.aiProvider}-radio-label`);
    if (selectedRadioLabel) {
      selectedRadioLabel.classList.add("selected");

      // Check the radio button
      const radioInput = document.querySelector(`input[name="aiProvider"][value="${currentSettings.aiProvider}"]`);
      if (radioInput) {
        radioInput.checked = true;
      }
    }
  }

  // Replace localhost with 127.0.0.1 for better compatibility
  const baseUrl = currentSettings.ollamaUrl || "http://127.0.0.1:11434";
  ollamaUrlInput.value = baseUrl.replace("localhost", "127.0.0.1");

  // Select the appropriate model in dropdown and card
  if (currentSettings.aiProvider === "openai") {
    utils.selectModelCard("openai", currentSettings.currentModel);
  } else if (currentSettings.aiProvider === "gemini") {
    geminiProvider.loadGeminiModels();
  }

  // Set language selection based on settings
  if (currentSettings.responseLanguage) {
    languageSelect.value = currentSettings.responseLanguage;
    selectLanguageCard(currentSettings.responseLanguage);
  } else {
    // Default to English
    languageSelect.value = "en";
    selectLanguageCard("en");
  }

  // Update visibility based on provider
  utils.updateSectionVisibility(currentSettings.aiProvider);

  // Load Ollama models
  if (currentSettings.aiProvider === AI_PROVIDERS.OLLAMA) {
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

    if (provider === AI_PROVIDERS.OLLAMA) {
      ollamaProvider.loadOllamaModels();
    } else if (provider === AI_PROVIDERS.GEMINI) {
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
  // Reset the UI
  pullStatusDiv.textContent = "";
  pullStatusDiv.className = "status";
  confirmPullBtn.disabled = true;
  
  // Reset the progress container
  const progressContainer = document.querySelector(".progress-container");
  const progressBarFill = document.getElementById("progress-bar-fill");
  if (progressContainer) progressContainer.style.display = "none";
  if (progressBarFill) progressBarFill.style.width = "0%";
  
  // Reset model details to default state
  const modelNameElement = document.querySelector(".model-name");
  const modelSizeBadge = document.querySelector(".model-size-badge");
  const modelParams = document.querySelector(".model-params");
  const modelCommand = document.querySelector(".model-command code");
  const modelRequirements = document.querySelector(".model-requirements");
  
  if (modelNameElement) modelNameElement.textContent = "Select a model";
  if (modelSizeBadge) modelSizeBadge.textContent = "-";
  if (modelParams) modelParams.textContent = "Parameters: -";
  if (modelCommand) modelCommand.textContent = "ollama run model-name";
  if (modelRequirements) modelRequirements.textContent = "System Requirements: -";
  
  // Reset and load the model library dropdown
  const modelLibrarySelect = document.getElementById("model-library-select");
  if (modelLibrarySelect) modelLibrarySelect.selectedIndex = 0;
  
  // Load the model library
  ollamaProvider.loadModelLibrary();
  
  // Show the modal
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
  const modelSelect = document.getElementById("model-library-select");
  const modelName = modelSelect.value;
  
  if (!modelName) {
    pullStatusDiv.textContent = "Please select a model to pull";
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

/**
 * Select a language card and deselect others
 * @param {string} languageCode The language code to select (e.g., 'en', 'vi')
 */
function selectLanguageCard(languageCode) {
  // Deselect all cards
  languageCardsContainer.querySelectorAll(".language-card").forEach((card) => {
    card.classList.remove("selected");
  });

  // Select the matching card
  const cardToSelect = languageCardsContainer.querySelector(`.language-card[data-language="${languageCode}"]`);
  if (cardToSelect) {
    cardToSelect.classList.add("selected");
  }
}

// Function to populate language options dynamically
function populateLanguageOptions() {
  // Clear any existing options
  languageSelect.innerHTML = "";
  languageCardsContainer.innerHTML = "";

  // Get available languages from the config manager
  const languages = configManager.getAvailableLanguages();

  // Add options to the select dropdown
  for (const code in languages) {
    const language = languages[code];
    const option = document.createElement("option");
    option.value = code;

    // Create localized display name (e.g., "Spanish (Español)")
    let displayName = language.name;
    if (code !== "en" && language.nativeName) {
      displayName += ` (${language.nativeName})`;
    }

    option.textContent = displayName;
    languageSelect.appendChild(option);

    // Create language card
    const card = document.createElement("div");
    card.className = "language-card";
    card.setAttribute("data-language", code);
    card.setAttribute("tabindex", "0"); // Make it focusable for accessibility

    const title = document.createElement("div");
    title.className = "language-card-title";
    title.textContent = language.name;
    card.appendChild(title);

    // Add native name if available and not English
    if (code !== "en" && language.nativeName) {
      const description = document.createElement("div");
      description.className = "language-card-description";
      description.textContent = language.nativeName;
      card.appendChild(description);
    }

    // Add language code badge
    const codeBadge = document.createElement("div");
    codeBadge.className = "language-code";
    codeBadge.textContent = code.toUpperCase();
    card.appendChild(codeBadge);

    // Add click handler
    card.addEventListener("click", () => {
      selectLanguageCard(code);
      languageSelect.value = code;
    });

    // Add keyboard support
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectLanguageCard(code);
        languageSelect.value = code;
      }
    });

    languageCardsContainer.appendChild(card);
  }
}

// Set up section toggle functionality
function setupSectionToggles() {
  sectionToggles.forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const section = toggle.closest(".section");
      const content = section.querySelector(".section-content");

      // Toggle collapsed state
      toggle.classList.toggle("collapsed");
      content.classList.toggle("collapsed");

      // Save the state to localStorage for persistence
      const sectionId = section.id;
      const isCollapsed = toggle.classList.contains("collapsed");

      try {
        const collapsedSections = JSON.parse(localStorage.getItem("collapsed-sections") || "{}");
        collapsedSections[sectionId] = isCollapsed;
        localStorage.setItem("collapsed-sections", JSON.stringify(collapsedSections));
      } catch (err) {
        console.error("Error saving section state", err);
      }
    });
  });
}

// Restore collapsed state of sections
function restoreSectionStates() {
  try {
    const collapsedSections = JSON.parse(localStorage.getItem("collapsed-sections") || "{}");

    for (const sectionId in collapsedSections) {
      if (collapsedSections[sectionId]) {
        const section = document.getElementById(sectionId);
        if (section) {
          const toggle = section.querySelector(".section-toggle");
          const content = section.querySelector(".section-content");

          if (toggle && content) {
            toggle.classList.add("collapsed");
            content.classList.add("collapsed");
          }
        }
      }
    }
  } catch (err) {
    console.error("Error restoring section states", err);
  }
}

// Event listener for language select dropdown
languageSelect.addEventListener("change", () => {
  selectLanguageCard(languageSelect.value);
});

// Save button handler
saveBtn.addEventListener("click", async () => {
  const selectedRadio = document.querySelector('input[name="aiProvider"]:checked');

  // Check if a provider has been selected
  if (!selectedRadio) {
    messageDiv.textContent = "Please select an AI provider first";
    messageDiv.className = "status error";
    return;
  }

  const aiProvider = selectedRadio.value;
  let currentModel;

  // Check if we need to initialize API clients based on the selected provider
  if (aiProvider === AI_PROVIDERS.OPENAI) {
    // Ensure we have an API key for OpenAI
    const openaiKey = API_KEYS.openai.key;
    if (!openaiKey) {
      messageDiv.textContent = "Please enter your OpenAI API key first";
      messageDiv.className = "status error";
      return;
    }

    // Initialize OpenAI client with the current key
    try {
      await ipcRenderer.invoke(IPC_CHANNELS.INITIALIZE_AI_CLIENT, AI_PROVIDERS.OPENAI, openaiKey);
    } catch (err) {
      console.error("Failed to initialize OpenAI client:", err);
      messageDiv.textContent = "Failed to initialize OpenAI client";
      messageDiv.className = "status error";
      return;
    }

    const selectedCard = openaiModelCards.querySelector(".model-card.selected");
    currentModel = selectedCard ? selectedCard.getAttribute("data-model") : openaiModelSelect.value;
  } else if (aiProvider === AI_PROVIDERS.GEMINI) {
    // Ensure we have an API key for Gemini
    const geminiKey = API_KEYS.gemini.key;
    if (!geminiKey) {
      messageDiv.textContent = "Please enter your Gemini API key first";
      messageDiv.className = "status error";
      return;
    }

    // Initialize Gemini client with the current key
    try {
      await ipcRenderer.invoke(IPC_CHANNELS.INITIALIZE_AI_CLIENT, AI_PROVIDERS.GEMINI, geminiKey);
    } catch (err) {
      console.error("Failed to initialize Gemini client:", err);
      messageDiv.textContent = "Failed to initialize Gemini client";
      messageDiv.className = "status error";
      return;
    }

    const selectedCard = document.getElementById("gemini-model-cards").querySelector(".model-card.selected");
    currentModel = selectedCard
      ? selectedCard.getAttribute("data-model")
      : document.getElementById("gemini-model").value;
  } else {
    const selectedCard = document.getElementById("ollama-model-cards").querySelector(".model-card.selected");
    currentModel = selectedCard
      ? selectedCard.getAttribute("data-model")
      : document.getElementById("ollama-model").value;
  }

  // Validate selection
  if (
    aiProvider === AI_PROVIDERS.OLLAMA &&
    (!currentModel || currentModel === "loading" || currentModel === "Ollama not configured")
  ) {
    messageDiv.textContent = "Please select a valid Ollama model";
    messageDiv.className = "status error";
    return;
  }

  // Validate that a model is selected
  if (!currentModel) {
    messageDiv.textContent = "Please select a model";
    messageDiv.className = "status error";
    return;
  }

  // For Ollama, always ensure we're using IPv4
  let ollamaUrl = ollamaUrlInput.value;
  if (aiProvider === AI_PROVIDERS.OLLAMA) {
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

  // Get selected language
  const responseLanguage = languageSelect.value;

  // Disable the save button to prevent multiple clicks
  saveBtn.disabled = true;

  // Create settings object to save
  const settings = {
    aiProvider,
    currentModel,
    ollamaUrl,
    responseLanguage,
  };

  try {
    // Update settings through the IPC channel to be persisted in the main process
    ipcRenderer.send(IPC_CHANNELS.UPDATE_MODEL_SETTINGS, settings);

    // Show success message
    messageDiv.textContent = "Settings saved!";
    messageDiv.className = "status success";

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
    messageDiv.textContent = "Could not save settings: " + error.message;
    messageDiv.className = "status error";
    saveBtn.disabled = false;
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

    // Add development-only keyboard shortcut for manual reload (Cmd/Ctrl+Shift+R)
    if (ctrlOrCmd && e.shiftKey && e.key === "R") {
      ipcRenderer.send(IPC_CHANNELS.DEV_RELOAD);
      e.preventDefault();
    }
  });
}

// Setup API key input handlers
function setupApiKeyInputs() {
  // Setup API key input for OpenAI
  const openaiApiKeyInput = document.getElementById(API_KEYS.openai.inputId);
  if (openaiApiKeyInput) {
    openaiApiKeyInput.addEventListener("input", (e) => {
      const key = e.target.value.trim();
      if (key) {
        // Store the full key
        API_KEYS.openai.key = key;
        // Also update gemini key with the same value for consistency
        API_KEYS.gemini.key = key;

        // Mask the key in the input
        const maskedKey = apiKeyManager.maskApiKey(key);
        if (openaiApiKeyInput.value !== maskedKey) {
          openaiApiKeyInput.value = maskedKey;
        }

        // Update gemini input field if it exists
        const geminiApiKeyInput = document.getElementById(API_KEYS.gemini.inputId);
        if (geminiApiKeyInput) {
          geminiApiKeyInput.value = maskedKey;
        }

        // Save the key
        apiKeyManager.saveApiKey("openai", key);

        // Initialize OpenAI client with the new key
        ipcRenderer.invoke(IPC_CHANNELS.INITIALIZE_AI_CLIENT, AI_PROVIDERS.OPENAI, key);

        // Auto-fetch models if key is long enough
        if (key.length >= 32) {
          // Minimum length for API keys
          apiKeyManager.validateAndFetchModels("openai", key, () => {
            // Nothing to do for OpenAI model fetching
          });
        }
      } else {
        apiKeyManager.updateApiKeyStatus("openai", "API key is required", "error");
      }
    });
  }

  // Setup API key input for Gemini
  const geminiApiKeyInput = document.getElementById(API_KEYS.gemini.inputId);
  if (geminiApiKeyInput) {
    geminiApiKeyInput.addEventListener("input", (e) => {
      const key = e.target.value.trim();
      if (key) {
        // Store the full key
        API_KEYS.gemini.key = key;
        // Also update openai key with the same value for consistency
        API_KEYS.openai.key = key;

        // Mask the key in the input
        const maskedKey = apiKeyManager.maskApiKey(key);
        if (geminiApiKeyInput.value !== maskedKey) {
          geminiApiKeyInput.value = maskedKey;
        }

        // Update openai input field if it exists
        const openaiApiKeyInput = document.getElementById(API_KEYS.openai.inputId);
        if (openaiApiKeyInput) {
          openaiApiKeyInput.value = maskedKey;
        }

        // Save the key
        apiKeyManager.saveApiKey("gemini", key);

        // Initialize Gemini client with the new key
        ipcRenderer.invoke(IPC_CHANNELS.INITIALIZE_AI_CLIENT, AI_PROVIDERS.GEMINI, key);

        // Auto-fetch models if key is long enough
        if (key.length >= 32) {
          // Minimum length for API keys
          apiKeyManager.validateAndFetchModels("gemini", key, geminiProvider.loadGeminiModels);
        }
      } else {
        apiKeyManager.updateApiKeyStatus("gemini", "API key is required", "error");
      }
    });
  }

  // Modal API key input handler
  const modalApiKeyInput = document.getElementById("modal-api-key");
  if (modalApiKeyInput) {
    modalApiKeyInput.addEventListener("input", (e) => {
      const modalApiKeyStatus = document.getElementById("modal-api-key-status");
      const key = e.target.value.trim();
      if (key) {
        modalApiKeyStatus.textContent = "";
      } else {
        modalApiKeyStatus.textContent = "API key is required";
        modalApiKeyStatus.className = "api-key-status error";
      }
    });
  }

  // Add toggle functionality for password fields
  function setupPasswordToggle(toggleId, inputId) {
    const toggleBtn = document.getElementById(toggleId);
    const inputField = document.getElementById(inputId);

    if (toggleBtn && inputField) {
      toggleBtn.addEventListener("click", () => {
        const showIcon = toggleBtn.querySelector(".show-password-icon");
        const hideIcon = toggleBtn.querySelector(".hide-password-icon");

        // Toggle password visibility
        if (inputField.type === "password") {
          inputField.type = "text";
          showIcon.classList.add("hidden");
          hideIcon.classList.remove("hidden");
        } else {
          inputField.type = "password";
          showIcon.classList.remove("hidden");
          hideIcon.classList.add("hidden");
        }
      });
    }
  }

  // Setup toggle buttons for all API key inputs
  setupPasswordToggle("toggle-openai-key", "openai-api-key");
  setupPasswordToggle("toggle-gemini-key", "gemini-api-key");
  setupPasswordToggle("toggle-modal-key", "modal-api-key");
}

// Initialize the application
function initialize() {
  // Load saved API keys
  apiKeyManager.loadApiKeys();

  // Set up API key input handlers
  setupApiKeyInputs();

  // Initialize modals
  initializeModals();
  
  // Set up keyboard shortcuts
  setupKeyboardShortcuts();

  // Populate language options
  populateLanguageOptions();

  // Set up section toggles
  setupSectionToggles();

  // Listen for visibility updates from main process
  ipcRenderer.on(IPC_CHANNELS.UPDATE_VISIBILITY, (event, isVisible) => {
    document.body.style.opacity = isVisible ? "1" : "0";
  });

  // Load current settings
  loadCurrentSettings();

  // Restore collapsed section states
  restoreSectionStates();

  // Run once on page load to adjust UI
  utils.adjustUIForScreenSize();

  // Fix progress bar styling
  const progressBarFill = document.getElementById("progress-bar-fill");
  if (progressBarFill) {
    // Make sure styles get applied correctly
    progressBarFill.style.height = "100%";
    progressBarFill.style.backgroundColor = "var(--accent-color)";
    progressBarFill.style.width = "0%";
    progressBarFill.style.transition = "width 0.3s ease";
  }

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

// Initialize modal event listeners
function initializeModals() {
  const apiKeyModal = document.getElementById("api-key-modal");
  const saveApiKeyBtn = document.getElementById("save-api-key");
  const cancelApiKeyBtn = document.getElementById("cancel-api-key");
  const closeModalBtn = document.querySelector(".close-modal");

  // Save API key button
  saveApiKeyBtn.addEventListener("click", () => {
    modalManager.saveApiKeyFromModal();
  });

  // Cancel and close buttons
  cancelApiKeyBtn.addEventListener("click", () => {
    modalManager.closeApiKeyModal();
  });

  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", () => {
      modalManager.closeApiKeyModal();
    });
  }

  // Close modal when clicking outside
  window.addEventListener("click", (e) => {
    if (e.target === apiKeyModal) {
      modalManager.closeApiKeyModal();
    }
  });

  // Add keyboard shortcuts for modal
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && apiKeyModal.style.display === "block") {
      modalManager.closeApiKeyModal();
    }
    if (e.key === "Enter" && apiKeyModal.style.display === "block") {
      saveApiKeyBtn.click();
    }
  });
}

// Start initialization when DOM is loaded
document.addEventListener("DOMContentLoaded", initialize);

// Export for use in other parts of the application
window.API_KEYS = API_KEYS;
window.showApiKeyModal = modalManager.showApiKeyModal;
