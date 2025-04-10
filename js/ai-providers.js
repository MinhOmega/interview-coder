const axios = require("axios");
const { OpenAI } = require("openai");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const EventEmitter = require("events");
const { AI_PROVIDERS } = require("./constants");

axios.defaults.family = 4;

let openai = null;
let geminiAI = null;
let OLLAMA_BASE_URL = "http://127.0.0.1:11434";

function initializeAIClients() {
  try {
    // Only try to load from localStorage if in renderer process
    if (typeof localStorage !== "undefined") {
      try {
        const storedOpenAIKey = localStorage.getItem("openai_api_key");
        const storedGeminiKey = localStorage.getItem("gemini_api_key");

        if (storedOpenAIKey) {
          console.log("Initializing OpenAI client from stored key");
          openai = new OpenAI({ apiKey: storedOpenAIKey });
        }

        if (storedGeminiKey) {
          console.log("Initializing Gemini client from stored key");
          geminiAI = new GoogleGenerativeAI(storedGeminiKey);
        }
      } catch (storageErr) {
        console.error("Error loading keys from localStorage:", storageErr);
      }
    }
  } catch (err) {
    console.error("Error setting up AI clients:", err);
  }
}

/**
 * Updates the AI clients with new API keys
 *
 * @param {string} provider - The provider to update
 * @param {string} apiKey - The new API key
 * @returns {boolean} True if the client was updated, false otherwise
 */
function updateAIClients(provider, apiKey) {
  try {
    console.log(`Updating ${provider} client with new API key...`);

    if (!apiKey || apiKey.trim() === "") {
      console.error(`Invalid ${provider} API key: Key is empty or missing`);
      return false;
    }

    if (provider === AI_PROVIDERS.OPENAI && apiKey) {
      openai = new OpenAI({ apiKey });
      console.log("OpenAI client initialized successfully");
      return true;
    } else if (provider === AI_PROVIDERS.GEMINI && apiKey) {
      geminiAI = new GoogleGenerativeAI(apiKey);
      console.log("Gemini client initialized successfully");
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
      throw new Error("Gemini AI client is not initialized. Please check your API key.");
    }

    // Get the Gemini model
    console.log(`Using Gemini model: ${model}`);
    const geminiModel = geminiAI.getGenerativeModel({ model: model });

    // Format as Gemini content parts
    const contentParts = [];

    for (const message of messages) {
      if (message.type === "text") {
        contentParts.push({ text: message.text });
      } else if (message.type === "image_url") {
        const imageUrl = message.image_url.url;
        // Extract base64 data from data URL - Gemini requires just the base64 data without the prefix
        const base64Data = imageUrl.split(",")[1];
        if (!base64Data) {
          console.error("Invalid base64 data in image:", imageUrl.substring(0, 50) + "...");
          continue; // Skip this image
        }
        contentParts.push({
          inlineData: {
            data: base64Data,
            mimeType: "image/png",
          },
        });
      }
    }

    // Log information about content being sent to Gemini
    console.log(`Sending to Gemini: ${contentParts.length} content parts`);
    console.log(
      `Content parts include ${contentParts.filter((p) => p.text).length} text parts and ${
        contentParts.filter((p) => p.inlineData).length
      } image parts`,
    );

    // Generate configuration including safety settings
    const genConfig = {
      temperature: 0.4,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
    };

    // Create the content object required by Gemini
    const geminiContent = {
      parts: contentParts,
      role: "user",
    };

    if (streaming) {
      console.log("Starting Gemini streaming response");
      const emitter = new EventEmitter();

      try {
        // For streaming, we need to use the proper request format
        const result = await geminiModel.generateContentStream({
          contents: [geminiContent],
          generationConfig: genConfig,
        });
        console.log("Gemini stream created successfully");

        (async () => {
          let fullText = "";
          try {
            for await (const chunk of result.stream) {
              const text = chunk.text();
              fullText += text;
              emitter.emit("chunk", text);
            }
            console.log("Gemini stream completed successfully");
            console.log(`Received ${fullText.length} characters from Gemini`);
            emitter.emit("complete", fullText);
          } catch (streamError) {
            console.error("Error in Gemini stream processing:", streamError);
            console.error(
              "Stream error details:",
              JSON.stringify(streamError, Object.getOwnPropertyNames(streamError)),
            );
            emitter.emit("error", streamError);
          }
        })();

        return { emitter };
      } catch (streamCreationError) {
        console.error("Failed to create Gemini stream:", streamCreationError);
        console.error(
          "Error details:",
          JSON.stringify(streamCreationError, Object.getOwnPropertyNames(streamCreationError)),
        );

        // Create a more detailed error message
        let errorMessage = "Failed to create Gemini stream";

        if (streamCreationError.message) {
          errorMessage += `: ${streamCreationError.message}`;
        }

        if (streamCreationError.status) {
          errorMessage += ` (Status: ${streamCreationError.status})`;
        }

        throw new Error(errorMessage);
      }
    } else {
      console.log("Starting Gemini non-streaming response");
      try {
        // For non-streaming, use the same format as streaming for consistency
        const result = await geminiModel.generateContent(geminiContent);
        const text = result.response.text();
        console.log(`Received ${text.length} characters from Gemini`);
        return text;
      } catch (error) {
        console.error("Error in Gemini generateContent:", error);
        console.error("Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error)));

        // Create a more detailed error message
        let errorMessage = "Failed to generate content with Gemini";

        if (error.message) {
          errorMessage += `: ${error.message}`;
        }

        if (error.status) {
          errorMessage += ` (Status: ${error.status})`;
        }

        throw new Error(errorMessage);
      }
    }
  } catch (error) {
    console.error("Error in generateWithGemini:", error);

    // Log additional information for connection errors
    if ((error.message && error.message.includes("network")) || error.message.includes("connection")) {
      console.error("Network error details:", error);
    }

    throw error;
  }
}

// Export functions
module.exports = {
  initializeAIClients,
  updateAIClients,
  setOllamaBaseURL,
  getOllamaModels,
  verifyOllamaModel,
  generateWithOllama,
  generateWithGemini,
  getOpenAI: () => openai,
  getGeminiAI: () => geminiAI,
};
