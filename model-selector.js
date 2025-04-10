const { ipcRenderer } = require("electron");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

// Elements
const aiProviderRadios = document.querySelectorAll('input[name="aiProvider"]');
const radioLabels = document.querySelectorAll(".radio-label");
const openaiSection = document.getElementById("openai-section");
const ollamaSection = document.getElementById("ollama-section");
const geminiSection = document.getElementById("gemini-section");
const geminiLoading = document.getElementById("gemini-loading");
const openaiModelSelect = document.getElementById("openai-model");
const openaiModelCards = document.getElementById("openai-model-cards");
const ollamaModelSelect = document.getElementById("ollama-model");
const ollamaModelCards = document.getElementById("ollama-model-cards");
const geminiModelSelect = document.getElementById("gemini-model");
const geminiModelCards = document.getElementById("gemini-model-cards");
const ollamaUrlInput = document.getElementById("ollama-url");
const ollamaStatus = document.getElementById("ollama-status");
const visionModelsNote = document.getElementById("vision-models-note");
const refreshModelsBtn = document.getElementById("refresh-models");
const testConnectionBtn = document.getElementById("test-connection");
const pullModelBtn = document.getElementById("pull-model-btn");
const connectionTestResult = document.getElementById("connection-test-result");
const saveBtn = document.getElementById("save-settings");
const cancelBtn = document.getElementById("cancel");
const messageDiv = document.getElementById("message");

// Pull model modal elements
const pullModelModal = document.getElementById("pull-model-modal");
const closeModalBtn = document.querySelector(".close-modal");
const modelToPullInput = document.getElementById("model-to-pull");
const pullStatusDiv = document.getElementById("pull-status");
const confirmPullBtn = document.getElementById("confirm-pull");
const cancelPullBtn = document.getElementById("cancel-pull");

// Load current settings
let currentSettings = {};
let geminiApiKey = ""; // Will store the API key from .env

// Detect platform for correct key labels
const isMac = navigator.platform.includes("Mac");

// Function to parse the .env file and get the GEMINI_API_KEY
function getGeminiApiKey() {
  try {
    // Read the .env file from the application root directory
    const envPath = path.join(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf8");
      const lines = envContent.split("\n");

      for (const line of lines) {
        if (line.startsWith("GEMINI_API_KEY=")) {
          return line.substring("GEMINI_API_KEY=".length).trim();
        }
      }
    }

    // If we couldn't find the key in .env, check environment variables
    if (process.env.GEMINI_API_KEY) {
      return process.env.GEMINI_API_KEY;
    }

    return ""; // Return empty string if no key found
  } catch (error) {
    console.error("Error reading .env file:", error);
    return "";
  }
}

