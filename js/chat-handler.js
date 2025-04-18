const axios = require("axios");
const { AI_PROVIDERS } = require("./constants");
const { getUserDataPath } = require("./utils");
const fs = require("fs");
const { HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const EventEmitter = require("events");

/**
 * Handles chat functionality with AI models
 * Maintains conversation context and processes messages
 */
class ChatHandler {
  constructor(aiProviders, configManager) {
    this.aiProviders = aiProviders;
    this.configManager = configManager;
    this.conversations = new Map(); // Store conversations by window ID
    this.systemPrompts = new Map(); // Store system prompts by window ID

    // Initialize AI providers
    this.initializeAIProviders();
  }

  /**
   * Initialize AI providers from configuration
   */
  initializeAIProviders() {
    try {
      // Force initialization of AI providers
      const initStatus = this.aiProviders.initializeFromConfig();
      console.log("Chat handler initialized AI providers with status:", initStatus);

      // Get current provider from configuration
      const currentProvider = this.configManager.getAiProvider();
      console.log(`Current AI provider configured: ${currentProvider}`);

      // Check if the configured provider is initialized
      if (currentProvider === AI_PROVIDERS.GEMINI && !this.aiProviders.getGeminiAI()) {
        console.warn("Gemini AI is configured but not initialized");
      } else if (currentProvider === AI_PROVIDERS.OPENAI && !this.aiProviders.getOpenAI()) {
        console.warn("OpenAI is configured but not initialized");
      }
    } catch (error) {
      console.error("Failed to initialize AI providers:", error);
    }
  }

  /**
   * Process a chat message and generate a response
   * @param {Array} messages The conversation history with the new message
   * @param {number} windowId The ID of the chat window
   * @param {string} systemPrompt Optional system prompt to use
   * @param {boolean} useStreaming Whether to use streaming (defaults to true for Gemini)
   * @param {function} streamCallback Optional callback function for handling streaming responses
   * @returns {Promise<Object>} The AI's response or a streaming handler
   */
  async processMessage(messages, windowId, systemPrompt, useStreaming, streamCallback) {
    try {
      // Store system prompt for this window if provided
      if (systemPrompt) {
        this.systemPrompts.set(windowId, systemPrompt);
      }

      // Get cached system prompt for this window or load from file if not in memory
      let currentSystemPrompt = this.systemPrompts.get(windowId);
      if (!currentSystemPrompt) {
        currentSystemPrompt = this.loadSystemPrompt();
        if (currentSystemPrompt) {
          this.systemPrompts.set(windowId, currentSystemPrompt);
        }
      }

      // Get the current AI provider and model from config
      const provider = this.configManager.getAiProvider();
      const currentModel = this.configManager.getCurrentModel();

      console.log(`Processing message with ${provider} using model ${currentModel}`);

      // Default to streaming for Gemini if not specified
      if (useStreaming === undefined) {
        useStreaming = provider === AI_PROVIDERS.GEMINI;
      }

      // Create a copy of messages with system prompt if available
      let messagesWithSystem = [...messages];
      if (currentSystemPrompt) {
        // Insert system prompt at beginning if not already there
        if (messagesWithSystem.length === 0 || messagesWithSystem[0].role !== "system") {
          messagesWithSystem.unshift({
            role: "system",
            content: currentSystemPrompt,
          });
        }
      }

      // Generate response based on the configured AI provider
      let response;
      try {
        switch (provider) {
          case AI_PROVIDERS.GEMINI:
            response = await this.generateWithGemini(
              messagesWithSystem,
              currentModel,
              useStreaming,
              streamCallback,
              windowId,
            );
            break;
          case AI_PROVIDERS.OLLAMA:
            response = await this.generateWithOllama(messagesWithSystem, currentModel);
            break;
          case AI_PROVIDERS.OPENAI:
            response = await this.generateWithOpenAI(
              messagesWithSystem,
              currentModel,
              useStreaming,
              streamCallback,
              windowId,
            );
            break;
          default:
            // If provider not set or invalid, try each available provider
            if (this.aiProviders.getGeminiAI()) {
              response = await this.generateWithGemini(
                messagesWithSystem,
                "gemini-pro",
                useStreaming,
                streamCallback,
                windowId,
              );
            } else if (this.aiProviders.getOpenAI()) {
              response = await this.generateWithOpenAI(
                messagesWithSystem,
                "gpt-3.5-turbo",
                useStreaming,
                streamCallback,
                windowId,
              );
            } else if (this.configManager.getOllamaUrl) {
              response = await this.generateWithOllama(messagesWithSystem, "llama2");
            } else {
              throw new Error(`No AI providers are configured. Please go to Settings and configure an AI provider.`);
            }
        }
      } catch (providerError) {
        console.error(`Error with provider ${provider}:`, providerError);

        // Try fallback providers if the primary one fails
        if (provider !== AI_PROVIDERS.GEMINI && this.aiProviders.getGeminiAI()) {
          console.log("Trying fallback with Gemini...");
          response = await this.generateWithGemini(
            messagesWithSystem,
            "gemini-pro",
            useStreaming,
            streamCallback,
            windowId,
          );
        } else if (provider !== AI_PROVIDERS.OPENAI && this.aiProviders.getOpenAI()) {
          console.log("Trying fallback with OpenAI...");
          response = await this.generateWithOpenAI(
            messagesWithSystem,
            "gpt-3.5-turbo",
            useStreaming,
            streamCallback,
            windowId,
          );
        } else if (provider !== AI_PROVIDERS.OLLAMA) {
          console.log("Trying fallback with Ollama...");
          response = await this.generateWithOllama(messagesWithSystem, "llama2");
        } else {
          // If we've tried all options, rethrow the original error
          throw providerError;
        }
      }

      // If streaming, the response is handled through callbacks
      if (useStreaming && provider !== AI_PROVIDERS.OLLAMA) {
        return response;
      }

      // Save conversation for context (but without system prompt in history)
      this.saveConversation(windowId, messages.concat([response]));

      return response;
    } catch (error) {
      console.error("Error processing chat message:", error);
      return {
        role: "assistant",
        content: `Error: ${
          error.message || "Failed to generate response"
        }. Please check your API keys in the Settings menu (${
          (this.configManager.getModifierKey && this.configManager.getModifierKey()) || "Cmd/Ctrl"
        }+,).`,
      };
    }
  }

  /**
   * Load system prompt from file
   * @returns {string} The system prompt or empty string if not found
   */
  loadSystemPrompt() {
    try {
      const systemPromptFile = getUserDataPath("systemPrompt.txt");
      if (fs.existsSync(systemPromptFile)) {
        return fs.readFileSync(systemPromptFile, "utf8");
      }
    } catch (error) {
      console.error("Error loading system prompt:", error);
    }
    return "";
  }

  /**
   * Generate a response using Gemini AI
   * @param {Array} messages The conversation history
   * @param {string} model The Gemini model to use
   * @param {boolean} streaming Whether to use streaming
   * @param {function} streamCallback Optional callback function for handling streaming responses
   * @param {number} windowId Optional window ID for managing conversations
   * @returns {Promise<Object>} The response or streaming handler
   */
  async generateWithGemini(messages, model, streaming = true, streamCallback, windowId) {
    try {
      // Ensure Gemini client is available
      const geminiClient = this.aiProviders.getGeminiAI();
      if (!geminiClient) {
        throw new Error("Gemini client not initialized. Please go to Settings and enter your API key.");
      }

      // If streaming is requested, use the generateWithGemini function from aiProviders
      if (streaming) {
        // Extract system message if present
        let systemPrompt = "";
        if (messages.length > 0 && messages[0].role === "system") {
          systemPrompt = messages[0].content;
        }

        // Get only the most recent user message and the previous assistant message (if available)
        // This significantly reduces context length and token usage
        const recentMessages = [];
        
        // Find the last user message
        let lastUserMessageIndex = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === "user") {
            lastUserMessageIndex = i;
            break;
          }
        }
        
        // If we found a user message
        if (lastUserMessageIndex !== -1) {
          // Add the previous assistant message if it exists
          if (lastUserMessageIndex > 0 && messages[lastUserMessageIndex - 1].role === "assistant") {
            const assistantMsg = messages[lastUserMessageIndex - 1];
            if (assistantMsg.content && assistantMsg.content.trim() !== "") {
              recentMessages.push({
                type: "text",
                text: assistantMsg.content,
              });
            }
          }
          
          // Add the user message
          const userMsg = messages[lastUserMessageIndex];
          if (userMsg.content && userMsg.content.trim() !== "") {
            // If there's a system prompt, add it to the user message
            if (systemPrompt) {
              recentMessages.push({
                type: "text",
                text: "System instructions: " + systemPrompt + "\n\n" + userMsg.content,
              });
            } else {
              recentMessages.push({
                type: "text",
                text: userMsg.content,
              });
            }
          }
          
          // Handle any image type attached to the user message
          if (userMsg.type === "image_url" && userMsg.image_url) {
            try {
              // Ensure proper image_url format for Gemini API
              let formattedImageUrl;
              if (typeof userMsg.image_url === "object" && userMsg.image_url.url) {
                // Already in the correct format: { url: "data:image/..." }
                formattedImageUrl = userMsg.image_url;
              } else if (typeof userMsg.image_url === "string") {
                // Convert string format to object format
                formattedImageUrl = { url: userMsg.image_url };
              } else {
                throw new Error("Invalid image_url format");
              }

              recentMessages.push({
                type: "image_url",
                image_url: formattedImageUrl,
              });
            } catch (error) {
              console.error("Error processing image message:", error);
              // Continue without the image if there's an error
            }
          }
        } else {
          // If no user message found, add a default message
          recentMessages.push({
            type: "text",
            text: systemPrompt ? `System instructions: ${systemPrompt}\n\nHello` : "Hello",
          });
        }

        // Safety check - ensure we have at least one message
        if (recentMessages.length === 0) {
          recentMessages.push({
            type: "text",
            text: "Hello",
          });
        }

        // Debug log showing the formatted messages to send to Gemini
        console.log("Formatted messages for Gemini:", JSON.stringify(recentMessages, null, 2));
        // Also log the count of messages for easier debugging
        console.log(`Sending ${recentMessages.length} formatted messages to Gemini API`);

        // Use the streaming implementation from aiProviders
        const streamingResult = await this.aiProviders.generateWithGemini(
          recentMessages,
          model || "gemini-pro",
          true,
        );

        // If a streamCallback is provided, set up event listeners
        if (streamCallback) {
          let fullText = "";

          streamingResult.emitter.on("chunk", (chunk) => {
            fullText += chunk;
            streamCallback("chunk", chunk, fullText);
          });

          streamingResult.emitter.on("complete", (text) => {
            streamCallback("complete", text);

            // Save the conversation with the final response
            if (windowId) {
              this.saveConversation(
                windowId,
                messages.concat([
                  {
                    role: "assistant",
                    content: text,
                  },
                ]),
              );
            }
          });

          streamingResult.emitter.on("error", (error) => {
            console.error("Gemini streaming error:", error);
            streamCallback("error", error);
          });
        }

        return streamingResult;
      }

      const safetySettings = [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
      ];

      // For non-streaming mode, handle similarly - use only most recent context
      // Extract system message if present
      let systemPrompt = "";
      if (messages.length > 0 && messages[0].role === "system") {
        systemPrompt = messages[0].content;
        messages = messages.slice(1); // Remove system message from array
      }

      // Get the last conversation turn (1-2 messages) to reduce context
      const recentMessages = [];
      
      if (messages.length > 0) {
        // Get last assistant message (if it exists) and the last user message
        let lastUserIndex = messages.length - 1;
        while (lastUserIndex >= 0 && messages[lastUserIndex].role !== "user") {
          lastUserIndex--;
        }
        
        // If we found a user message
        if (lastUserIndex >= 0) {
          // Add previous assistant message if it exists
          if (lastUserIndex > 0 && messages[lastUserIndex - 1].role === "assistant") {
            recentMessages.push({
              role: "model",
              parts: [{ text: messages[lastUserIndex - 1].content }]
            });
          }
          
          // Add the user message with system prompt
          const userContent = systemPrompt 
            ? `System instructions: ${systemPrompt}\n\n${messages[lastUserIndex].content}`
            : messages[lastUserIndex].content;
            
          recentMessages.push({
            role: "user",
            parts: [{ text: userContent }]
          });
        } else {
          // Fallback if no user message found
          recentMessages.push({
            role: "user",
            parts: [{ text: systemPrompt ? `System instructions: ${systemPrompt}\n\nHello` : "Hello" }]
          });
        }
      } else if (systemPrompt) {
        // If only system prompt exists
        recentMessages.push({
          role: "user",
          parts: [{ text: `System instructions: ${systemPrompt}\n\nHello` }]
        });
      } else {
        // Complete fallback
        recentMessages.push({
          role: "user",
          parts: [{ text: "Hello" }]
        });
      }

      // Get the specific model
      const geminiModel = geminiClient.getGenerativeModel({ model: model || "gemini-pro" });

      // Generate response
      const result = await geminiModel.generateContent({
        contents: recentMessages,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192,
        },
        safetySettings,
      });

      const response = result.response;
      const text = response.text();

      return {
        role: "assistant",
        content: text,
      };
    } catch (error) {
      console.error("Error generating with Gemini:", error);
      throw error;
    }
  }

  /**
   * Generate a response using Ollama
   * @param {Array} messages The conversation history
   * @param {string} model The Ollama model to use
   * @returns {Promise<Object>} The response
   */
  async generateWithOllama(messages, model) {
    try {
      // Get Ollama URL from config
      const ollamaUrl = this.configManager.getCurrentSettings().ollamaUrl;
      if (!ollamaUrl) {
        throw new Error("Ollama URL is not configured");
      }

      // Format messages for Ollama API
      const formattedMessages = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      // API call to Ollama
      const response = await axios.post(`${ollamaUrl}/api/chat`, {
        model: model || "llama2",
        messages: formattedMessages,
        stream: false,
        options: {
          temperature: 0.7,
        },
      });

      if (!response.data || !response.data.message) {
        throw new Error("Invalid response from Ollama");
      }

      return {
        role: "assistant",
        content: response.data.message.content,
      };
    } catch (error) {
      console.error("Error generating with Ollama:", error);
      throw error;
    }
  }

  /**
   * Generate a response using OpenAI
   * @param {Array} messages The conversation history
   * @param {string} model The OpenAI model to use
   * @param {boolean} streaming Whether to use streaming
   * @param {function} streamCallback Optional callback function for handling streaming responses
   * @param {number} windowId Optional window ID for managing conversations
   * @returns {Promise<Object>} The response or streaming handler
   */
  async generateWithOpenAI(messages, model, streaming = false, streamCallback, windowId) {
    try {
      // Ensure OpenAI client is available
      const openaiClient = this.aiProviders.getOpenAI();
      if (!openaiClient) {
        throw new Error("OpenAI client not initialized. Please go to Settings and enter your API key.");
      }

      // Format messages for OpenAI API
      const formattedMessages = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      // Use streaming if requested
      if (streaming) {
        const stream = await openaiClient.chat.completions.create({
          model: model || "gpt-3.5-turbo",
          messages: formattedMessages,
          temperature: 0.7,
          max_tokens: 2048,
          stream: true,
        });

        if (streamCallback) {
          let fullText = "";

          // Process the stream
          (async () => {
            try {
              // Signal that streaming has started
              streamCallback("start");

              for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || "";
                if (content) {
                  fullText += content;
                  streamCallback("chunk", content, fullText);
                }
              }

              // Signal that streaming is complete
              streamCallback("complete", fullText);

              // Save the conversation with the final response
              if (windowId) {
                this.saveConversation(
                  windowId,
                  messages.concat([
                    {
                      role: "assistant",
                      content: fullText,
                    },
                  ]),
                );
              }
            } catch (error) {
              console.error("Error in OpenAI stream processing:", error);
              streamCallback("error", error);
            }
          })();
        }

        // Return an object similar to Gemini streaming for consistency
        const emitter = new EventEmitter();
        return {
          streaming: true,
          emitter: emitter,
          text: () => "",
        };
      }

      // Standard non-streaming response
      const response = await openaiClient.chat.completions.create({
        model: model || "gpt-3.5-turbo",
        messages: formattedMessages,
        temperature: 0.7,
        max_tokens: 2048,
      });

      if (!response.choices || !response.choices[0] || !response.choices[0].message) {
        throw new Error("Invalid response from OpenAI");
      }

      return {
        role: "assistant",
        content: response.choices[0].message.content,
      };
    } catch (error) {
      console.error("Error generating with OpenAI:", error);
      throw error;
    }
  }

  /**
   * Save conversation history for a window
   * @param {number} windowId The window ID
   * @param {Array} messages The conversation messages
   */
  saveConversation(windowId, messages) {
    this.conversations.set(windowId, messages);
  }

  /**
   * Get conversation history for a window
   * @param {number} windowId The window ID
   * @returns {Array|null} The conversation messages or null if none
   */
  getConversation(windowId) {
    return this.conversations.get(windowId) || null;
  }

  /**
   * Clear conversation history for a window
   * @param {number} windowId The window ID
   */
  clearConversation(windowId) {
    this.conversations.delete(windowId);
  }
}

module.exports = ChatHandler;
