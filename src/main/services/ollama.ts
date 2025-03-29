import axios from 'axios';
import { MessageContent, ModelVerificationResult } from '../types';
import { EventEmitter } from 'events';

export class OllamaService {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://127.0.0.1:11434') {
    // Always use IPv4 explicitly by replacing any 'localhost' with '127.0.0.1'
    this.baseUrl = baseUrl.replace('localhost', '127.0.0.1');
    
    // Configure axios to use IPv4
    axios.defaults.family = 4;
  }

  /**
   * Set the base URL for the Ollama API
   * @param baseUrl Base URL for Ollama API
   */
  public setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl.replace('localhost', '127.0.0.1');
  }

  /**
   * Get the list of available models from Ollama
   * @returns Array of model names
   */
  public async getModels(): Promise<string[]> {
    try {
      // Add timeout to avoid long waiting times if Ollama is not running
      const response = await axios.get(`${this.baseUrl}/api/tags`, {
        timeout: 5000,
        validateStatus: () => true // Don't throw on non-2xx status
      });
      
      if (response.status !== 200) {
        console.error(`Error: Ollama API returned status ${response.status}`);
        return [];
      }
      
      return response.data.models?.map((model: any) => model.name) || [];
    } catch (error: any) {
      // More detailed error logging
      console.error("Error fetching Ollama models:", error.message);
      if (error.code) console.error("Error code:", error.code);
      if (error.syscall) console.error("System call:", error.syscall);
      if (error.address) console.error("Address:", error.address);
      if (error.port) console.error("Port:", error.port);
      
      return [];
    }
  }

  /**
   * Verify if an Ollama model exists and has vision capability
   * @param modelName Name of the model to verify
   * @returns Model verification result
   */
  public async verifyModel(modelName: string): Promise<ModelVerificationResult> {
    try {
      console.log(`Verifying Ollama model: ${modelName}`);
      
      // First, check if the model is in the list of available models
      try {
        // Get available models first
        const modelsResponse = await axios.get(`${this.baseUrl}/api/tags`, {
          timeout: 5000,
          validateStatus: () => true
        });
        
        if (modelsResponse.status !== 200) {
          return {
            exists: false,
            error: `Failed to get list of models (status ${modelsResponse.status})`
          };
        }
        
        const modelsList = modelsResponse.data.models || [];
        const availableModels = modelsList.map((m: any) => m.name);
        
        // Check if our model is in the list
        const modelExists = availableModels.some((m: string) => m === modelName);
        
        if (!modelExists) {
          // For a better user experience, suggest models that do exist
          const visionModels = availableModels.filter((name: string) => 
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
        
        // Try to get model details
        try {
          const modelResponse = await axios.get(`${this.baseUrl}/api/show`, {
            params: { name: modelName },
            timeout: 5000,
            validateStatus: () => true
          });
          
          if (modelResponse.status !== 200) {
            return {
              exists: true,
              isMultimodal: modelName.includes('llava') || 
                            modelName.includes('bakllava') || 
                            modelName.includes('moondream') || 
                            modelName.includes('deepseek'),
              needsPull: false
            };
          }
          
          // Check if the model is multimodal
          const modelInfo = modelResponse.data;
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
          
          return {
            exists: true,
            isMultimodal,
            needsPull: false
          };
          
        } catch (error) {
          // Return exists=true even if details can't be fetched
          return {
            exists: true,
            isMultimodal: modelName.includes('llava') || 
                          modelName.includes('bakllava') || 
                          modelName.includes('moondream') || 
                          modelName.includes('deepseek'),
            needsPull: false
          };
        }
        
      } catch (error: any) {
        // Check if the error is because Ollama is not running
        if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
          return {
            exists: false,
            error: `Unable to connect to Ollama. Is Ollama running at ${this.baseUrl}?`
          };
        }
        
        return {
          exists: false,
          error: `Failed to verify model: ${error.message}`
        };
      }
      
    } catch (error: any) {
      return {
        exists: false,
        error: `Failed to verify model: ${error.message}`
      };
    }
  }

  /**
   * Generate a response using Ollama API
   * @param messages Array of messages to send to Ollama
   * @param model Ollama model to use
   * @param streaming Whether to use streaming mode
   * @returns Response or stream from Ollama
   */
  public async generate(
    messages: MessageContent[],
    model: string,
    streaming = false
  ): Promise<string | EventEmitter> {
    try {
      // Format messages for Ollama
      console.log(`Preparing to generate with Ollama using model: ${model}`);
      
      // Check if we're using deepseek-r1 model
      const isDeepseek = model.toLowerCase().includes('deepseek-r1');
      
      // Format messages for Ollama
      const ollamaMessages: any[] = [];
      
      // Special handling for deepseek models
      if (isDeepseek) {
        return this.generateWithDeepseek(messages, model, streaming);
      }
      
      // Standard format for non-deepseek models
      for (const msg of messages) {
        if ('role' in msg) {
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
            throw new Error(`Failed to process image: ${error}`);
          }
        }
      }
      
      if (streaming) {
        return this.streamGenerateWithOllama(ollamaMessages, model);
      } else {
        // Try generating with the chat API endpoint 
        let response;
        
        try {
          // First try with the chat endpoint
          console.log("Attempting to use /api/chat endpoint...");
          response = await axios.post(`${this.baseUrl}/api/chat`, {
            model: model,
            messages: ollamaMessages,
            stream: false,
          }, {
            timeout: 120000 // Increased timeout to 2 minutes
          });
          
          return response.data.message.content;
        } catch (chatError) {
          console.error("Error with /api/chat endpoint:", chatError);
          
          // Fallback to generate API if chat fails
          console.log("Falling back to /api/generate endpoint...");
          
          // Construct a prompt from the messages
          let prompt = "";
          for (const msg of ollamaMessages) {
            if (typeof msg.content === 'string') {
              prompt += `${msg.role === 'assistant' ? 'Assistant: ' : 'User: '}${msg.content}\n\n`;
            } else if (Array.isArray(msg.content)) {
              // For messages with images, we still need to include any text
              const textParts = msg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text);
              if (textParts.length > 0) {
                prompt += `${msg.role === 'assistant' ? 'Assistant: ' : 'User: '}${textParts.join(' ')}\n\n`;
              } else {
                prompt += `${msg.role === 'assistant' ? 'Assistant: ' : 'User: '}[Image provided]\n\n`;
              }
            }
          }
          
          prompt += "Assistant: ";
          
          // Try the generate endpoint
          try {
            response = await axios.post(`${this.baseUrl}/api/generate`, {
              model: model,
              prompt: prompt,
              stream: false,
            }, {
              timeout: 120000
            });
            
            return response.data.response;
          } catch (generateError) {
            // If both methods fail, rethrow the original error
            throw chatError;
          }
        }
      }
    } catch (error: any) {
      console.error("Error generating with Ollama:", error.message);
      throw new Error(`Ollama API error: ${error.message}`);
    }
  }

  /**
   * Generate a response using Ollama with streaming
   * @param messages Formatted messages for Ollama
   * @param model Ollama model to use
   * @returns EventEmitter for streaming
   */
  private async streamGenerateWithOllama(messages: any[], model: string): Promise<EventEmitter> {
    const emitter = new EventEmitter();
    
    try {
      // Try generating with the chat API endpoint
      const controller = new AbortController();
      const signal = controller.signal;
      
      console.log("Streaming with /api/chat endpoint...");
      
      // Set up streaming
      const response = await axios.post(
        `${this.baseUrl}/api/chat`,
        {
          model: model,
          messages: messages,
          stream: true,
        },
        {
          timeout: 300000, // 5 minute timeout for streaming
          signal,
          responseType: 'stream'
        }
      );
      
      let fullResponse = '';
      
      response.data.on('data', (chunk: Buffer) => {
        try {
          const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
          
          for (const line of lines) {
            try {
              const json = JSON.parse(line);
              if (json.message?.content) {
                const content = json.message.content;
                fullResponse += content;
                emitter.emit('chunk', content);
              }
            } catch (jsonError) {
              // Skip non-JSON lines
            }
          }
        } catch (error) {
          console.error("Error processing stream chunk:", error);
        }
      });
      
      response.data.on('end', () => {
        emitter.emit('end', fullResponse);
      });
      
      response.data.on('error', (error: Error) => {
        console.error("Stream error:", error);
        emitter.emit('error', error);
      });
      
      // Allow for cancellation
      emitter.on('cancel', () => {
        controller.abort();
      });
      
    } catch (error: any) {
      // Attempt fallback to non-streaming if streaming fails
      console.error("Error in streaming mode:", error.message);
      
      try {
        // Try regular request as fallback
        const response = await this.generate([], model, false);
        if (typeof response === 'string') {
          emitter.emit('chunk', response);
          emitter.emit('end', response);
        } else {
          throw new Error('Unexpected response type from fallback');
        }
      } catch (fallbackError: any) {
        emitter.emit('error', fallbackError);
      }
    }
    
    return emitter;
  }

  /**
   * Special handling for deepseek models
   * @param messages Array of messages to send to Ollama
   * @param model Ollama model to use
   * @param streaming Whether to use streaming mode
   * @returns Response from Ollama
   */
  private async generateWithDeepseek(
    messages: MessageContent[],
    model: string,
    streaming = false
  ): Promise<string | EventEmitter> {
    // Extract all images
    const imageList: string[] = [];
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
    
    if (streaming) {
      // Create emitter for streaming
      const emitter = new EventEmitter();
      
      // Process in background
      (async () => {
        try {
          // Attempt deepseek format with generate endpoint
          const response = await axios.post(`${this.baseUrl}/api/generate`, {
            model: model,
            prompt: textPrompt,
            images: imageList,
            stream: false
          }, {
            timeout: 180000 // 3 minutes
          });
          
          // Emit the whole response as one chunk
          emitter.emit('chunk', response.data.response);
          emitter.emit('end', response.data.response);
        } catch (error: any) {
          // Try alternative approach
          try {
            // Create a message with the text first, then all images
            const ollamaMessages = [{ role: "user", content: textPrompt }];
            
            const chatResponse = await axios.post(`${this.baseUrl}/api/chat`, {
              model: model,
              messages: ollamaMessages,
              images: imageList,
              stream: false
            }, {
              timeout: 180000 // 3 minutes
            });
            
            // Emit the whole response as one chunk
            emitter.emit('chunk', chatResponse.data.message.content);
            emitter.emit('end', chatResponse.data.message.content);
          } catch (alternativeError: any) {
            emitter.emit('error', error);
          }
        }
      })();
      
      return emitter;
    } else {
      try {
        // Attempt deepseek format with generate endpoint
        const response = await axios.post(`${this.baseUrl}/api/generate`, {
          model: model,
          prompt: textPrompt,
          images: imageList,
          stream: false
        }, {
          timeout: 180000 // 3 minutes
        });
        
        return response.data.response;
      } catch (error) {
        // Try alternative approach
        try {
          // Create a message with the text first, then all images
          const ollamaMessages = [{ role: "user", content: textPrompt }];
          
          const chatResponse = await axios.post(`${this.baseUrl}/api/chat`, {
            model: model,
            messages: ollamaMessages,
            images: imageList,
            stream: false
          }, {
            timeout: 180000 // 3 minutes
          });
          
          return chatResponse.data.message.content;
        } catch (alternativeError) {
          throw error;
        }
      }
    }
  }
} 