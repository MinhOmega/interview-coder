import { BrowserWindow } from 'electron';
import { ScreenshotHelper } from './ScreenshotHelper';

export interface IProcessingHelperDeps {
  getScreenshotHelper: () => ScreenshotHelper | null;
  getMainWindow: () => BrowserWindow | null;
  getView: () => "queue" | "solutions" | "debug";
  setView: (view: "queue" | "solutions" | "debug") => void;
  getProblemInfo: () => any;
  setProblemInfo: (info: any) => void;
  getScreenshotQueue: () => string[];
  getExtraScreenshotQueue: () => string[];
  clearQueues: () => void;
  takeScreenshot: () => Promise<string>;
  getImagePreview: (filepath: string) => Promise<string>;
  deleteScreenshot: (path: string) => Promise<{ success: boolean; error?: string }>;
  setHasDebugged: (value: boolean) => void;
  getHasDebugged: () => boolean;
  PROCESSING_EVENTS: {
    UNAUTHORIZED: string;
    NO_SCREENSHOTS: string;
    OUT_OF_CREDITS: string;
    API_KEY_INVALID: string;
    INITIAL_START: string;
    PROBLEM_EXTRACTED: string;
    SOLUTION_SUCCESS: string;
    INITIAL_SOLUTION_ERROR: string;
    DEBUG_START: string;
    DEBUG_SUCCESS: string;
    DEBUG_ERROR: string;
  };
}

/**
 * Helper class to process screenshots and interact with AI service
 */
export class ProcessingHelper {
  private deps: IProcessingHelperDeps;
  private isProcessing: boolean = false;

  constructor(deps: IProcessingHelperDeps) {
    this.deps = deps;
  }

  /**
   * Process the screenshots in the queue
   */
  async processScreenshots(): Promise<void> {
    // Get the main window
    const mainWindow = this.deps.getMainWindow();
    if (!mainWindow) {
      console.error('No main window available');
      return;
    }

    // Check if already processing
    if (this.isProcessing) {
      mainWindow.webContents.send('notification', {
        body: 'Already processing screenshots. Please wait...',
        type: 'warning'
      });
      return;
    }

    // Get screenshot queue
    const queue = this.deps.getScreenshotQueue();
    if (queue.length === 0) {
      mainWindow.webContents.send('notification', {
        body: 'No screenshots to process. Use the screenshot button first.',
        type: 'error'
      });
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
      return;
    }

    // Set processing state
    this.isProcessing = true;
    mainWindow.webContents.send('loading', true);
    mainWindow.webContents.send('update-instruction', 'Processing screenshots...');

    try {
      // For demo, just simulate a delay and send a response
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Add some dummy processing result
      const response = {
        result: `# Problem Analysis\n\nBased on the screenshot, this appears to be a coding interview problem. Let me analyze it.\n\n## Problem Statement\n\nThe problem asks us to implement a solution for a coding challenge.\n\n## Example Solution\n\n\`\`\`javascript\nfunction solution(input) {\n  // This is a demonstration solution\n  return input.map(x => x * 2).filter(x => x > 10);\n}\n\`\`\`\n\n## Time Complexity\n\nThe time complexity of this solution is O(n) where n is the input size.\n\n## Space Complexity\n\nThe space complexity is O(n) for storing the result.`
      };

      // Send result to renderer process
      mainWindow.webContents.send('loading', false);
      mainWindow.webContents.send('hide-instruction');
      mainWindow.webContents.send('analysis-result', response.result);
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.SOLUTION_SUCCESS);
    } catch (error) {
      console.error('Error processing screenshots:', error);
      
      mainWindow.webContents.send('loading', false);
      mainWindow.webContents.send('hide-instruction');
      mainWindow.webContents.send('error', 'Failed to process screenshots. Please try again.');
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Debug the current problem with additional screenshots
   */
  async debugProblem(): Promise<void> {
    // Similar implementation as processScreenshots, but for debugging
    // This would be triggered by the "Report error in solution" button
    const mainWindow = this.deps.getMainWindow();
    if (!mainWindow) {
      console.error('No main window available');
      return;
    }

    mainWindow.webContents.send('notification', {
      body: 'Debug functionality is a stub in this demo.',
      type: 'warning'
    });
  }

  /**
   * Check if images are being processed
   */
  isCurrentlyProcessing(): boolean {
    return this.isProcessing;
  }
} 