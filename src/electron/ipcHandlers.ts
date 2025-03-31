import { BrowserWindow, ipcMain } from 'electron';

// Define the interface for dependencies that will be injected
interface IpcHandlerDeps {
  getMainWindow: () => BrowserWindow | null;
  setWindowDimensions: (width: number, height: number) => void;
  toggleMainWindow: () => void;
  // Add other dependencies as needed
}

/**
 * Initialize all IPC handlers for communication between the main and renderer processes
 * @param deps - Dependencies needed by the handlers
 */
export function initializeIpcHandlers(deps: IpcHandlerDeps): void {
  const { getMainWindow, setWindowDimensions, toggleMainWindow } = deps;

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

    // For demo, just send a notification
    mainWindow.webContents.send('notification', {
      body: 'Processing screenshots (demo mode)',
      type: 'success'
    });
  });

  // Take screenshot
  ipcMain.on('take-screenshot', () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return;

    // For demo, just send a notification
    mainWindow.webContents.send('notification', {
      body: 'Screenshot taken (demo mode)',
      type: 'success'
    });
  });

  // Get screenshot queue
  ipcMain.handle('get-screenshot-queue', () => {
    return [];
  });

  // Get extra screenshot queue
  ipcMain.handle('get-extra-screenshot-queue', () => {
    return [];
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
} 