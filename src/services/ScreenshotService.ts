import { sendIpcMessage, invokeIpcMethod } from '../hooks/useElectron';

/**
 * Service to handle screenshot operations and AI processing
 */
export class ScreenshotService {
  /**
   * Take a screenshot and process it with the AI
   * @returns Promise that resolves when the screenshot is taken and sent for processing
   */
  static async captureAndProcess(): Promise<void> {
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
   * Process existing screenshots with AI
   * @param useStreaming Whether to use streaming for the AI response
   * @returns Promise that resolves when processing starts
   */
  static async processExistingScreenshots(useStreaming = true): Promise<void> {
    try {
      sendIpcMessage('notification', {
        body: 'Processing screenshots...',
        type: 'info'
      });
      
      // Show loading state
      sendIpcMessage('loading', true);
      
      // Request main process to process screenshots
      sendIpcMessage('process-screenshots', useStreaming);
    } catch (error) {
      console.error('Error processing screenshots:', error);
      sendIpcMessage('notification', {
        body: `Failed to process screenshots: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error'
      });
      
      // Hide loading state on error
      sendIpcMessage('loading', false);
    }
  }

  /**
   * Add a new screenshot to continue the conversation context
   * @returns Promise that resolves when the additional screenshot is captured and processed
   */
  static async addContextScreenshot(): Promise<void> {
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
  static reportSolutionError(errorDescription: string): void {
    if (!errorDescription || errorDescription.trim() === '') {
      return;
    }
    
    sendIpcMessage('report-solution-error', errorDescription);
  }
} 