// Function to fetch Gemini models from the API
async function fetchGeminiModels() {
  geminiLoading.innerHTML = 'Loading Gemini models... <span class="loading"></span>';
  geminiModelSelect.innerHTML = '<option value="loading">Loading models...</option>';
  geminiModelCards.style.display = "none";
  geminiModelCards.innerHTML = "";

  try {
    // Get API key from .env file
    geminiApiKey = getGeminiApiKey();

    if (!geminiApiKey) {
      geminiLoading.textContent = "Error: No Gemini API key found in .env file";
      geminiModelSelect.innerHTML = '<option value="">No API key available</option>';
      return;
    }

    // Show loading indication in a more accessible way
    geminiLoading.innerHTML = '<div class="loading"></div><span>Loading models from Google AI...</span>';

    // Make API request to get available models
    const response = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiApiKey}`);

    if (response.data && response.data.models) {
      // Clear the select element
      geminiModelSelect.innerHTML = "";

      // Filter for Gemini models
      const geminiModels = response.data.models.filter(
        (model) =>
          model.name.includes("gemini") &&
          !model.name.includes("embedding") &&
          model.supportedGenerationMethods.includes("generateContent"),
      );

      if (geminiModels.length === 0) {
        geminiLoading.textContent = "No Gemini models found";
        geminiModelSelect.innerHTML = '<option value="">No models available</option>';
        return;
      }

      // Group models by family (1.5, 2.0, etc.)
      const modelFamilies = {};
      geminiModels.forEach((model) => {
        const modelName = model.displayName.toLowerCase();
        let family = "other";

        if (modelName.includes("1.5")) family = "1.5";
        else if (modelName.includes("2.0")) family = "2.0";
        else if (modelName.includes("2.5")) family = "2.5";

        if (!modelFamilies[family]) modelFamilies[family] = [];
        modelFamilies[family].push(model);
      });

      // Clear existing cards
      geminiModelCards.innerHTML = "";

      // Add models to select and create model cards grouped by family
      for (const family in modelFamilies) {
        if (modelFamilies[family].length > 0) {
          // Sort by whether contains "flash", "pro", "ultra" etc
          modelFamilies[family].sort((a, b) => {
            const aName = a.displayName.toLowerCase();
            const bName = b.displayName.toLowerCase();

            // Flash models first (faster/cheaper)
            if (aName.includes("flash") && !bName.includes("flash")) return -1;
            if (!aName.includes("flash") && bName.includes("flash")) return 1;

            // Then Pro models
            if (aName.includes("pro") && !bName.includes("pro")) return aName.includes("flash") ? -1 : 1;
            if (!aName.includes("pro") && bName.includes("pro")) return bName.includes("flash") ? 1 : -1;

            return aName.localeCompare(bName);
          });

          // Add models in this family
          modelFamilies[family].forEach((model) => {
            const modelId = model.name.replace("models/", "");

            // Add to select element
            const option = document.createElement("option");
            option.value = modelId;
            option.textContent = model.displayName;
            geminiModelSelect.appendChild(option);

            // Create model card
            const modelCard = document.createElement("div");
            modelCard.className = "model-card";
            modelCard.setAttribute("data-model", modelId);
            // Make cards keyboard focusable
            modelCard.setAttribute("tabindex", "0");

            // Add title
            const title = document.createElement("div");
            title.className = "model-card-title";
            title.textContent = model.displayName;
            modelCard.appendChild(title);

            // Add description
            const description = document.createElement("div");
            description.className = "model-card-description";
            description.textContent = model.description || "Google AI model";
            modelCard.appendChild(description);

            // Add token limit badge if available
            if (model.inputTokenLimit) {
              // Format large numbers with K or M for readability
              let tokenLimit = model.inputTokenLimit;
              if (tokenLimit >= 1000000) {
                tokenLimit = (tokenLimit / 1000000).toFixed(1) + "M";
              } else if (tokenLimit >= 1000) {
                tokenLimit = (tokenLimit / 1000).toFixed(0) + "K";
              }

              const badge = document.createElement("div");
              badge.className = "model-card-badge";
              badge.textContent = `${tokenLimit} tokens`;
              modelCard.appendChild(badge);
            }

            // Add vision badge if supports images
            if (
              model.supportedGenerationMethods.includes("generateContent") &&
              model.inputSupportedMimeTypes &&
              model.inputSupportedMimeTypes.some((mime) => mime.includes("image"))
            ) {
              const visionBadge = document.createElement("div");
              visionBadge.className = model.inputTokenLimit
                ? "model-card-badge vision second"
                : "model-card-badge vision";
              visionBadge.textContent = "Vision";
              modelCard.appendChild(visionBadge);
            }

            // Add click handler to select this model
            modelCard.addEventListener("click", () => {
              selectGeminiModel(modelCard, modelId);
            });

            // Add keyboard support
            modelCard.addEventListener("keydown", (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                selectGeminiModel(modelCard, modelId);
              }
            });

            geminiModelCards.appendChild(modelCard);
          });
        }
      }

      // Helper function to select a Gemini model
      function selectGeminiModel(card, modelId) {
        // Deselect all other cards
        document.querySelectorAll("#gemini-model-cards .model-card").forEach((c) => {
          c.classList.remove("selected");
        });

        // Select this card and update the hidden select
        card.classList.add("selected");
        geminiModelSelect.value = modelId;

        // Scroll the card into view on mobile if needed
        if (window.innerWidth <= 768) {
          card.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }

      // Show the model cards
      geminiModelCards.style.display = "grid";
      geminiLoading.innerHTML = `<span>${geminiModels.length} Gemini models available</span>`;

      // Select the current model if it exists
      if (currentSettings.aiProvider === "gemini" && currentSettings.currentModel) {
        selectModelCard("gemini", currentSettings.currentModel);
      } else {
        // Select a default model - prefer gemini-1.5-flash if available
        const defaultModel = geminiModels.find(
          (model) => model.name.includes("gemini-1.5-flash") || model.name.includes("gemini-pro"),
        );

        if (defaultModel) {
          const modelId = defaultModel.name.replace("models/", "");
          selectModelCard("gemini", modelId);
        }
      }

      // Make sure a model is always selected
      if (!geminiModelCards.querySelector(".model-card.selected") && geminiModelCards.firstChild) {
        const firstCard = geminiModelCards.firstChild;
        firstCard.classList.add("selected");
        geminiModelSelect.value = firstCard.getAttribute("data-model");
      }
    } else {
      geminiLoading.textContent = "Error: Invalid response from Gemini API";
      geminiModelSelect.innerHTML = '<option value="">Error loading models</option>';
    }
  } catch (error) {
    console.error("Error fetching Gemini models:", error);
    geminiLoading.textContent = `Error: ${error.message}`;
    geminiModelSelect.innerHTML = '<option value="">Error loading models</option>';
  }
}

// Helper function to select a model card and update the select element
function selectModelCard(provider, modelId) {
  let modelCards;
  let selectElement;

  switch (provider) {
    case "openai":
      modelCards = openaiModelCards;
      selectElement = openaiModelSelect;
      break;
    case "gemini":
      modelCards = geminiModelCards;
      selectElement = geminiModelSelect;
      break;
    case "ollama":
      modelCards = ollamaModelCards;
      selectElement = ollamaModelSelect;
      break;
    default:
      return;
  }

  // Deselect all cards
  modelCards.querySelectorAll(".model-card").forEach((card) => {
    card.classList.remove("selected");
  });

  // Find the exact match first
  let modelCard = modelCards.querySelector(`.model-card[data-model="${modelId}"]`);

  // If not found, try a partial match
  if (!modelCard) {
    modelCard = Array.from(modelCards.querySelectorAll(".model-card")).find((card) => {
      return modelId.includes(card.getAttribute("data-model")) || card.getAttribute("data-model").includes(modelId);
    });
  }

  // If we found a card, select it
  if (modelCard) {
    modelCard.classList.add("selected");
    selectElement.value = modelCard.getAttribute("data-model");
  }
}

// Test Ollama connection
async function testOllamaConnection() {
  connectionTestResult.innerHTML = 'Testing connection... <span class="loading"></span>';
  connectionTestResult.className = "status";

  try {
    // Always use IPv4 by replacing localhost with 127.0.0.1
    const url = ollamaUrlInput.value.replace("localhost", "127.0.0.1");

    const response = await axios.get(`${url}/api/version`, {
      timeout: 5000,
      validateStatus: false,
    });

    if (response.status === 200) {
      connectionTestResult.textContent = `Connected successfully! Ollama version: ${response.data.version}`;
      connectionTestResult.className = "status success";
      return true;
    } else {
      connectionTestResult.textContent = `Error: Received status ${response.status}`;
      connectionTestResult.className = "status error";
      return false;
    }
  } catch (error) {
    connectionTestResult.textContent = `Connection failed: ${error.message}`;
    connectionTestResult.className = "status error";
    return false;
  }
}

async function loadCurrentSettings() {
  try {
    currentSettings = await ipcRenderer.invoke("get-current-settings");
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
    selectModelCard("openai", currentSettings.currentModel);
  } else if (currentSettings.aiProvider === "gemini") {
    fetchGeminiModels();
  }

  // Update visibility based on provider
  updateSectionVisibility(currentSettings.aiProvider);

  // Load Ollama models
  if (currentSettings.aiProvider === "ollama") {
    loadOllamaModels();
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

// Update section visibility based on selected provider
function updateSectionVisibility(provider) {
  // Reset all sections
  openaiSection.style.display = "none";
  ollamaSection.style.display = "none";
  geminiSection.style.display = "none";

  // Update selected radio label styling
  radioLabels.forEach((label) => label.classList.remove("selected"));
  document.getElementById(`${provider}-radio-label`).classList.add("selected");

  // Show the selected provider's section
  if (provider === "openai") {
    openaiSection.style.display = "block";
  } else if (provider === "gemini") {
    geminiSection.style.display = "block";
  } else {
    ollamaSection.style.display = "block";
  }

  // Load models for the selected provider
  if (provider === "ollama") {
    loadOllamaModels();
  } else if (provider === "gemini") {
    fetchGeminiModels();
  }
}

// Load models from Ollama
async function loadOllamaModels() {
  ollamaStatus.innerHTML = '<div class="loading"></div><span>Loading models...</span>';
  ollamaStatus.className = "status";
  visionModelsNote.style.display = "none";
  ollamaModelCards.style.display = "none";
  ollamaModelCards.innerHTML = "";

  try {
    let models = [];
    try {
      models = await ipcRenderer.invoke("get-ollama-models");
    } catch (invokeError) {
      // Handle missing handler or other errors
      if (invokeError.message.includes("No handler registered for")) {
        ollamaStatus.textContent = "Ollama support is not fully configured. Other AI providers are still available.";
        ollamaStatus.className = "status error";
        ollamaModelSelect.innerHTML = '<option value="">Ollama not configured</option>';
        return;
      } else {
        throw invokeError; // Re-throw other errors to be caught below
      }
    }

    // Clear and populate the select
    ollamaModelSelect.innerHTML = "";

    if (models.length === 0) {
      ollamaModelSelect.innerHTML = '<option value="">No models found</option>';
      ollamaStatus.textContent = "No models found. Is Ollama running?";
      ollamaStatus.className = "status error";
      return;
    }

    // Group by category for better organization
    const modelGroups = {
      vision: [],
      llama: [],
      mistral: [],
      other: [],
    };

    // Check for vision models
    let hasVisionModels = false;
    const visionModelNames = ["llava", "bakllava", "moondream", "deepseek"];

    // Sort models into categories
    models.forEach((model) => {
      const modelName = model.name.toLowerCase();

      // Check if this is a vision model
      const isVisionModel = visionModelNames.some((name) => modelName.includes(name));
      if (isVisionModel) {
        hasVisionModels = true;
        modelGroups.vision.push(model);
      } else if (modelName.includes("llama")) {
        modelGroups.llama.push(model);
      } else if (modelName.includes("mistral")) {
        modelGroups.mistral.push(model);
      } else {
        modelGroups.other.push(model);
      }

      // Create select option
      const option = document.createElement("option");
      option.value = model.name;
      option.textContent = model.name;
      ollamaModelSelect.appendChild(option);
    });

    // Add models to cards in order: vision, llama, mistral, other
    // First add vision models if any
    if (modelGroups.vision.length > 0) {
      modelGroups.vision.forEach((model) => createOllamaModelCard(model, true));
    }

    // Then add other groups
    ["llama", "mistral", "other"].forEach((group) => {
      if (modelGroups[group].length > 0) {
        modelGroups[group].forEach((model) => createOllamaModelCard(model, false));
      }
    });

    // Helper function to create a model card
    function createOllamaModelCard(model, isVision) {
      // Create model card
      const modelCard = document.createElement("div");
      modelCard.className = "model-card";
      modelCard.setAttribute("data-model", model.name);
      modelCard.setAttribute("tabindex", "0"); // Make keyboard focusable

      // Add title
      const title = document.createElement("div");
      title.className = "model-card-title";
      title.textContent = model.name;
      modelCard.appendChild(title);

      // Add description
      const descText =
        model.details && model.details.family
          ? `${model.details.family} (${Math.round(model.size / 1024 / 1024)}MB)`
          : `Size: ${Math.round(model.size / 1024 / 1024)}MB`;

      const description = document.createElement("div");
      description.className = "model-card-description";
      description.textContent = descText;
      modelCard.appendChild(description);

      // Add vision badge if applicable
      if (isVision) {
        const visionBadge = document.createElement("div");
        visionBadge.className = "model-card-badge vision";
        visionBadge.textContent = "Vision";
        modelCard.appendChild(visionBadge);
      }

      // Add click handler to select this model
      modelCard.addEventListener("click", selectOllamaModel);

      // Add keyboard handler for accessibility
      modelCard.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectOllamaModel();
        }
      });

      function selectOllamaModel() {
        // Deselect all other cards
        document.querySelectorAll("#ollama-model-cards .model-card").forEach((card) => {
          card.classList.remove("selected");
        });

        // Select this card and update the hidden select
        modelCard.classList.add("selected");
        ollamaModelSelect.value = model.name;

        // Scroll into view on mobile
        if (window.innerWidth <= 768) {
          modelCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }

      ollamaModelCards.appendChild(modelCard);
    }

    // Show the model cards
    ollamaModelCards.style.display = "grid";

    // If the current model is set and exists in the list, select it
    if (currentSettings.aiProvider === "ollama" && currentSettings.currentModel) {
      selectModelCard("ollama", currentSettings.currentModel);
    }

    // Ensure a model is selected
    if (!ollamaModelCards.querySelector(".model-card.selected") && ollamaModelCards.firstChild) {
      const firstCard = ollamaModelCards.firstChild;
      firstCard.classList.add("selected");
      ollamaModelSelect.value = firstCard.getAttribute("data-model");
    }

    // Show vision model note if needed
    if (hasVisionModels) {
      visionModelsNote.style.display = "block";
    }

    ollamaStatus.innerHTML = `<span>${models.length} models loaded</span>`;
    ollamaStatus.className = "status success";
  } catch (error) {
    ollamaStatus.textContent = `Error: ${error.message}`;
    ollamaStatus.className = "status error";
    ollamaModelSelect.innerHTML = '<option value="">Error loading models</option>';

    // Check if the error is likely due to Ollama not running
    if (error.message.includes("ECONNREFUSED") || error.message.includes("ECONNRESET")) {
      ollamaStatus.textContent = "Cannot connect to Ollama. Is Ollama running?";
    }
  }
}

// Pull an Ollama model
async function pullOllamaModel(modelName) {
  pullStatusDiv.innerHTML = `Pulling model ${modelName}... <span class="loading"></span>`;
  pullStatusDiv.className = "status";
  confirmPullBtn.disabled = true;

  try {
    // Always use IPv4 by replacing localhost with 127.0.0.1
    const url = ollamaUrlInput.value.replace("localhost", "127.0.0.1");

    pullStatusDiv.textContent = `Sending pull request for ${modelName}...`;

    // Use Ollama API to pull the model
    const response = await axios.post(
      `${url}/api/pull`,
      {
        name: modelName,
        stream: false,
      },
      {
        timeout: 300000, // 5 minute timeout for pulling
      },
    );

    if (response.data && response.data.status === "success") {
      pullStatusDiv.textContent = `Successfully pulled model: ${modelName}`;
      pullStatusDiv.className = "status success";

      // Reload the model list
      await loadOllamaModels();

      // Select the newly pulled model
      selectModelCard("ollama", modelName);

      // Close the modal after a delay
      setTimeout(() => {
        pullModelModal.style.display = "none";
        confirmPullBtn.disabled = false;
      }, 2000);

      return true;
    } else {
      pullStatusDiv.textContent = `Error pulling model: ${response.data.status || "Unknown error"}`;
      pullStatusDiv.className = "status error";
      confirmPullBtn.disabled = false;
      return false;
    }
  } catch (error) {
    pullStatusDiv.textContent = `Error pulling model: ${error.message}`;
    pullStatusDiv.className = "status error";
    confirmPullBtn.disabled = false;
    return false;
  }
}

// Event Listeners for radio buttons
for (const radio of aiProviderRadios) {
  radio.addEventListener("change", () => {
    const provider = radio.value;
    updateSectionVisibility(provider);
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

refreshModelsBtn.addEventListener("click", loadOllamaModels);
testConnectionBtn.addEventListener("click", testOllamaConnection);

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

  await pullOllamaModel(modelName);
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
    const selectedCard = geminiModelCards.querySelector(".model-card.selected");
    currentModel = selectedCard ? selectedCard.getAttribute("data-model") : geminiModelSelect.value;
  } else {
    const selectedCard = ollamaModelCards.querySelector(".model-card.selected");
    currentModel = selectedCard ? selectedCard.getAttribute("data-model") : ollamaModelSelect.value;
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
    ipcRenderer.send("update-model-settings", settings);

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

// Initialize
loadCurrentSettings();

// Handle window resize events to adjust UI
let resizeTimeout;
window.addEventListener("resize", () => {
  // Debounce resize events
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    adjustUIForScreenSize();
  }, 250);
});

// Adjust UI based on screen size
function adjustUIForScreenSize() {
  const isMobile = window.innerWidth <= 768;
  const isSmallMobile = window.innerWidth <= 480;

  // Get all buttons in flex containers
  const buttonContainers = document.querySelectorAll(".flex.justify-between");
  buttonContainers.forEach((container) => {
    if (isSmallMobile) {
      container.style.flexDirection = "column";
      container.style.gap = "var(--space-sm)";

      // Make buttons full width
      container.querySelectorAll("button").forEach((btn) => {
        btn.style.width = "100%";
      });
    } else {
      container.style.flexDirection = "";
      container.style.gap = "";

      // Reset button width
      container.querySelectorAll("button").forEach((btn) => {
        btn.style.width = "";
      });
    }
  });

  // Ensure scroll position is correct for any selected cards
  const selectedCard = document.querySelector(".model-card.selected");
  if (selectedCard && isMobile) {
    selectedCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

// Run once on page load
adjustUIForScreenSize();

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
        ipcRenderer.send("toggle-visibility");
        e.preventDefault();
        break;
      case "s": // Save settings
        saveBtn.click();
        e.preventDefault();
        break;
    }
  }
});

// Listen for visibility updates from main process
ipcRenderer.on("update-visibility", (event, isVisible) => {
  document.body.style.opacity = isVisible ? "1" : "0";
});