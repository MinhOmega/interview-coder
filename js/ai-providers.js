const axios = require("axios");
const { OpenAI } = require("openai");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Events } = require("events");

// Configure axios to use IPv4
axios.defaults.family = 4;

// Initialize clients
let openai = null;
let geminiAI = null;
let OLLAMA_BASE_URL = "http://127.0.0.1:11434";

// Initialize the AI clients
function initializeAIClients() {
  try {
    // Get API key from .env file
    const apiKey = process.env.OPENAI_API_KEY;

    if (apiKey && apiKey !== "YOUR_OPENAI_API_KEY") {
      openai = new OpenAI({ apiKey });
    }

    // Initialize Gemini client
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (geminiApiKey && geminiApiKey !== "YOUR_GEMINI_API_KEY") {
      geminiAI = new GoogleGenerativeAI(geminiApiKey);
    }
  } catch (err) {
    console.error("Error setting up AI clients:", err);
  }
}

// Update AI clients with new API keys
function updateAIClients(provider, apiKey) {
  try {
    if (provider === 'openai' && apiKey) {
      openai = new OpenAI({ apiKey });
      return true;
    } else if (provider === 'gemini' && apiKey) {
      geminiAI = new GoogleGenerativeAI(apiKey);
      return true;
    }
    return false;
  } catch (err) {
    console.error(`Error updating ${provider} client:`, err);
    return false;
  }
}

// Set the Ollama base URL
function setOllamaBaseURL(url) {
  OLLAMA_BASE_URL = url.replace("localhost", "127.0.0.1");
}

// Get list of models from Ollama
async function getOllamaModels() {
  try {
    // Use IPv4 explicitly by replacing any remaining 'localhost' with '127.0.0.1'
    const apiUrl = OLLAMA_BASE_URL.replace("localhost", "127.0.0.1");

    // Add timeout to avoid long waiting times if Ollama is not running
    const response = await axios.get(`${apiUrl}/api/tags`, {
      timeout: 5000,
      validateStatus: false, // Don't throw on non-2xx status
    });

    if (response.status !== 200) {
      console.error(`Error: Ollama API returned status ${response.status}`);
      return [];
    }

    return response.data.models || [];
  } catch (error) {
    // More detailed error logging
    console.error("Error fetching Ollama models:", error.message);
    if (error.code) {
      console.error("Error code:", error.code);
    }
    if (error.syscall) {
      console.error("System call:", error.syscall);
    }
    if (error.address) {
      console.error("Address:", error.address);
    }
    if (error.port) {
      console.error("Port:", error.port);
    }
    return [];
  }
}

