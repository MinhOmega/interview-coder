const {
  app,
  BrowserWindow,
  globalShortcut,
  dialog,
  ipcMain,
  desktopCapturer,
  screen,
  systemPreferences,
  Menu,
  shell,
} = require("electron");
const path = require("path");
const screenshot = require("screenshot-desktop");
const fs = require("fs");
const { OpenAI } = require("openai");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");
const Screenshots = require("electron-screenshots");
require("dotenv").config();

// Enable hot reload for development
try {
  // Only enable in development and not in production
  if (process.env.NODE_ENV !== "production") {
    require("electron-reloader")(module, {
      debug: true,
      watchRenderer: true,
    });
    console.log("Hot reload enabled");
  }
} catch (err) {
  console.error("Error setting up hot reload:", err);
}

// Check if running on macOS
const isMac = process.platform === "darwin";
const modifierKey = isMac ? "Command" : "Crtl";

// Default values - use IPv4 address explicitly for Ollama
let OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL
  ? process.env.OLLAMA_BASE_URL.replace("localhost", "127.0.0.1")
  : "http://127.0.0.1:11434";
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL || "deepseek-r1:14b";

// Application modes
let isWindowVisible = true;

// Configure axios to use IPv4
axios.defaults.family = 4;

let openai;
let geminiAI;
let aiProvider = process.env.AI_PROVIDER || "openai"; // Default to OpenAI
let currentModel =
  aiProvider === "openai" ? DEFAULT_MODEL : aiProvider === "gemini" ? DEFAULT_GEMINI_MODEL : DEFAULT_OLLAMA_MODEL;

// Initialize electron-screenshots
let screenshotInstance;

try {
  // Get API key from .env file
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey && apiKey !== "YOUR_OPENAI_API_KEY") {
    openai = new OpenAI({ apiKey });
    console.log("OpenAI client initialized");
  } else {
    console.log("No valid OpenAI API key found, will try to use Ollama if selected");
  }

  // Initialize Gemini client
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (geminiApiKey && geminiApiKey !== "YOUR_GEMINI_API_KEY") {
    geminiAI = new GoogleGenerativeAI(geminiApiKey);
    console.log("Gemini AI client initialized");
  } else {
    console.log("No valid Gemini API key found");
  }
} catch (err) {
  console.error("Error setting up AI clients:", err);
}

let mainWindow;
let modelListWindow;
let screenshots = [];
let multiPageMode = false;

// Define shortcuts configuration
const SHORTCUTS = {
  TOGGLE_VISIBILITY: {
    key: `${modifierKey}+B`,
    handler: () => toggleWindowVisibility(),
    alwaysActive: true,
  },
  PROCESS_SCREENSHOTS: {
    key: `${modifierKey}+Enter`,
    handler: () => {
      if (screenshots.length === 0) {
        mainWindow.webContents.send("warning", "No screenshots to process. Take a screenshot first.");
        return;
      }
      processScreenshotsWithAI();
    },
  },
  OPEN_SETTINGS: {
    key: `${modifierKey}+,`,
    handler: () => createModelSelectionWindow(),
  },
  MOVE_LEFT: {
    key: `${modifierKey}+Left`,
    handler: () => moveWindow("left"),
  },
  MOVE_RIGHT: {
    key: `${modifierKey}+Right`,
    handler: () => moveWindow("right"),
  },
  MOVE_UP: {
    key: `${modifierKey}+Up`,
    handler: () => moveWindow("up"),
  },
  MOVE_DOWN: {
    key: `${modifierKey}+Down`,
    handler: () => moveWindow("down"),
  },
  TAKE_SCREENSHOT: {
    key: `${modifierKey}+H`,
    handler: async () => {
      try {
        updateInstruction("Taking screenshot...");
        const img = await captureScreenshot();
        screenshots.push(img);
        updateInstruction("Processing screenshot with AI...");
        await processScreenshots(true);
      } catch (error) {
        console.error(`${modifierKey}+H error:`, error);
        mainWindow.webContents.send("error", `Error processing command: ${error.message}`);
        updateInstruction(getDefaultInstructions());
      }
    },
  },
  AREA_SCREENSHOT: {
    key: `${modifierKey}+D`,
    handler: () => {
      try {
        updateInstruction("Select an area to screenshot...");
        screenshotInstance.startCapture();
      } catch (error) {
        console.error(`${modifierKey}+D error:`, error);
        mainWindow.webContents.send("error", `Error starting area capture: ${error.message}`);
        updateInstruction(getDefaultInstructions());
      }
    },
  },
  MULTI_PAGE: {
    key: `${modifierKey}+A`,
    handler: async () => {
      try {
        if (!multiPageMode) {
          multiPageMode = true;
          updateInstruction(
            `Multi-mode: ${screenshots.length} screenshots. ${modifierKey}+A to add more, ${modifierKey}+Enter to analyze`,
          );
        }
        updateInstruction("Taking screenshot for multi-mode...");
        const img = await captureScreenshot();
        screenshots.push(img);
        updateInstruction(
          `Multi-mode: ${screenshots.length} screenshots captured. ${modifierKey}+A to add more, ${modifierKey}+Enter to analyze`,
        );
      } catch (error) {
        console.error(`${modifierKey}+A error:`, error);
        mainWindow.webContents.send("error", `Error processing command: ${error.message}`);
      }
    },
  },
  RESET: {
    key: `${modifierKey}+R`,
    handler: () => resetProcess(),
  },
  QUIT: {
    key: `${modifierKey}+Q`,
    handler: () => {
      console.log("Quitting application...");
      app.quit();
    },
  },
  MODEL_SELECTION: {
    key: `${modifierKey}+M`,
    handler: () => createModelSelectionWindow(),
  },
};

