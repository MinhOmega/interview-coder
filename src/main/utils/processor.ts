import * as fs from 'fs-extra';
import * as path from 'path';
import { AIServiceFactory } from '../services/ai-factory';

interface ScreenshotData {
  path: string;
  data?: string; // Base64 data if available
}

/**
 * Manages processing screenshots with AI services
 */
export class ScreenshotProcessor {
  private screenshots: ScreenshotData[] = [];
  private lastPrompt: string = '';
  private lastResult: string = '';
  private screenshotsDir: string;
  private aiFactory: AIServiceFactory;

  /**
   * Creates a new ScreenshotProcessor
   * @param aiFactory Factory for AI services
   * @param screenshotsDir Directory to store screenshots
   */
  constructor(aiFactory: AIServiceFactory, screenshotsDir: string) {
    this.aiFactory = aiFactory;
    this.screenshotsDir = screenshotsDir;
  }

  /**
   * Adds a screenshot to the collection
   * @param path Path to the screenshot file
   * @param data Optional base64 data of the image
   */
  addScreenshot(path: string, data?: string): void {
    this.screenshots.push({ path, data });
    console.log(`Added screenshot ${this.screenshots.length}: ${path}`);
  }

  /**
   * Gets the number of screenshots currently stored
   */
  getScreenshotCount(): number {
    return this.screenshots.length;
  }

  /**
   * Clears all stored screenshots
   */
  reset(): void {
    this.screenshots = [];
    console.log('Reset screenshot processor');
  }

  /**
   * Checks if there's a history of previous processing
   */
  hasHistory(): boolean {
    return !!this.lastPrompt && !!this.lastResult;
  }

  /**
   * Processes a single screenshot
   * @param imagePath Path to the screenshot
   * @param imageData Optional base64 data of the image
   * @returns Promise with the AI analysis result
   */
  async processScreenshot(imagePath: string, imageData?: string): Promise<string> {
    try {
      // Add to the collection
      this.addScreenshot(imagePath, imageData);
      
      // Generate a prompt for the AI
      const prompt = this.generatePrompt(false);
      this.lastPrompt = prompt;
      
      // Get the current AI service
      const aiService = this.aiFactory.getService();
      
      // Process the images
      const result = await aiService.processImages(
        prompt,
        this.screenshots.map(s => s.path)
      );
      
      this.lastResult = result;
      return result;
    } catch (error) {
      console.error('Error processing screenshot:', error);
      throw error;
    }
  }

  /**
   * Processes all stored screenshots
   * @returns Promise with the AI analysis result
   */
  async processAllScreenshots(): Promise<string> {
    try {
      if (this.screenshots.length === 0) {
        throw new Error('No screenshots to process');
      }
      
      // Generate a prompt for the AI
      const prompt = this.generatePrompt(true);
      this.lastPrompt = prompt;
      
      // Get the current AI service
      const aiService = this.aiFactory.getService();
      
      // Process the images
      const result = await aiService.processImages(
        prompt,
        this.screenshots.map(s => s.path)
      );
      
      this.lastResult = result;
      return result;
    } catch (error) {
      console.error('Error processing screenshots:', error);
      throw error;
    }
  }

  /**
   * Repeats the last processing with the same prompt and screenshots
   * @returns Promise with the AI analysis result
   */
  async repeatLastProcess(): Promise<string> {
    try {
      if (!this.lastPrompt || this.screenshots.length === 0) {
        throw new Error('No previous analysis to repeat');
      }
      
      // Get the current AI service
      const aiService = this.aiFactory.getService();
      
      // Process the images with the last prompt
      const result = await aiService.processImages(
        this.lastPrompt,
        this.screenshots.map(s => s.path)
      );
      
      this.lastResult = result;
      return result;
    } catch (error) {
      console.error('Error repeating process:', error);
      throw error;
    }
  }

  /**
   * Generates a prompt for the AI based on screenshots
   * @param isMulti Whether this is for multiple screenshots
   * @returns Generated prompt
   */
  private generatePrompt(isMulti: boolean): string {
    const count = this.screenshots.length;
    
    if (isMulti && count > 1) {
      return `I have ${count} images of a coding problem or documentation. These images should be considered together as one continuous document. Please analyze these screenshots and provide a full understanding of the content. If it's a coding problem, explain the problem and provide a detailed solution with code examples. If there's any diagram or visualization, describe what it shows.`;
    } else {
      return `Please analyze this screenshot and tell me what you see. If it contains code, a problem statement, or documentation, provide a detailed explanation. If it's a coding problem, provide a solution with code examples. If there's any diagram or visualization, describe what it shows.`;
    }
  }
} 