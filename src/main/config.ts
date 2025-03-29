import { app } from 'electron';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { AppConfig } from '../../types/app';

export class ConfigManager {
  private config: AppConfig;

  constructor() {
    // Load environment variables
    dotenv.config();

    // Check if running on macOS
    const isMac = process.platform === 'darwin';
    const modifierKey = isMac ? 'Command' : 'Ctrl';

    // Default values - use IPv4 address explicitly for Ollama
    const ollamaBaseUrl = process.env.OLLAMA_BASE_URL
      ? process.env.OLLAMA_BASE_URL.replace('localhost', '127.0.0.1')
      : 'http://127.0.0.1:11434';

    this.config = {
      OLLAMA_BASE_URL: ollamaBaseUrl,
      DEFAULT_MODEL: process.env.OPENAI_MODEL || 'gpt-4-vision-preview',
      DEFAULT_GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-pro-vision',
      DEFAULT_OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'deepseek-r1:14b',
      isMac,
      modifierKey,
    };

    // Set up additional environment variables
    process.env.PICTURES_PATH = app.getPath('pictures');
  }

  public getConfig(): AppConfig {
    return this.config;
  }

  public getOllamaBaseUrl(): string {
    return this.config.OLLAMA_BASE_URL;
  }

  public getDefaultModel(): string {
    return this.config.DEFAULT_MODEL;
  }

  public getDefaultGeminiModel(): string {
    return this.config.DEFAULT_GEMINI_MODEL;
  }

  public getDefaultOllamaModel(): string {
    return this.config.DEFAULT_OLLAMA_MODEL;
  }

  public isMacOS(): boolean {
    return this.config.isMac;
  }

  public getModifierKey(): string {
    return this.config.modifierKey;
  }
} 