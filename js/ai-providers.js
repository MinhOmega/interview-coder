const axios = require("axios");
const { OpenAI } = require("openai");
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const AnthropicFoundry = require("@anthropic-ai/foundry-sdk");
const EventEmitter = require("events");
const { AI_PROVIDERS } = require("./constants");
const { getSettingsFilePath, saveApiKey } = require("./config-manager");
const { generateWithAzureFoundry, getAzureFoundryModels, validateAzureFoundryConfig } = require("./azure-foundry-provider");
const fs = require("fs");

axios.defaults.family = 4;

let openai = null;
let geminiAI = null;
let azureFoundryClient = null;
let OLLAMA_BASE_URL = "http://127.0.0.1:11434";
let AZURE_FOUNDRY_ENDPOINT = "";

// Add a flag to track initialization status
let isInitialized = false;

/**
 * Initializes AI clients based on stored configuration
 * This function should be called when the app starts
 *
 * @returns {Object} Status of initialization for each provider
 */
function initializeFromConfig() {
  if (isInitialized) {
    return { openai: !!openai, gemini: !!geminiAI, azureFoundry: !!azureFoundryClient };
  }

  try {
    // Get the settings file path
    const settingsFilePath = getSettingsFilePath();

    // Check if settings file exists
    if (fs.existsSync(settingsFilePath)) {
      try {
        const settingsData = fs.readFileSync(settingsFilePath, "utf8");
        const settings = JSON.parse(settingsData);

        // Check for provider-specific API keys first, then fall back to general apiKey
        const apiKeys = settings.apiKeys || {};

        try {
          // Initialize based on current AI provider
          if (settings.aiProvider === AI_PROVIDERS.OPENAI) {
            const apiKey = apiKeys.openai || settings.apiKey;
            if (apiKey) {
              openai = new OpenAI({ apiKey });
              console.log("OpenAI client initialized automatically from saved settings");
            }
          } else if (settings.aiProvider === AI_PROVIDERS.GEMINI) {
            const apiKey = apiKeys.gemini || settings.apiKey;
            if (apiKey) {
              geminiAI = new GoogleGenerativeAI(apiKey);
              console.log("Gemini AI client initialized automatically from saved settings");
            }
          } else if (settings.aiProvider === AI_PROVIDERS.AZURE_FOUNDRY) {
            const apiKey = apiKeys["azure-foundry"];
            if (apiKey) {
              // Initialize Azure Foundry with saved endpoint if available
              const endpoint = settings.azureEndpoint || AZURE_FOUNDRY_ENDPOINT;
              azureFoundryClient = new AnthropicFoundry({
                apiKey: apiKey,
                baseURL: endpoint,
                apiVersion: "2023-06-01",
              });
              AZURE_FOUNDRY_ENDPOINT = endpoint;
              console.log("Azure Foundry client initialized automatically from saved settings");
            }
          } else if (settings.apiKey) {
            // Initialize both by default with legacy apiKey for backward compatibility
            openai = new OpenAI({ apiKey: settings.apiKey });
            geminiAI = new GoogleGenerativeAI(settings.apiKey);
            console.log("Both AI clients initialized with the same API key");
          }
        } catch (err) {
          console.error("Error initializing AI clients from saved settings:", err);
        }

        // Update Ollama URL if available
        if (settings.ollamaUrl) {
          OLLAMA_BASE_URL = settings.ollamaUrl.replace("localhost", "127.0.0.1");
        }

        // Update Azure Foundry endpoint if available
        if (settings.azureEndpoint) {
          AZURE_FOUNDRY_ENDPOINT = settings.azureEndpoint;
        }
      } catch (parseError) {
        console.error("Error parsing settings file:", parseError);
      }
    }

    isInitialized = true;
    return { openai: !!openai, gemini: !!geminiAI, azureFoundry: !!azureFoundryClient };
  } catch (error) {
    console.error("Error in initializeFromConfig:", error);
    return { openai: false, gemini: false, azureFoundry: false };
  }
}

