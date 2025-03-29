import { OpenAI } from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

export type AIProvider = 'openai' | 'gemini' | 'ollama';

export interface AIMessage {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
  };
  role?: 'user' | 'assistant' | 'system';
  content?: string | Array<{ type: string; text?: string; data?: string }>;
}

export interface OllamaModelInfo {
  exists: boolean;
  isMultimodal: boolean;
  needsPull: boolean;
  error?: string;
  availableModels?: string[];
  suggestedModels?: string[];
}

export interface AIClients {
  openai?: OpenAI;
  geminiAI?: GoogleGenerativeAI;
}

export interface AIConfig {
  provider: AIProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface StreamingResult {
  streaming: boolean;
  emitter: NodeJS.EventEmitter;
  text: () => string;
}

export interface GenerateOptions {
  messages: AIMessage[];
  model: string;
  streaming?: boolean;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
} 