// Function to manage hotkey registration based on visibility
function updateHotkeys(isVisible) {
  // Unregister all existing shortcuts
  globalShortcut.unregisterAll();

  // Register shortcuts based on visibility state
  Object.values(SHORTCUTS).forEach((shortcut) => {
    if (isVisible || shortcut.alwaysActive) {
      globalShortcut.register(shortcut.key, shortcut.handler);
    }
  });
}

// Function to move window to different positions on screen
function moveWindow(direction) {
  if (!mainWindow) return;

  const currentPosition = mainWindow.getBounds();
  const display = screen.getDisplayNearestPoint({ x: currentPosition.x, y: currentPosition.y });
  const workArea = display.workArea;

  // Calculate the amount to move (30% of workarea width/height)
  const moveX = Math.floor(workArea.width * 0.3);
  const moveY = Math.floor(workArea.height * 0.3);

  let newPosition = { ...currentPosition };

  switch (direction) {
    case "left":
      newPosition.x = Math.max(workArea.x, currentPosition.x - moveX);
      break;
    case "right":
      newPosition.x = Math.min(workArea.x + workArea.width - currentPosition.width, currentPosition.x + moveX);
      break;
    case "up":
      newPosition.y = Math.max(workArea.y, currentPosition.y - moveY);
      break;
    case "down":
      newPosition.y = Math.min(workArea.y + workArea.height - currentPosition.height, currentPosition.y + moveY);
      break;
  }

  mainWindow.setBounds(newPosition);
}

