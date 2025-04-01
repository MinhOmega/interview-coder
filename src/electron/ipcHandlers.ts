import { BrowserWindow, ipcMain } from 'electron';
import { ProcessingHelper } from './ProcessingHelper';

// Define the interface for dependencies that will be injected
interface IpcHandlerDeps {
  getMainWindow: () => BrowserWindow | null;
  setWindowDimensions: (width: number, height: number) => void;
  toggleMainWindow: () => void;
  getView: () => "queue" | "solutions" | "debug";
  getScreenshotQueue: () => string[];
  getExtraScreenshotQueue: () => string[];
  deleteScreenshot: (path: string) => Promise<{ success: boolean; error?: string }>;
  getImagePreview: (filepath: string) => Promise<string>;
  processingHelper: ProcessingHelper | null;
  PROCESSING_EVENTS: any;
  takeScreenshot: () => Promise<string>;
  clearQueues: () => void;
  setView: (view: "queue" | "solutions" | "debug") => void;
  moveWindowLeft: () => void;
  moveWindowRight: () => void;
  moveWindowUp: () => void;
  moveWindowDown: () => void;
}

/**
 * Initialize all IPC handlers for communication between the main and renderer processes
 * @param deps - Dependencies needed by the handlers
 */
export function initializeIpcHandlers(deps: IpcHandlerDeps): void {
  const { 
    getMainWindow, 
    setWindowDimensions, 
    toggleMainWindow,
    getView,
    getScreenshotQueue,
    getExtraScreenshotQueue,
    deleteScreenshot,
    getImagePreview,
    processingHelper,
    PROCESSING_EVENTS,
    takeScreenshot,
    clearQueues,
    setView,
    moveWindowLeft,
    moveWindowRight,
    moveWindowUp,
    moveWindowDown
  } = deps;

  // Window management
  
  // Toggle visibility
  ipcMain.on('toggle-visibility', () => {
    toggleMainWindow();
  });

  // Get settings
  ipcMain.handle('get-current-settings', () => {
    // Return default settings
    return {
      aiProvider: 'openai',
      currentModel: 'gpt-4o-mini',
      ollamaUrl: 'http://127.0.0.1:11434'
    };
  });

  // Get Ollama models
  ipcMain.handle('get-ollama-models', async () => {
    // Return sample models
    return [
      {
        name: 'llava:latest',
        size: 4200000000,
        details: {
          family: 'llava'
        },
        isVisionModel: true
      },
      {
        name: 'mistral:latest',
        size: 3800000000,
        details: {
          family: 'mistral'
        }
      }
    ];
  });

  // Process screenshots
  ipcMain.on('process-screenshots', () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return;

    if (processingHelper) {
      processingHelper.processScreenshots();
    } else {
      // For demo, just send a notification
      mainWindow.webContents.send('notification', {
        body: 'Processing screenshots (demo mode)',
        type: 'success'
      });
    }
  });

  // Take screenshot
  ipcMain.on('take-screenshot', async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return;

    try {
      // Show a notification that we're taking a screenshot
      mainWindow.webContents.send('update-instruction', "Taking screenshot...");
      
      // Temporarily hide the window for a cleaner screenshot
      const wasVisible = mainWindow.isVisible();
      if (wasVisible) {
        mainWindow.hide();
        // Wait a bit for the window to hide
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      const screenshotPath = await takeScreenshot();
      
      // Get directory path for open button
      const path = require('path');
      const dirPath = path.dirname(screenshotPath);
      
      // Read the file as base64 for sending to the renderer
      const fs = require('fs');
      const imageBuffer = fs.readFileSync(screenshotPath);
      const base64Data = `data:image/png;base64,${imageBuffer.toString('base64')}`;
      
      // Restore window visibility
      if (wasVisible) {
        mainWindow.show();
      }

      // Send the screenshot data to the renderer
      mainWindow.webContents.send('screenshot-data', base64Data);
      
      // Log success
      console.log(`Screenshot saved to ${screenshotPath}`);
      
      // Notify the user about the saved screenshot with a directory button
      mainWindow.webContents.send('notification', {
        body: `Screenshot saved to ${screenshotPath}`,
        type: 'success',
        actions: [
          {
            id: 'open-directory',
            label: 'Open Directory',
            data: dirPath
          }
        ]
      });

      // Clear the instruction
      setTimeout(() => {
        mainWindow.webContents.send('hide-instruction');
      }, 1500);
    } catch (error) {
      console.error('Error taking screenshot:', error);
      mainWindow.webContents.send('notification', {
        body: `Failed to take screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error'
      });
      
      // Restore window visibility on error
      mainWindow.show();
      
      // Clear the instruction
      mainWindow.webContents.send('hide-instruction');
    }
  });

  // Open screenshot directory
  ipcMain.on('open-directory', (event, dirPath) => {
    const { shell } = require('electron');
    shell.openPath(dirPath).catch((err: Error) => {
      console.error('Failed to open directory:', err);
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send('notification', {
          body: `Failed to open directory: ${err.message}`,
          type: 'error'
        });
      }
    });
  });

  // Get screenshot queue
  ipcMain.handle('get-screenshot-queue', () => {
    return getScreenshotQueue();
  });

  // Get extra screenshot queue
  ipcMain.handle('get-extra-screenshot-queue', () => {
    return getExtraScreenshotQueue();
  });

  // Delete screenshot
  ipcMain.handle('delete-screenshot', async (event, path) => {
    return await deleteScreenshot(path);
  });

  // Get environment variable
  ipcMain.handle('get-env-variable', (event, key) => {
    // List of allowed environment variables that can be accessed
    const ALLOWED_ENV_VARIABLES = [
      'GEMINI_API_KEY',
      'OPENAI_API_KEY',
      'VITE_GEMINI_API_KEY',
      'VITE_OPENAI_API_KEY',
      'REACT_APP_GEMINI_API_KEY',
      'REACT_APP_OPENAI_API_KEY'
    ];
    
    // Only allow access to specified environment variables for security
    if (ALLOWED_ENV_VARIABLES.includes(key)) {
      return process.env[key];
    } else {
      console.warn(`Attempted to access unauthorized environment variable: ${key}`);
      return undefined;
    }
  });

  // Get view
  ipcMain.handle('get-view', () => {
    return getView();
  });

  // Set view
  ipcMain.on('set-view', (event, view) => {
    setView(view);
  });

  // Clear queues
  ipcMain.on('clear-queues', () => {
    clearQueues();
  });

  // Update model settings
  ipcMain.on('update-model-settings', (event, settings) => {
    console.log('Model settings updated:', settings);
    
    const mainWindow = getMainWindow();
    if (!mainWindow) return;
    
    mainWindow.webContents.send('model-changed', settings);
  });

  // Add handler for area capture
  ipcMain.on('area-capture-complete', async (event, bounds) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return;

    try {
      // Implement area capture here
      // This would typically involve capturing a specific region defined by bounds
      
      // For now, just capture a full screenshot and notify the user
      const screenshotPath = await takeScreenshot();
      const preview = await getImagePreview(screenshotPath);
      
      mainWindow.webContents.send('screenshot-taken', {
        path: screenshotPath,
        preview,
        isAreaCapture: true
      });
      
      mainWindow.webContents.send('notification', {
        body: 'Area captured (simulated for now)',
        type: 'success'
      });
    } catch (error) {
      console.error('Error capturing area:', error);
      mainWindow.webContents.send('notification', {
        body: 'Failed to capture area',
        type: 'error'
      });
    }
  });

  // Add handler for additional screenshot
  ipcMain.on('add-additional-screenshot', async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return;

    try {
      const screenshotPath = await takeScreenshot();
      const preview = await getImagePreview(screenshotPath);
      
      mainWindow.webContents.send('screenshot-taken', {
        path: screenshotPath,
        preview,
        isAdditional: true
      });
      
      mainWindow.webContents.send('notification', {
        body: 'Additional screenshot added',
        type: 'success'
      });
    } catch (error) {
      console.error('Error taking additional screenshot:', error);
      mainWindow.webContents.send('notification', {
        body: 'Failed to take additional screenshot',
        type: 'error'
      });
    }
  });

  // Process screenshots with AI
  ipcMain.on('process-screenshots-with-ai', (event, screenshotsData) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return;

    if (!Array.isArray(screenshotsData) || screenshotsData.length === 0) {
      mainWindow.webContents.send('notification', {
        body: 'No screenshots to process',
        type: 'warning'
      });
      return;
    }

    // Show loading state
    mainWindow.webContents.send('loading', true);

    // Process the screenshots with AI
    if (processingHelper) {
      try {
        // Instead of using a global variable, directly pass to the main process
        // and let it handle the screenshots data
        mainWindow.webContents.send('set-screenshots-data', screenshotsData);
        processingHelper.processScreenshots();
      } catch (error) {
        console.error('Error processing screenshots with AI:', error);
        mainWindow.webContents.send('error', 
          `Failed to process screenshots: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        mainWindow.webContents.send('loading', false);
      }
    } else {
      // For demo, simulate processing
      console.log(`Processing ${screenshotsData.length} screenshots (demo mode)`);
      
      setTimeout(() => {
        mainWindow.webContents.send('analysis-result', 
          `# Analysis of ${screenshotsData.length} Screenshots\n\n` +
          `I've analyzed the ${screenshotsData.length} screenshot${screenshotsData.length > 1 ? 's' : ''} you provided.\n\n` +
          `## Observations\n\n` +
          `- The screenshots appear to contain code and/or UI elements\n` +
          `- There ${screenshotsData.length > 1 ? 'are' : 'is'} ${screenshotsData.length} screenshot${screenshotsData.length > 1 ? 's' : ''} in total\n\n` +
          `## Recommendations\n\n` +
          `Based on what I see, I recommend...\n\n` +
          `\`\`\`javascript\nconsole.log("Processing complete!");\n\`\`\``
        );
        mainWindow.webContents.send('loading', false);
        mainWindow.webContents.send('hide-instruction');
      }, 2000);
    }
  });

  // Capture selected area
  ipcMain.on('capture-selected-area', async (event, area) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return;

    try {
      // Check if area is valid
      if (!area || typeof area.x !== 'number' || typeof area.y !== 'number' || 
          typeof area.width !== 'number' || typeof area.height !== 'number') {
        throw new Error('Invalid area specified');
      }

      // Show notification that we're capturing an area
      mainWindow.webContents.send('update-instruction', "Capturing selected area...");

      // Hide the window for a cleaner screenshot
      const wasVisible = mainWindow.isVisible();
      if (wasVisible) {
        mainWindow.hide();
        // Wait a bit for the window to hide
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      // Generate a timestamp for the file name
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
      const path = require('path');
      const os = require('os');
      const fs = require('fs');
      
      // Create a screenshots directory if it doesn't exist
      const screenshotsDir = path.join(os.homedir(), 'Pictures', 'Screenshots', 'InterviewCoder');
      if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
      }
      
      const screenshotPath = path.join(screenshotsDir, `area-screenshot-${timestamp}.png`);
      
      // In a production app, you would use something like robotjs or a native module to capture a specific region
      // For this example, we'll capture the entire screen and then crop it
      const fullScreenPath = await takeScreenshot();
      
      // Read the full screenshot
      const { createCanvas, loadImage } = require('canvas');
      const image = await loadImage(fullScreenPath);
      
      // Create a canvas for cropping
      const canvas = createCanvas(area.width, area.height);
      const ctx = canvas.getContext('2d');
      
      // Draw only the selected area to the canvas
      ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
      
      // Save the cropped image
      const buffer = canvas.toBuffer('image/png');
      fs.writeFileSync(screenshotPath, buffer);
      
      // Convert to base64 for sending to the renderer
      const base64Data = `data:image/png;base64,${buffer.toString('base64')}`;

      // Restore window visibility
      if (wasVisible) {
        mainWindow.show();
      }

      // Notify the renderer about the area screenshot
      mainWindow.webContents.send('area-screenshot-data', base64Data);
      
      console.log(`Area screenshot saved to ${screenshotPath} (${area.width}x${area.height})`);
      
      // Get directory path for open button
      const dirPath = path.dirname(screenshotPath);
      
      mainWindow.webContents.send('notification', {
        body: `Area screenshot saved to ${screenshotPath} (${area.width}x${area.height})`,
        type: 'success',
        actions: [
          {
            id: 'open-directory',
            label: 'Open Directory',
            data: dirPath
          }
        ]
      });
      
      // Clear the instruction
      setTimeout(() => {
        mainWindow.webContents.send('hide-instruction');
      }, 1500);
    } catch (error) {
      console.error('Error capturing area:', error);
      mainWindow.webContents.send('notification', {
        body: `Failed to capture area: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error'
      });
      
      // Show the window again on error
      mainWindow.show();
      
      // Clear the instruction
      mainWindow.webContents.send('hide-instruction');
    }
  });

  // Start multi-screenshot mode
  ipcMain.on('start-multi-mode', () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return;

    mainWindow.webContents.send('start-multi-mode');
    mainWindow.webContents.send('notification', {
      body: 'Multi-screenshot mode activated',
      type: 'info'
    });
  });

  // Start area capture
  ipcMain.on('start-area-capture', () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return;

    mainWindow.webContents.send('start-area-capture');
  });
} 