// Helper function to select a model card and update the select element
function selectModelCard(provider, modelId) {
  let modelCards;
  let selectElement;

  switch (provider) {
    case "openai":
      modelCards = document.getElementById("openai-model-cards");
      selectElement = document.getElementById("openai-model");
      break;
    case "gemini":
      modelCards = document.getElementById("gemini-model-cards");
      selectElement = document.getElementById("gemini-model");
      break;
    case "ollama":
      modelCards = document.getElementById("ollama-model-cards");
      selectElement = document.getElementById("ollama-model");
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

module.exports = {
  selectModelCard,
  updateSectionVisibility,
  adjustUIForScreenSize
}; 