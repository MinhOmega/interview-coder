const axios = require("axios");

// Load models from Ollama
async function loadOllamaModels() {
  const ollamaStatus = document.getElementById("ollama-status");
  const visionModelsNote = document.getElementById("vision-models-note");
  const ollamaModelCards = document.getElementById("ollama-model-cards");
  const ollamaModelSelect = document.getElementById("ollama-model");
  const ipcRenderer = window.ipcRenderer;
  
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
    if (window.currentSettings && window.currentSettings.aiProvider === "ollama" && window.currentSettings.currentModel) {
      window.selectModelCard("ollama", window.currentSettings.currentModel);
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

// Test Ollama connection
async function testOllamaConnection() {
  const connectionTestResult = document.getElementById("connection-test-result");
  const ollamaUrlInput = document.getElementById("ollama-url");
  
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

// Pull an Ollama model
async function pullOllamaModel(modelName) {
  const pullStatusDiv = document.getElementById("pull-status");
  const confirmPullBtn = document.getElementById("confirm-pull");
  const ollamaUrlInput = document.getElementById("ollama-url");
  
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
      window.selectModelCard("ollama", modelName);

      // Close the modal after a delay
      setTimeout(() => {
        document.getElementById("pull-model-modal").style.display = "none";
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

module.exports = {
  loadOllamaModels,
  testOllamaConnection,
  pullOllamaModel
}; 