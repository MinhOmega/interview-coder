import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { MessageContent } from '../types';
import { EventEmitter } from 'events';

export class GeminiService {
  private client: GoogleGenerativeAI | null = null;

  constructor(apiKey?: string) {
    if (apiKey) {
      this.initialize(apiKey);
    }
  }

  /**
   * Initialize the Gemini client with the API key
   * @param apiKey Gemini API key
   */
  public initialize(apiKey: string): void {
    if (!apiKey) {
      throw new Error('Gemini API key is required');
    }
    this.client = new GoogleGenerativeAI(apiKey);
    console.log('Gemini client initialized');
  }

  /**
   * Check if the Gemini client is initialized
   * @returns True if initialized, false otherwise
   */
  public isInitialized(): boolean {
    return this.client !== null;
  }

  /**
   * Generate a response using Gemini API
   * @param messages Array of messages to send to Gemini
   * @param model Gemini model to use
   * @param streaming Whether to use streaming mode
   * @returns Response or stream from Gemini
   */
  public async generate(
    messages: MessageContent[],
    model: string,
    streaming = false
  ): Promise<string | EventEmitter> {
    if (!this.client) {
      throw new Error('Gemini client is not initialized');
    }

    console.log(`Generating with Gemini using model: ${model}`);

    // Get the Gemini model
    const geminiModel = this.client.getGenerativeModel({ model });

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
      
      // Create an emitter to handle the stream
      const emitter = new EventEmitter();
      
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
          emitter.emit('end', fullResponse);
        } catch (error) {
          console.error("Error in Gemini stream processing:", error);
          emitter.emit('error', error);
        }
      })();
      
      return emitter;
    } else {
      // Standard non-streaming response
      const response = await geminiModel.generateContent({
        contents: [geminiContent],
        generationConfig: genConfig
      });
      
      return response.response.text();
    }
  }
} 