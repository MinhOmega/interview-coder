const { AI_PROVIDERS, IPC_CHANNELS } = require("./constants");
const { getScreenshots } = require("./screenshot-manager");
const configManager = require("./config-manager");
const aiProviders = require("./ai-providers");
const windowManager = require("./window-manager");
const { getUserDataPath } = require("./utils");
const fs = require("fs");
const toastManager = require("./toast-manager");
const log = require("electron-log");

const basePrompt = `I need you to analyze this problem carefully and provide the best possible solution with excellent performance and readability.

Guidelines:
1. Take time to understand the problem fully before proposing a solution.
2. Consider different approaches and select the most appropriate one.
3. Prioritize code readability and maintainability while ensuring good performance.
4. Handle edge cases and include error handling where appropriate.
5. Start with a clear understanding of the problem before diving into code.
6. Use modern practices, efficient algorithms, and optimize for both time and space complexity.
7. Structure your code with clean architecture principles.
8. Include robust error handling and edge case considerations.

Your response MUST follow this exact structure with these main sections:

# Analyzing the Problem
Provide a clear understanding of what the problem is asking, including:
- The key requirements and constraints
- Input/output specifications
- Important edge cases to consider
- Any implicit assumptions

# My Thoughts
- Explain your chosen approach and why it's optimal for this problem
- Discuss any alternative approaches you considered
- Outline the key algorithms or data structures you're using
- The complete, well-commented implementation
- Any trade-offs or alternative approaches you considered

# Implementation
- Start with a high-level overview of your solution strategy
- Break down your implementation into logical steps, explaining each step before showing the code
- For each significant code segment:
  * First explain what you're going to do and why
  * Then show the implementation with clean, well-structured code
  * Use descriptive variable names that clearly indicate purpose
- Structure your code naturally as a human developer would (not top-to-bottom sequential)
- Group related logic and functionality together
- Include detailed bilingual comments in both English and the user's selected language for all key parts
- Comments should explain WHY, not just WHAT the code does
- Demonstrate proper error handling and edge case coverage
- Apply clean code principles and best practices

# Complexity
Analyze the efficiency of your solution:
- Time complexity with explanation
- Space complexity with explanation
- Potential bottlenecks
- Any further optimization possibilities

Format your response in clear, well-structured Markdown with proper code blocks for all code.`;

/**
 * Creates a prompt for the AI based on the number of screenshots and preferred language
 *
 * @param {number} screenshotsCount - The number of screenshots
 * @param {string} language - The preferred language for the response (e.g., 'en', 'vi')
 * @returns {string} The prompt for the AI
 */
function createPrompt(screenshotsCount, language = "en") {
  log.info("Create prompt with language:", language);
  let prompt = "";
  if (screenshotsCount === 1) {
    prompt = `The screenshot shows a programming problem or question. ${basePrompt}`;
  } else {
    prompt = `These ${screenshotsCount} screenshots show a multi-part programming problem. ${basePrompt}`;
  }

  const languageMap = {
    vi: "Vietnamese",
    es: "Spanish",
    fr: "French",
    de: "German",
    ja: "Japanese",
    ko: "Korean",
    zh: "Chinese",
  };

  if (language === "en" || !languageMap[language]) {
    return prompt;
  }

  return `${prompt}\n\nIMPORTANT: Please respond entirely in ${languageMap[language]} language. For the Implementation section, provide all code comments in both English and ${languageMap[language]} side-by-side. Example: /* This validates the input (English) / Esto valida la entrada (Spanish) */`;
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

    if (aiProvider === AI_PROVIDERS.OLLAMA) {
      const modelVerification = await verifyOllamaModelFn(currentModel);

      if (!modelVerification.exists) {
        let errorMessage = `The selected model "${currentModel}" is not available: ${modelVerification.error}`;
        throw new Error(errorMessage);
      }
    }

    const promptText = createPrompt(screenshots.length, responseLanguage);
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
          max_tokens: 8000,
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
          max_tokens: 8000,
        });

        result = response.choices[0].message.content;
      }
    } else if (aiProvider === AI_PROVIDERS.OLLAMA) {
      result = await generateWithOllamaFn(messages, currentModel);
    } else if (aiProvider === AI_PROVIDERS.GEMINI) {
      // Get Gemini client from AI providers module if not provided
      const geminiAI = aiProviders.getGeminiAI();

      if (!geminiAI) {
        throw new Error("Gemini AI client is not initialized. Please go to Settings and enter your API key.");
      }

      if (useStreaming) {
        const streamingResult = await generateWithGeminiFn(messages, currentModel, true);

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
        result = await generateWithGeminiFn(messages, currentModel);
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

    if (!aiProvider || aiProvider === AI_PROVIDERS.DEFAULT) {
      toastManager.error("Please configure an AI provider in settings first.");
      return;
    }

    let messages = [];

    // Add system prompt if provided
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }

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
        max_tokens: 4000,
      });

      response = { role: "assistant", content: result.choices[0].message.content };
    } else if (aiProvider === AI_PROVIDERS.GEMINI) {
      // Get Gemini client
      const geminiAI = aiProviders.getGeminiAI();

      if (!geminiAI) {
        throw new Error("Gemini AI client is not initialized. Please go to Settings and enter your API key.");
      }

      const geminiMessages = messages.map((msg) => {
        return { role: msg.role === "user" ? "user" : "model", parts: [{ text: msg.content }] };
      });

      const result = await geminiAI.generateContent({
        contents: geminiMessages,
        generationConfig: {
          maxOutputTokens: 8192,
        },
      });

      response = { role: "assistant", content: result.response.text() };
    } else if (aiProvider === AI_PROVIDERS.OLLAMA) {
      // Use Ollama client
      const result = await aiProviders.generateWithOllama(
        messages.map((msg) => msg.content),
        currentModel,
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

module.exports = {
  createPrompt,
  processScreenshots,
  processChatMessage,
  getSystemPrompt,
};
