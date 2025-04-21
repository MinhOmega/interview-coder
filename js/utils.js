const { AI_PROVIDERS } = require("./constants");
const { app } = require("electron");
const path = require("path");

/**
 * Safely gets a path from Electron's app.getPath
 * This is cross-platform compatible across Windows, Linux, and MacOS
 * @param {string} pathName - The path name to get (e.g., "userData", "documents", "pictures")
 * @param {string} defaultPath - Default path to use if app is not available (e.g., in renderer process)
 * @returns {string} The resolved path or empty string if not available
 */
const getAppPath = (pathName, defaultPath = "") => {
  try {
    // Check if app is available and properly initialized
    if (app && typeof app.getPath === "function") {
      return app.getPath(pathName);
    }

    // Return default path if provided
    return defaultPath;
  } catch (error) {
    console.error(`Error getting ${pathName} path:`, error);
    return defaultPath;
  }
};

/**
 * Gets the full path to a file in the user data directory
 * @param {string} filename - The filename to join with user data path
 * @returns {string} The full path to the file
 */
const getUserDataPath = (filename) => {
  const userDataPath = getAppPath("userData", "");
  return path.join(userDataPath, filename);
};

/**
 * Selects a model card and updates the select element
 * @param {string} provider - The provider
 * @param {string} modelId - The model ID
 */
function selectModelCard(provider, modelId) {
  let modelCards;
  let selectElement;

  switch (provider) {
    case AI_PROVIDERS.OPENAI:
      modelCards = document.getElementById("openai-model-cards");
      selectElement = document.getElementById("openai-model");
      break;
    case AI_PROVIDERS.GEMINI:
      modelCards = document.getElementById("gemini-model-cards");
      selectElement = document.getElementById("gemini-model");
      break;
    case AI_PROVIDERS.OLLAMA:
      modelCards = document.getElementById("ollama-model-cards");
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

// Update section visibility based on selected provider
function updateSectionVisibility(provider) {
  const openaiSection = document.getElementById("openai-section");
  const ollamaSection = document.getElementById("ollama-section");
  const geminiSection = document.getElementById("gemini-section");
  const radioLabels = document.querySelectorAll(".radio-label");

  // Reset all sections
  openaiSection.style.display = "none";
  ollamaSection.style.display = "none";
  geminiSection.style.display = "none";

  // If provider is not defined or is a default value, keep all sections hidden
  if (!provider || provider === "AI") {
    // Remove selected class from all radio labels
    radioLabels.forEach((label) => label.classList.remove("selected"));
    return;
  }

  // Update selected radio label styling
  radioLabels.forEach((label) => label.classList.remove("selected"));
  const selectedLabel = document.getElementById(`${provider}-radio-label`);
  if (selectedLabel) {
    selectedLabel.classList.add("selected");
  }

  // Show the selected provider's section
  if (provider === "openai") {
    openaiSection.style.display = "block";
  } else if (provider === "gemini") {
    geminiSection.style.display = "block";
  } else if (provider === "ollama") {
    ollamaSection.style.display = "block";
  }
}

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

/**
 * Checks if a command is available in the system
 * @param {string} command - The command to check
 * @returns {boolean} True if the command is available, false otherwise
 */
const isCommandAvailable = (command) => {
  try {
    const { execSync } = require("child_process");
    execSync(`which ${command}`, { stdio: "ignore" });
    return true;
  } catch (error) {
    return false;
  }
};

module.exports = {
  selectModelCard,
  updateSectionVisibility,
  adjustUIForScreenSize,
  getAppPath,
  getUserDataPath,
  isCommandAvailable,
};