/**
 * Updates the AI clients with new API key
 *
 * @param {string} provider - The provider to update
 * @param {string} apiKey - The new API key
 * @param {string} endpoint - Optional endpoint URL for Azure Foundry
 * @returns {boolean} True if the client was updated, false otherwise
 */
function updateAIClients(provider, apiKey, endpoint = null) {
  try {
    if (provider === AI_PROVIDERS.OPENAI && apiKey) {
      openai = new OpenAI({ apiKey });
      console.log("OpenAI client initialized successfully");

      // Save API key to settings file with provider
      saveApiKey(apiKey, "openai");

      return true;
    } else if (provider === AI_PROVIDERS.GEMINI && apiKey) {
      geminiAI = new GoogleGenerativeAI(apiKey);
      console.log("Gemini AI client initialized successfully");

      // Save API key to settings file with provider
      saveApiKey(apiKey, "gemini");

      return true;
    } else if (provider === AI_PROVIDERS.AZURE_FOUNDRY && apiKey) {
      const azureEndpoint = endpoint || AZURE_FOUNDRY_ENDPOINT;
      azureFoundryClient = new AnthropicFoundry({
        apiKey: apiKey,
        baseURL: azureEndpoint,
        apiVersion: "2023-06-01",
      });
      AZURE_FOUNDRY_ENDPOINT = azureEndpoint;
      console.log("Azure Foundry client initialized successfully with endpoint:", azureEndpoint);

      // Save API key to settings file with provider
      saveApiKey(apiKey, "azure-foundry");

      return true;
    }
    return false;
  } catch (err) {
    console.error(`Error updating ${provider} client:`, err);
    return false;
  }
}

/**
 * Sets the Ollama base URL
 *
 * @param {string} url - The new Ollama base URL
 */
function setOllamaBaseURL(url) {
  OLLAMA_BASE_URL = url.replace("localhost", "127.0.0.1");
}

/**
 * Gets the list of models from Ollama
 *
 * @returns {Promise<Array>} The list of models
 */
async function getOllamaModels() {
  try {
    const apiUrl = OLLAMA_BASE_URL.replace("localhost", "127.0.0.1");

    const response = await axios.get(`${apiUrl}/api/tags`, {
      timeout: 5000,
      validateStatus: false,
    });

    if (response.status !== 200) {
      console.error(`Error: Ollama API returned status ${response.status}`);
      return [];
    }

    return response.data.models || [];
  } catch (error) {
    return [];
  }
}

/**
 * Verifies if an Ollama model exists and has vision capability
 *
 * @param {string} modelName - The name of the model to verify
 * @returns {Promise<Object>} The result of the verification
 */
async function verifyOllamaModel(modelName) {
  try {
    const apiUrl = OLLAMA_BASE_URL.replace("localhost", "127.0.0.1");

    try {
      const modelsResponse = await axios.get(`${apiUrl}/api/tags`, {
        timeout: 5000,
        validateStatus: false,
      });

      if (modelsResponse.status !== 200) {
        console.error(`Failed to get list of models (status ${modelsResponse.status})`);
        return {
          exists: false,
          error: `Failed to get list of models (status ${modelsResponse.status})`,
        };
      }

      const modelsList = modelsResponse.data.models || [];

      const modelExists = modelsList.some((m) => m.name === modelName);

      if (!modelExists) {
        console.error(`Model ${modelName} does not exist in the list of available models`);
        const availableModels = modelsList.map((m) => m.name);

        return {
          exists: false,
          error: `Model "${modelName}" is not available on your Ollama server`,
          availableModels: availableModels,
        };
      }

      try {
        const modelResponse = await axios.get(`${apiUrl}/api/show`, {
          params: { name: modelName },
          timeout: 5000,
          validateStatus: false,
        });

        if (modelResponse.status !== 200) {
          console.warn(`Could not get details for model ${modelName}, but it exists in the model list`);
          return {
            exists: true,
            needsPull: false,
          };
        }
        return {
          exists: true,
          needsPull: false,
        };
      } catch (modelDetailsError) {
        console.error(`Error getting model details: ${modelDetailsError.message}`);
        return {
          exists: true,
          needsPull: false,
        };
      }
    } catch (error) {
      console.error(`Error checking model existence: ${error.message}`);
      if (error.code === "ECONNREFUSED" || error.code === "ECONNRESET") {
        return {
          exists: false,
          error: `Unable to connect to Ollama. Is Ollama running at ${apiUrl}?`,
        };
      }

      return {
        exists: false,
        error: `Failed to verify model: ${error.message}`,
      };
    }
  } catch (error) {
    console.error(`Error in verifyOllamaModel:`, error.message);
    return {
      exists: false,
      error: `Failed to verify model: ${error.message}`,
    };
  }
}

