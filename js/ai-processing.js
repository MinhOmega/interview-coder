const { getScreenshots } = require("./screenshot-manager");
const { IPC_CHANNELS } = require("./constants");

/**
 * Creates a prompt for the AI based on the number of screenshots
 *
 * @param {number} screenshotsCount - The number of screenshots
 * @returns {string} The prompt for the AI
 */
function createPrompt(screenshotsCount) {
  let promptText = "";
  if (screenshotsCount === 1) {
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
    promptText = `These ${screenshotsCount} screenshots show a multi-part programming problem. 
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

  return promptText;
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
 * @param {OpenAI} openai - The OpenAI client
 * @param {boolean} useStreaming - Whether to use streaming
 */
async function processScreenshots(
  mainWindow,
  aiProvider,
  currentModel,
  verifyOllamaModelFn,
  generateWithOllamaFn,
  generateWithGeminiFn,
  openai,
  useStreaming = false,
) {
  try {
    mainWindow.webContents.send(IPC_CHANNELS.LOADING, true);
    const screenshots = getScreenshots();

    // Notify user that screenshots are being processed
    mainWindow.webContents.send(IPC_CHANNELS.NOTIFICATION, {
      body: `Processing ${screenshots.length} screenshot(s) with ${aiProvider} (${currentModel})`,
      type: "info",
    });

    if (aiProvider === "ollama") {
      const modelVerification = await verifyOllamaModelFn(currentModel);

      if (!modelVerification.exists) {
        let errorMessage = `The selected model "${currentModel}" is not available: ${modelVerification.error}`;
        throw new Error(errorMessage);
      }
    }

    const promptText = createPrompt(screenshots.length);

    const messages = [{ type: "text", text: promptText }];

    for (const img of screenshots) {
      const imageData = img.startsWith("data:image/") ? img : `data:image/png;base64,${img}`;
      messages.push({
        type: "image_url",
        image_url: { url: imageData },
      });
    }

    // Notify user that screenshots are being sent to AI
    mainWindow.webContents.send(IPC_CHANNELS.NOTIFICATION, {
      body: `Sending ${screenshots.length} screenshot(s) to ${aiProvider}...`,
      type: "info",
    });

    let result;

    if (aiProvider === "openai") {
      if (!openai) {
        throw new Error("OpenAI client is not initialized. Please check your API key.");
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

        // Notify that streaming has started
        mainWindow.webContents.send(IPC_CHANNELS.NOTIFICATION, {
          body: `Processing started with ${aiProvider}. Streaming response...`,
          type: "success",
        });

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            mainWindow.webContents.send(IPC_CHANNELS.STREAM_CHUNK, content);
          }
        }

        mainWindow.webContents.send(IPC_CHANNELS.STREAM_END);
        mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);

        // Notify when streaming is complete
        mainWindow.webContents.send(IPC_CHANNELS.NOTIFICATION, {
          body: `${aiProvider} processing complete`,
          type: "success",
        });

        return;
      } else {
        const response = await openai.chat.completions.create({
          model: currentModel,
          messages: [{ role: "user", content: messages }],
          max_tokens: 8000,
        });

        result = response.choices[0].message.content;
      }
    } else if (aiProvider === "ollama") {
      result = await generateWithOllamaFn(messages, currentModel);
    } else if (aiProvider === "gemini") {
      if (useStreaming) {
        // Notify that Gemini processing is starting
        mainWindow.webContents.send(IPC_CHANNELS.NOTIFICATION, {
          body: `${aiProvider} is processing screenshots with ${currentModel}...`,
          type: "info",
        });

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

          // Notify when Gemini processing is complete
          mainWindow.webContents.send(IPC_CHANNELS.NOTIFICATION, {
            body: `${aiProvider} processing complete`,
            type: "success",
          });
        });

        streamingResult.emitter.on("error", (error) => {
          mainWindow.webContents.send(IPC_CHANNELS.ERROR, error.message);
          mainWindow.webContents.send(IPC_CHANNELS.STREAM_END);
          mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);

          // Notify when Gemini processing fails
          mainWindow.webContents.send(IPC_CHANNELS.NOTIFICATION, {
            body: `${aiProvider} processing failed: ${error.message}`,
            type: "error",
          });
        });

        return;
      } else {
        // Notify that Gemini processing is starting
        mainWindow.webContents.send(IPC_CHANNELS.NOTIFICATION, {
          body: `${aiProvider} is processing screenshots with ${currentModel}...`,
          type: "info",
        });

        result = await generateWithGeminiFn(messages, currentModel);
      }
    } else {
      throw new Error(`Unknown AI provider: ${aiProvider}`);
    }

    mainWindow.webContents.send(IPC_CHANNELS.LOADING, false);

    mainWindow.webContents.send(IPC_CHANNELS.ANALYSIS_RESULT, result);

    mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);

    // Notify when processing is complete
    mainWindow.webContents.send(IPC_CHANNELS.NOTIFICATION, {
      body: `${aiProvider} processing complete`,
      type: "success",
    });
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

    // Notify with detailed error message
    mainWindow.webContents.send(IPC_CHANNELS.NOTIFICATION, {
      body: `Error processing screenshots: ${err.message}`,
      type: "error",
    });
  }
}

module.exports = {
  createPrompt,
  processScreenshots,
};
