// AI Processing module - handles processing of screenshots with various AI providers

// Import modules
const { getScreenshots } = require('./screenshot-manager');
const { updateInstruction } = require('./window-manager');

// Create an improved prompt based on the number of screenshots
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

// Process screenshots with AI
async function processScreenshots(mainWindow, aiProvider, currentModel, verifyOllamaModelFn, generateWithOllamaFn, generateWithGeminiFn, openai, useStreaming = false) {
  try {
    // Show loading state
    mainWindow.webContents.send("loading", true);

    // Get screenshots
    const screenshots = getScreenshots();

    // Check if we're using Ollama and verify the model first
    if (aiProvider === "ollama") {
      const modelVerification = await verifyOllamaModelFn(currentModel);

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

    // Create prompt based on the number of screenshots
    const promptText = createPrompt(screenshots.length);

    // Build message with text + each screenshot
    const messages = [{ type: "text", text: promptText }];

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
      }
    } else if (aiProvider === "ollama") {
      // Use Ollama for generation
      result = await generateWithOllamaFn(messages, currentModel);
    } else if (aiProvider === "gemini") {
      // Use Gemini for generation

      if (useStreaming) {
        const streamingResult = await generateWithGeminiFn(messages, currentModel, true);

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
        result = await generateWithGeminiFn(messages, currentModel);
      }
    } else {
      throw new Error(`Unknown AI provider: ${aiProvider}`);
    }

    // Hide loading state
    mainWindow.webContents.send("loading", false);

    // Send the text to the renderer
    mainWindow.webContents.send("analysis-result", result);

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

module.exports = {
  createPrompt,
  processScreenshots
}; 