/**
 * Generates a chat completion with Ollama
 *
 * @param {Array} messages - The messages to generate a chat completion with
 * @param {string} model - The model to use for the chat completion
 * @returns {Promise<string>} The generated chat completion
 */
async function generateWithOllama(messages, model) {
  try {
    const isDeepseek = model.toLowerCase().includes("deepseek-r1");
    const ollamaMessages = [];

    if (isDeepseek) {
      const imageList = [];
      let textPrompt = "";

      for (const msg of messages) {
        if (msg.type === "text") {
          textPrompt += msg.text + "\n";
        } else if (msg.type === "image_url") {
          try {
            const base64Image = msg.image_url.url.split(",")[1];
            imageList.push(base64Image);
          } catch (error) {
            console.error("Error processing image:", error);
          }
        }
      }

      try {
        const apiUrl = OLLAMA_BASE_URL.replace("localhost", "127.0.0.1");
        let prompt = textPrompt;

        const response = await axios.post(
          `${apiUrl}/api/generate`,
          {
            model: model,
            prompt: prompt,
            images: imageList,
            stream: false,
          },
          {
            timeout: 180000,
          },
        );

        return response.data.response;
      } catch (deepseekError) {
        console.error("Error with deepseek format 1:", deepseekError.message);

        if (deepseekError.response) {
          console.error("Response status:", deepseekError.response.status);
          console.error("Response data:", JSON.stringify(deepseekError.response.data));
        }

        try {
          const firstMsg = { role: "user", content: textPrompt };
          ollamaMessages.push(firstMsg);

          const apiUrl = OLLAMA_BASE_URL.replace("localhost", "127.0.0.1");
          const chatResponse = await axios.post(
            `${apiUrl}/api/chat`,
            {
              model: model,
              messages: ollamaMessages,
              images: imageList,
              stream: false,
            },
            {
              timeout: 180000, // 3 minutes
            },
          );

          return chatResponse.data.message.content;
        } catch (alternativeError) {
          console.error("Error with deepseek format 2:", alternativeError.message);

          if (alternativeError.response) {
            console.error("Response status:", alternativeError.response.status);
            console.error("Response data:", JSON.stringify(alternativeError.response.data));
          }

          throw deepseekError;
        }
      }
    }

    for (const msg of messages) {
      if (msg.role) {
        ollamaMessages.push(msg);
        continue;
      }

      if (msg.type === "text") {
        ollamaMessages.push({ role: "user", content: msg.text });
      } else if (msg.type === "image_url") {
        try {
          const base64Image = msg.image_url.url.split(",")[1];

          if (ollamaMessages.length > 0 && ollamaMessages[ollamaMessages.length - 1].role === "user") {
            const lastMessage = ollamaMessages[ollamaMessages.length - 1];
            if (typeof lastMessage.content === "string") {
              lastMessage.content = [{ type: "text", text: lastMessage.content }];
            }

            if (Array.isArray(lastMessage.content)) {
              lastMessage.content.push({ type: "image", data: base64Image });
            }
          } else {
            ollamaMessages.push({
              role: "user",
              content: [{ type: "image", data: base64Image }],
            });
          }
        } catch (error) {
          console.error("Error processing image for Ollama:", error);
          throw new Error(`Failed to process image: ${error.message}`);
        }
      }
    }

    const apiUrl = OLLAMA_BASE_URL.replace("localhost", "127.0.0.1");

    let response;
    let result;

    try {
      response = await axios.post(
        `${apiUrl}/api/chat`,
        {
          model: model,
          messages: ollamaMessages,
          stream: false,
        },
        {
          timeout: 120000,
        },
      );

      result = response.data.message.content;
    } catch (chatError) {
      console.error("Error with /api/chat endpoint:", chatError.message);

      if (chatError.response) {
        console.error("Response status:", chatError.response.status);
        console.error("Response data:", JSON.stringify(chatError.response.data));
      }

      let prompt = "";
      for (const msg of ollamaMessages) {
        if (typeof msg.content === "string") {
          prompt += `${msg.role === "assistant" ? "Assistant: " : "User: "}${msg.content}\n\n`;
        } else if (Array.isArray(msg.content)) {
          const textParts = msg.content.filter((c) => c.type === "text").map((c) => c.text);
          if (textParts.length > 0) {
            prompt += `${msg.role === "assistant" ? "Assistant: " : "User: "}${textParts.join(" ")}\n\n`;
          } else {
            prompt += `${msg.role === "assistant" ? "Assistant: " : "User: "}[Image provided]\n\n`;
          }
        }
      }

      prompt += "Assistant: ";

      try {
        response = await axios.post(
          `${apiUrl}/api/generate`,
          {
            model: model,
            prompt: prompt,
            stream: false,
          },
          {
            timeout: 120000,
          },
        );

        result = response.data.response;
      } catch (generateError) {
        console.error("Error with /api/generate endpoint:", generateError.message);

        if (generateError.response) {
          console.error("Response status:", generateError.response.status);
          console.error("Response data:", JSON.stringify(generateError.response.data));
        }

        throw chatError;
      }
    }

    return result;
  } catch (error) {
    console.error("Error generating with Ollama:", error.message);

    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", JSON.stringify(error.response.data));
    }

    throw new Error(`Ollama API error: ${error.message}`);
  }
}

