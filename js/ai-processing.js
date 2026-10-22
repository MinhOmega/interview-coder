const { AI_PROVIDERS, IPC_CHANNELS } = require("./constants");
const { getScreenshots } = require("./screenshot-manager");
const configManager = require("./config-manager");
const aiProviders = require("./ai-providers");
const windowManager = require("./window-manager");
const { getUserDataPath } = require("./utils");
const fs = require("fs");
const toastManager = require("./toast-manager");
const log = require("electron-log");
const { createDirectAnswerPrompt } = require("./direct-answer-prompt");
const {
  createAnalysisPrompt: createPrompt,
  createUIResponsePrompt,
} = require("./analysis-prompts");
const {
  getEffectiveMaxOutputTokens,
  getResponseProfileInstruction,
} = require("./response-profiles");
const {
  getOpenAIOutputOptions,
  getGeminiOutputOptions,
} = require("./provider-output-options");
const { logGeminiResponseDiagnostics } = require("./gemini-response-diagnostics");

// Store active request controllers for cancellation
let activeRequestControllers = new Set();

function getConfiguredResponseOptions() {
  const responseProfile = configManager.getResponseProfile();
  const customMaxOutputTokens = configManager.getCustomMaxOutputTokens();
  return {
    responseProfile,
    customMaxOutputTokens,
    maxOutputTokens: getEffectiveMaxOutputTokens(responseProfile, customMaxOutputTokens),
  };
}

/**
 * Processes the screenshots with the AI
 *
 * @param {BrowserWindow} mainWindow - The main application window
 * @param {string} aiProvider - The AI provider
 * @param {string} currentModel - The current model
 * @param {function} verifyOllamaModelFn - The function to verify the Ollama model
 * @param {function} generateWithOllamaFn - The function to generate with Ollama
 * @param {function} generateWithGeminiFn - The function to generate with Gemini
 * @param {boolean} useStreaming - Whether to use streaming
 */
