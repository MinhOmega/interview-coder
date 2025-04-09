import { v4 as uuidv4 } from 'uuid';
import { sendIpcMessage, invokeIpcMethod } from '../hooks/useElectron';
import { AIService } from './AIService';

export interface Screenshot {
  id: string;
  preview: string;
  timestamp: number;
  data: string; // Base64 data
}

class ScreenshotService {
  private screenshots: Screenshot[] = [];
  private multiMode: boolean = false;
  
  // Get all screenshots
  getScreenshots(): Screenshot[] {
    return [...this.screenshots];
  }
  
  // Add a screenshot
  addScreenshot(base64Data: string): Screenshot {
    const newScreenshot: Screenshot = {
      id: uuidv4(),
      preview: base64Data,
      timestamp: Date.now(),
      data: base64Data
    };
    
    this.screenshots.push(newScreenshot);
    
    // Send notification about successful screenshot
    sendIpcMessage('notification', {
      body: 'Screenshot captured successfully',
      type: 'success'
    });
    
    return newScreenshot;
  }
  
  // Remove a screenshot by ID
  removeScreenshot(id: string): boolean {
    const initialLength = this.screenshots.length;
    this.screenshots = this.screenshots.filter(shot => shot.id !== id);
    return initialLength !== this.screenshots.length;
  }
  
  // Clear all screenshots
  clearAll(): void {
    this.screenshots = [];
    this.multiMode = false;
  }
  
  // Get screenshot count
  getCount(): number {
    return this.screenshots.length;
  }
  
  // Set multi-mode state
  setMultiMode(enabled: boolean): void {
    this.multiMode = enabled;
  }
  
  // Check if multi-mode is enabled
  isMultiMode(): boolean {
    return this.multiMode;
  }
  
  // Take a full screenshot
  async takeFullScreenshot(): Promise<Screenshot> {
    return new Promise((resolve, reject) => {
      const listener = (window as any).ipcRenderer.once('screenshot-data', async (_: any, data: string) => {
        try {
          const screenshot = this.addScreenshot(data);
          
          // After adding the screenshot, automatically process it with AI
          await this.processScreenshots();
          
          resolve(screenshot);
        } catch (error) {
          reject(error);
        }
      });
      
      sendIpcMessage('take-screenshot');
    });
  }
  
  // Take an area screenshot
  async takeAreaScreenshot(area: { x: number, y: number, width: number, height: number }): Promise<Screenshot> {
    return new Promise((resolve, reject) => {
      const listener = (window as any).ipcRenderer.once('area-screenshot-data', async (_: any, data: string) => {
        try {
          const screenshot = this.addScreenshot(data);
          
          // After adding the screenshot, automatically process it with AI
          await this.processScreenshots();
          
          resolve(screenshot);
        } catch (error) {
          reject(error);
        }
      });
      
      sendIpcMessage('capture-selected-area', area);
    });
  }
  
  // Process screenshots with AI
  async processScreenshots(useStreaming = true): Promise<void> {
    try {
      if (this.screenshots.length === 0) {
        throw new Error('No screenshots to process');
      }

      // Get the screenshots data
      const screenshotsData = this.screenshots.map(shot => shot.data);
      
      // Use AIService to analyze the screenshots
      await AIService.analyzeScreenshots(screenshotsData, useStreaming);
    } catch (error) {
      console.error('Error processing screenshots:', error);
      sendIpcMessage('notification', {
        body: `Failed to process screenshots: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error'
      });
      throw error;
    }
  }
  
  /**
   * Capture and process a screenshot with AI
   * @returns Promise that resolves when the screenshot is taken and sent for processing
   */
  async captureAndProcess(): Promise<void> {
    try {
      // First notify the user that we're taking a screenshot
      sendIpcMessage('notification', { 
        body: 'Taking screenshot...',
        type: 'info'
      });
      
      // Take the screenshot
      await this.takeFullScreenshot();
      // Processing is now handled automatically in takeFullScreenshot
    } catch (error) {
      console.error('Error capturing screenshot:', error);
      sendIpcMessage('notification', {
        body: `Failed to capture screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error'
      });
      throw error;
    }
  }
  
  /**
   * Add a new screenshot to continue the conversation context
   * @returns Promise that resolves when the additional screenshot is captured and processed
   */
  async addContextScreenshot(): Promise<void> {
    try {
      sendIpcMessage('notification', {
        body: 'Adding context screenshot...',
        type: 'info'
      });
      
      // Take a new screenshot and process it
      await this.takeFullScreenshot();
    } catch (error) {
      console.error('Error adding context screenshot:', error);
      sendIpcMessage('notification', {
        body: `Failed to add context: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error'
      });
      throw error;
    }
  }
  
  /**
   * Report an error in the AI solution
   * @param errorDescription User's description of the error
   */
  reportSolutionError(errorDescription: string): void {
    if (!errorDescription || errorDescription.trim() === '') {
      return;
    }
    
    AIService.reportError(errorDescription);
  }
}

// Create and export singleton instance
export const screenshotService = new ScreenshotService();

export default screenshotService; 