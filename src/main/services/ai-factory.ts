import axios from 'axios';
import { AIProvider, ModelVerificationResult } from '../types';
import { OpenAIService } from './openai';
import { OllamaService } from './ollama';

/**
 * Base interface for AI services
 */
export interface AIService {
  /**
   * Process images with AI
   * @param prompt Text prompt to send to the AI
   * @param imagePaths Array of image paths to process
   */
  processImages(prompt: string, imagePaths: string[]): Promise<string>;
}

/**
 * Factory class to create and manage AI services
 */
export class AIServiceFactory {
  private currentProvider: AIProvider;
  private openaiService: OpenAIService | null = null;
  private geminiService: any | null = null;
  private ollamaService: OllamaService | null = null;
  
  /**
   * Creates a new AIServiceFactory
   * @param initialProvider The initial AI provider to use
   */
  constructor(initialProvider: AIProvider = 'openai') {
    this.currentProvider = initialProvider;
  }
  
  /**
   * Sets the current AI provider
   * @param provider Provider to use
   */
  setProvider(provider: AIProvider): void {
    this.currentProvider = provider;
    console.log(`AI provider set to: ${provider}`);
  }
  
  /**
   * Gets the current AI service based on the selected provider
   * @returns The current AI service
   */
  getService(): AIService {
    switch (this.currentProvider) {
      case 'openai':
        if (!this.openaiService) {
          this.openaiService = new OpenAIService();
        }
        return this.openaiService as unknown as AIService;
        
      case 'gemini':
        if (!this.geminiService) {
          this.geminiService = {}; // Placeholder
        }
        return this.geminiService as AIService;
        
      case 'ollama':
        if (!this.ollamaService) {
          this.ollamaService = new OllamaService();
        }
        return this.ollamaService as unknown as AIService;
        
      default:
        throw new Error(`Unknown AI provider: ${this.currentProvider}`);
    }
  }
  
  /**
   * Fetches available models from Ollama
   * @param url Ollama server URL
   * @returns Promise with array of model names
   */
  async getOllamaModels(url: string): Promise<string[]> {
    try {
      // Create a temporary service instance
      const ollamaService = new OllamaService(url);
      return await ollamaService.getModels();
    } catch (error) {
      console.error('Error fetching Ollama models:', error);
      throw new Error(`Failed to fetch Ollama models: ${(error as Error).message}`);
    }
  }
  
  /**
   * Verify if a model exists and supports vision
   * @param modelName Name of the model to verify
   * @returns Promise with verification result
   */
  async verifyModel(modelName: string): Promise<ModelVerificationResult> {
    try {
      if (this.currentProvider === 'ollama') {
        if (!this.ollamaService) {
          this.ollamaService = new OllamaService();
        }
        return await this.ollamaService.verifyModel(modelName);
      }
      
      // For other providers, return a default result
      return {
        exists: true,
        isMultimodal: true,
        needsPull: false
      };
    } catch (error) {
      return {
        exists: false,
        error: `Failed to verify model: ${(error as Error).message}`
      };
    }
  }
} 