async function processScreenshots(
  mainWindow,
  aiProvider,
  currentModel,
  verifyOllamaModelFn,
  generateWithOllamaFn,
  generateWithGeminiFn,
  useStreaming = false,
) {
  try {
    mainWindow.webContents.send("loading", true);
    const screenshots = getScreenshots();

    // Get the user's preferred response language
    const responseLanguage = configManager.getResponseLanguage();
    const responseOptions = getConfiguredResponseOptions();

    if (aiProvider === AI_PROVIDERS.OLLAMA) {
      const modelVerification = await verifyOllamaModelFn(currentModel);

      if (!modelVerification.exists) {
        let errorMessage = `The selected model "${currentModel}" is not available: ${modelVerification.error}`;
        throw new Error(errorMessage);
      }
    }

    const promptText = createPrompt(
      screenshots.length,
      responseLanguage,
      responseOptions.responseProfile,
      responseOptions.customMaxOutputTokens,
    );
    log.info("Prompt text in processScreenshots:", promptText);

    const messages = [{ type: "text", text: promptText }];

    for (const img of screenshots) {
      const imageData = img.startsWith("data:image/") ? img : `data:image/png;base64,${img}`;
      messages.push({
        type: "image_url",
        image_url: { url: imageData },
      });
    }

    let result;

    if (aiProvider === AI_PROVIDERS.DEFAULT) {
      // Create model selection window when the default provider is selected
      windowManager.createModelSelectionWindow();

      // Return early since we're opening the model selection window instead of processing
      mainWindow.webContents.send(IPC_CHANNELS.LOADING, false);
      mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);
      return;
    }

    if (aiProvider === AI_PROVIDERS.OPENAI) {
      // Get OpenAI client from AI providers module
      const openai = aiProviders.getOpenAI();

      if (!openai) {
        throw new Error("OpenAI client is not initialized. Please go to Settings and enter your API key.");
      }

      if (useStreaming) {
        const stream = await openai.chat.completions.create({
          model: currentModel,
          messages: [{ role: "user", content: messages }],
          ...getOpenAIOutputOptions(responseOptions.maxOutputTokens),
          stream: true,
        });

        mainWindow.webContents.send(IPC_CHANNELS.LOADING, false);
        mainWindow.webContents.send(IPC_CHANNELS.STREAM_START);

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            mainWindow.webContents.send(IPC_CHANNELS.STREAM_CHUNK, content);
          }
        }

        mainWindow.webContents.send(IPC_CHANNELS.STREAM_END);
        mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);
        return;
      } else {
        const response = await openai.chat.completions.create({
          model: currentModel,
          messages: [{ role: "user", content: messages }],
          ...getOpenAIOutputOptions(responseOptions.maxOutputTokens),
        });

        result = response.choices[0].message.content;
      }
    } else if (aiProvider === AI_PROVIDERS.OLLAMA) {
      result = await generateWithOllamaFn(messages, currentModel, responseOptions.maxOutputTokens);
    } else if (aiProvider === AI_PROVIDERS.GEMINI) {
      // Get Gemini client from AI providers module if not provided
      const geminiAI = aiProviders.getGeminiAI();

      if (!geminiAI) {
        throw new Error("Gemini AI client is not initialized. Please go to Settings and enter your API key.");
      }

      if (useStreaming) {
        const streamingResult = await generateWithGeminiFn(
          messages,
          currentModel,
          true,
          responseOptions.maxOutputTokens,
        );

        mainWindow.webContents.send(IPC_CHANNELS.LOADING, false);
        mainWindow.webContents.send(IPC_CHANNELS.STREAM_START);

        let accumulatedText = "";

        streamingResult.emitter.on("chunk", (chunk) => {
          accumulatedText += chunk;
          mainWindow.webContents.send(IPC_CHANNELS.STREAM_UPDATE, accumulatedText);
        });

        streamingResult.emitter.on("complete", () => {
          mainWindow.webContents.send(IPC_CHANNELS.STREAM_END);
          mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);
        });

        streamingResult.emitter.on("error", (error) => {
          toastManager.error(`${error.message}`);
          mainWindow.webContents.send(IPC_CHANNELS.STREAM_END);
          mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);
        });

        return;
      } else {
        result = await generateWithGeminiFn(
          messages,
          currentModel,
          false,
          responseOptions.maxOutputTokens,
        );
      }
    } else if (aiProvider === AI_PROVIDERS.AZURE_FOUNDRY) {
      // Try to reinitialize Azure Foundry if not already initialized
      let azureFoundryClient = aiProviders.getAzureFoundryClient();

      if (!azureFoundryClient) {
        // Try to initialize from config if not already initialized
        console.log("Azure Foundry client not found, attempting to initialize from config...");
        aiProviders.initializeFromConfig();
        azureFoundryClient = aiProviders.getAzureFoundryClient();

        if (!azureFoundryClient) {
          throw new Error("Azure Foundry client is not initialized. Please go to Settings and enter your API key and endpoint.");
        }
      }

      if (useStreaming) {
        const streamingResult = await aiProviders.generateWithAzureFoundry(
          messages,
          currentModel,
          true,
          null,
          responseOptions.maxOutputTokens,
        );

        mainWindow.webContents.send(IPC_CHANNELS.LOADING, false);
        mainWindow.webContents.send(IPC_CHANNELS.STREAM_START);

        let accumulatedText = "";

        streamingResult.emitter.on("chunk", (chunk) => {
          accumulatedText += chunk;
          mainWindow.webContents.send(IPC_CHANNELS.STREAM_UPDATE, accumulatedText);
        });

        streamingResult.emitter.on("complete", () => {
          mainWindow.webContents.send(IPC_CHANNELS.STREAM_END);
          mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);
        });

        streamingResult.emitter.on("error", (error) => {
          toastManager.error(`${error.message}`);
          mainWindow.webContents.send(IPC_CHANNELS.STREAM_END);
          mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);
        });

        return;
      } else {
        result = await aiProviders.generateWithAzureFoundry(
          messages,
          currentModel,
          false,
          null,
          responseOptions.maxOutputTokens,
        );
      }
    } else {
      throw new Error(`Unknown AI provider: ${aiProvider}`);
    }

    mainWindow.webContents.send(IPC_CHANNELS.LOADING, false);

    mainWindow.webContents.send(IPC_CHANNELS.ANALYSIS_RESULT, result);

    mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);
  } catch (err) {
    log.error("Error in processScreenshots:", err);
    log.error("Stack trace:", err.stack);

    if (err.response) {
      log.error("Response status:", err.response.status);
      log.error("Response data:", JSON.stringify(err.response.data));
    }

    mainWindow.webContents.send(IPC_CHANNELS.LOADING, false);
    mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);
    toastManager.error(`${err.message}`);
  }
}