// Generate with Gemini
async function generateWithGemini(messages, model, streaming = false) {
  try {
    if (!geminiAI) {
      throw new Error("Gemini AI client is not initialized. Please go to Settings and enter your API key.");
    }

    // Get the Gemini model
    const geminiModel = geminiAI.getGenerativeModel({ model: model });

    // Format as Gemini content parts
    const contentParts = [];

    for (const message of messages) {
      if (message.type === "text") {
        // Only add text messages with actual content
        if (message.text && message.text.trim() !== "") {
          contentParts.push({ text: message.text });
        }
      } else if (message.type === "image_url") {
        try {
          let base64Data = null;
          let mimeType = "image/jpeg";

          // Handle different image URL formats
          if (typeof message.image_url === "object" && message.image_url.url) {
            // Format: { type: "image_url", image_url: { url: "data:image/..." } }
            const imageUrl = message.image_url.url;

            // Extract MIME type if available
            const mimeMatch = imageUrl.match(/^data:([^;]+);base64,/);
            if (mimeMatch) {
              mimeType = mimeMatch[1];
            }

            // Extract base64 data
            base64Data = imageUrl.split(";base64,").pop();
          } else if (typeof message.image_url === "string") {
            // Format: { type: "image_url", image_url: "data:image/..." }
            const imageUrl = message.image_url;

            // Extract MIME type if available
            const mimeMatch = imageUrl.match(/^data:([^;]+);base64,/);
            if (mimeMatch) {
              mimeType = mimeMatch[1];
            }

            // Extract base64 data
            base64Data = imageUrl.split(";base64,").pop();
          }

          // Validate base64 data
          if (!base64Data) {
            console.error("Invalid or missing base64 data in image URL");
            continue; // Skip this image
          }

          // Add to content parts
          contentParts.push({
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          });
        } catch (error) {
          console.error("Error processing image data for Gemini:", error);
          // Continue without this image
        }
      }
    }

    // Ensure we have at least one content part
    if (contentParts.length === 0) {
      // If no valid content, add a default text message
      contentParts.push({ text: "Please provide a valid question or input." });
    }

    // Filter out any invalid parts (final validation before API call)
    const filteredContentParts = contentParts.filter((part) => {
      // Keep image parts
      if (part.inlineData) return true;
      // Only keep text parts with actual content
      return part.text && part.text.trim() !== "";
    });

    // Create the content message format required by Gemini
    const geminiContent = {
      parts: filteredContentParts,
      role: "user",
    };

    // Generate configuration including safety settings
    const genConfig = {
      temperature: 0.4,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
    };

    const safetySettings = [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
    ];

    // If streaming is requested, use the streaming API
    if (streaming) {
      const streamingResponse = await geminiModel.generateContentStream({
        contents: [geminiContent],
        generationConfig: genConfig,
        safetySettings,
      });

      // Set up stream handling
      let fullResponse = "";

      // Return an object that emits events for streaming
      const emitter = new EventEmitter();

      // Process the stream
      (async () => {
        try {
          for await (const chunk of streamingResponse.stream) {
            const chunkText = chunk.text();
            fullResponse += chunkText;

            // Emit the chunk
            emitter.emit("chunk", chunkText);
          }

          // Emit completion event
          emitter.emit("complete", fullResponse);
        } catch (error) {
          console.error("Error in Gemini stream processing:", error);
          console.error("Stack trace:", error.stack);
          emitter.emit("error", error);
        }
      })();

      return {
        streaming: true,
        emitter: emitter,
        text: () => fullResponse,
      };
    } else {
      // Standard non-streaming response
      const response = await geminiModel.generateContent({
        contents: [geminiContent],
        generationConfig: genConfig,
        safetySettings,
      });

      return response.response.text();
    }
  } catch (error) {
    console.error("Error generating with Gemini:", error.message);
    if (error.stack) {
      console.error("Stack trace:", error.stack);
    }
    throw error;
  }
}

