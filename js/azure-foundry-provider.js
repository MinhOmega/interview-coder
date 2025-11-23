const AnthropicFoundry = require("@anthropic-ai/foundry-sdk");
const EventEmitter = require("events");
const { compressForAzure, needsCompression } = require("./image-compressor");

// Azure Foundry Claude models
const AZURE_FOUNDRY_MODELS = {
  "claude-sonnet-4-5": {
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    supportsVision: true,
    maxTokens: 200000,
  },
  "claude-opus-4-1": {
    id: "claude-opus-4-1",
    name: "Claude Opus 4.1",
    supportsVision: true,
    maxTokens: 200000,
  },
  "claude-haiku-4-5": {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    supportsVision: true,
    maxTokens: 200000,
  },
};

/**
 * Detect actual image format from base64 data
 * @param {string} base64Data - The base64 encoded image data
 * @returns {string} The detected image format
 */
function detectImageFormat(base64Data) {
  // Get the first few bytes of the image to check the magic numbers
  const binaryString = atob(base64Data.substring(0, 20));
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Check magic numbers for different image formats
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
    return 'jpeg';
  } else if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return 'png';
  } else if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'gif';
  } else if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
             bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'webp';
  }

  // Default to png if we can't detect
  return 'png';
}

/**
 * Format messages for Azure Foundry API
 * Converts from OpenAI format to Claude format
 *
 * @param {Array} messages - Messages in OpenAI format
 * @returns {Promise<Array>} Messages in Claude format
 */
async function formatMessagesForClaude(messages) {
  console.log("[formatMessagesForClaude] Called with", messages.length, "messages");
  console.log("[formatMessagesForClaude] First message structure:", JSON.stringify(messages[0], null, 2).substring(0, 500));

  const formattedMessages = [];

  for (const msg of messages) {
    console.log("[formatMessagesForClaude] Processing message with role:", msg.role);

    if (msg.role === "system") {
      // System messages should be handled separately in Claude
      continue;
    }

    // Handle messages with text and images
    if (Array.isArray(msg.content)) {
      console.log("[formatMessagesForClaude] Message has array content with", msg.content.length, "parts");
      const parts = [];

      for (const part of msg.content) {
        console.log("[formatMessagesForClaude] Processing part of type:", part.type);

        if (part.type === "text") {
          console.log("[formatMessagesForClaude] Adding text part");
          parts.push({ type: "text", text: part.text });
        } else if (part.type === "image_url") {
          console.log("[formatMessagesForClaude] Processing image_url part");
          try {
            // Always compress for Azure to ensure we're under limit
            const imageUrl = part.image_url.url;

            console.log("Processing image for Azure Foundry...");

            // Check initial size
            const initialBase64 = imageUrl.includes('base64,') ? imageUrl.split('base64,')[1] : imageUrl;
            const initialSize = Buffer.from(initialBase64, 'base64').length;
            console.log(`[Azure] Initial image size: ${(initialSize / 1024 / 1024).toFixed(2)} MB`);

            // Use aggressive compression for Azure
            console.log("[Azure] Starting compression...");
            const processedImageUrl = await compressForAzure(imageUrl);
            console.log("[Azure] Compression completed");

            // Extract base64 data from data URL
            const base64Match = processedImageUrl.match(/^data:image\/(.*?);base64,(.*)$/);
            if (base64Match) {
            // Clean the base64 data (remove any whitespace or newlines)
            const cleanedBase64 = base64Match[2].replace(/\s+/g, '');

            // Calculate actual size in bytes
            const actualSizeBytes = Buffer.from(cleanedBase64, 'base64').length;
            const sizeInMB = (actualSizeBytes / 1024 / 1024).toFixed(2);

            // Check if still too large (5MB limit)
            if (actualSizeBytes > 5 * 1024 * 1024) {
              console.error(`Image still exceeds 5MB after compression: ${sizeInMB}MB (${actualSizeBytes} bytes)`);
              console.error("Skipping image to avoid API error");
              // Skip this image rather than fail the entire request
              continue;
            }

            // Detect actual image format from the data
            const actualFormat = detectImageFormat(cleanedBase64);

            // Extract the declared format from URL
            let declaredFormat = base64Match[1].toLowerCase();
            if (declaredFormat === 'jpg') {
              declaredFormat = 'jpeg';
            }

            // Use actual format if detected, otherwise use declared format
            let format = actualFormat;

            // Log if there's a mismatch
            if (actualFormat !== declaredFormat && declaredFormat !== 'png') {
              console.warn(`Image format mismatch - declared: ${declaredFormat}, actual: ${actualFormat}, using: ${format}`);
            }

            // Validate the format is supported
            const supportedFormats = ['jpeg', 'png', 'gif', 'webp'];
            if (!supportedFormats.includes(format)) {
              console.warn(`Unsupported image format: ${format}, defaulting to jpeg for better compression`);
              format = 'jpeg'; // Default to JPEG for better compression
            }

            console.log(`Processed image: format=image/${format}, size=${sizeInMB}MB (${actualSizeBytes} bytes)`);

            parts.push({
              type: "image",
              source: {
                type: "base64",
                media_type: `image/${format}`,
                data: cleanedBase64,
              },
            });
          } else {
            console.warn("Invalid image URL format, skipping image");
          }
          } catch (imageError) {
            console.error("[Azure] Error processing image:", imageError);
            console.error("[Azure] Stack trace:", imageError.stack);
            // Skip this image if there's an error
            continue;
          }
        }
      }

      formattedMessages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: parts,
      });
    } else {
      // Simple text message
      formattedMessages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      });
    }
  }

  return formattedMessages;
}

