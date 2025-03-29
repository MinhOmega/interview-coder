/** Types for AI providers */
export type AIProvider = 'openai' | 'gemini' | 'ollama';

/** Types for OpenAI models */
export interface OpenAISettings {
  apiKey: string;
  model: string;
}

/** Types for Ollama settings */
export interface OllamaSettings {
  baseUrl: string;
  model: string;
}

/** Types for Gemini settings */
export interface GeminiSettings {
  apiKey: string;
  model: string;
}

/** Types for application settings */
export interface AppSettings {
  aiProvider: AIProvider;
  openaiApiKey?: string;
  openaiModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  ollamaUrl?: string;
  ollamaModel?: string;
  currentModel?: string;
  multiScreenshotMode?: boolean;
}

/** Types for screenshot result */
export interface ScreenshotResult {
  path: string;
  isArea: boolean;
  dimensions?: {
    width: number;
    height: number;
  };
}

/** Types for message content */
export interface MessageContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
  };
}

/** Types for stream response */
export interface StreamResponse {
  content: string;
  done: boolean;
}

/** Types for area selection */
export interface AreaSelection {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Types for model verification result */
export interface ModelVerificationResult {
  exists: boolean;
  isMultimodal?: boolean;
  needsPull?: boolean;
  error?: string;
  availableModels?: string[];
  suggestedModels?: string[];
} 