/**
 * Sets the Azure Foundry endpoint URL
 *
 * @param {string} url - The new Azure Foundry endpoint URL
 */
function setAzureFoundryEndpoint(url) {
  AZURE_FOUNDRY_ENDPOINT = url;
}

/**
 * Wrapper function for Azure Foundry generation
 *
 * @param {Array} messages - Messages array
 * @param {string} model - Model to use
 * @param {boolean} streaming - Whether to stream the response
 * @param {string} systemPrompt - Optional system prompt
 * @returns {Promise} Response or streaming emitter
 */
async function generateWithAzureFoundryWrapper(messages, model, streaming = false, systemPrompt = null) {
  if (!azureFoundryClient) {
    throw new Error("Azure Foundry client is not initialized. Please go to Settings and enter your API key and endpoint.");
  }
  return generateWithAzureFoundry(azureFoundryClient, messages, model, streaming, systemPrompt);
}

// Export functions
module.exports = {
  updateAIClients,
  setOllamaBaseURL,
  setAzureFoundryEndpoint,
  getOllamaModels,
  getAzureFoundryModels,
  verifyOllamaModel,
  validateAzureFoundryConfig,
  generateWithOllama,
  generateWithGemini,
  generateWithAzureFoundry: generateWithAzureFoundryWrapper,
  getOpenAI: () => openai,
  getGeminiAI: () => geminiAI,
  getAzureFoundryClient: () => azureFoundryClient,
  getAzureFoundryEndpoint: () => AZURE_FOUNDRY_ENDPOINT,
  initializeFromConfig,
};