/**
 * Generate response using Azure Foundry Claude
 *
 * @param {Object} client - Azure Foundry client
 * @param {Array} messages - Messages array
 * @param {string} model - Model to use
 * @param {boolean} streaming - Whether to stream the response
 * @param {string} systemPrompt - Optional system prompt
 * @returns {Promise} Response or streaming emitter
 */
async function generateWithAzureFoundry(client, messages, model, streaming = false, systemPrompt = null) {
  try {
    // Check if messages is an array of parts (screenshot mode) or proper messages
    let properMessages = messages;

    // If the first element doesn't have a 'role' property, it's screenshot mode
    if (messages.length > 0 && !messages[0].role) {
      // This is screenshot mode - wrap the parts in a user message
      properMessages = [{
        role: "user",
        content: messages
      }];
    }

    // Format messages for Claude (now async due to image compression)
    const claudeMessages = await formatMessagesForClaude(properMessages);

    // Extract system prompt from messages or use provided one
    let system = systemPrompt;
    const systemMessage = properMessages.find(msg => msg.role === "system");
    if (systemMessage && !system) {
      system = typeof systemMessage.content === "string"
        ? systemMessage.content
        : systemMessage.content.find(part => part.type === "text")?.text;
    }

    const modelInfo = AZURE_FOUNDRY_MODELS[model] || AZURE_FOUNDRY_MODELS["claude-sonnet-4-5"];

    // Create the request parameters
    const params = {
      model: model,
      messages: claudeMessages,
      max_tokens: Math.min(4096, modelInfo.maxTokens),
      temperature: 0.7,
    };

    // Add system prompt if available
    if (system) {
      params.system = system;
    }

    if (streaming) {
      // Create an event emitter for streaming
      const emitter = new EventEmitter();

      // Start streaming in background
      (async () => {
        try {
          const stream = await client.messages.create({
            ...params,
            stream: true,
          });

          let accumulatedText = "";

          for await (const chunk of stream) {
            if (chunk.type === "content_block_delta" && chunk.delta?.text) {
              accumulatedText += chunk.delta.text;
              emitter.emit("chunk", chunk.delta.text);
              emitter.emit("accumulated", accumulatedText);
            }
          }

          emitter.emit("complete", accumulatedText);
        } catch (error) {
          console.error("Azure Foundry streaming error:", error);
          emitter.emit("error", error);
        }
      })();

      return { emitter, streaming: true };
    } else {
      // Non-streaming response
      const response = await client.messages.create(params);

      // Extract text from response
      let responseText = "";
      if (response.content && Array.isArray(response.content)) {
        for (const block of response.content) {
          if (block.type === "text") {
            responseText += block.text;
          }
        }
      }

      return responseText;
    }
  } catch (error) {
    console.error("Azure Foundry generation error:", error);
    throw error;
  }
}

/**
 * Get available Azure Foundry models
 *
 * @returns {Array} List of available models
 */
function getAzureFoundryModels() {
  return Object.values(AZURE_FOUNDRY_MODELS);
}

/**
 * Validate Azure Foundry configuration
 *
 * @param {string} apiKey - API key
 * @param {string} endpoint - Azure endpoint URL
 * @returns {Promise<boolean>} True if configuration is valid
 */
async function validateAzureFoundryConfig(apiKey, endpoint) {
  try {
    const client = new AnthropicFoundry({
      apiKey: apiKey,
      baseURL: endpoint,
      apiVersion: "2023-06-01",
    });

    // Test with a simple message
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      messages: [{ role: "user", content: "Hello" }],
      max_tokens: 10,
    });

    return !!response;
  } catch (error) {
    console.error("Azure Foundry validation error:", error);
    return false;
  }
}

module.exports = {
  generateWithAzureFoundry,
  getAzureFoundryModels,
  validateAzureFoundryConfig,
  AZURE_FOUNDRY_MODELS,
};