const { app, BrowserWindow, globalShortcut, dialog, ipcMain, desktopCapturer } = require("electron");
const path = require("path");
const screenshot = require("screenshot-desktop");
const fs = require("fs");
const { OpenAI } = require("openai");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");
require("dotenv").config();

// Check if running on macOS
const isMac = process.platform === "darwin";
const modifierKey = isMac ? "Command" : "Control";

// Default values - use IPv4 address explicitly for Ollama
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ? process.env.OLLAMA_BASE_URL.replace('localhost', '127.0.0.1') : "http://127.0.0.1:11434";
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

// Configure axios to use IPv4
axios.defaults.family = 4;

let openai;
let geminiAI;
let aiProvider = process.env.AI_PROVIDER || "openai"; // Default to OpenAI
let currentModel = DEFAULT_MODEL;

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

// Get list of models from Ollama
async function getOllamaModels() {
  try {
    console.log("🚀 ~ getOllamaModels ~ OLLAMA_BASE_URL:", OLLAMA_BASE_URL);
    // Use IPv4 explicitly by replacing any remaining 'localhost' with '127.0.0.1'
    const apiUrl = OLLAMA_BASE_URL.replace('localhost', '127.0.0.1');
    
    // Add timeout to avoid long waiting times if Ollama is not running
    const response = await axios.get(`${apiUrl}/api/tags`, {
      timeout: 5000,
      validateStatus: false // Don't throw on non-2xx status
    });
    
    console.log("🚀 ~ getOllamaModels ~ response status:", response.status);
    
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
    const apiUrl = OLLAMA_BASE_URL.replace('localhost', '127.0.0.1');
    
    // First, check if the model is in the list of available models
    try {
      // Get available models first
      const modelsResponse = await axios.get(`${apiUrl}/api/tags`, {
        timeout: 5000,
        validateStatus: false
      });
      
      console.log(`Models list response status: ${modelsResponse.status}`);
      
      if (modelsResponse.status !== 200) {
        console.error(`Failed to get list of models (status ${modelsResponse.status})`);
        return {
          exists: false,
          error: `Failed to get list of models (status ${modelsResponse.status})`
        };
      }
      
      const modelsList = modelsResponse.data.models || [];
      console.log(`Available models: ${modelsList.map(m => m.name).join(', ')}`);
      
      // Check if our model is in the list
      const modelExists = modelsList.some(m => m.name === modelName);
      
      if (!modelExists) {
        console.error(`Model ${modelName} does not exist in the list of available models`);
        
        // For a better user experience, suggest models that do exist
        const availableModels = modelsList.map(m => m.name);
        const visionModels = availableModels.filter(name => 
          name.includes('llava') || 
          name.includes('bakllava') || 
          name.includes('moondream') || 
          name.includes('deepseek')
        );
        
        const suggestedModels = visionModels.length > 0 ? visionModels : availableModels;
        
        return {
          exists: false,
          error: `Model "${modelName}" is not available on your Ollama server`,
          availableModels: availableModels,
          suggestedModels: suggestedModels.slice(0, 5) // Limit to 5 suggestions
        };
      }
      
      // Model exists in the list, now let's get more details if possible
      try {
        // The model exists in the list, now we can get more details using show endpoint
        const modelResponse = await axios.get(`${apiUrl}/api/show`, {
          params: { name: modelName },
          timeout: 5000,
          validateStatus: false
        });
        
        console.log(`Model info response status: ${modelResponse.status}`);
        
        if (modelResponse.status !== 200) {
          console.warn(`Could not get details for model ${modelName}, but it exists in the model list`);
          // Return exists=true even if details can't be fetched, since we know it exists
          return {
            exists: true,
            isMultimodal: modelName.includes('llava') || 
                          modelName.includes('bakllava') || 
                          modelName.includes('moondream') || 
                          modelName.includes('deepseek'),
            needsPull: false
          };
        }
        
        // Log model details
        const modelInfo = modelResponse.data;
        console.log(`Model details for ${modelName}:`, JSON.stringify(modelInfo, null, 2));
        
        // Check if the model is multimodal
        let isMultimodal = false;
        
        // Specific model families that are known to be multimodal
        const multimodalFamilies = ['llava', 'bakllava', 'moondream', 'deepseek-vision', 'deepseek-r1'];
        
        if (modelInfo.details && modelInfo.details.families) {
          for (const family of modelInfo.details.families) {
            if (multimodalFamilies.some(f => family.toLowerCase().includes(f))) {
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
          needsPull: false
        };
      } catch (modelDetailsError) {
        console.error(`Error getting model details: ${modelDetailsError.message}`);
        // Return exists=true even if details can't be fetched, since we know it exists in the list
        return {
          exists: true,
          isMultimodal: modelName.includes('llava') || 
                        modelName.includes('bakllava') || 
                        modelName.includes('moondream') || 
                        modelName.includes('deepseek'),
          needsPull: false
        };
      }
    } catch (error) {
      console.error(`Error checking model existence: ${error.message}`);
      
      // Check if the error is because Ollama is not running
      if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
        return {
          exists: false,
          error: `Unable to connect to Ollama. Is Ollama running at ${apiUrl}?`
        };
      }
      
      return {
        exists: false,
        error: `Failed to verify model: ${error.message}`
      };
    }
  } catch (error) {
    console.error(`Error in verifyOllamaModel:`, error.message);
    return {
      exists: false,
      error: `Failed to verify model: ${error.message}`
    };
  }
}

// Generate chat completion with Ollama
async function generateWithOllama(messages, model) {
  try {
    // Format messages for Ollama
    console.log(`Preparing to generate with Ollama using model: ${model}`);
    
    // Check if we're using deepseek-r1 model
    const isDeepseek = model.toLowerCase().includes('deepseek-r1');
    console.log(`Using model ${model}, isDeepseek: ${isDeepseek}`);
    
    // Format messages for Ollama
    const ollamaMessages = [];
    
    // Log the original messages for debugging
    console.log("Original messages structure:", JSON.stringify(messages.map(m => {
      // Don't log actual image data as it's too large
      if (m.type === "image_url") {
        return { type: "image_url", image_url: { url: "[base64 image data]" } };
      }
      return m;
    })));
    
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
        
        const apiUrl = OLLAMA_BASE_URL.replace('localhost', '127.0.0.1');
        console.log(`Sending request to Ollama API at: ${apiUrl}/api/generate`);
        
        // Create a combined prompt with images and text
        let prompt = textPrompt;
        
        // Add images to the prompt
        const response = await axios.post(`${apiUrl}/api/generate`, {
          model: model,
          prompt: prompt,
          images: imageList,
          stream: false
        }, {
          timeout: 180000 // 3 minutes
        });
        
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
          const apiUrl = OLLAMA_BASE_URL.replace('localhost', '127.0.0.1');
          const chatResponse = await axios.post(`${apiUrl}/api/chat`, {
            model: model,
            messages: ollamaMessages,
            images: imageList,
            stream: false
          }, {
            timeout: 180000 // 3 minutes
          });
          
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
          if (ollamaMessages.length > 0 && ollamaMessages[ollamaMessages.length-1].role === 'user') {
            // If the content is a string, convert it to an array
            const lastMessage = ollamaMessages[ollamaMessages.length-1];
            if (typeof lastMessage.content === 'string') {
              lastMessage.content = [{ type: 'text', text: lastMessage.content }];
            }
            
            // Add the image to the content array
            if (Array.isArray(lastMessage.content)) {
              lastMessage.content.push({ type: 'image', data: base64Image });
            }
          } else {
            // Create a new message with just the image
            ollamaMessages.push({
              role: "user",
              content: [{ type: 'image', data: base64Image }]
            });
          }
        } catch (error) {
          console.error("Error processing image for Ollama:", error);
          throw new Error(`Failed to process image: ${error.message}`);
        }
      }
    }
    
    // Log the transformed messages (without actual image data for clarity)
    console.log("Formatted messages for Ollama:", JSON.stringify(ollamaMessages.map(m => {
      if (typeof m.content === 'string') {
        return { role: m.role, content: m.content };
      } else if (Array.isArray(m.content)) {
        return {
          role: m.role,
          content: m.content.map(c => {
            if (c.type === 'image') {
              return { type: 'image', data: '[base64 image data]' };
            }
            return c;
          })
        };
      }
      return m;
    })));
    
    // Use IPv4 explicitly
    const apiUrl = OLLAMA_BASE_URL.replace('localhost', '127.0.0.1');
    console.log(`Sending request to Ollama API at: ${apiUrl}/api/chat`);
    
    // Try generating with the chat API endpoint 
    let response;
    let result;
    
    try {
      // First try with the chat endpoint
      console.log("Attempting to use /api/chat endpoint...");
      response = await axios.post(`${apiUrl}/api/chat`, {
        model: model,
        messages: ollamaMessages,
        stream: false,
      }, {
        timeout: 120000 // Increased timeout to 2 minutes
      });
      
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
        if (typeof msg.content === 'string') {
          prompt += `${msg.role === 'assistant' ? 'Assistant: ' : 'User: '}${msg.content}\n\n`;
        } else if (Array.isArray(msg.content)) {
          // For messages with images, we still need to include any text
          const textParts = msg.content.filter(c => c.type === 'text').map(c => c.text);
          if (textParts.length > 0) {
            prompt += `${msg.role === 'assistant' ? 'Assistant: ' : 'User: '}${textParts.join(' ')}\n\n`;
          } else {
            prompt += `${msg.role === 'assistant' ? 'Assistant: ' : 'User: '}[Image provided]\n\n`;
          }
        }
      }
      
      prompt += "Assistant: ";
      console.log("Constructed prompt:", prompt);
      
      // Try the generate endpoint
      try {
        response = await axios.post(`${apiUrl}/api/generate`, {
          model: model,
          prompt: prompt,
          stream: false,
        }, {
          timeout: 120000
        });
        
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
        // Extract base64 data from data URL
        const base64Data = imageUrl.split(',')[1];
        contentParts.push({
          inlineData: {
            data: base64Data,
            mimeType: "image/png"
          }
        });
      }
    }
    
    // Create the content message format required by Gemini
    const geminiContent = { 
      parts: contentParts,
      role: "user"
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
        generationConfig: genConfig
      });
      
      // Set up stream handling
      let fullResponse = "";
      
      // Return an object that emits events for streaming
      const emitter = new (require('events').EventEmitter)();
      
      // Process the stream
      (async () => {
        try {
          for await (const chunk of streamingResponse.stream) {
            const chunkText = chunk.text();
            fullResponse += chunkText;
            
            // Emit the chunk
            emitter.emit('chunk', chunkText);
          }
          
          // Emit completion event
          emitter.emit('complete', fullResponse);
        } catch (error) {
          console.error("Error in Gemini stream processing:", error);
          emitter.emit('error', error);
        }
      })();
      
      return {
        streaming: true,
        emitter: emitter,
        text: () => fullResponse
      };
    } else {
      // Standard non-streaming response
      const response = await geminiModel.generateContent({
        contents: [geminiContent],
        generationConfig: genConfig
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
  if (mainWindow?.webContents) {
    mainWindow.webContents.send("update-instruction", instruction);
  }
}

function hideInstruction() {
  if (mainWindow?.webContents) {
    mainWindow.webContents.send("hide-instruction");
  }
}

/**
 * Enhanced screenshot functionality that can capture specific windows
 */
async function captureApplicationWindow() {
  try {
    console.log("Listing available windows for capture...");
    
    // Add a timeout to prevent hanging if desktopCapturer gets stuck
    const sourcesPromise = new Promise(async (resolve, reject) => {
      try {
        // Set a timeout to prevent the app from getting stuck
        const timeoutId = setTimeout(() => {
          console.log("desktopCapturer timed out, falling back to regular screenshot");
          resolve([]);
        }, 3000); // 3 second timeout
        
        // Get all available sources including windows and screens
        const sources = await desktopCapturer.getSources({ 
          types: ['window', 'screen'],
          thumbnailSize: { width: 150, height: 150 } // Small thumbnails to show in a picker
        });
        
        // Clear the timeout since we got a result
        clearTimeout(timeoutId);
        resolve(sources);
      } catch (error) {
        console.error("Error getting sources:", error);
        reject(error);
      }
    });
    
    // Wait for sources with a fallback
    let sources;
    try {
      sources = await sourcesPromise;
    } catch (error) {
      console.error("Failed to get sources:", error);
      console.log("Falling back to regular screenshot due to source listing error");
      return await captureScreenshot();
    }
    
    // If there are no sources or only one source (just the screen), fall back to regular screenshot
    if (!sources || sources.length <= 1) {
      console.log("Only found screen source or no sources, falling back to regular screenshot");
      return await captureScreenshot();
    }
    
    // Create a window to display the available sources for selection
    const sourcePickerWindow = new BrowserWindow({
      width: 600,
      height: 400,
      frame: true,
      resizable: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });
    
    // Load a custom HTML file for source selection
    try {
      await sourcePickerWindow.loadFile('source-picker.html');
    } catch (loadError) {
      console.error("Error loading source picker:", loadError);
      sourcePickerWindow.close();
      return await captureScreenshot();
    }
    
    // Pass the sources to the renderer
    sourcePickerWindow.webContents.send('SET_SOURCES', sources);
    
    // Wait for user to select a source
    return new Promise((resolve, reject) => {
      ipcMain.once('SOURCE_SELECTED', async (event, sourceId) => {
        try {
          if (!sourceId) {
            sourcePickerWindow.close();
            console.log("No source selected, falling back to regular screenshot");
            const fallbackImage = await captureScreenshot();
            resolve(fallbackImage);
            return;
          }
          
          console.log(`Selected source: ${sourceId}`);
          sourcePickerWindow.close();
          
          // Now capture the selected source
          const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
          const imagePath = path.join(app.getPath("pictures"), `app-screenshot-${timestamp}.png`);
          
          // Create a temporary window to capture the source
          const captureWindow = new BrowserWindow({
            width: 400,
            height: 300,
            show: false,
            webPreferences: {
              nodeIntegration: true,
              contextIsolation: false
            }
          });
          
          await captureWindow.loadFile('capture-helper.html');
          
          // Add a timeout to the capture process as well
          const captureTimeoutPromise = new Promise((_, timeoutReject) => {
            setTimeout(() => {
              timeoutReject(new Error("Window capture timed out"));
            }, 5000); // 5 second timeout
          });
          
          // Create a promise to wait for the capture result
          const capturePromise = new Promise((resolveCapture, rejectCapture) => {
            ipcMain.once('window-captured', (event, result) => {
              if (result.success) {
                resolveCapture(result.base64Image);
              } else {
                rejectCapture(new Error(result.error || "Failed to capture window"));
              }
              captureWindow.close();
            });
          });
          
          // Tell the capture-helper to take the window screenshot
          captureWindow.webContents.send('capture-window', {
            sourceId: sourceId,
            imagePath: imagePath
          });
          
          try {
            // Wait for the capture to complete or timeout
            const base64Image = await Promise.race([
              capturePromise,
              captureTimeoutPromise
            ]);
            
            // Get image dimensions
            const dimensions = { width: 0, height: 0 };
            try {
              const sizeOf = require('image-size');
              const imageDimensions = sizeOf(imagePath);
              dimensions.width = imageDimensions.width;
              dimensions.height = imageDimensions.height;
            } catch (dimError) {
              console.error("Error getting image dimensions:", dimError);
            }
            
            // Notify about saved screenshot
            mainWindow.webContents.send("screenshot-saved", {
              path: imagePath,
              isArea: false,
              dimensions: dimensions
            });
            
            console.log(`Application window screenshot saved to ${imagePath}`);
            resolve(base64Image);
          } catch (captureError) {
            console.error("Error capturing application window:", captureError);
            captureWindow.close();
            // Fall back to regular screenshot
            const fallbackImage = await captureScreenshot();
            resolve(fallbackImage);
          }
        } catch (error) {
          console.error("Error processing selected source:", error);
          sourcePickerWindow.close();
          // Fall back to regular screenshot
          const fallbackImage = await captureScreenshot();
          resolve(fallbackImage);
        }
      });
      
      ipcMain.once('SOURCE_SELECTION_CANCELLED', async () => {
        console.log("Source selection cancelled, falling back to regular screenshot");
        sourcePickerWindow.close();
        const fallbackImage = await captureScreenshot();
        resolve(fallbackImage);
      });
      
      sourcePickerWindow.on('closed', async () => {
        // If closed without selecting a source
        console.log("Source picker window closed, falling back to regular screenshot");
        try {
          const fallbackImage = await captureScreenshot();
          resolve(fallbackImage);
        } catch (error) {
          reject(error);
        }
      });
    });
  } catch (error) {
    console.error("Error in captureApplicationWindow:", error);
    // Fall back to regular screenshot
    return await captureScreenshot();
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
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    let success = false;
    
    // Use platform-specific approach for best results
    if (process.platform === 'darwin') {
      // On macOS, use the native screencapture command which works reliably
      try {
        console.log("Using native macOS screencapture command");
        await new Promise((resolve, reject) => {
          const { exec } = require('child_process');
          // -x suppresses the sound, -D captures a specific display (default is main display)
          // -c copies to clipboard as well
          exec(`screencapture -x "${imagePath}"`, (error) => {
            if (error) {
              reject(error);
            } else {
              success = true;
              resolve();
            }
          });
        });
      } catch (macOSError) {
        console.error("macOS screencapture failed:", macOSError);
        // Fall back to screenshot-desktop
        await screenshot({ filename: imagePath });
      }
    } else if (process.platform === 'win32') {
      try {
        console.log("Using native Windows screenshot method");
        // Try to use PowerShell to capture the screen on Windows
        await new Promise((resolve, reject) => {
          const { exec } = require('child_process');
          const psScript = `
            Add-Type -AssemblyName System.Windows.Forms
            Add-Type -AssemblyName System.Drawing
            $screen = [System.Windows.Forms.Screen]::PrimaryScreen
            $bitmap = New-Object System.Drawing.Bitmap $screen.Bounds.Width, $screen.Bounds.Height
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            $graphics.CopyFromScreen($screen.Bounds.X, $screen.Bounds.Y, 0, 0, $bitmap.Size)
            $bitmap.Save("${imagePath.replace(/\\/g, '\\\\')}")
            $graphics.Dispose()
            $bitmap.Dispose()
          `;
          exec(`powershell -command "${psScript}"`, (error) => {
            if (error) {
              reject(error);
            } else {
              success = true;
              resolve();
            }
          });
        });
      } catch (windowsError) {
        console.error("Windows PowerShell screenshot failed:", windowsError);
        // Fall back to screenshot-desktop
        await screenshot({ filename: imagePath });
      }
    } else {
      // For Linux and other platforms
      await screenshot({ filename: imagePath });
      success = true;
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
    
    // Read the image and convert to base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = `data:image/png;base64,${imageBuffer.toString("base64")}`;
    
    // Get image dimensions
    const dimensions = { width: 0, height: 0 };
    try {
      const sizeOf = require('image-size');
      const imageDimensions = sizeOf(imagePath);
      dimensions.width = imageDimensions.width;
      dimensions.height = imageDimensions.height;
    } catch (dimError) {
      console.error("Error getting image dimensions:", dimError);
      // Continue without dimensions if there's an error
    }
    
    // Notify about saved screenshot
    mainWindow.webContents.send("screenshot-saved", {
      path: imagePath,
      isArea: false,
      dimensions: dimensions
    });
    
    console.log(`Screenshot saved to ${imagePath} (${dimensions.width}x${dimensions.height})`);
    return base64Image;
  } catch (error) {
    console.error("Screenshot capture failed:", error);
    throw error;
  }
}

/**
 * Capture a specific window by prompting the user to click on it
 */
async function captureWindowScreenshot() {
  try {
    console.log("Preparing to capture specific window...");
    
    // Hide our app window first
    const wasVisible = mainWindow.isVisible();
    if (wasVisible) {
      mainWindow.hide();
    }
    
    // Show instruction in notification
    const notification = new Notification({
      title: 'Screenshot',
      body: 'Please click on the window you want to capture.'
    });
    notification.show();
    
    const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
    const imagePath = path.join(app.getPath("pictures"), `window-screenshot-${timestamp}.png`);
    
    let success = false;
    
    // Use platform-specific approach for window capture
    if (process.platform === 'darwin') {
      try {
        console.log("Using native macOS window capture");
        // -w flag captures the window the user clicks on
        await new Promise((resolve, reject) => {
          const { exec } = require('child_process');
          exec(`screencapture -w "${imagePath}"`, (error) => {
            if (error) {
              reject(error);
            } else {
              success = true;
              resolve();
            }
          });
        });
      } catch (macOSError) {
        console.error("macOS window capture failed:", macOSError);
        if (wasVisible) mainWindow.show();
        throw macOSError;
      }
    } else {
      // For other platforms, just use regular screenshot as there's no easy native way
      // to capture a specific window without additional dependencies
      if (wasVisible) mainWindow.show();
      return await captureScreenshot();
    }
    
    // Show the main window again
    if (wasVisible) {
      mainWindow.show();
    }
    
    // Verify the screenshot was taken (user might have canceled)
    if (!fs.existsSync(imagePath)) {
      console.log("Window capture was canceled or failed");
      throw new Error("Window capture was canceled");
    }
    
    const stats = fs.statSync(imagePath);
    if (stats.size < 1000) {
      throw new Error("Window screenshot file is too small, likely empty");
    }
    
    // Read the image and convert to base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = `data:image/png;base64,${imageBuffer.toString("base64")}`;
    
    // Get image dimensions
    const dimensions = { width: 0, height: 0 };
    try {
      const sizeOf = require('image-size');
      const imageDimensions = sizeOf(imagePath);
      dimensions.width = imageDimensions.width;
      dimensions.height = imageDimensions.height;
    } catch (dimError) {
      console.error("Error getting image dimensions:", dimError);
    }
    
    // Notify about saved screenshot
    mainWindow.webContents.send("screenshot-saved", {
      path: imagePath,
      isArea: false,
      dimensions: dimensions
    });
    
    console.log(`Window screenshot saved to ${imagePath}`);
    return base64Image;
  } catch (error) {
    console.error("Window screenshot capture failed:", error);
    throw error;
  }
}

/**
 * Captures a screenshot of a selected area
 */
async function captureAreaScreenshot() {
  // Hide the main window
  mainWindow.hide();
  console.log("Waiting for window to hide...");
  
  await new Promise(resolve => setTimeout(resolve, 300)); // Wait for window to hide

  try {
    console.log("Preparing to capture area...");
    
    const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
    const imagePath = path.join(app.getPath("pictures"), `area-screenshot-${timestamp}.png`);
    
    // Use platform-specific approach for area capture
    if (process.platform === 'darwin') {
      try {
        console.log("Using native macOS area selection");
        // -s flag allows user to select an area
        await new Promise((resolve, reject) => {
          const { exec } = require('child_process');
          exec(`screencapture -s "${imagePath}"`, (error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
      } catch (macOSError) {
        console.error("macOS area capture failed:", macOSError);
        mainWindow.show();
        throw macOSError;
      }
    } else {
      // For Windows and Linux, use the existing area selection implementation
      // Simplified for brevity - would need to be implemented based on platform

      // Create a window for the screenshot area selection
      let captureWindow = new BrowserWindow({
        width: 800,
        height: 600,
        frame: false,
        fullscreen: true,
        transparent: true,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
        },
      });

      // Load the capture-helper.html from the file system
      await captureWindow.loadFile("capture-helper.html");

      return new Promise((resolve, reject) => {
        ipcMain.once("area-selected", async (event, { x, y, width, height, imageData }) => {
          console.log("Area selected:", x, y, width, height);
          
          try {
            if (width < 10 || height < 10) {
              captureWindow.close();
              mainWindow.show();
              reject(new Error("Selected area is too small"));
              return;
            }

            // If we received image data directly from the renderer
            if (imageData) {
              console.log("Using image data from renderer");
              captureWindow.close();
              mainWindow.show();
              
              try {
                const buffer = Buffer.from(imageData.replace(/^data:image\/\w+;base64,/, ""), "base64");
                fs.writeFileSync(imagePath, buffer);
                
                // Get dimensions for notification
                const dimensions = { width, height };
                
                // Notify about saved screenshot
                mainWindow.webContents.send("screenshot-saved", {
                  path: imagePath,
                  isArea: true,
                  dimensions
                });
                
                console.log(`Area screenshot saved to ${imagePath}`);
                resolve(imageData);
              } catch (error) {
                console.error("Error saving area screenshot:", error);
                reject(error);
              }
            } else {
              // No image data, fallback to full screen
              captureWindow.close();
              mainWindow.show();
              const fullScreenshot = await captureScreenshot();
              resolve(fullScreenshot);
            }
          } catch (error) {
            console.error("Error processing area selection:", error);
            captureWindow.close();
            mainWindow.show();
            reject(error);
          }
        });

        ipcMain.once("area-selection-cancelled", () => {
          console.log("Area selection cancelled by user");
          captureWindow.close();
          mainWindow.show();
          reject(new Error("Area selection cancelled"));
        });
      });
    }
    
    // Check if the file exists (user might have canceled)
    if (!fs.existsSync(imagePath)) {
      console.log("Area capture was canceled");
      mainWindow.show();
      throw new Error("Area capture was canceled");
    }
    
    const stats = fs.statSync(imagePath);
    if (stats.size < 1000) {
      mainWindow.show();
      throw new Error("Area screenshot file is too small, likely empty");
    }
    
    // Read the image and convert to base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = `data:image/png;base64,${imageBuffer.toString("base64")}`;
    
    // Get image dimensions
    const dimensions = { width: 0, height: 0 };
    try {
      const sizeOf = require('image-size');
      const imageDimensions = sizeOf(imagePath);
      dimensions.width = imageDimensions.width;
      dimensions.height = imageDimensions.height;
    } catch (dimError) {
      console.error("Error getting image dimensions:", dimError);
    }
    
    // Show main window again
    mainWindow.show();
    
    // Notify about saved screenshot
    mainWindow.webContents.send("screenshot-saved", {
      path: imagePath,
      isArea: true,
      dimensions: dimensions
    });
    
    console.log(`Area screenshot saved to ${imagePath}`);
    return base64Image;
  } catch (error) {
    console.error("Area screenshot failed:", error);
    mainWindow.show();
    throw error;
  }
}

async function processScreenshots(useStreaming = false) {
  try {
    console.log("Starting processScreenshots with provider:", aiProvider, "and model:", currentModel);
    
    // Show loading state
    mainWindow.webContents.send("loading", true);

    // Check if we're using Ollama and verify the model first
    if (aiProvider === "ollama") {
      const modelVerification = await verifyOllamaModel(currentModel);
      
      if (!modelVerification.exists) {
        // If we have suggested models, include them in the error message
        let errorMessage = `The selected model "${currentModel}" is not available: ${modelVerification.error}`;
        
        if (modelVerification.suggestedModels && modelVerification.suggestedModels.length > 0) {
          errorMessage += `\n\nAvailable vision models:\n${modelVerification.suggestedModels.join('\n')}`;
          
          // Show a special message with suggestions
          mainWindow.webContents.send("model-not-found", {
            model: currentModel,
            error: modelVerification.error,
            suggestedModels: modelVerification.suggestedModels
          });
        }
        
        throw new Error(errorMessage);
      }
      
      if (!modelVerification.isMultimodal) {
        mainWindow.webContents.send("warning", `Warning: The model "${currentModel}" may not support image inputs. Results may be unpredictable.`);
      }
    }

    // Create a better prompt based on the number of screenshots
    let promptText = "";
    if (screenshots.length === 1) {
      promptText = `The screenshot shows a programming problem or question. 
Please analyze it carefully and provide a detailed solution with explanation. 
If there's code involved, provide the complete implementation with clear comments. 
If it's a theoretical question, provide a comprehensive answer.
Please highlight any key concepts or algorithms used in the solution.`;
    } else {
      promptText = `These ${screenshots.length} screenshots show a multi-part programming problem or question. 
Please analyze all parts carefully and provide a complete solution that addresses all aspects.
If there's code involved, provide the full implementation with clear comments.
Break down your response into sections if needed to address each part of the problem.
Please highlight any key concepts or algorithms used in the solution.`;
    }

    // Build message with text + each screenshot
    const messages = [{ type: "text", text: promptText }];
    console.log(`Processing ${screenshots.length} screenshots`);
    
    for (const img of screenshots) {
      messages.push({
        type: "image_url",
        image_url: { url: `data:image/png;base64,${img}` },
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
          max_tokens: 5000,
          stream: true,
        });
        
        // Start streaming to the renderer
        mainWindow.webContents.send("loading", false);
        mainWindow.webContents.send("stream-start");
        
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            mainWindow.webContents.send("stream-chunk", content);
          }
        }
        
        mainWindow.webContents.send("stream-end");
        return; // Early return as streaming is handled
      } else {
        // Non-streaming request
        const response = await openai.chat.completions.create({
          model: currentModel,
          messages: [{ role: "user", content: messages }],
          max_tokens: 5000,
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
        
        streamingResult.emitter.on('chunk', (chunk) => {
          mainWindow.webContents.send("stream-chunk", chunk);
        });
        
        streamingResult.emitter.on('complete', () => {
          mainWindow.webContents.send("stream-end");
        });
        
        streamingResult.emitter.on('error', (error) => {
          mainWindow.webContents.send("error", error.message);
          mainWindow.webContents.send("stream-end");
        });
        
        return; // Early return as streaming is handled
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
  } catch (err) {
    console.error("Error in processScreenshots:", err);
    
    // Log stack trace
    if (err.stack) {
      console.error("Stack trace:", err.stack);
    }
    
    // Log additional error details if available
    if (err.response) {
      console.error("Response status:", err.response.status);
      if (err.response.data) {
        console.error("Response data:", JSON.stringify(err.response.data));
      }
    }
    
    mainWindow.webContents.send("loading", false);
    if (mainWindow.webContents) {
      mainWindow.webContents.send("error", err.message);
    }
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
    modal: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  modelListWindow.loadFile("model-selector.html");

  modelListWindow.on("closed", () => {
    modelListWindow = null;
  });
}

// Reset everything
function resetProcess() {
  screenshots = [];
  multiPageMode = false;
  mainWindow.webContents.send("clear-result");
  updateInstruction(
    `${modifierKey}+Shift+S: Full Screen | ${modifierKey}+Shift+D: Area | ${modifierKey}+Shift+A: Multi-mode | ${modifierKey}+Shift+M: Models`,
  );
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    paintWhenInitiallyHidden: true,
    contentProtection: true,
    type: "toolbar",
  });

  mainWindow.loadFile("index.html");
  mainWindow.setContentProtection(true);
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setAlwaysOnTop(true, "screen-saver", 1);

  // Single or final screenshot shortcut
  globalShortcut.register(`${modifierKey}+Shift+S`, async () => {
    try {
      updateInstruction("Taking screenshot...");
      
      try {
        // On Mac, use window-specific capture, otherwise full screen
        let img;
        if (process.platform === 'darwin') {
          try {
            // Capture specific window on Mac
            img = await captureWindowScreenshot();
          } catch (windowError) {
            console.error("Window capture failed, falling back to screen capture:", windowError);
            // Fall back to full screen
            img = await captureScreenshot();
          }
        } else {
          // Use regular screen capture on other platforms
          img = await captureScreenshot();
        }
        
        // Verify the screenshot captured something
        if (!img || img.length < 1000) {
          console.warn("Screenshot appears to be empty or invalid");
          mainWindow.webContents.send("warning", "Screenshot appears to be empty or invalid. Please try again.");
          updateInstruction(`${modifierKey}+Shift+S: Full Screen | ${modifierKey}+Shift+D: Area | ${modifierKey}+Shift+A: Multi-mode | ${modifierKey}+Shift+M: Models`);
          return;
        }
        
        // Process the image
        screenshots.push(img);
        updateInstruction("Processing screenshot with AI...");
        await processScreenshots(true); // Use streaming by default
      } catch (screenshotError) {
        console.error(`Screenshot capture error:`, screenshotError);
        mainWindow.webContents.send("error", `Failed to capture screenshot: ${screenshotError.message}`);
        updateInstruction(`${modifierKey}+Shift+S: Full Screen | ${modifierKey}+Shift+D: Area | ${modifierKey}+Shift+A: Multi-mode | ${modifierKey}+Shift+M: Models`);
      }
    } catch (error) {
      console.error(`${modifierKey}+Shift+S error:`, error);
      mainWindow.webContents.send("error", `Error processing command: ${error.message}`);
      updateInstruction(
        `${modifierKey}+Shift+S: Full Screen | ${modifierKey}+Shift+D: Area | ${modifierKey}+Shift+A: Multi-mode | ${modifierKey}+Shift+M: Models`,
      );
    }
  });
  
  // Area screenshot shortcut
  globalShortcut.register(`${modifierKey}+Shift+D`, async () => {
    try {
      updateInstruction("Select an area to screenshot...");
      
      try {
        // Use the area screenshot function
        const img = await captureAreaScreenshot();
        
        // Verify the screenshot captured something
        if (!img || img.length < 1000) {
          mainWindow.webContents.send("warning", "Area screenshot appears to be empty or invalid. Please try again.");
          updateInstruction(`${modifierKey}+Shift+S: Full Screen | ${modifierKey}+Shift+D: Area | ${modifierKey}+Shift+A: Multi-mode | ${modifierKey}+Shift+M: Models`);
          return;
        }
        
        screenshots.push(img);
        updateInstruction("Processing area screenshot with AI...");
        await processScreenshots(true); // Use streaming by default
      } catch (screenshotError) {
        if (screenshotError.message === "Area selection cancelled" || 
            screenshotError.message === "Area capture was canceled") {
          // User cancelled the selection, no need to show an error
          console.log("Area selection was cancelled by user");
        } else {
          console.error(`Area screenshot error:`, screenshotError);
          mainWindow.webContents.send("error", `Failed to capture area screenshot: ${screenshotError.message}`);
        }
        updateInstruction(`${modifierKey}+Shift+S: Full Screen | ${modifierKey}+Shift+D: Area | ${modifierKey}+Shift+A: Multi-mode | ${modifierKey}+Shift+M: Models`);
      }
    } catch (error) {
      console.error(`${modifierKey}+Shift+D error:`, error);
      mainWindow.webContents.send("error", `Error processing command: ${error.message}`);
      updateInstruction(
        `${modifierKey}+Shift+S: Full Screen | ${modifierKey}+Shift+D: Area | ${modifierKey}+Shift+A: Multi-mode | ${modifierKey}+Shift+M: Models`,
      );
    }
  });

  // Multi-page mode shortcut
  globalShortcut.register(`${modifierKey}+Shift+A`, async () => {
    try {
      if (!multiPageMode) {
        multiPageMode = true;
        updateInstruction(`Multi-mode: ${modifierKey}+Shift+A to add, ${modifierKey}+Shift+S to finalize`);
      }
      updateInstruction("Taking screenshot for multi-mode...");
      
      try {
        // On Mac, use window-specific capture, otherwise full screen
        let img;
        if (process.platform === 'darwin') {
          try {
            // Capture specific window on Mac
            img = await captureWindowScreenshot();
          } catch (windowError) {
            console.error("Window capture failed in multi-mode, falling back to screen capture:", windowError);
            // Fall back to full screen
            img = await captureScreenshot();
          }
        } else {
          // Use regular screen capture on other platforms
          img = await captureScreenshot();
        }
        
        // Verify the screenshot captured something
        if (!img || img.length < 1000) {
          console.warn("Multi-mode screenshot appears to be empty or invalid");
          mainWindow.webContents.send("warning", "Screenshot appears to be empty or invalid. Please try again.");
          return;
        }
        
        // Add the screenshot to the collection
        screenshots.push(img);
        updateInstruction(`Multi-mode: ${screenshots.length} screenshots captured. ${modifierKey}+Shift+A to add more, ${modifierKey}+Shift+S to finalize`);
      } catch (screenshotError) {
        console.error(`Screenshot error in multi-mode:`, screenshotError);
        mainWindow.webContents.send("error", `Failed to capture screenshot: ${screenshotError.message}`);
        updateInstruction(`Multi-mode: ${modifierKey}+Shift+A to add, ${modifierKey}+Shift+S to finalize`);
      }
    } catch (error) {
      console.error(`${modifierKey}+Shift+A error:`, error);
      mainWindow.webContents.send("error", `Error processing command: ${error.message}`);
    }
  });

  // Reset shortcut
  globalShortcut.register(`${modifierKey}+Shift+R`, () => {
    resetProcess();
  });

  // Quit shortcut
  globalShortcut.register(`${modifierKey}+Shift+Q`, () => {
    console.log("Quitting application...");
    app.quit();
  });

  // Model selection shortcut
  globalShortcut.register(`${modifierKey}+Shift+M`, () => {
    createModelSelectionWindow();
  });

  // IPC handlers for model selection
  ipcMain.handle("get-ollama-models", async () => {
    return await getOllamaModels();
  });

  ipcMain.handle("get-current-settings", () => {
    return {
      aiProvider,
      currentModel,
      ollamaUrl: OLLAMA_BASE_URL,
    };
  });

  ipcMain.on("update-model-settings", (event, settings) => {
    aiProvider = settings.aiProvider;
    currentModel = settings.currentModel;
    
    // Update Ollama URL if provided
    if (settings.ollamaUrl) {
      process.env.OLLAMA_BASE_URL = settings.ollamaUrl;
      // Update the global variable, ensuring we use IPv4
      const updatedUrl = settings.ollamaUrl.replace('localhost', '127.0.0.1');
      console.log(`Updating Ollama URL to: ${updatedUrl}`);
      OLLAMA_BASE_URL = updatedUrl;
    }
    
    console.log(`Updated settings: Provider=${aiProvider}, Model=${currentModel}, URL=${OLLAMA_BASE_URL}`);
    
    // Notify renderer about model change
    if (mainWindow?.webContents) {
      mainWindow.webContents.send('model-changed');
    }
    
    // Update instruction to show currently selected model
    resetProcess();
  });

  // Send initial status to renderer
  setTimeout(() => {
    updateInstruction(
      `${modifierKey}+Shift+S: Full Screen | ${modifierKey}+Shift+D: Area | ${modifierKey}+Shift+A: Multi-mode | ${modifierKey}+Shift+M: Models`,
    );
  }, 1000);

  // Add compatibility handling for both area-selector.html and capture-helper.html
  ipcMain.on('area-cancelled', () => {
    console.log('Received deprecated area-cancelled event - for backward compatibility');
    mainWindow.show();
  });

  ipcMain.on('area-selected', async (event, rect) => {
    console.log('Received deprecated area-selected event - for backward compatibility');
    try {
      // Handle the old format from area-selector.html
      const timestamp = Date.now();
      const fileName = `area_screenshot_${timestamp}.png`;
      const picturesDir = app.getPath("pictures");
      const imagePath = path.join(picturesDir, fileName);
      
      try {
        // Take a full screenshot with screenshot-desktop
        await screenshot({ filename: imagePath });
        
        // Read the image file to base64
        const imageBuffer = fs.readFileSync(imagePath);
        const base64Image = `data:image/png;base64,${imageBuffer.toString("base64")}`;
        
        // Notify user about saved screenshot
        mainWindow.webContents.send("screenshot-saved", {
          path: imagePath,
          fileName: fileName,
          isArea: true,
          dimensions: { width: Math.round(rect.width), height: Math.round(rect.height) }
        });
        
        mainWindow.webContents.send("warning", "Using full screenshot instead of area selection");
        
        console.log(`Fallback screenshot saved to: ${imagePath}`);
        
        // Process with AI
        updateInstruction("Processing area screenshot with AI...");
        screenshots.push(base64Image);
        await processScreenshots(true);
      } catch (err) {
        console.error("Error handling backward compatibility screenshot:", err);
        mainWindow.webContents.send("error", `Failed to capture area: ${err.message}`);
        updateInstruction(`${modifierKey}+Shift+S: Full Screen | ${modifierKey}+Shift+D: Area | ${modifierKey}+Shift+A: Multi-mode | ${modifierKey}+Shift+M: Models`);
      }
    } catch (err) {
      console.error("Error in backward compatibility area-selected handler:", err);
      mainWindow.webContents.send("error", `Failed to process area selection: ${err.message}`);
      updateInstruction(`${modifierKey}+Shift+S: Full Screen | ${modifierKey}+Shift+D: Area | ${modifierKey}+Shift+A: Multi-mode | ${modifierKey}+Shift+M: Models`);
    }
  });
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