// Update the toggleWindowVisibility function
function toggleWindowVisibility(forceState) {
  isWindowVisible = typeof forceState === "boolean" ? forceState : !isWindowVisible;

  if (mainWindow) {
    if (isWindowVisible) {
      mainWindow.show();
      mainWindow.setAlwaysOnTop(true, "screen-saver", 1);
      if (modelListWindow) {
        modelListWindow.show();
        modelListWindow.setOpacity(1);
      }
    } else {
      mainWindow.hide();
      mainWindow.setAlwaysOnTop(false);
      if (modelListWindow) {
        modelListWindow.hide();
        modelListWindow.setOpacity(0);
      }
    }

    // Update hotkeys based on visibility
    updateHotkeys(isWindowVisible);

    // Notify renderer about visibility change
    mainWindow.webContents.send("update-visibility", isWindowVisible);
  }
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
    console.log(`Verifying Ollama model: ${modelName}`);
    const apiUrl = OLLAMA_BASE_URL.replace("localhost", "127.0.0.1");

    // First, check if the model is in the list of available models
    try {
      // Get available models first
      const modelsResponse = await axios.get(`${apiUrl}/api/tags`, {
        timeout: 5000,
        validateStatus: false,
      });

      console.log(`Models list response status: ${modelsResponse.status}`);

      if (modelsResponse.status !== 200) {
        console.error(`Failed to get list of models (status ${modelsResponse.status})`);
        return {
          exists: false,
          error: `Failed to get list of models (status ${modelsResponse.status})`,
        };
      }

      const modelsList = modelsResponse.data.models || [];
      console.log(`Available models: ${modelsList.map((m) => m.name).join(", ")}`);

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

        console.log(`Model info response status: ${modelResponse.status}`);

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
        console.log(`Model details for ${modelName}:`, JSON.stringify(modelInfo, null, 2));

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
        } else {
          console.log(`Model ${modelName} appears to have vision capabilities`);
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
    // Format messages for Ollama
    console.log(`Preparing to generate with Ollama using model: ${model}`);

    // Check if we're using deepseek-r1 model
    const isDeepseek = model.toLowerCase().includes("deepseek-r1");
    console.log(`Using model ${model}, isDeepseek: ${isDeepseek}`);

    // Format messages for Ollama
    const ollamaMessages = [];

    // Log the original messages for debugging
    console.log(
      "Original messages structure:",
      JSON.stringify(
        messages.map((m) => {
          // Don't log actual image data as it's too large
          if (m.type === "image_url") {
            return { type: "image_url", image_url: { url: "[base64 image data]" } };
          }
          return m;
        }),
      ),
    );

    // Special handling for deepseek models which might need a different approach
    if (isDeepseek) {
      console.log("Using special format for deepseek-r1 model");

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
        console.log("Attempting deepseek format 1 (using /api/generate endpoint)");

        const apiUrl = OLLAMA_BASE_URL.replace("localhost", "127.0.0.1");
        console.log(`Sending request to Ollama API at: ${apiUrl}/api/generate`);

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

        console.log("Generate API response status:", response.status);
        return response.data.response;
      } catch (deepseekError) {
        console.error("Error with deepseek format 1:", deepseekError.message);

        if (deepseekError.response) {
          console.error("Response status:", deepseekError.response.status);
          console.error("Response data:", JSON.stringify(deepseekError.response.data));
        }

        // Try alternative approach
        try {
          console.log("Attempting deepseek format 2 (using multipart message)");

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

          console.log("Chat API response status:", chatResponse.status);
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
          // For Ollama, we need to add images to the 'content' array of the most recent message
          // or create a new message if there are no previous messages

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

    // Log the transformed messages (without actual image data for clarity)
    console.log(
      "Formatted messages for Ollama:",
      JSON.stringify(
        ollamaMessages.map((m) => {
          if (typeof m.content === "string") {
            return { role: m.role, content: m.content };
          } else if (Array.isArray(m.content)) {
            return {
              role: m.role,
              content: m.content.map((c) => {
                if (c.type === "image") {
                  return { type: "image", data: "[base64 image data]" };
                }
                return c;
              }),
            };
          }
          return m;
        }),
      ),
    );

    // Use IPv4 explicitly
    const apiUrl = OLLAMA_BASE_URL.replace("localhost", "127.0.0.1");
    console.log(`Sending request to Ollama API at: ${apiUrl}/api/chat`);

    // Try generating with the chat API endpoint
    let response;
    let result;

    try {
      // First try with the chat endpoint
      console.log("Attempting to use /api/chat endpoint...");
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

      console.log("Chat API response status:", response.status);
      result = response.data.message.content;
    } catch (chatError) {
      console.error("Error with /api/chat endpoint:", chatError.message);

      if (chatError.response) {
        console.error("Response status:", chatError.response.status);
        console.error("Response data:", JSON.stringify(chatError.response.data));
      }

      // Fallback to generate API if chat fails
      console.log("Falling back to /api/generate endpoint...");

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
      console.log("Constructed prompt:", prompt);

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

        console.log("Generate API response status:", response.status);
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

    console.log("Successfully generated response from Ollama");
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

async function generateWithGemini(messages, model, streaming = false) {
  try {
    if (!geminiAI) {
      throw new Error("Gemini AI client is not initialized. Please check your API key.");
    }

    console.log(`Generating with Gemini using model: ${model}`);

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
      console.log("Using streaming API with Gemini");

      const streamingResponse = await geminiModel.generateContentStream({
        contents: [geminiContent],
        generationConfig: genConfig,
      });

      // Set up stream handling
      let fullResponse = "";

      // Return an object that emits events for streaming
      const emitter = new (require("events").EventEmitter)();

      // Process the stream
      (async () => {
        try {
          for await (const chunk of streamingResponse.stream) {
            const chunkText = chunk.text();
            console.log("Gemini stream chunk received:", chunkText.substring(0, 50) + "...");
            fullResponse += chunkText;

            // Emit the chunk
            emitter.emit("chunk", chunkText);
          }

          // Emit completion event
          console.log("Gemini stream complete, total length:", fullResponse.length);
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

function updateInstruction(instruction) {
  if (!instruction || instruction.trim() === "") {
    // If instruction is empty, hide the instruction banner
    mainWindow.webContents.send("hide-instruction");
  } else {
    // Show the instruction with the provided text
    mainWindow.webContents.send("update-instruction", instruction);
  }
}

/**
 * Capture a screenshot of the entire screen or active window using the most reliable method for the platform
 */
async function captureScreenshot() {
  try {
    console.log("Capturing screen content...");

    const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
    const imagePath = path.join(app.getPath("pictures"), `screenshot-${timestamp}.png`);

    // Hide the main window temporarily for capturing
    const wasVisible = mainWindow.isVisible();
    if (wasVisible) {
      mainWindow.hide();
      // Wait a bit for the window to hide
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    let success = false;
    let base64Image = "";

    try {
      // Get all screen sources
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: {
          width: screen.getPrimaryDisplay().workAreaSize.width,
          height: screen.getPrimaryDisplay().workAreaSize.height,
        },
      });

      // Get the primary display
      const primaryDisplay = screen.getPrimaryDisplay();

      // Find the source that matches the primary display
      const source =
        sources.find((s) => {
          const bounds = s.display?.bounds || s.bounds;
          return (
            bounds.x === 0 &&
            bounds.y === 0 &&
            bounds.width === primaryDisplay.size.width &&
            bounds.height === primaryDisplay.size.height
          );
        }) || sources[0];

      if (!source) {
        throw new Error("No screen source found");
      }

      // Create a temporary hidden BrowserWindow to capture the screen
      const captureWin = new BrowserWindow({
        width: primaryDisplay.size.width,
        height: primaryDisplay.size.height,
        show: false,
        webPreferences: {
          offscreen: true,
          nodeIntegration: true,
          contextIsolation: false,
        },
      });

      // Load a minimal HTML file
      await captureWin.loadURL("data:text/html,<html><body></body></html>");

      // Inject capture script
      await captureWin.webContents.executeJavaScript(`
        new Promise(async (resolve) => {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: {
                mandatory: {
                  chromeMediaSource: 'desktop',
                  chromeMediaSourceId: '${source.id}',
                  minWidth: ${primaryDisplay.size.width},
                  maxWidth: ${primaryDisplay.size.width},
                  minHeight: ${primaryDisplay.size.height},
                  maxHeight: ${primaryDisplay.size.height}
                }
              }
            });

            const video = document.createElement('video');
            video.style.cssText = 'position: absolute; top: -10000px; left: -10000px;';
            video.srcObject = stream;

            video.onloadedmetadata = () => {
              video.play();
              const canvas = document.createElement('canvas');
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(video, 0, 0);
              
              const imageData = canvas.toDataURL('image/png');
              video.remove();
              stream.getTracks()[0].stop();
              resolve(imageData);
            };

            document.body.appendChild(video);
          } catch (err) {
            resolve(null);
            console.error('Capture error:', err);
          }
        });
      `);

      // Get the captured image
      const imageData = await captureWin.webContents.executeJavaScript(
        'document.querySelector("canvas").toDataURL("image/png")',
      );

      // Close the capture window
      captureWin.close();

      if (!imageData) {
        throw new Error("Failed to capture screen");
      }

      // Save the image
      const base64Data = imageData.replace(/^data:image\/png;base64,/, "");
      fs.writeFileSync(imagePath, base64Data, "base64");
      base64Image = imageData;
      success = true;
    } catch (captureError) {
      console.error("Desktop capturer failed:", captureError);

      // Fallback to screenshot-desktop
      try {
        await screenshot({ filename: imagePath });
        const imageBuffer = fs.readFileSync(imagePath);
        base64Image = `data:image/png;base64,${imageBuffer.toString("base64")}`;
        success = true;
      } catch (fallbackError) {
        console.error("Screenshot fallback failed:", fallbackError);
        throw fallbackError;
      }
    }

    // Show the main window again
    if (wasVisible) {
      mainWindow.show();
    }

    // Verify the screenshot was taken
    if (!fs.existsSync(imagePath)) {
      throw new Error("Screenshot file was not created");
    }

    const stats = fs.statSync(imagePath);
    if (stats.size < 1000) {
      throw new Error("Screenshot file is too small, likely empty");
    }

    // Get image dimensions
    const dimensions = { width: 0, height: 0 };
    try {
      const sizeOf = require("image-size");
      const imageDimensions = sizeOf(imagePath);
      dimensions.width = imageDimensions.width;
      dimensions.height = imageDimensions.height;
    } catch (dimError) {
      console.error("Error getting image dimensions:", dimError);
    }

    // Notify about saved screenshot
    mainWindow.webContents.send("notification", {
      body: `Screenshot saved to ${imagePath} (${dimensions.width}x${dimensions.height})`,
      type: "success",
    });

    console.log(`Screenshot saved to ${imagePath} (${dimensions.width}x${dimensions.height})`);
    return base64Image;
  } catch (error) {
    console.error("Screenshot capture failed:", error);
    throw error;
  }
}

async function processScreenshots(useStreaming = false) {
  try {
    console.log(`Starting processScreenshots with provider: ${aiProvider}, model: ${currentModel}`);

    // Show loading state
    mainWindow.webContents.send("loading", true);

    // Check if we're using Ollama and verify the model first
    if (aiProvider === "ollama") {
      const modelVerification = await verifyOllamaModel(currentModel);

      if (!modelVerification.exists) {
        // If we have suggested models, include them in the error message
        let errorMessage = `The selected model "${currentModel}" is not available: ${modelVerification.error}`;

        if (modelVerification.suggestedModels && modelVerification.suggestedModels.length > 0) {
          errorMessage += `\n\nAvailable vision models:\n${modelVerification.suggestedModels.join("\n")}`;

          // Show a special message with suggestions
          mainWindow.webContents.send("model-not-found", {
            model: currentModel,
            error: modelVerification.error,
            suggestedModels: modelVerification.suggestedModels,
          });
        }

        throw new Error(errorMessage);
      }

      if (!modelVerification.isMultimodal) {
        mainWindow.webContents.send(
          "warning",
          `Warning: The model "${currentModel}" may not support image inputs. Results may be unpredictable.`,
        );
      }
    }

    // Create an improved prompt based on the number of screenshots
    let promptText = "";
    if (screenshots.length === 1) {
      promptText = `The screenshot shows a programming problem or question. 
I need you to provide the best possible solution with excellent performance and readability.

Guidelines:
1. Start with a clear understanding of the problem before diving into code.
2. Use modern practices, efficient algorithms, and optimize for both time and space complexity.
3. Structure your code with clean architecture principles.
4. Include robust error handling and edge case considerations.
5. If multiple solutions exist, present the optimal approach and explain your decision.

Your response MUST follow this exact structure with these three main sections:

# Analyzing the Problem
Provide a clear understanding of what the problem is asking, including:
- The key requirements and constraints
- Input/output specifications
- Important edge cases to consider
- Any implicit assumptions

# My Thoughts
Explain your strategy and implementation, including:
- Your overall approach to solving the problem
- Key algorithms, data structures, or patterns you're using
- The complete, well-commented implementation
- Any trade-offs or alternative approaches you considered

# Complexity
Analyze the efficiency of your solution:
- Time complexity with explanation
- Space complexity with explanation
- Potential bottlenecks
- Any further optimization possibilities

Format your response in clear, well-structured Markdown with proper code blocks for all code.`;
    } else {
      promptText = `These ${screenshots.length} screenshots show a multi-part programming problem. 
I need you to provide the best possible solution with excellent performance and readability.

Guidelines:
1. Start with a clear understanding of the full problem scope across all screenshots.
2. Use modern practices, efficient algorithms, and optimize for both time and space complexity.
3. Structure your code with clean architecture principles.
4. Include robust error handling and edge case considerations.
5. If multiple solutions exist, present the optimal approach and explain your decision.

Your response MUST follow this exact structure with these three main sections:

# Analyzing the Problem
Provide a clear understanding of what the problem is asking, including:
- The key requirements and constraints
- Input/output specifications
- Important edge cases to consider
- Any implicit assumptions

# My Thoughts
Explain your strategy and implementation, including:
- Your overall approach to solving the problem
- Key algorithms, data structures, or patterns you're using
- The complete, well-commented implementation
- Any trade-offs or alternative approaches you considered

# Complexity
Analyze the efficiency of your solution:
- Time complexity with explanation
- Space complexity with explanation
- Potential bottlenecks
- Any further optimization possibilities

Format your response in clear, well-structured Markdown with proper code blocks for all code.`;
    }

    // Build message with text + each screenshot
    const messages = [{ type: "text", text: promptText }];
    console.log(`Processing ${screenshots.length} screenshots`);

    for (const img of screenshots) {
      // Check if the image already has the data URL prefix or not
      const imageData = img.startsWith("data:image/") ? img : `data:image/png;base64,${img}`;
      messages.push({
        type: "image_url",
        image_url: { url: imageData },
      });
    }

    let result;

    if (aiProvider === "openai") {
      if (!openai) {
        throw new Error("OpenAI client is not initialized. Please check your API key.");
      }

      console.log("Using OpenAI for processing with model:", currentModel);

      if (useStreaming) {
        // Make the streaming request using OpenAI
        const stream = await openai.chat.completions.create({
          model: currentModel,
          messages: [{ role: "user", content: messages }],
          max_tokens: 8000,
          stream: true,
        });

        // Start streaming to the renderer
        mainWindow.webContents.send("loading", false);
        mainWindow.webContents.send("stream-start");

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            mainWindow.webContents.send("stream-chunk", content);
          }
        }

        mainWindow.webContents.send("stream-end");
        // Hide instruction banner after streaming is complete
        mainWindow.webContents.send("hide-instruction");
        return;
      } else {
        // Non-streaming request
        const response = await openai.chat.completions.create({
          model: currentModel,
          messages: [{ role: "user", content: messages }],
          max_tokens: 8000,
        });

        result = response.choices[0].message.content;
        console.log("Successfully received response from OpenAI");
      }
    } else if (aiProvider === "ollama") {
      // Use Ollama for generation
      console.log("Using Ollama for processing with model:", currentModel);
      result = await generateWithOllama(messages, currentModel);
      console.log("Successfully received response from Ollama");
    } else if (aiProvider === "gemini") {
      // Use Gemini for generation
      console.log("Using Gemini for processing with model:", currentModel);

      if (useStreaming) {
        const streamingResult = await generateWithGemini(messages, currentModel, true);

        // Start streaming to the renderer
        mainWindow.webContents.send("loading", false);
        mainWindow.webContents.send("stream-start");

        // For Gemini, we need to handle streaming differently
        let accumulatedText = "";

        streamingResult.emitter.on("chunk", (chunk) => {
          accumulatedText += chunk;
          mainWindow.webContents.send("stream-update", accumulatedText);
        });

        streamingResult.emitter.on("complete", () => {
          mainWindow.webContents.send("stream-end");
          // Hide instruction banner after streaming is complete
          mainWindow.webContents.send("hide-instruction");
        });

        streamingResult.emitter.on("error", (error) => {
          mainWindow.webContents.send("error", error.message);
          mainWindow.webContents.send("stream-end");
          // Hide instruction banner on error
          mainWindow.webContents.send("hide-instruction");
        });

        return;
      } else {
        result = await generateWithGemini(messages, currentModel);
        console.log("Successfully received response from Gemini");
      }
    } else {
      throw new Error(`Unknown AI provider: ${aiProvider}`);
    }

    // Hide loading state
    mainWindow.webContents.send("loading", false);

    // Send the text to the renderer
    mainWindow.webContents.send("analysis-result", result);
    console.log("Analysis complete and sent to renderer");

    // Hide instruction banner when done
    mainWindow.webContents.send("hide-instruction");
  } catch (err) {
    console.error("Error in processScreenshots:", err);
    console.error("Stack trace:", err.stack);

    if (err.response) {
      console.error("Response status:", err.response.status);
      console.error("Response data:", JSON.stringify(err.response.data));
    }

    mainWindow.webContents.send("loading", false);
    mainWindow.webContents.send("error", err.message);
    // Hide instruction banner on error
    mainWindow.webContents.send("hide-instruction");
  }
}

// Create model selection window
function createModelSelectionWindow() {
  if (modelListWindow) {
    modelListWindow.focus();
    return;
  }

  modelListWindow = new BrowserWindow({
    width: 500,
    height: 600,
    parent: mainWindow,
    modal: false, // Allow communication between windows
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  modelListWindow.loadFile("model-selector.html");

  modelListWindow.on("closed", () => {
    modelListWindow = null;
    // Notify main window to refresh model badge
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send("model-changed");
    }
  });
}

// Reset everything
function resetProcess() {
  screenshots = [];
  multiPageMode = false;
  mainWindow.webContents.send("clear-result");
  mainWindow.webContents.send("hide-content");
  updateInstruction(`Press ${modifierKey}+H to take a screenshot`);
}

// Handler for getting current settings
ipcMain.handle("get-current-settings", () => {
  return {
    aiProvider,
    currentModel,
    ollamaUrl: OLLAMA_BASE_URL,
  };
});

// Handler for updating model settings
ipcMain.on("update-model-settings", (event, settings) => {
  console.log("Updating model settings:", settings);

  // Update global settings
  aiProvider = settings.aiProvider;
  currentModel = settings.currentModel;

  if (settings.ollamaUrl) {
    // Ensure IPv4 compatibility
    OLLAMA_BASE_URL = settings.ollamaUrl.replace("localhost", "127.0.0.1");
  }

  // Save to local storage via renderer (more reliable than electron-store for simple settings)
  if (mainWindow) {
    mainWindow.webContents.send("model-changed");
  }

  console.log(`Settings updated: Provider=${aiProvider}, Model=${currentModel}, Ollama URL=${OLLAMA_BASE_URL}`);
});

// Handler for Ollama models
ipcMain.handle("get-ollama-models", async () => {
  try {
    return await getOllamaModels();
  } catch (error) {
    console.error("Error getting Ollama models:", error);
    return [];
  }
});

function createWindow() {
  // Get primary display dimensions for centering
  const { screen } = require("electron");
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: displayWidth, height: displayHeight } = primaryDisplay.workAreaSize;

  // Window dimensions
  const windowWidth = 800;
  const windowHeight = 600;

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: Math.floor((displayWidth - windowWidth) / 2),
    y: Math.floor((displayHeight - windowHeight) / 2),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    frame: false,
    transparent: true,
    backgroundColor: "#00000000", // Transparent background
    alwaysOnTop: true,
    paintWhenInitiallyHidden: true,
    contentProtection: true,
    movable: true, // Ensure window is movable
    roundedCorners: true,
    titleBarStyle: "hidden", // Hide title bar completely
    titleBarOverlay: false,
    trafficLightPosition: { x: -999, y: -999 }, // Move traffic lights far off-screen
    fullscreenable: true,
    skipTaskbar: true,
    autoHideMenuBar: true,
    hasShadow: true, // Add shadow for better visibility
    enableLargerThanScreen: false, // Prevent window from being larger than screen
  });

  mainWindow.loadFile("index.html");
  mainWindow.setContentProtection(true);
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setAlwaysOnTop(true, "screen-saver", 1);

  // Enable DevTools keyboard shortcut (will only work when called from renderer)
  mainWindow.webContents.on("before-input-event", (event, input) => {
    // Allow Cmd+Opt+I or Ctrl+Shift+I to open dev tools directly
    const cmdOrCtrl = process.platform === "darwin" ? input.meta : input.control;
    if (
      (cmdOrCtrl && input.alt && input.key.toLowerCase() === "i") ||
      (cmdOrCtrl && input.shift && input.key.toLowerCase() === "i")
    ) {
      mainWindow.webContents.openDevTools();
      event.preventDefault();
    }
  });

  // Initialize electron-screenshots
  screenshotInstance = new Screenshots({
    singleWindow: true,
    lang: "en",
    // Customize the appearance
    styles: {
      windowBackgroundColor: "#00000000",
      mask: {
        color: "#000000",
        opacity: 0.6,
      },
      toolbar: {
        backgroundColor: "#2e2c29",
        color: "#ffffff",
        activeColor: "#2196f3",
      },
    },
  });

  // Listen for screenshot complete event
  screenshotInstance.on("ok", async (data) => {
    try {
      const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
      const imagePath = path.join(app.getPath("pictures"), `screenshot-${timestamp}.png`);

      // Save the image
      fs.writeFileSync(imagePath, data.buffer);

      // Convert to base64 for processing
      const base64Image = `data:image/png;base64,${data.buffer.toString("base64")}`;

      // Add to screenshots array and process
      screenshots.push(base64Image);

      // Get dimensions
      const dimensions = { width: data.bounds.width, height: data.bounds.height };

      // Notify about saved screenshot
      mainWindow.webContents.send("notification", {
        body: `Screenshot saved to ${imagePath} (${dimensions.width}x${dimensions.height})`,
        type: "success",
      });

      // Process the screenshot
      await processScreenshots(true);
    } catch (error) {
      console.error("Error handling screenshot:", error);
      mainWindow.webContents.send("error", `Failed to process screenshot: ${error.message}`);
      // Hide instruction banner on error
      mainWindow.webContents.send("hide-instruction");
    }
  });

  // Listen for cancel event
  screenshotInstance.on("cancel", () => {
    console.log("Screenshot cancelled");
  });

  // Detect screen capture/sharing
  if (process.platform === "darwin") {
    // macOS screen capture detection
    const { systemPreferences } = require("electron");

    try {
      // Check if screen recording permission is granted
      const hasScreenCapturePermission = systemPreferences.getMediaAccessStatus("screen");

      if (hasScreenCapturePermission === "granted") {
        console.log("Screen capture permission is granted");

        // Check if screen is being captured/shared
        systemPreferences.subscribeWorkspaceNotification("NSWorkspaceScreenIsSharedDidChangeNotification", () => {
          const isBeingCaptured = systemPreferences.getMediaAccessStatus("screen") === "granted";
          console.log("Screen sharing status changed:", isBeingCaptured ? "sharing active" : "sharing inactive");

          if (isBeingCaptured) {
            // Screen is being shared, make window nearly invisible
            toggleWindowVisibility(false);

            // Also notify the renderer
            if (mainWindow?.webContents) {
              mainWindow.webContents.send("screen-sharing-detected");
            }
          }
        });
      }
    } catch (error) {
      console.error("Error setting up screen capture detection:", error);
    }
  }

  // Add listener for screen sharing detection on Windows/Linux
  if (process.platform === "win32" || process.platform === "linux") {
    try {
      // Use desktopCapturer as a way to detect screen sharing
      let checkInterval = setInterval(() => {
        desktopCapturer
          .getSources({ types: ["screen"] })
          .then((sources) => {
            // If more than one screen source is found, it might indicate screen sharing
            if (sources.length > 1) {
              console.log("Multiple screen sources detected, possible screen sharing");
              toggleWindowVisibility(false);

              // Notify the renderer
              if (mainWindow?.webContents) {
                mainWindow.webContents.send("screen-sharing-detected");
              }
            }
          })
          .catch((error) => {
            console.error("Error checking screen sources:", error);
          });
      }, 5000); // Check every 5 seconds

      // Clear interval when window is closed
      mainWindow.on("closed", () => {
        clearInterval(checkInterval);
        checkInterval = null;
      });
    } catch (error) {
      console.error("Error setting up screen sharing detection:", error);
    }
  }

  // Replace all individual globalShortcut.register calls with a single updateHotkeys call
  updateHotkeys(true);

  // Send initial status to renderer
  setTimeout(() => {
    updateInstruction(getDefaultInstructions());
  }, 1000);
}

// Get default instructions based on app state
function getDefaultInstructions() {
  if (multiPageMode) {
    return `Multi-mode: ${screenshots.length} screenshots. ${modifierKey}+Shift+A to add more, ${modifierKey}+Enter to analyze`;
  }

  return `${modifierKey}+B: Toggle visibility \n ${modifierKey}+H: Take screenshot \n ${modifierKey}+R: Reset \n`;
}

// Process screenshots based on current mode
async function processScreenshotsWithAI() {
  if (screenshots.length === 0) {
    mainWindow.webContents.send("warning", "No screenshots to process. Take a screenshot first.");
    return;
  }

  try {
    updateInstruction("Processing screenshots with AI...");
    await processScreenshots(true);
  } catch (error) {
    console.error("Error processing screenshots:", error);
    mainWindow.webContents.send("error", "Failed to process screenshots: " + error.message);
    updateInstruction(getDefaultInstructions());
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  globalShortcut.unregisterAll();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.on("add-context-screenshot", async () => {
  try {
    updateInstruction("Taking additional screenshot for context...");
    const img = await captureScreenshot();
    screenshots.push(img);
    updateInstruction("Processing with new context...");
    await processScreenshots(true);
  } catch (error) {
    console.error("Error adding context screenshot:", error);
    mainWindow.webContents.send("error", `Error processing: ${error.message}`);
    updateInstruction(getDefaultInstructions());
  }
});

// Toggle DevTools when requested
ipcMain.on("toggle-devtools", () => {
  if (mainWindow) {
    if (mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools();
    } else {
      mainWindow.webContents.openDevTools();
    }
  }
});

// Show context menu for inspection
ipcMain.on("show-context-menu", () => {
  if (mainWindow) {
    const template = [
      {
        label: "Inspect Element",
        click: () => {
          mainWindow.webContents.openDevTools();
        },
      },
      { type: "separator" },
      { label: "Reload", click: () => mainWindow.reload() },
      { type: "separator" },
      { label: "Copy", role: "copy" },
      { label: "Paste", role: "paste" },
    ];

    const menu = Menu.buildFromTemplate(template);
    menu.popup(BrowserWindow.fromWebContents(mainWindow.webContents));
  }
});

ipcMain.on("report-solution-error", async (event, errorDescription) => {
  // ... existing code ...
});
