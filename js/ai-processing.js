const { AI_PROVIDERS, IPC_CHANNELS } = require("./constants");
const { getScreenshots } = require("./screenshot-manager");
const configManager = require("./config-manager");
const aiProviders = require("./ai-providers");
const windowManager = require("./window-manager");

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
- Provide a complete, well-commented solution
- Ensure the code is clean, readable, and follows best practices

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

  return `${prompt}\n\nIMPORTANT: Please respond entirely in ${languageMap[language]} language.`;
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
      // This is the same action triggered by Command+M
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
          mainWindow.webContents.send(IPC_CHANNELS.ERROR, error.message);
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
    console.error("Error in processScreenshots:", err);
    console.error("Stack trace:", err.stack);

    if (err.response) {
      console.error("Response status:", err.response.status);
      console.error("Response data:", JSON.stringify(err.response.data));
    }

    mainWindow.webContents.send(IPC_CHANNELS.LOADING, false);
    mainWindow.webContents.send(IPC_CHANNELS.ERROR, err.message);
    mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);
  }
}

module.exports = {
  createPrompt,
  processScreenshots,
};