// Verify if an Ollama model exists and has vision capability
async function verifyOllamaModel(modelName) {
  try {
    const apiUrl = OLLAMA_BASE_URL.replace("localhost", "127.0.0.1");

    // First, check if the model is in the list of available models
    try {
      // Get available models first
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

      // Check if our model is in the list
      const modelExists = modelsList.some((m) => m.name === modelName);

      if (!modelExists) {
        console.error(`Model ${modelName} does not exist in the list of available models`);

        // For a better user experience, suggest models that do exist
        const availableModels = modelsList.map((m) => m.name);
        const visionModels = availableModels.filter(
          (name) =>
            name.includes("llava") ||
            name.includes("bakllava") ||
            name.includes("moondream") ||
            name.includes("deepseek"),
        );

        const suggestedModels = visionModels.length > 0 ? visionModels : availableModels;

        return {
          exists: false,
          error: `Model "${modelName}" is not available on your Ollama server`,
          availableModels: availableModels,
          suggestedModels: suggestedModels.slice(0, 5), // Limit to 5 suggestions
        };
      }

      // Model exists in the list, now let's get more details if possible
      try {
        // The model exists in the list, now we can get more details using show endpoint
        const modelResponse = await axios.get(`${apiUrl}/api/show`, {
          params: { name: modelName },
          timeout: 5000,
          validateStatus: false,
        });

        if (modelResponse.status !== 200) {
          console.warn(`Could not get details for model ${modelName}, but it exists in the model list`);
          // Return exists=true even if details can't be fetched, since we know it exists
          return {
            exists: true,
            isMultimodal:
              modelName.includes("llava") ||
              modelName.includes("bakllava") ||
              modelName.includes("moondream") ||
              modelName.includes("deepseek"),
            needsPull: false,
          };
        }

        // Log model details
        const modelInfo = modelResponse.data;

        // Check if the model is multimodal
        let isMultimodal = false;

        // Specific model families that are known to be multimodal
        const multimodalFamilies = ["llava", "bakllava", "moondream", "deepseek-vision", "deepseek-r1"];

        if (modelInfo.details && modelInfo.details.families) {
          for (const family of modelInfo.details.families) {
            if (multimodalFamilies.some((f) => family.toLowerCase().includes(f))) {
              isMultimodal = true;
              break;
            }
          }
        }

        // Also check the model name itself
        if (!isMultimodal) {
          for (const family of multimodalFamilies) {
            if (modelName.toLowerCase().includes(family)) {
              isMultimodal = true;
              break;
            }
          }
        }

        if (!isMultimodal) {
          console.warn(`Model ${modelName} may not have vision capabilities`);
        }

        return {
          exists: true,
          isMultimodal,
          needsPull: false,
        };
      } catch (modelDetailsError) {
        console.error(`Error getting model details: ${modelDetailsError.message}`);
        // Return exists=true even if details can't be fetched, since we know it exists in the list
        return {
          exists: true,
          isMultimodal:
            modelName.includes("llava") ||
            modelName.includes("bakllava") ||
            modelName.includes("moondream") ||
            modelName.includes("deepseek"),
          needsPull: false,
        };
      }
    } catch (error) {
      console.error(`Error checking model existence: ${error.message}`);

      // Check if the error is because Ollama is not running
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

// Generate chat completion with Ollama
async function generateWithOllama(messages, model) {
  try {
    // Check if we're using deepseek-r1 model
    const isDeepseek = model.toLowerCase().includes("deepseek-r1");

    // Format messages for Ollama
    const ollamaMessages = [];

    // Special handling for deepseek models which might need a different approach
    if (isDeepseek) {
      // Extract all images
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

      // Try different approaches for deepseek model
      try {
        const apiUrl = OLLAMA_BASE_URL.replace("localhost", "127.0.0.1");

        // Create a combined prompt with images and text
        let prompt = textPrompt;

        // Add images to the prompt
        const response = await axios.post(
          `${apiUrl}/api/generate`,
          {
            model: model,
            prompt: prompt,
            images: imageList,
            stream: false,
          },
          {
            timeout: 180000, // 3 minutes
          },
        );

        return response.data.response;
      } catch (deepseekError) {
        console.error("Error with deepseek format 1:", deepseekError.message);

        if (deepseekError.response) {
          console.error("Response status:", deepseekError.response.status);
          console.error("Response data:", JSON.stringify(deepseekError.response.data));
        }

        // Try alternative approach
        try {
          // Create a message with the text first, then all images
          const firstMsg = { role: "user", content: textPrompt };
          ollamaMessages.push(firstMsg);

          // Create a message object for chat endpoint
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

          // Rethrow the original error
          throw deepseekError;
        }
      }
    }

    // Standard format for non-deepseek models
    for (const msg of messages) {
      if (msg.role) {
        ollamaMessages.push(msg);
        continue; // Already in the right format
      }

      // Text format conversion
      if (msg.type === "text") {
        ollamaMessages.push({ role: "user", content: msg.text });
      }
      // Image format conversion
      else if (msg.type === "image_url") {
        try {
          const base64Image = msg.image_url.url.split(",")[1];

          // Check if we already have a user message to add image to
          if (ollamaMessages.length > 0 && ollamaMessages[ollamaMessages.length - 1].role === "user") {
            // If the content is a string, convert it to an array
            const lastMessage = ollamaMessages[ollamaMessages.length - 1];
            if (typeof lastMessage.content === "string") {
              lastMessage.content = [{ type: "text", text: lastMessage.content }];
            }

            // Add the image to the content array
            if (Array.isArray(lastMessage.content)) {
              lastMessage.content.push({ type: "image", data: base64Image });
            }
          } else {
            // Create a new message with just the image
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

    // Use IPv4 explicitly
    const apiUrl = OLLAMA_BASE_URL.replace("localhost", "127.0.0.1");

    // Try generating with the chat API endpoint
    let response;
    let result;

    try {
      // First try with the chat endpoint
      response = await axios.post(
        `${apiUrl}/api/chat`,
        {
          model: model,
          messages: ollamaMessages,
          stream: false,
        },
        {
          timeout: 120000, // Increased timeout to 2 minutes
        },
      );

      result = response.data.message.content;
    } catch (chatError) {
      console.error("Error with /api/chat endpoint:", chatError.message);

      if (chatError.response) {
        console.error("Response status:", chatError.response.status);
        console.error("Response data:", JSON.stringify(chatError.response.data));
      }

      // Fallback to generate API if chat fails

      // Construct a prompt from the messages
      let prompt = "";
      for (const msg of ollamaMessages) {
        if (typeof msg.content === "string") {
          prompt += `${msg.role === "assistant" ? "Assistant: " : "User: "}${msg.content}\n\n`;
        } else if (Array.isArray(msg.content)) {
          // For messages with images, we still need to include any text
          const textParts = msg.content.filter((c) => c.type === "text").map((c) => c.text);
          if (textParts.length > 0) {
            prompt += `${msg.role === "assistant" ? "Assistant: " : "User: "}${textParts.join(" ")}\n\n`;
          } else {
            prompt += `${msg.role === "assistant" ? "Assistant: " : "User: "}[Image provided]\n\n`;
          }
        }
      }

      prompt += "Assistant: ";

      // Try the generate endpoint
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

        // If both methods fail, rethrow the original error
        throw chatError;
      }
    }

    return result;
  } catch (error) {
    console.error("Error generating with Ollama:", error.message);

    // Add additional error information
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

    // Create the content message format required by Gemini
    const geminiContent = {
      parts: contentParts,
      role: "user",
    };

    // Generate configuration including safety settings
    const genConfig = {
      temperature: 0.4,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
    };

    // If streaming is requested, use the streaming API
    if (streaming) {
      const streamingResponse = await geminiModel.generateContentStream({
        contents: [geminiContent],
        generationConfig: genConfig,
      });

      // Set up stream handling
      let fullResponse = "";

      // Return an object that emits events for streaming
      const emitter = new Events.EventEmitter();

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
  getGeminiAI: () => geminiAI
}; 