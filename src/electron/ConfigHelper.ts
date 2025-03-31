import { app } from 'electron';
import fs from 'fs';
import path from 'path';

interface AppConfig {
  apiKey?: string;
  aiProvider: string;
  currentModel: string;
  ollamaUrl?: string;
  opacity: number;
}

/**
 * Helper class to manage application configuration
 */
class ConfigHelper {
  private configFilePath: string;
  private config: AppConfig;

  constructor() {
    this.configFilePath = path.join(app.getPath('userData'), 'config.json');
    this.config = this.loadConfig();
  }

  /**
   * Load configuration from disk
   */
  private loadConfig(): AppConfig {
    try {
      if (fs.existsSync(this.configFilePath)) {
        const configData = fs.readFileSync(this.configFilePath, 'utf8');
        return JSON.parse(configData);
      }
    } catch (error) {
      console.error('Error reading config file:', error);
    }

    // Default configuration
    return {
      aiProvider: 'openai',
      currentModel: 'gpt-4o-mini',
      ollamaUrl: 'http://127.0.0.1:11434',
      opacity: 1.0
    };
  }

  /**
   * Save configuration to disk
   */
  private saveConfig(): void {
    try {
      fs.writeFileSync(
        this.configFilePath,
        JSON.stringify(this.config, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('Error saving config file:', error);
    }
  }

  /**
   * Get API key
   */
  getApiKey(): string | undefined {
    return this.config.apiKey;
  }

  /**
   * Check if API key is set
   */
  hasApiKey(): boolean {
    return !!this.config.apiKey;
  }

  /**
   * Set API key
   */
  setApiKey(apiKey: string): void {
    this.config.apiKey = apiKey;
    this.saveConfig();
  }

  /**
   * Get AI provider
   */
  getAiProvider(): string {
    return this.config.aiProvider;
  }

  /**
   * Set AI provider
   */
  setAiProvider(provider: string): void {
    this.config.aiProvider = provider;
    this.saveConfig();
  }

  /**
   * Get current model
   */
  getCurrentModel(): string {
    return this.config.currentModel;
  }

  /**
   * Set current model
   */
  setCurrentModel(model: string): void {
    this.config.currentModel = model;
    this.saveConfig();
  }

  /**
   * Get Ollama URL
   */
  getOllamaUrl(): string {
    return this.config.ollamaUrl || 'http://127.0.0.1:11434';
  }

  /**
   * Set Ollama URL
   */
  setOllamaUrl(url: string): void {
    this.config.ollamaUrl = url;
    this.saveConfig();
  }

  /**
   * Get window opacity
   */
  getOpacity(): number {
    return this.config.opacity || 1.0;
  }

  /**
   * Set window opacity
   */
  setOpacity(opacity: number): void {
    this.config.opacity = opacity;
    this.saveConfig();
  }

  /**
   * Update model settings
   */
  updateModelSettings(settings: {
    aiProvider: string;
    currentModel: string;
    ollamaUrl?: string;
  }): void {
    this.config.aiProvider = settings.aiProvider;
    this.config.currentModel = settings.currentModel;
    
    if (settings.ollamaUrl) {
      this.config.ollamaUrl = settings.ollamaUrl;
    }
    
    this.saveConfig();
  }
}

// Export a singleton instance
export const configHelper = new ConfigHelper(); 