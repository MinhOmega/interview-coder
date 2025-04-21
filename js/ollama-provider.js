const axios = require("axios");
const { IPC_CHANNELS } = require("./constants");

// Load models from Ollama
async function loadOllamaModels() {
  const ollamaStatus = document.getElementById("ollama-status");
  const visionModelsNote = document.getElementById("vision-models-note");
  const ollamaModelCards = document.getElementById("ollama-model-cards");
  const ipcRenderer = window.ipcRenderer;

  ollamaStatus.innerHTML = '<div class="loading"></div><span>Loading models...</span>';
  ollamaStatus.className = "status";
  visionModelsNote.style.display = "none";
  ollamaModelCards.style.display = "none";
  ollamaModelCards.innerHTML = "";

  try {
    let models = [];
    try {
      models = await ipcRenderer.invoke(IPC_CHANNELS.GET_OLLAMA_MODELS);
    } catch (invokeError) {
      // Handle missing handler or other errors
      if (invokeError.message.includes("No handler registered for")) {
        ollamaStatus.textContent = "Ollama support is not fully configured. Other AI providers are still available.";
        ollamaStatus.className = "status error";
        return;
      } else {
        throw invokeError; // Re-throw other errors to be caught below
      }
    }

    if (models.length === 0) {
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
      // Create elements directly instead of using a template
      const modelCard = document.createElement("div");
      modelCard.className = "model-card";
      modelCard.setAttribute("tabindex", "0");
      modelCard.setAttribute("data-model", model.name);
      modelCard.style.transition = "opacity 0.3s ease, transform 0.3s ease";

      // Create title
      const title = document.createElement("div");
      title.className = "model-card-title";
      title.textContent = model.name;
      modelCard.appendChild(title);

      // Create description
      const description = document.createElement("div");
      description.className = "model-card-description";
      const descText =
        model.details && model.details.family
          ? `${model.details.family} (${Math.round(model.size / 1024 / 1024)}MB)`
          : `Size: ${Math.round(model.size / 1024 / 1024)}MB`;
      description.textContent = descText;
      modelCard.appendChild(description);

      // Create vision badge
      const visionBadge = document.createElement("div");
      visionBadge.className = "model-card-badge vision";
      visionBadge.textContent = "Vision";
      visionBadge.style.display = isVision ? "inline-flex" : "none";
      modelCard.appendChild(visionBadge);

      // Create installed badge
      const installedBadge = document.createElement("div");
      installedBadge.className = "model-card-badge installed";
      installedBadge.style.display = "inline-flex";

      // Use emoji character for checkmark and text
      const checkText = document.createElement("span");
      checkText.textContent = "✓";
      checkText.style.marginRight = "3px";
      installedBadge.appendChild(checkText);

      modelCard.appendChild(installedBadge);

      // Create uninstall button
      const uninstallBtn = document.createElement("button");
      uninstallBtn.className = "model-card-uninstall";
      uninstallBtn.setAttribute("aria-label", `Uninstall model ${model.name}`);
      uninstallBtn.setAttribute("title", `Uninstall ${model.name}`);

      // Use emoji character instead of SVG for better compatibility
      uninstallBtn.textContent = "❌";

      modelCard.appendChild(uninstallBtn);

      // Add click handler to uninstall the model
      uninstallBtn.addEventListener("click", async (e) => {
        e.stopPropagation(); // Prevent card selection when clicking uninstall
        e.preventDefault();

        if (confirm(`Are you sure you want to uninstall the model "${model.name}"?`)) {
          try {
            // Show loading state
            uninstallBtn.disabled = true;
            modelCard.style.opacity = "0.6";

            // Make API call to remove the model
            const ollamaUrlInput = document.getElementById("ollama-url");
            const url = ollamaUrlInput.value.replace("localhost", "127.0.0.1");

            const response = await axios({
              method: "delete",
              url: `${url}/api/delete`,
              data: { name: model.name },
            });

            if (response.status === 200) {
              // Add a fade-out animation
              modelCard.style.transform = "scale(0.95)";
              modelCard.style.opacity = "0";

              // Remove the card after animation
              setTimeout(() => {
                // Reload models to refresh the view
                loadOllamaModels();
              }, 300);
            } else {
              alert(`Failed to uninstall model: ${response.data?.error || "Unknown error"}`);
              uninstallBtn.disabled = false;
              modelCard.style.opacity = "1";
            }
          } catch (error) {
            alert(`Error uninstalling model: ${error.message}`);
            uninstallBtn.disabled = false;
            modelCard.style.opacity = "1";
          }
        }
      });

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

        // Scroll into view on mobile
        if (window.innerWidth <= 768) {
          modelCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }

      // Add the card to the container
      ollamaModelCards.appendChild(modelCard);
    }

    // Show the model cards
    ollamaModelCards.style.display = "grid";

    // If the current model is set and exists in the list, select it
    if (
      window.currentSettings &&
      window.currentSettings.aiProvider === "ollama" &&
      window.currentSettings.currentModel
    ) {
      window.selectModelCard("ollama", window.currentSettings.currentModel);
    }

    // Ensure a model is selected
    if (!ollamaModelCards.querySelector(".model-card.selected") && ollamaModelCards.firstChild) {
      const firstCard = ollamaModelCards.firstChild;
      firstCard.classList.add("selected");
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

// Library of models for Ollama
const MODEL_LIBRARY = [
  { name: "gemma3:1b", params: "1B", size: "815MB", ram: "4GB", cpuCores: 2, family: "Gemma 3" },
  { name: "gemma3", params: "4B", size: "3.3GB", ram: "8GB", cpuCores: 4, family: "Gemma 3" },
  { name: "gemma3:12b", params: "12B", size: "8.1GB", ram: "16GB", cpuCores: 6, family: "Gemma 3" },
  { name: "gemma3:27b", params: "27B", size: "17GB", ram: "32GB", cpuCores: 8, family: "Gemma 3" },
  { name: "qwq", params: "32B", size: "20GB", ram: "32GB", cpuCores: 8, family: "QwQ" },
  { name: "deepseek-r1", params: "7B", size: "4.7GB", ram: "8GB", cpuCores: 4, family: "DeepSeek-R1", vision: true },
  { name: "deepseek-r1:671b", params: "671B", size: "404GB", ram: "512GB", cpuCores: 32, family: "DeepSeek-R1" },
  { name: "llama3.3", params: "70B", size: "43GB", ram: "64GB", cpuCores: 16, family: "Llama 3.3" },
  { name: "llama3.2", params: "3B", size: "2.0GB", ram: "8GB", cpuCores: 4, family: "Llama 3.2" },
  { name: "llama3.2:1b", params: "1B", size: "1.3GB", ram: "4GB", cpuCores: 2, family: "Llama 3.2" },
  {
    name: "llama3.2-vision",
    params: "11B",
    size: "7.9GB",
    ram: "16GB",
    cpuCores: 6,
    family: "Llama 3.2",
    vision: true,
  },
  {
    name: "llama3.2-vision:90b",
    params: "90B",
    size: "55GB",
    ram: "96GB",
    cpuCores: 24,
    family: "Llama 3.2",
    vision: true,
  },
  { name: "llama3.1", params: "8B", size: "4.7GB", ram: "8GB", cpuCores: 4, family: "Llama 3.1" },
  { name: "llama3.1:405b", params: "405B", size: "231GB", ram: "256GB", cpuCores: 32, family: "Llama 3.1" },
  { name: "phi4", params: "14B", size: "9.1GB", ram: "16GB", cpuCores: 6, family: "Phi 4" },
  { name: "phi4-mini", params: "3.8B", size: "2.5GB", ram: "8GB", cpuCores: 4, family: "Phi 4 Mini" },
  { name: "mistral", params: "7B", size: "4.1GB", ram: "8GB", cpuCores: 4, family: "Mistral" },
  { name: "moondream", params: "1.4B", size: "829MB", ram: "4GB", cpuCores: 2, family: "Moondream 2", vision: true },
  { name: "neural-chat", params: "7B", size: "4.1GB", ram: "8GB", cpuCores: 4, family: "Neural Chat" },
  { name: "starling-lm", params: "7B", size: "4.1GB", ram: "8GB", cpuCores: 4, family: "Starling" },
  { name: "codellama", params: "7B", size: "3.8GB", ram: "8GB", cpuCores: 4, family: "Code Llama" },
  { name: "llama2-uncensored", params: "7B", size: "3.8GB", ram: "8GB", cpuCores: 4, family: "Llama 2 Uncensored" },
  { name: "llava", params: "7B", size: "4.5GB", ram: "8GB", cpuCores: 4, family: "LLaVA", vision: true },
  { name: "granite3.2", params: "8B", size: "4.9GB", ram: "8GB", cpuCores: 4, family: "Granite 3.2" },
];

// Get system specifications
function getSystemSpecs() {
  try {
    // Using Node.js OS module
    const os = require("os");

    // Get total memory in GB
    const totalRamGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));

    // Get CPU cores count
    const cpuCores = os.cpus().length;

    return {
      ram: totalRamGB,
      cores: cpuCores,
      platform: os.platform(),
      arch: os.arch(),
    };
  } catch (error) {
    console.error("Error getting system specs:", error);
    // Return reasonable defaults if we can't get the actual specs
    return { ram: 8, cores: 4, platform: "unknown", arch: "unknown" };
  }
}

// Cache system specs
const SYSTEM_SPECS = getSystemSpecs();

// Load model library into dropdown select
function loadModelLibrary() {
  const librarySelect = document.getElementById("model-library-select");
  const confirmPullBtn = document.getElementById("confirm-pull");

  // Clear existing options
  while (librarySelect.options.length > 1) {
    librarySelect.remove(1);
  }

  // Get list of already installed models first
  const installedModels = [];

  // Fetch installed models asynchronously
  (async () => {
    try {
      const models = await window.ipcRenderer.invoke(IPC_CHANNELS.GET_OLLAMA_MODELS);
      // Extract model names
      models.forEach((model) => installedModels.push(model.name.toLowerCase()));

      // Update the dropdown with installed status
      updateDropdownWithInstalledModels(installedModels);
    } catch (error) {
      console.error("Failed to fetch installed models:", error);
    }
  })();

  // Sort models by family and size
  const sortedModels = [...MODEL_LIBRARY].sort((a, b) => {
    // First sort by family
    if (a.family !== b.family) {
      return a.family.localeCompare(b.family);
    }
    // Then by parameter size (convert to number first)
    const aParams = parseFloat(a.params.replace(/[^\d.]/g, ""));
    const bParams = parseFloat(b.params.replace(/[^\d.]/g, ""));
    return aParams - bParams;
  });

  // Group models by family
  const modelsByFamily = {};
  sortedModels.forEach((model) => {
    if (!modelsByFamily[model.family]) {
      modelsByFamily[model.family] = [];
    }
    modelsByFamily[model.family].push(model);
  });

  // Create optgroups for each family
  Object.keys(modelsByFamily)
    .sort()
    .forEach((family) => {
      const optgroup = document.createElement("optgroup");
      optgroup.label = family;

      modelsByFamily[family].forEach((model) => {
        // Check if model is compatible with system
        const isCompatible = checkModelCompatibility(model);

        const option = document.createElement("option");
        option.value = model.name;

        // Add compatibility marker to option text (installed status will be updated later)
        const compatibilityMarker = isCompatible ? "✅" : "⚠️";
        option.textContent = `${compatibilityMarker} ${model.name} (${model.params}, ${model.size})`;

        // Store model data in dataset attributes
        option.dataset.params = model.params;
        option.dataset.size = model.size;
        option.dataset.ram = model.ram;
        option.dataset.cpuCores = model.cpuCores;
        option.dataset.family = model.family;
        option.dataset.vision = model.vision ? "true" : "false";
        option.dataset.compatible = isCompatible ? "true" : "false";

        // Style options based on compatibility
        if (!isCompatible) {
          option.classList.add("incompatible-model");
        }

        optgroup.appendChild(option);
      });

      librarySelect.appendChild(optgroup);
    });

  // Function to update options with installed status
  function updateDropdownWithInstalledModels(installedModelsList) {
    // Check each option and update if it's installed
    const options = Array.from(librarySelect.options);
    options.forEach((option) => {
      if (option.value && installedModelsList.includes(option.value.toLowerCase())) {
        option.disabled = true;
        option.classList.add("model-installed");

        // Update the text to show it's installed, preserving the existing compatibility markers
        let originalText = option.textContent;
        // Remove any existing markers first
        originalText = originalText.replace(/^[✅⚠️✓]\s*/, "");
        option.textContent = `✓ ${originalText} (installed)`;

        // Set the installed data attribute
        option.dataset.installed = "true";
      } else if (option.value) {
        option.dataset.installed = "false";
      }
    });

    // If the current selected model is installed, disable the pull button
    const selectedOption = librarySelect.options[librarySelect.selectedIndex];
    if (selectedOption && selectedOption.dataset && selectedOption.dataset.installed === "true") {
      confirmPullBtn.disabled = true;
      confirmPullBtn.title = "Model is already installed";
    }
  }

  // Add change handler to update model details
  librarySelect.addEventListener("change", () => {
    updateModelDetails(librarySelect.value);

    // Enable pull button when a model is selected
    const selectedOption = librarySelect.options[librarySelect.selectedIndex];
    if (selectedOption && selectedOption.dataset && selectedOption.dataset.installed === "true") {
      confirmPullBtn.disabled = true;
      confirmPullBtn.title = "Model is already installed";
    } else {
      confirmPullBtn.disabled = !librarySelect.value;
      confirmPullBtn.title = "";
    }
  });

  // Show system specs in the status area
  const systemSpecsDiv = document.getElementById("system-specs");
  if (systemSpecsDiv) {
    systemSpecsDiv.textContent = `Your System: ${SYSTEM_SPECS.ram}GB RAM, ${SYSTEM_SPECS.cores} CPU Cores`;
  }
}

// Check if model is compatible with user's system
function checkModelCompatibility(model) {
  // Parse the RAM requirement (strip non-digit characters and convert to number)
  const ramRequiredGB = parseInt(model.ram.replace(/[^\d]/g, ""));

  // Check RAM and CPU requirements
  const hasEnoughRam = SYSTEM_SPECS.ram >= ramRequiredGB;
  const hasEnoughCores = SYSTEM_SPECS.cores >= model.cpuCores;

  return hasEnoughRam && hasEnoughCores;
}

// Update model details when a model is selected
function updateModelDetails(modelName) {
  if (!modelName) return;

  // Find the model in the library
  const model = MODEL_LIBRARY.find((m) => m.name === modelName);
  if (!model) return;

  // Check compatibility
  const isCompatible = checkModelCompatibility(model);

  // Check if the model is already installed
  const isInstalled = checkIfModelInstalled(modelName);

  // Update the info card
  const modelInfoCard = document.querySelector(".model-info-card");
  const modelNameElement = document.querySelector(".model-name");
  const modelSizeBadge = document.querySelector(".model-size-badge");
  const modelParams = document.querySelector(".model-params");
  const modelCommand = document.querySelector(".model-command code");
  const modelRequirements = document.querySelector(".model-requirements");

  // Remove previous classes
  modelInfoCard.classList.remove("compatible-model", "incompatible-model", "model-installed");

  // Add appropriate compatibility class
  modelInfoCard.classList.add(isCompatible ? "compatible-model" : "incompatible-model");

  // Add installed class if installed
  if (isInstalled) {
    modelInfoCard.classList.add("model-installed");
  }

  // Base model info
  modelNameElement.textContent = `${model.family} (${model.name})`;
  modelSizeBadge.textContent = model.size;
  modelParams.textContent = `Parameters: ${model.params}`;
  modelCommand.textContent = `ollama run ${model.name}`;

  // Set requirements and compatibility status
  const compatibilityIcon = isCompatible
    ? `<span class="compatibility-icon compatible">✅</span>`
    : `<span class="compatibility-icon incompatible">⚠️</span>`;

  modelRequirements.innerHTML = `
    ${compatibilityIcon} System Requirements: ${model.ram} RAM, ${model.cpuCores} CPU Cores
    ${
      isCompatible
        ? '<div class="compatibility-message compatible">Compatible with your system</div>'
        : `<div class="compatibility-message incompatible">Your system (${SYSTEM_SPECS.ram}GB RAM, ${SYSTEM_SPECS.cores} Cores) may not meet requirements</div>`
    }
  `;

  // Add vision badge if applicable
  if (model.vision) {
    modelNameElement.innerHTML = `${model.family} (${model.name}) <span class="vision-badge">Vision</span>`;
  }

  // Update the confirm button based on compatibility and installation status
  const confirmPullBtn = document.getElementById("confirm-pull");
  if (confirmPullBtn) {
    // Disable button if model is already installed
    if (isInstalled) {
      confirmPullBtn.disabled = true;
      confirmPullBtn.title = "Model is already installed";
    } else if (!isCompatible) {
      confirmPullBtn.disabled = false;
      confirmPullBtn.classList.add("warning-pull");
      confirmPullBtn.title = "This model may not run well on your system";
    } else {
      confirmPullBtn.disabled = false;
      confirmPullBtn.classList.remove("warning-pull");
      confirmPullBtn.title = "";
    }
  }
}

// Helper function to check if a model is already installed
function checkIfModelInstalled(modelName) {
  if (!modelName) return false;

  // Check if there are any options in the dropdown with this model name that are marked as installed
  const select = document.getElementById("model-library-select");
  if (!select) return false;

  const options = Array.from(select.options);
  const matchingOption = options.find(
    (option) => option.value.toLowerCase() === modelName.toLowerCase() && option.dataset.installed === "true",
  );

  return !!matchingOption;
}

// Pull an Ollama model with progress tracking
async function pullOllamaModel(modelName) {
  const pullStatusDiv = document.getElementById("pull-status");
  const confirmPullBtn = document.getElementById("confirm-pull");
  const ollamaUrlInput = document.getElementById("ollama-url");
  const progressContainer = document.querySelector(".progress-container");
  const progressBarFill = document.getElementById("progress-bar-fill");
  const progressPercentage = document.getElementById("progress-percentage");
  const progressDetails = document.getElementById("progress-details");

  // If no model name is provided, get it from the select
  if (!modelName) {
    const modelSelect = document.getElementById("model-library-select");
    modelName = modelSelect.value;

    if (!modelName) {
      pullStatusDiv.textContent = "Please select a model to pull";
      pullStatusDiv.className = "status error";
      return false;
    }
  }

  // Reset and show progress elements
  progressContainer.style.display = "block";
  progressContainer.classList.add("downloading");
  progressBarFill.style.width = "0%";
  progressPercentage.textContent = "0%";
  progressDetails.textContent = "Starting download...";

  pullStatusDiv.innerHTML = `Preparing to pull model ${modelName}...`;
  pullStatusDiv.className = "status";
  confirmPullBtn.disabled = true;

  try {
    // Always use IPv4 by replacing localhost with 127.0.0.1
    const url = ollamaUrlInput.value.replace("localhost", "127.0.0.1");

    // Check if the Ollama server is accessible
    try {
      const versionCheck = await axios.get(`${url}/api/version`, {
        timeout: 5000,
      });

      if (versionCheck.status !== 200) {
        throw new Error(`Server returned status ${versionCheck.status}`);
      }

      pullStatusDiv.textContent = `Connected to Ollama v${versionCheck.data.version}`;
    } catch (connectionError) {
      throw new Error(`Could not connect to Ollama server: ${connectionError.message}`);
    }

    pullStatusDiv.textContent = `Sending pull request for ${modelName}...`;

    // Create fetch request to the Ollama API to pull the model
    const controller = new AbortController();
    const signal = controller.signal;

    // Setup cancel button functionality
    const cancelPullBtn = document.getElementById("cancel-pull");
    const originalCancelAction = cancelPullBtn.onclick;

    cancelPullBtn.onclick = () => {
      controller.abort();
      progressDetails.textContent = "Download cancelled";
      pullStatusDiv.textContent = "Model pull was cancelled";
      pullStatusDiv.className = "status warning";
      progressContainer.classList.remove("downloading");
      confirmPullBtn.disabled = false;

      // Reset the cancel button
      cancelPullBtn.onclick = originalCancelAction;

      // Hide modal after a delay
      setTimeout(() => {
        document.getElementById("pull-model-modal").style.display = "none";
        progressContainer.style.display = "none";
      }, 1500);
    };

    // Start the fetch request to the Ollama API with streaming
    const response = await fetch(`${url}/api/pull`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: modelName }),
      signal: signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    let receivedLength = 0;
    let chunks = [];
    let decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      chunks.push(value);
      receivedLength += value.length;

      // Convert the chunk to text and add to buffer
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      // Process any complete JSON lines in the buffer
      const lines = buffer.split("\n");
      buffer = lines.pop(); // Keep the last incomplete line in the buffer

      for (const line of lines) {
        if (line.trim() === "") continue;

        try {
          const data = JSON.parse(line);

          // Update progress based on status
          if (data.status) {
            progressDetails.textContent = data.status;
          }

          // Update progress bar if download percentage is available
          if (data.completed && data.total) {
            const percent = Math.round((data.completed / data.total) * 100);
            progressBarFill.style.width = `${percent}%`;
            progressPercentage.textContent = `${percent}%`;

            if (percent === 100) {
              progressDetails.textContent = "Finalizing...";
            }
          }
        } catch (e) {
          console.error("Error parsing JSON from Ollama stream:", e);
          console.log("Problematic line:", line);
        }
      }
    }

    // Process is complete
    progressContainer.classList.remove("downloading");
    progressBarFill.style.width = "100%";
    progressPercentage.textContent = "100%";
    progressDetails.textContent = "Download complete!";

    pullStatusDiv.textContent = `Successfully pulled model: ${modelName}`;
    pullStatusDiv.className = "status success";

    // Reset cancel button
    cancelPullBtn.onclick = originalCancelAction;

    // Reload the model list
    await loadOllamaModels();

    // Select the newly pulled model
    window.selectModelCard("ollama", modelName);

    // Close the modal after a delay
    setTimeout(() => {
      document.getElementById("pull-model-modal").style.display = "none";
      confirmPullBtn.disabled = false;
      progressContainer.style.display = "none";
      progressContainer.classList.remove("downloading");

      // Reset the dropdown
      document.getElementById("model-library-select").selectedIndex = 0;
      updateModelDetails("");
    }, 2000);

    return true;
  } catch (error) {
    const errorMessage =
      error.name === "AbortError" ? "Download was cancelled" : `Error pulling model: ${error.message}`;

    pullStatusDiv.textContent = errorMessage;
    pullStatusDiv.className = "status error";
    progressContainer.style.display = "none";
    progressContainer.classList.remove("downloading");
    confirmPullBtn.disabled = false;

    // Reset cancel button if it was an error (not a user cancellation)
    if (error.name !== "AbortError") {
      const cancelPullBtn = document.getElementById("cancel-pull");
      cancelPullBtn.onclick = originalCancelAction;
    }

    return false;
  }
}

module.exports = {
  loadOllamaModels,
  testOllamaConnection,
  pullOllamaModel,
  loadModelLibrary,
};
