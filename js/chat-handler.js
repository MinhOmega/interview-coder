const axios = require("axios");
const { AI_PROVIDERS } = require("./constants");
const { getUserDataPath } = require("./utils");
const fs = require('fs');

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
   * @returns {Promise<Object>} The AI's response
   */
  async processMessage(messages, windowId, systemPrompt) {
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
      
      // Create a copy of messages with system prompt if available
      let messagesWithSystem = [...messages];
      if (currentSystemPrompt) {
        // Insert system prompt at beginning if not already there
        if (messagesWithSystem.length === 0 || messagesWithSystem[0].role !== 'system') {
          messagesWithSystem.unshift({ 
            role: 'system', 
            content: currentSystemPrompt 
          });
        }
      }

      // Generate response based on the configured AI provider
      let response;
      try {
        switch (provider) {
          case AI_PROVIDERS.GEMINI:
            response = await this.generateWithGemini(messagesWithSystem, currentModel);
            break;
          case AI_PROVIDERS.OLLAMA:
            response = await this.generateWithOllama(messagesWithSystem, currentModel);
            break;
          case AI_PROVIDERS.OPENAI:
            response = await this.generateWithOpenAI(messagesWithSystem, currentModel);
            break;
          default:
            // If provider not set or invalid, try each available provider
            if (this.aiProviders.getGeminiAI()) {
              response = await this.generateWithGemini(messagesWithSystem, "gemini-pro");
            } else if (this.aiProviders.getOpenAI()) {
              response = await this.generateWithOpenAI(messagesWithSystem, "gpt-3.5-turbo");
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
          response = await this.generateWithGemini(messagesWithSystem, "gemini-pro");
        } else if (provider !== AI_PROVIDERS.OPENAI && this.aiProviders.getOpenAI()) {
          console.log("Trying fallback with OpenAI...");
          response = await this.generateWithOpenAI(messagesWithSystem, "gpt-3.5-turbo");
        } else if (provider !== AI_PROVIDERS.OLLAMA) {
          console.log("Trying fallback with Ollama...");
          response = await this.generateWithOllama(messagesWithSystem, "llama2");
        } else {
          // If we've tried all options, rethrow the original error
          throw providerError;
        }
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
      const systemPromptFile = getUserDataPath('systemPrompt.txt');
      if (fs.existsSync(systemPromptFile)) {
        return fs.readFileSync(systemPromptFile, 'utf8');
      }
    } catch (error) {
      console.error('Error loading system prompt:', error);
    }
    return '';
  }

  /**
   * Generate a response using Gemini AI
   * @param {Array} messages The conversation history
   * @param {string} model The Gemini model to use
   * @returns {Promise<Object>} The response
   */
  async generateWithGemini(messages, model) {
    try {
      // Ensure Gemini client is available
      const geminiClient = this.aiProviders.getGeminiAI();
      if (!geminiClient) {
        throw new Error("Gemini client not initialized. Please go to Settings and enter your API key.");
      }

      // Format messages for Gemini API
      const formattedMessages = messages.map((msg) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      }));

      // Get the specific model
      const geminiModel = geminiClient.getGenerativeModel({ model: model || "gemini-pro" });

      // Generate response
      const result = await geminiModel.generateContent({
        contents: formattedMessages,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
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
   * @returns {Promise<Object>} The response
   */
  async generateWithOpenAI(messages, model) {
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

      // API call to OpenAI
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
