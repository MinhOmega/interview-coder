import { app, BrowserWindow, globalShortcut, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';
import Store from 'electron-store';

import { AIProvider, AppSettings, AreaSelection } from './types';
import { AIServiceFactory } from './services/ai-factory';
import { ScreenshotProcessor } from './utils/processor';
import { captureScreenshot, captureAreaScreenshot } from './utils/screenshot';

// Create application settings store
const store = new Store<AppSettings>({
  name: 'settings',
  defaults: {
    aiProvider: 'openai',
    openaiModel: 'gpt-4o-mini',
    geminiModel: 'gemini-1.5-pro-vision',
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'llava',
    currentModel: 'gpt-4o-mini',
    multiScreenshotMode: false
  }
});

// Initialize local directories
const userDataPath = app.getPath('userData');
const screenshotsDir = path.join(userDataPath, 'screenshots');
fs.ensureDirSync(screenshotsDir);

// Keep a global reference of the window objects to avoid garbage collection
let mainWindow: BrowserWindow | null = null;
let captureHelperWindow: BrowserWindow | null = null;
let modelSelectorWindow: BrowserWindow | null = null;

// Initialize services
const aiServiceFactory = new AIServiceFactory(store.get('aiProvider'));
const screenshotProcessor = new ScreenshotProcessor(aiServiceFactory, screenshotsDir);

/**
 * Creates the main application window
 */
function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    // @ts-ignore - contentProtection is supported in Electron but not in TS definitions
    contentProtection: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Load the HTML file
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Open DevTools in development mode
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('ready-to-show', () => {
    if (mainWindow) mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

/**
 * Creates the area capture helper window
 */
function createCaptureHelperWindow(): BrowserWindow {
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  captureHelperWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    fullscreen: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  captureHelperWindow.loadFile(path.join(__dirname, '../renderer/capture-helper.html'));

  // Hide the window initially
  captureHelperWindow.setIgnoreMouseEvents(false);

  captureHelperWindow.on('closed', () => {
    captureHelperWindow = null;
  });

  return captureHelperWindow;
}

/**
 * Creates the model selector window
 */
function createModelSelectorWindow(): BrowserWindow {
  modelSelectorWindow = new BrowserWindow({
    width: 600,
    height: 700,
    show: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  modelSelectorWindow.loadFile(path.join(__dirname, '../renderer/model-selector.html'));

  modelSelectorWindow.on('ready-to-show', () => {
    if (modelSelectorWindow) modelSelectorWindow.show();
  });

  modelSelectorWindow.on('closed', () => {
    modelSelectorWindow = null;
  });

  return modelSelectorWindow;
}

/**
 * Process a single captured screenshot
 */
async function processSingleScreenshot(): Promise<void> {
  try {
    if (mainWindow) {
      mainWindow.webContents.send('loading', true);
      mainWindow.webContents.send('update-instruction', 'Taking screenshot...');
    }

    // Capture the screenshot
    const imagePath = path.join(screenshotsDir, `screenshot-${Date.now()}.png`);
    const dimensions = await captureScreenshot(imagePath);

    if (mainWindow) {
      mainWindow.webContents.send('screenshot-saved', { 
        path: imagePath, 
        isArea: false, 
        dimensions 
      });
      mainWindow.webContents.send('update-instruction', 'Processing screenshot...');
    }

    // Process the screenshot
    const result = await screenshotProcessor.processScreenshot(imagePath);
    
    if (mainWindow) {
      mainWindow.webContents.send('loading', false);
      mainWindow.webContents.send('analysis-result', result);
    }
  } catch (error) {
    console.error('Error processing screenshot:', error);
    if (mainWindow) {
      mainWindow.webContents.send('loading', false);
      mainWindow.webContents.send('error', (error as Error).message || 'Failed to process screenshot');
    }
  }
}

/**
 * Process a selected area screenshot
 */
async function processAreaScreenshot(): Promise<void> {
  if (!captureHelperWindow) {
    captureHelperWindow = createCaptureHelperWindow();
  }

  try {
    if (mainWindow) {
      mainWindow.webContents.send('update-instruction', 'Select an area for screenshot...');
    }

    captureHelperWindow.show();
  } catch (error) {
    console.error('Error in area screenshot capture:', error);
    if (mainWindow) {
      mainWindow.webContents.send('error', (error as Error).message || 'Failed to capture area screenshot');
    }
  }
}

/**
 * Capture a selected area screenshot and process it
 */
async function captureAndProcessArea(selection: AreaSelection): Promise<void> {
  try {
    if (mainWindow) {
      mainWindow.webContents.send('loading', true);
      mainWindow.webContents.send('update-instruction', 'Capturing selected area...');
    }

    // Hide the capture helper window before taking the screenshot
    if (captureHelperWindow) {
      captureHelperWindow.hide();
    }

    // Wait a moment for the window to hide
    await new Promise(resolve => setTimeout(resolve, 300));

    // Capture the area screenshot
    const imagePath = path.join(screenshotsDir, `area-screenshot-${Date.now()}.png`);
    const imageData = await captureAreaScreenshot(selection, imagePath);

    if (mainWindow) {
      mainWindow.webContents.send('screenshot-saved', { 
        path: imagePath, 
        isArea: true, 
        dimensions: selection 
      });
      mainWindow.webContents.send('update-instruction', 'Processing area screenshot...');
    }

    // Process the screenshot
    let result;
    if (store.get('multiScreenshotMode')) {
      // Add to multi-screenshot mode
      screenshotProcessor.addScreenshot(imagePath, imageData);
      const count = screenshotProcessor.getScreenshotCount();
      
      if (mainWindow) {
        mainWindow.webContents.send('loading', false);
        mainWindow.webContents.send('update-instruction', 
          `Added screenshot ${count}. Press Cmd+Shift+D for another area, Cmd+Shift+S for full screen, or Cmd+Shift+A to process all ${count} screenshot${count > 1 ? 's' : ''}`);
      }
    } else {
      // Process single screenshot
      result = await screenshotProcessor.processScreenshot(imagePath, imageData);
      
      if (mainWindow) {
        mainWindow.webContents.send('loading', false);
        mainWindow.webContents.send('analysis-result', result);
      }
    }
  } catch (error) {
    console.error('Error processing area screenshot:', error);
    if (mainWindow) {
      mainWindow.webContents.send('loading', false);
      mainWindow.webContents.send('error', (error as Error).message || 'Failed to process area screenshot');
    }
  }
}

/**
 * Handle full screen capture from the capture helper
 */
async function handleFullScreenCapture(): Promise<void> {
  try {
    // Hide the capture helper window
    if (captureHelperWindow) {
      captureHelperWindow.hide();
    }

    // Process as a regular screenshot
    await processSingleScreenshot();
  } catch (error) {
    console.error('Error capturing full screen:', error);
    if (mainWindow) {
      mainWindow.webContents.send('error', (error as Error).message || 'Failed to capture full screen');
    }
  }
}

/**
 * Toggle multi-screenshot mode
 */
function toggleMultiScreenshotMode(): void {
  const current = store.get('multiScreenshotMode', false);
  const newMode = !current;
  store.set('multiScreenshotMode', newMode);
  
  // Reset the processor if turning on multi-mode
  if (newMode) {
    screenshotProcessor.reset();
  }
  
  if (mainWindow) {
    mainWindow.webContents.send('update-instruction', 
      newMode 
        ? 'Multi-screenshot mode ON. Press Cmd+Shift+D for area or Cmd+Shift+S for full screen. Press Cmd+Shift+A to process all.'
        : 'Multi-screenshot mode OFF. Press Cmd+Shift+D for area or Cmd+Shift+S for full screen.');
  }
}

/**
 * Process all screenshots in multi-screenshot mode
 */
async function processAllScreenshots(): Promise<void> {
  try {
    const isMultiMode = store.get('multiScreenshotMode', false);
    const count = screenshotProcessor.getScreenshotCount();
    
    if (!isMultiMode) {
      toggleMultiScreenshotMode();
      return;
    }
    
    if (count === 0) {
      if (mainWindow) {
        mainWindow.webContents.send('warning', 'No screenshots to process. Take screenshots first.');
      }
      return;
    }
    
    if (mainWindow) {
      mainWindow.webContents.send('loading', true);
      mainWindow.webContents.send('update-instruction', `Processing ${count} screenshots...`);
    }
    
    // Process all screenshots
    const result = await screenshotProcessor.processAllScreenshots();
    
    if (mainWindow) {
      mainWindow.webContents.send('loading', false);
      mainWindow.webContents.send('analysis-result', result);
    }
    
    // Reset after processing
    screenshotProcessor.reset();
  } catch (error) {
    console.error('Error processing multiple screenshots:', error);
    if (mainWindow) {
      mainWindow.webContents.send('loading', false);
      mainWindow.webContents.send('error', (error as Error).message || 'Failed to process screenshots');
    }
  }
}

/**
 * Repeat the last process
 */
async function repeatProcess(): Promise<void> {
  try {
    if (screenshotProcessor.hasHistory()) {
      if (mainWindow) {
        mainWindow.webContents.send('loading', true);
        mainWindow.webContents.send('update-instruction', 'Repeating last analysis...');
      }
      
      const result = await screenshotProcessor.repeatLastProcess();
      
      if (mainWindow) {
        mainWindow.webContents.send('loading', false);
        mainWindow.webContents.send('analysis-result', result);
      }
    } else {
      if (mainWindow) {
        mainWindow.webContents.send('warning', 'No previous analysis to repeat.');
      }
    }
  } catch (error) {
    console.error('Error repeating process:', error);
    if (mainWindow) {
      mainWindow.webContents.send('loading', false);
      mainWindow.webContents.send('error', (error as Error).message || 'Failed to repeat analysis');
    }
  }
}

/**
 * Open the model selector window
 */
function openModelSelector(): void {
  if (!modelSelectorWindow) {
    modelSelectorWindow = createModelSelectorWindow();
  } else {
    modelSelectorWindow.show();
  }
}

// Register IPC handlers
function registerIpcHandlers(): void {
  // Area selection handlers
  ipcMain.on('area-capture-ready', () => {
    console.log('Area capture window is ready');
  });
  
  ipcMain.on('area-selected', (_event, selection: AreaSelection) => {
    captureAndProcessArea(selection).catch(err => {
      console.error('Error in area selection handling:', err);
    });
  });
  
  ipcMain.on('area-selection-cancelled', () => {
    if (captureHelperWindow) {
      captureHelperWindow.hide();
    }
    
    if (mainWindow) {
      mainWindow.webContents.send('update-instruction', 
        'Area selection cancelled. Press Cmd+Shift+D to try again.');
    }
  });
  
  ipcMain.on('full-screen-captured', () => {
    handleFullScreenCapture().catch(err => {
      console.error('Error handling full screen capture:', err);
    });
  });
  
  // Model settings handlers
  ipcMain.on('update-model-settings', (_event, settings: AppSettings) => {
    // Save the settings
    for (const [key, value] of Object.entries(settings)) {
      store.set(key, value);
    }
    
    // Update the AI service provider
    aiServiceFactory.setProvider(settings.aiProvider as AIProvider);
    
    // Notify about the change
    if (mainWindow) {
      mainWindow.webContents.send('model-changed');
    }
    
    // Close the model selector window
    if (modelSelectorWindow) {
      modelSelectorWindow.close();
    }
  });
  
  // Ollama models handler
  ipcMain.handle('get-ollama-models', async (_event, data: { url: string }) => {
    try {
      return await aiServiceFactory.getOllamaModels(data.url);
    } catch (error) {
      console.error('Error fetching Ollama models:', error);
      throw error;
    }
  });
  
  // Get current settings
  ipcMain.handle('get-current-settings', () => {
    return store.store;
  });
}

// Register global shortcuts
function registerGlobalShortcuts(): void {
  // Full screen screenshot
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    const isMultiMode = store.get('multiScreenshotMode', false);
    
    if (isMultiMode && screenshotProcessor.getScreenshotCount() > 0) {
      // If in multi-mode with screenshots, process them all
      processAllScreenshots().catch(console.error);
    } else {
      // Otherwise take a single screenshot
      processSingleScreenshot().catch(console.error);
    }
  });
  
  // Area screenshot
  globalShortcut.register('CommandOrControl+Shift+D', () => {
    processAreaScreenshot().catch(console.error);
  });
  
  // Toggle multi-screenshot mode or process all
  globalShortcut.register('CommandOrControl+Shift+A', () => {
    processAllScreenshots().catch(console.error);
  });
  
  // Open model selector
  globalShortcut.register('CommandOrControl+Shift+M', () => {
    openModelSelector();
  });
  
  // Repeat last process
  globalShortcut.register('CommandOrControl+Shift+R', () => {
    repeatProcess().catch(console.error);
  });
  
  // Quit application
  globalShortcut.register('CommandOrControl+Shift+Q', () => {
    app.quit();
  });
}

// Application event handlers
app.on('ready', () => {
  createMainWindow();
  registerIpcHandlers();
  registerGlobalShortcuts();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
}); 