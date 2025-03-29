import { OpenAI } from 'openai';
import { MessageContent } from '../types';
import { EventEmitter } from 'events';

export class OpenAIService {
  private client: OpenAI | null = null;

  constructor(apiKey?: string) {
    if (apiKey) {
      this.initialize(apiKey);
    }
  }

  /**
   * Initialize the OpenAI client with the API key
   * @param apiKey OpenAI API key
   */
  public initialize(apiKey: string): void {
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }
    this.client = new OpenAI({ apiKey });
    console.log('OpenAI client initialized');
  }

  /**
   * Check if the OpenAI client is initialized
   * @returns True if initialized, false otherwise
   */
  public isInitialized(): boolean {
    return this.client !== null;
  }

  /**
   * Format message content for OpenAI API
   * @param messages Array of message content
   * @returns Formatted messages for OpenAI API
   */
  private formatMessages(messages: MessageContent[]) {
    return messages.map(msg => {
      if (msg.type === 'text') {
        return { 
          role: 'user' as const, 
          content: msg.text || '' 
        };
      } else if (msg.type === 'image_url') {
        return {
          role: 'user' as const,
          content: [
            {
              type: 'image_url' as const,
              image_url: { url: msg.image_url?.url || '' }
            }
          ]
        };
      }
      return { role: 'user' as const, content: '' };
    });
  }

  /**
   * Generate a response using OpenAI API
   * @param messages Array of messages to send to OpenAI
   * @param model OpenAI model to use
   * @param streaming Whether to use streaming mode
   * @returns Response or stream from OpenAI
   */
  public async generate(
    messages: MessageContent[],
    model: string,
    streaming = false
  ): Promise<string | EventEmitter> {
    if (!this.client) {
      throw new Error('OpenAI client is not initialized');
    }

    console.log(`Generating with OpenAI using model: ${model}`);
    const formattedMessages = this.formatMessages(messages);

    if (streaming) {
      // Make the streaming request using OpenAI
      const stream = await this.client.chat.completions.create({
        model: model,
        messages: formattedMessages,
        max_tokens: 5000,
        stream: true,
      });

      // Create an emitter to handle the stream
      const emitter = new EventEmitter();

      // Process the stream
      (async () => {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              emitter.emit('chunk', content);
            }
          }
          emitter.emit('end');
        } catch (error) {
          emitter.emit('error', error);
        }
      })();

      return emitter;
    } else {
      // Non-streaming request
      const response = await this.client.chat.completions.create({
        model: model,
        messages: formattedMessages,
        max_tokens: 5000,
      });

      return response.choices[0].message.content || '';
    }
  }
} 