/**
 * Processes a chat message with the AI
 *
 * @param {BrowserWindow} window - The window sending the message
 * @param {Array} messageHistory - The message history including user and AI messages
 * @param {string} systemPrompt - Optional system prompt to include
 */
async function processChatMessage(window, messageHistory, systemPrompt) {
  try {
    // Get current AI settings
    const settings = configManager.getCurrentSettings();
    const { aiProvider, currentModel } = settings;
    const responseOptions = getConfiguredResponseOptions();
    const profileInstruction = getResponseProfileInstruction(
      responseOptions.responseProfile,
      responseOptions.customMaxOutputTokens,
    );

    if (!aiProvider || aiProvider === AI_PROVIDERS.DEFAULT) {
      toastManager.error("Please configure an AI provider in settings first.");
      return;
    }

    let messages = [];

    // Add system prompt if provided
    const effectiveSystemPrompt = [systemPrompt, profileInstruction].filter(Boolean).join("\n\n");
    if (effectiveSystemPrompt) messages.push({ role: "system", content: effectiveSystemPrompt });

    // Add message history
    messageHistory.forEach((msg) => {
      messages.push({ role: msg.role, content: msg.content });
    });

    let response;

    if (aiProvider === AI_PROVIDERS.OPENAI) {
      // Get OpenAI client
      const openai = aiProviders.getOpenAI();

      if (!openai) {
        throw new Error("OpenAI client is not initialized. Please go to Settings and enter your API key.");
      }

      const result = await openai.chat.completions.create({
        model: currentModel,
        messages: messages,
        ...getOpenAIOutputOptions(responseOptions.maxOutputTokens),
      });

      response = { role: "assistant", content: result.choices[0].message.content };
    } else if (aiProvider === AI_PROVIDERS.GEMINI) {
      // Get Gemini client
      const geminiAI = aiProviders.getGeminiAI();

      if (!geminiAI) {
        throw new Error("Gemini AI client is not initialized. Please go to Settings and enter your API key.");
      }

      // Handle system prompts for Gemini by converting to user prompts if needed
      const geminiMessages = messages.map((msg) => {
        // For Gemini, convert system role to user role since Gemini doesn't support system
        if (msg.role === "system") {
          return { role: "user", parts: [{ text: msg.content }] };
        }
        return { role: msg.role === "assistant" ? "model" : "user", parts: [{ text: msg.content }] };
      });

      const result = await geminiAI.generateContent({
        contents: geminiMessages,
        generationConfig: {
          ...getGeminiOutputOptions(responseOptions.maxOutputTokens, currentModel),
        },
      });

      logGeminiResponseDiagnostics(result.response);
      response = { role: "assistant", content: result.response.text() };
    } else if (aiProvider === AI_PROVIDERS.OLLAMA) {
      // Use Ollama client
      const result = await aiProviders.generateWithOllama(
        messages,
        currentModel,
        responseOptions.maxOutputTokens,
      );

      response = { role: "assistant", content: result };
    }

    // Send response back to renderer
    window.webContents.send(IPC_CHANNELS.CHAT_MESSAGE_RESPONSE, response);
  } catch (error) {
    log.error("Error in processChatMessage:", error);
    toastManager.error(`${error.message}`);
    // Send a fallback error response
    window.webContents.send(IPC_CHANNELS.CHAT_MESSAGE_RESPONSE, {
      role: "assistant",
      content:
        "I'm sorry, I encountered an error while processing your message. Please try again or check your AI provider settings.",
    });
  }
}

/**
 * Gets the system prompt from file if it exists
 *
 * @returns {string} The system prompt or empty string if not found
 */
function getSystemPrompt() {
  try {
    const systemPromptFile = getUserDataPath("systemPrompt.txt");
    if (fs.existsSync(systemPromptFile)) {
      return fs.readFileSync(systemPromptFile, "utf8");
    }
  } catch (error) {
    log.error("Error loading system prompt:", error);
  }
  return "";
}

