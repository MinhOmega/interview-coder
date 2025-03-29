import { OpenAI } from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import { EventEmitter } from 'events';
import {
  AIProvider,
  AIMessage,
  OllamaModelInfo,
  AIClients,
  StreamingResult,
  GenerateOptions
} from '../../types/ai';

export class AIService {
  private clients: AIClients = {};
  private currentProvider: AIProvider;
  private currentModel: string;
  private ollamaBaseUrl: string;

  constructor(
    provider: AIProvider = 'openai',
    model: string,
    openaiApiKey?: string,
    geminiApiKey?: string,
    ollamaBaseUrl: string = 'http://127.0.0.1:11434'
  ) {
    this.currentProvider = provider;
    this.currentModel = model;
    this.ollamaBaseUrl = ollamaBaseUrl.replace('localhost', '127.0.0.1');

    // Initialize OpenAI client if valid API key is provided
    if (typeof openaiApiKey === 'string' && openaiApiKey.trim() !== '' && openaiApiKey !== 'YOUR_OPENAI_API_KEY') {
      this.clients.openai = new OpenAI({ apiKey: openaiApiKey });
      console.log('OpenAI client initialized');
    }

    // Initialize Gemini client if valid API key is provided
    if (typeof geminiApiKey === 'string' && geminiApiKey.trim() !== '' && geminiApiKey !== 'YOUR_GEMINI_API_KEY') {
      this.clients.geminiAI = new GoogleGenerativeAI(geminiApiKey);
      console.log('Gemini AI client initialized');
    }
  }

  public async verifyOllamaModel(modelName: string): Promise<OllamaModelInfo> {
    try {
      console.log(`Verifying Ollama model: ${modelName}`);
      const apiUrl = this.ollamaBaseUrl;

      const modelsResponse = await axios.get(`${apiUrl}/api/tags`, {
        timeout: 5000,
      });

      if (modelsResponse.status !== 200) {
        return {
          exists: false,
          isMultimodal: false,
          needsPull: false,
          error: `Failed to get list of models (status ${modelsResponse.status})`,
        };
      }

      const modelsList = modelsResponse.data.models || [];
      const modelExists = modelsList.some((m: { name: string }) => m.name === modelName);

      if (!modelExists) {
        const availableModels = modelsList.map((m: { name: string }) => m.name);
        const visionModels = availableModels.filter(
          (name: string) =>
            name.includes('llava') ||
            name.includes('bakllava') ||
            name.includes('moondream') ||
            name.includes('deepseek'),
        );

        return {
          exists: false,
          isMultimodal: false,
          needsPull: false,
          error: `Model "${modelName}" is not available on your Ollama server`,
          availableModels,
          suggestedModels: visionModels.slice(0, 5),
        };
      }

      try {
        const modelResponse = await axios.get(`${apiUrl}/api/show`, {
          params: { name: modelName },
          timeout: 5000,
        });

        const isMultimodal = this.checkIfModelIsMultimodal(modelName, modelResponse.data);

        return {
          exists: true,
          isMultimodal,
          needsPull: false,
        };
      } catch (error) {
        return {
          exists: true,
          isMultimodal: this.checkIfModelIsMultimodal(modelName),
          needsPull: false,
        };
      }
    } catch (error) {
      const err = error as Error;
      return {
        exists: false,
        isMultimodal: false,
        needsPull: false,
        error: `Failed to verify model: ${err.message}`,
      };
    }
  }

  private checkIfModelIsMultimodal(modelName: string, modelInfo?: any): boolean {
    const multimodalFamilies = ['llava', 'bakllava', 'moondream', 'deepseek-vision', 'deepseek-r1'];

    if (modelInfo?.details?.families) {
      for (const family of modelInfo.details.families) {
        if (multimodalFamilies.some(f => family.toLowerCase().includes(f))) {
          return true;
        }
      }
    }

    return multimodalFamilies.some(family => modelName.toLowerCase().includes(family));
  }

  public async generate(options: GenerateOptions): Promise<string | StreamingResult> {
    switch (this.currentProvider) {
      case 'openai':
        return this.generateWithOpenAI(options);
      case 'gemini':
        return this.generateWithGemini(options);
      case 'ollama':
        return this.generateWithOllama(options);
      default:
        throw new Error(`Unknown AI provider: ${this.currentProvider}`);
    }
  }

