const axios = require("axios");
const { API_KEYS } = require('./config');

// Function to fetch Gemini models from the API
async function fetchGeminiModels() {
  const geminiLoading = document.getElementById("gemini-loading");
  const geminiModelSelect = document.getElementById("gemini-model");
  const geminiModelCards = document.getElementById("gemini-model-cards");
  
  geminiLoading.innerHTML = 'Loading Gemini models... <span class="loading"></span>';
  geminiModelSelect.innerHTML = '<option value="loading">Loading models...</option>';
  geminiModelCards.style.display = "none";
  geminiModelCards.innerHTML = "";

  try {
    // Get API key from stored value
    const apiKey = API_KEYS.gemini.key;

    if (!apiKey) {
      geminiLoading.textContent = "Error: No Gemini API key found. Please enter your API key.";
      geminiModelSelect.innerHTML = '<option value="">No API key available</option>';
      return;
    }

    // Show loading indication
    geminiLoading.innerHTML = '<div class="loading"></div><span>Loading models from Google AI...</span>';

    // Make API request to get available models
    const response = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);

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
            modelCard.setAttribute("tabindex", "0"); // Make cards keyboard focusable

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
      if (window.currentSettings && window.currentSettings.aiProvider === "gemini" && window.currentSettings.currentModel) {
        window.selectModelCard("gemini", window.currentSettings.currentModel);
      } else {
        // Select a default model - prefer gemini-1.5-flash if available
        const defaultModel = geminiModels.find(
          (model) => model.name.includes("gemini-1.5-flash") || model.name.includes("gemini-pro"),
        );

        if (defaultModel) {
          const modelId = defaultModel.name.replace("models/", "");
          window.selectModelCard("gemini", modelId);
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

// Wrapper function for fetchGeminiModels
function loadGeminiModels() {
  fetchGeminiModels();
}

module.exports = {
  loadGeminiModels,
  fetchGeminiModels
}; 