/**
 * Processes screenshots specifically for UI implementation
 *
 * @param {BrowserWindow} mainWindow - The main application window
 * @param {string} aiProvider - The AI provider
 * @param {string} currentModel - The current model
 * @param {function} verifyOllamaModelFn - The function to verify the Ollama model
 * @param {function} generateWithOllamaFn - The function to generate with Ollama
 * @param {function} generateWithGeminiFn - The function to generate with Gemini
 * @param {boolean} useStreaming - Whether to use streaming
 */
async function processScreenshotsForUI(
  mainWindow,
  aiProvider,
  currentModel,
  verifyOllamaModelFn,
  generateWithOllamaFn,
  generateWithGeminiFn,
  useStreaming = false,
) {
  try {
    mainWindow.webContents.send("loading", true);
    const screenshots = getScreenshots();

    if (aiProvider === AI_PROVIDERS.OLLAMA) {
      const modelVerification = await verifyOllamaModelFn(currentModel);

      if (!modelVerification.exists) {
        let errorMessage = `The selected model "${currentModel}" is not available: ${modelVerification.error}`;
        throw new Error(errorMessage);
      }
    }

    // Use a profile-aware UI prompt so small budgets do not request an impossible full implementation.
    const responseOptions = getConfiguredResponseOptions();
    const promptText = createUIResponsePrompt(
      screenshots.length,
      configManager.getResponseLanguage(),
      responseOptions.responseProfile,
      responseOptions.customMaxOutputTokens,
    );
    log.info("UI implementation prompt created for", screenshots.length, "screenshots");

    const messages = [{ type: "text", text: promptText }];

    for (const img of screenshots) {
      const imageData = img.startsWith("data:image/") ? img : `data:image/png;base64,${img}`;
      messages.push({
        type: "image_url",
        image_url: { url: imageData },
      });
    }

    let result;

    if (aiProvider === AI_PROVIDERS.DEFAULT) {
      // Create model selection window when the default provider is selected
      windowManager.createModelSelectionWindow();

      // Return early since we're opening the model selection window instead of processing
      mainWindow.webContents.send(IPC_CHANNELS.LOADING, false);
      mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);
      return;
    }

    if (aiProvider === AI_PROVIDERS.OPENAI) {
      // Get OpenAI client from AI providers module
      const openai = aiProviders.getOpenAI();

      if (!openai) {
        throw new Error("OpenAI client is not initialized. Please go to Settings and enter your API key.");
      }

      if (useStreaming) {
        const stream = await openai.chat.completions.create({
          model: currentModel,
          messages: [{ role: "user", content: messages }],
          ...getOpenAIOutputOptions(responseOptions.maxOutputTokens),
          stream: true,
        });

        mainWindow.webContents.send(IPC_CHANNELS.LOADING, false);
        mainWindow.webContents.send(IPC_CHANNELS.STREAM_START);
        mainWindow.webContents.send(IPC_CHANNELS.UI_IMPLEMENTATION_MODE, true);

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            mainWindow.webContents.send(IPC_CHANNELS.STREAM_CHUNK, content);
          }
        }

        mainWindow.webContents.send(IPC_CHANNELS.STREAM_END);
        mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);
        return;
      } else {
        const response = await openai.chat.completions.create({
          model: currentModel,
          messages: [{ role: "user", content: messages }],
          ...getOpenAIOutputOptions(responseOptions.maxOutputTokens),
        });

        result = response.choices[0].message.content;
      }
    } else if (aiProvider === AI_PROVIDERS.OLLAMA) {
      result = await generateWithOllamaFn(messages, currentModel, responseOptions.maxOutputTokens);
    } else if (aiProvider === AI_PROVIDERS.GEMINI) {
      // Get Gemini client from AI providers module if not provided
      const geminiAI = aiProviders.getGeminiAI();

      if (!geminiAI) {
        throw new Error("Gemini AI client is not initialized. Please go to Settings and enter your API key.");
      }

      if (useStreaming) {
        const streamingResult = await generateWithGeminiFn(
          messages,
          currentModel,
          true,
          responseOptions.maxOutputTokens,
        );

        mainWindow.webContents.send(IPC_CHANNELS.LOADING, false);
        mainWindow.webContents.send(IPC_CHANNELS.STREAM_START);
        mainWindow.webContents.send(IPC_CHANNELS.UI_IMPLEMENTATION_MODE, true);

        let accumulatedText = "";

        streamingResult.emitter.on("chunk", (chunk) => {
          accumulatedText += chunk;
          mainWindow.webContents.send(IPC_CHANNELS.STREAM_UPDATE, accumulatedText);
        });

        streamingResult.emitter.on("complete", () => {
          mainWindow.webContents.send(IPC_CHANNELS.STREAM_END);
          mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);
        });

        streamingResult.emitter.on("error", (error) => {
          toastManager.error(`${error.message}`);
          mainWindow.webContents.send(IPC_CHANNELS.STREAM_END);
          mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);
        });

        return;
      } else {
        result = await generateWithGeminiFn(
          messages,
          currentModel,
          false,
          responseOptions.maxOutputTokens,
        );
      }
    } else if (aiProvider === AI_PROVIDERS.AZURE_FOUNDRY) {
      // Try to reinitialize Azure Foundry if not already initialized
      let azureFoundryClient = aiProviders.getAzureFoundryClient();

      if (!azureFoundryClient) {
        // Try to initialize from config if not already initialized
        console.log("Azure Foundry client not found, attempting to initialize from config...");
        aiProviders.initializeFromConfig();
        azureFoundryClient = aiProviders.getAzureFoundryClient();

        if (!azureFoundryClient) {
          throw new Error("Azure Foundry client is not initialized. Please go to Settings and enter your API key and endpoint.");
        }
      }

      if (useStreaming) {
        const streamingResult = await aiProviders.generateWithAzureFoundry(
          messages,
          currentModel,
          true,
          null,
          responseOptions.maxOutputTokens,
        );

        mainWindow.webContents.send(IPC_CHANNELS.LOADING, false);
        mainWindow.webContents.send(IPC_CHANNELS.STREAM_START);
        mainWindow.webContents.send(IPC_CHANNELS.UI_IMPLEMENTATION_MODE, true);

        let accumulatedText = "";

        streamingResult.emitter.on("chunk", (chunk) => {
          accumulatedText += chunk;
          mainWindow.webContents.send(IPC_CHANNELS.STREAM_UPDATE, accumulatedText);
        });

        streamingResult.emitter.on("complete", () => {
          mainWindow.webContents.send(IPC_CHANNELS.STREAM_END);
          mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);
        });

        streamingResult.emitter.on("error", (error) => {
          toastManager.error(`${error.message}`);
          mainWindow.webContents.send(IPC_CHANNELS.STREAM_END);
          mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);
        });

        return;
      } else {
        result = await aiProviders.generateWithAzureFoundry(
          messages,
          currentModel,
          false,
          null,
          responseOptions.maxOutputTokens,
        );
      }
    } else {
      throw new Error(`Unknown AI provider: ${aiProvider}`);
    }

    mainWindow.webContents.send(IPC_CHANNELS.LOADING, false);
    mainWindow.webContents.send(IPC_CHANNELS.UI_IMPLEMENTATION_MODE, true);
    mainWindow.webContents.send(IPC_CHANNELS.ANALYSIS_RESULT, result);
    mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);
  } catch (err) {
    log.error("Error in processScreenshotsForUI:", err);
    log.error("Stack trace:", err.stack);

    if (err.response) {
      log.error("Response status:", err.response.status);
      log.error("Response data:", JSON.stringify(err.response.data));
    }

    mainWindow.webContents.send(IPC_CHANNELS.LOADING, false);
    mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);
    toastManager.error(`${err.message}`);
  }
}

