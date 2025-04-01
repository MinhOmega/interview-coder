import { v4 as uuidv4 } from 'uuid';
import { sendIpcMessage, invokeIpcMethod } from '../hooks/useElectron';

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
  takeFullScreenshot(): Promise<Screenshot> {
    return new Promise((resolve, reject) => {
      const listener = (window as any).ipcRenderer.once('screenshot-data', (_: any, data: string) => {
        try {
          const screenshot = this.addScreenshot(data);
          resolve(screenshot);
        } catch (error) {
          reject(error);
        }
      });
      
      sendIpcMessage('take-screenshot');
    });
  }
  
  // Take an area screenshot
  takeAreaScreenshot(area: { x: number, y: number, width: number, height: number }): Promise<Screenshot> {
    return new Promise((resolve, reject) => {
      const listener = (window as any).ipcRenderer.once('area-screenshot-data', (_: any, data: string) => {
        try {
          const screenshot = this.addScreenshot(data);
          resolve(screenshot);
        } catch (error) {
          reject(error);
        }
      });
      
      sendIpcMessage('capture-selected-area', area);
    });
  }
  
  // Process screenshots with AI
  processScreenshots(useStreaming = true): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Convert screenshots to the format expected by the main process
        const screenshotsData = this.screenshots.map(shot => shot.data);
        
        // Send the screenshots to the main process
        sendIpcMessage('process-screenshots-with-ai', screenshotsData);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
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
      
      // Call the main process to handle the screenshot capture
      const result = await invokeIpcMethod<boolean>('capture-screenshot-and-process');
      
      if (!result) {
        throw new Error('Failed to capture screenshot');
      }
    } catch (error) {
      console.error('Error capturing screenshot:', error);
      sendIpcMessage('notification', {
        body: `Failed to capture screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error'
      });
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
      
      // Call the main process to handle adding a context screenshot
      sendIpcMessage('add-context-screenshot');
    } catch (error) {
      console.error('Error adding context screenshot:', error);
      sendIpcMessage('notification', {
        body: `Failed to add context: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error'
      });
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
    
    sendIpcMessage('report-solution-error', errorDescription);
  }
}

// Create and export singleton instance
export const screenshotService = new ScreenshotService();

export default screenshotService; 