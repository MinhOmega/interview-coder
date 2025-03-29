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

    // Get the gemini model
    const geminiModel = geminiAI.getGenerativeModel({ model: model });

    // Process the messages to format them for Gemini
    const geminiMessages = [];
    
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
    
    // If streaming is requested, use the streaming API
    if (streaming) {
      console.log("Using streaming API with Gemini");
      
      const streamingResponse = await geminiModel.generateContentStream({ contents: [{ parts: contentParts }] });
      
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
      const response = await geminiModel.generateContent({ contents: [{ parts: contentParts }] });
      return response.response.text();
    }
  } catch (error) {
    console.error("Error generating with Gemini:", error.message);
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

async function captureAreaScreenshot() {
  try {
    hideInstruction();
    
    // Create a new window for area selection
    const selectWindow = new BrowserWindow({
      width: 800,
      height: 600,
      frame: false,
      transparent: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
      fullscreen: true,
    });
    
    // Load a selection interface
    selectWindow.loadFile('area-selector.html');
    
    // Handle area selection from renderer
    return new Promise((resolve, reject) => {
      ipcMain.once('area-selected', async (event, rect) => {
        try {
          selectWindow.hide();
          
          // Wait a moment for the window to be hidden
          await new Promise(res => setTimeout(res, 200));
          
          // Capture the screen and crop it to the selected area
          const sources = await desktopCapturer.getSources({ types: ['screen'] });
          const source = sources[0]; // Typically the primary display
          
          if (!source) {
            reject(new Error("No screen source found"));
            return;
          }
          
          const timestamp = Date.now();
          const imagePath = path.join(app.getPath("pictures"), `area_screenshot_${timestamp}.png`);
          
          // Create temporary window to capture the screen
          const captureWindow = new BrowserWindow({
            width: 1,
            height: 1,
            show: false,
            webPreferences: {
              nodeIntegration: true,
              contextIsolation: false,
            }
          });
          
          captureWindow.loadFile('capture-helper.html');
          
          captureWindow.webContents.once('did-finish-load', () => {
            captureWindow.webContents.send('capture-screen', {
              sourceId: source.id,
              rect: rect,
              imagePath: imagePath
            });
          });
          
          ipcMain.once('area-captured', (event, result) => {
            if (result.success) {
              const imageBuffer = fs.readFileSync(imagePath);
              const base64Image = imageBuffer.toString("base64");
              resolve(base64Image);
            } else {
              reject(new Error(result.error || "Failed to capture area"));
            }
            captureWindow.close();
            selectWindow.close();
          });
        } catch (err) {
          reject(err);
          if (selectWindow) selectWindow.close();
        }
      });
      
      ipcMain.once('area-cancelled', () => {
        selectWindow.close();
        reject(new Error("Area selection cancelled"));
      });
    });
  } catch (err) {
    mainWindow.show();
    if (mainWindow.webContents) {
      mainWindow.webContents.send("error", err.message);
    }
    throw err;
  }
}

async function captureScreenshot() {
  try {
    hideInstruction();
    mainWindow.hide();
    await new Promise((res) => setTimeout(res, 200));

    const timestamp = Date.now();
    const imagePath = path.join(app.getPath("pictures"), `screenshot_${timestamp}.png`);
    await screenshot({ filename: imagePath });

    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString("base64");

    mainWindow.show();
    return base64Image;
  } catch (err) {
    mainWindow.show();
    if (mainWindow.webContents) {
      mainWindow.webContents.send("error", err.message);
    }
    throw err;
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

    // Build message with text + each screenshot
    const messages = [{ type: "text", text: "Can you solve the question for me and give the final answer/code?" }];
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
      const img = await captureScreenshot();
      screenshots.push(img);
      await processScreenshots(true); // Use streaming by default
    } catch (error) {
      console.error(`${modifierKey}+Shift+S error:`, error);
    }
  });
  
  // Area screenshot shortcut
  globalShortcut.register(`${modifierKey}+Shift+D`, async () => {
    try {
      updateInstruction("Select an area to screenshot");
      const img = await captureAreaScreenshot();
      screenshots.push(img);
      await processScreenshots(true); // Use streaming by default
    } catch (error) {
      console.error(`${modifierKey}+Shift+D error:`, error);
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
      const img = await captureScreenshot();
      screenshots.push(img);
      updateInstruction(`Multi-mode: ${modifierKey}+Shift+A to add, ${modifierKey}+Shift+S to finalize`);
    } catch (error) {
      console.error(`${modifierKey}+Shift+A error:`, error);
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