  private async generateWithOpenAI(options: GenerateOptions): Promise<string | StreamingResult> {
    if (!this.clients.openai) {
      throw new Error('OpenAI client is not initialized');
    }

    const messages = options.messages.map(msg => {
      if (msg.type === 'text') {
        return {
          role: 'user' as const,
          content: msg.text
        };
      } else {
        return {
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: msg.text || '' },
            {
              type: 'image_url' as const,
              image_url: { url: msg.image_url?.url || '' }
            }
          ]
        };
      }
    });

    if (options.streaming) {
      const stream = await this.clients.openai.chat.completions.create({
        model: options.model,
        messages,
        max_tokens: options.maxTokens || 8000,
        stream: true,
      });

      const emitter = new EventEmitter();
      let fullResponse = '';

      (async () => {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              fullResponse += content;
              emitter.emit('chunk', content);
            }
          }
          emitter.emit('complete', fullResponse);
        } catch (error) {
          emitter.emit('error', error);
        }
      })();

      return {
        streaming: true,
        emitter,
        text: () => fullResponse,
      };
    }

    const response = await this.clients.openai.chat.completions.create({
      model: options.model,
      messages,
      max_tokens: options.maxTokens || 8000,
      stream: false,
    });

    return response.choices[0]?.message?.content || '';
  }

  private async generateWithGemini(options: GenerateOptions): Promise<string | StreamingResult> {
    if (!this.clients.geminiAI) {
      throw new Error('Gemini AI client is not initialized');
    }

    const model = this.clients.geminiAI.getGenerativeModel({ model: options.model });
    const contentParts = this.formatMessagesForGemini(options.messages);

    const genConfig = {
      temperature: options.temperature || 0.4,
      topP: options.topP || 0.95,
      topK: options.topK || 40,
      maxOutputTokens: options.maxTokens || 8192,
    };

    if (options.streaming) {
      const response = await model.generateContentStream({
        contents: [{ role: 'user', parts: [{ text: contentParts.map(part => part.text || '').join('\n') }] }],
        generationConfig: genConfig,
      });

      const emitter = new EventEmitter();
      let fullResponse = '';

      (async () => {
        try {
          for await (const chunk of response.stream) {
            const chunkText = chunk.text();
            fullResponse += chunkText;
            emitter.emit('chunk', chunkText);
          }
          emitter.emit('complete', fullResponse);
        } catch (error) {
          emitter.emit('error', error);
        }
      })();

      return {
        streaming: true,
        emitter,
        text: () => fullResponse,
      };
    }

    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: contentParts.map(part => part.text || '').join('\n') }] }],
      generationConfig: genConfig,
    });

    return response.response.text();
  }

  private formatMessagesForGemini(messages: AIMessage[]): Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> {
    return messages.map(message => {
      if (message.type === 'text') {
        return { text: message.text };
      } else if (message.type === 'image_url') {
        const base64Data = message.image_url?.url.split(',')[1];
        if (!base64Data) {
          throw new Error('Invalid base64 data in image');
        }
        return {
          inlineData: {
            data: base64Data,
            mimeType: 'image/png',
          },
        };
      }
      throw new Error(`Unknown message type: ${message.type}`);
    });
  }

  private async generateWithOllama(options: GenerateOptions): Promise<string> {
    try {
      const isDeepseek = options.model.toLowerCase().includes('deepseek-r1');
      const messages = this.formatMessagesForOllama(options.messages, isDeepseek);

      const apiUrl = this.ollamaBaseUrl;
      let response;

      try {
        response = await axios.post(
          `${apiUrl}/api/chat`,
          {
            model: options.model,
            messages,
            stream: false,
          },
          { timeout: 120000 }
        );

        return response.data.message.content;
      } catch (chatError) {
        console.error('Error with /api/chat endpoint:', chatError);

        // Fallback to generate API
        const prompt = this.constructOllamaPrompt(messages);
        response = await axios.post(
          `${apiUrl}/api/generate`,
          {
            model: options.model,
            prompt,
            stream: false,
          },
          { timeout: 120000 }
        );

        return response.data.response;
      }
    } catch (error) {
      const err = error as Error;
      throw new Error(`Ollama API error: ${err.message}`);
    }
  }

  private formatMessagesForOllama(messages: AIMessage[], isDeepseek: boolean): any[] {
    if (isDeepseek) {
      const imageList: string[] = [];
      let textPrompt = '';

      for (const msg of messages) {
        if (msg.type === 'text') {
          textPrompt += msg.text + '\n';
        } else if (msg.type === 'image_url') {
          const base64Image = msg.image_url?.url.split(',')[1];
          if (base64Image) {
            imageList.push(base64Image);
          }
        }
      }

      return [{ role: 'user', content: textPrompt, images: imageList }];
    }

    return messages.map(msg => {
      if (msg.role) {
        return msg;
      }

      if (msg.type === 'text') {
        return { role: 'user', content: msg.text };
      }

      const base64Image = msg.image_url?.url.split(',')[1];
      return {
        role: 'user',
        content: [{ type: 'image', data: base64Image }],
      };
    });
  }

  private constructOllamaPrompt(messages: any[]): string {
    let prompt = '';
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        prompt += `${msg.role === 'assistant' ? 'Assistant: ' : 'User: '}${msg.content}\n\n`;
      } else if (Array.isArray(msg.content)) {
        const textParts = msg.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text);
        if (textParts.length > 0) {
          prompt += `${msg.role === 'assistant' ? 'Assistant: ' : 'User: '}${textParts.join(' ')}\n\n`;
        } else {
          prompt += `${msg.role === 'assistant' ? 'Assistant: ' : 'User: '}[Image provided]\n\n`;
        }
      }
    }
    return prompt + 'Assistant: ';
  }
} 