/**
 * Processes screenshots for direct answers (quick solutions)
 *
 * @param {BrowserWindow} mainWindow - The main application window
 * @param {string} aiProvider - The AI provider
 * @param {string} currentModel - The current model
 * @param {function} verifyOllamaModelFn - The function to verify the Ollama model
 * @param {function} generateWithOllamaFn - The function to generate with Ollama
 * @param {function} generateWithGeminiFn - The function to generate with Gemini
 * @param {boolean} useStreaming - Whether to use streaming
 */
async function processScreenshotsForDirectAnswer(
  mainWindow,
  aiProvider,
  currentModel,
  verifyOllamaModelFn,
  generateWithOllamaFn,
  generateWithGeminiFn,
  useStreaming = false,
) {
  // Create an abort controller for this request
  const abortController = new AbortController();
  activeRequestControllers.add(abortController);

  try {
    mainWindow.webContents.send("loading", true);
    const screenshots = getScreenshots();

    // Get the user's preferred response language
    const responseLanguage = configManager.getResponseLanguage();

    if (aiProvider === AI_PROVIDERS.OLLAMA) {
      const modelVerification = await verifyOllamaModelFn(currentModel);

      if (!modelVerification.exists) {
        let errorMessage = `The selected model "${currentModel}" is not available: ${modelVerification.error}`;
        throw new Error(errorMessage);
      }
    }

    // Use the direct answer prompt with the same global response budget.
    const responseOptions = getConfiguredResponseOptions();
    const promptText = createDirectAnswerPrompt(
      screenshots.length,
      responseLanguage,
      responseOptions.responseProfile,
      responseOptions.customMaxOutputTokens,
    );
    log.info("Direct answer prompt created for", screenshots.length, "screenshots");

    const messages = [{ type: "text", text: promptText }];

    for (const img of screenshots) {
      const imageData = img.startsWith("data:image/") ? img : `data:image/png;base64,${img}`;
      messages.push({
        type: "image_url",
        image_url: { url: imageData },
      });
    }

    let result;

    if (aiProvider === AI_PROVIDERS.DEFAULT) {
      // Create model selection window when the default provider is selected
      windowManager.createModelSelectionWindow();

      // Return early since we're opening the model selection window instead of processing
      mainWindow.webContents.send(IPC_CHANNELS.LOADING, false);
      mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);
      return;
    }

    if (aiProvider === AI_PROVIDERS.OPENAI) {
      // Get OpenAI client from AI providers module
      const openai = aiProviders.getOpenAI();

      if (!openai) {
        throw new Error("OpenAI client is not initialized. Please go to Settings and enter your API key.");
      }

      if (useStreaming) {
        const stream = await openai.chat.completions.create({
          model: currentModel,
          messages: [{ role: "user", content: messages }],
          ...getOpenAIOutputOptions(responseOptions.maxOutputTokens),
          stream: true,
          signal: abortController.signal,
        });

        mainWindow.webContents.send(IPC_CHANNELS.LOADING, false);
        mainWindow.webContents.send(IPC_CHANNELS.STREAM_START);
        mainWindow.webContents.send(IPC_CHANNELS.DIRECT_ANSWER_MODE, true);

        for await (const chunk of stream) {
          // Check if request was cancelled
          if (abortController.signal.aborted) {
            break;
          }
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            mainWindow.webContents.send(IPC_CHANNELS.STREAM_CHUNK, content);
          }
        }

        mainWindow.webContents.send(IPC_CHANNELS.STREAM_END);
        mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);
        return;
      } else {
        const response = await openai.chat.completions.create({
          model: currentModel,
          messages: [{ role: "user", content: messages }],
          ...getOpenAIOutputOptions(responseOptions.maxOutputTokens),
          signal: abortController.signal,
        });

        result = response.choices[0].message.content;
      }
    } else if (aiProvider === AI_PROVIDERS.OLLAMA) {
      result = await generateWithOllamaFn(messages, currentModel, responseOptions.maxOutputTokens);
    } else if (aiProvider === AI_PROVIDERS.GEMINI) {
      // Get Gemini client from AI providers module if not provided
      const geminiAI = aiProviders.getGeminiAI();

      if (!geminiAI) {
        throw new Error("Gemini AI client is not initialized. Please go to Settings and enter your API key.");
      }

      if (useStreaming) {
        const streamingResult = await generateWithGeminiFn(
          messages,
          currentModel,
          true,
          responseOptions.maxOutputTokens,
        );

        mainWindow.webContents.send(IPC_CHANNELS.LOADING, false);
        mainWindow.webContents.send(IPC_CHANNELS.STREAM_START);
        mainWindow.webContents.send(IPC_CHANNELS.DIRECT_ANSWER_MODE, true);

        let accumulatedText = "";

        streamingResult.emitter.on("chunk", (chunk) => {
          if (abortController.signal.aborted) {
            streamingResult.emitter.removeAllListeners();
            return;
          }
          accumulatedText += chunk;
          mainWindow.webContents.send(IPC_CHANNELS.STREAM_UPDATE, accumulatedText);
        });

        streamingResult.emitter.on("complete", () => {
          mainWindow.webContents.send(IPC_CHANNELS.STREAM_END);
          mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);
        });

        streamingResult.emitter.on("error", (error) => {
          if (!abortController.signal.aborted) {
            toastManager.error(`${error.message}`);
          }
          mainWindow.webContents.send(IPC_CHANNELS.STREAM_END);
          mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);
        });

        return;
      } else {
        result = await generateWithGeminiFn(
          messages,
          currentModel,
          false,
          responseOptions.maxOutputTokens,
        );
      }
    } else if (aiProvider === AI_PROVIDERS.AZURE_FOUNDRY) {
      // Try to reinitialize Azure Foundry if not already initialized
      let azureFoundryClient = aiProviders.getAzureFoundryClient();

      if (!azureFoundryClient) {
        // Try to initialize from config if not already initialized
        console.log("Azure Foundry client not found, attempting to initialize from config...");
        aiProviders.initializeFromConfig();
        azureFoundryClient = aiProviders.getAzureFoundryClient();

        if (!azureFoundryClient) {
          throw new Error("Azure Foundry client is not initialized. Please go to Settings and enter your API key and endpoint.");
        }
      }

      if (useStreaming) {
        const streamingResult = await aiProviders.generateWithAzureFoundry(
          messages,
          currentModel,
          true,
          null,
          responseOptions.maxOutputTokens,
        );

        mainWindow.webContents.send(IPC_CHANNELS.LOADING, false);
        mainWindow.webContents.send(IPC_CHANNELS.STREAM_START);
        mainWindow.webContents.send(IPC_CHANNELS.DIRECT_ANSWER_MODE, true);

        let accumulatedText = "";

        streamingResult.emitter.on("chunk", (chunk) => {
          if (abortController.signal.aborted) {
            streamingResult.emitter.removeAllListeners();
            return;
          }
          accumulatedText += chunk;
          mainWindow.webContents.send(IPC_CHANNELS.STREAM_UPDATE, accumulatedText);
        });

        streamingResult.emitter.on("complete", () => {
          mainWindow.webContents.send(IPC_CHANNELS.STREAM_END);
          mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);
        });

        streamingResult.emitter.on("error", (error) => {
          if (!abortController.signal.aborted) {
            toastManager.error(`${error.message}`);
          }
          mainWindow.webContents.send(IPC_CHANNELS.STREAM_END);
          mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);
        });

        return;
      } else {
        result = await aiProviders.generateWithAzureFoundry(
          messages,
          currentModel,
          false,
          null,
          responseOptions.maxOutputTokens,
        );
      }
    } else {
      throw new Error(`Unknown AI provider: ${aiProvider}`);
    }

    mainWindow.webContents.send(IPC_CHANNELS.LOADING, false);
    mainWindow.webContents.send(IPC_CHANNELS.DIRECT_ANSWER_MODE, true);
    mainWindow.webContents.send(IPC_CHANNELS.ANALYSIS_RESULT, result);
    mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);
  } catch (err) {
    // Don't show error if request was cancelled
    if (!abortController.signal.aborted) {
      log.error("Error in processScreenshotsForDirectAnswer:", err);
      log.error("Stack trace:", err.stack);

      if (err.response) {
        log.error("Response status:", err.response.status);
        log.error("Response data:", JSON.stringify(err.response.data));
      }

      toastManager.error(`${err.message}`);
    }

    mainWindow.webContents.send(IPC_CHANNELS.LOADING, false);
    mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);
  } finally {
    // Clean up the controller
    activeRequestControllers.delete(abortController);
  }
}

/**
 * Cancels all active AI requests
 */
function cancelAllRequests() {
  log.info(`Cancelling ${activeRequestControllers.size} active AI requests`);

  activeRequestControllers.forEach(controller => {
    try {
      controller.abort();
    } catch (error) {
      log.error("Error aborting request:", error);
    }
  });

  activeRequestControllers.clear();
}

module.exports = {
  createPrompt,
  processScreenshots,
  processScreenshotsForUI,
  processScreenshotsForDirectAnswer,
  processChatMessage,
  getSystemPrompt,
  cancelAllRequests,
};
