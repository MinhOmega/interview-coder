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
      const screenshotPath = await takeScreenshot();
      const preview = await getImagePreview(screenshotPath);
      
      mainWindow.webContents.send('screenshot-taken', {
        path: screenshotPath,
        preview
      });
    } catch (error) {
      console.error('Error taking screenshot:', error);
      mainWindow.webContents.send('notification', {
        body: 'Failed to take screenshot',
        type: 'error'
      });
    }
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
    mainWindow.webContents.send('notification', {
      body: 'Model settings updated successfully',
      type: 'success'
    });
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
} 