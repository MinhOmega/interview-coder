import { BrowserWindow, desktopCapturer, screen, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// Define types for our screenshot processing
interface ScreenshotMetadata {
  filePath: string;
  timestamp: number;
  width: number;
  height: number;
}

// Keep track of screenshots for the current session
let sessionScreenshots: ScreenshotMetadata[] = [];
const screenshotDirectory = path.join(process.env.HOME || process.env.USERPROFILE || '', 'Documents', 'InterviewCoder', 'Screenshots');

// Initialize the screenshot handler
export function initScreenshotHandler(mainWindow: BrowserWindow) {
  // Create screenshot directory if it doesn't exist
  ensureScreenshotDirectory();

  // IPC Handlers for screenshot operations
  ipcMain.handle('capture-screenshot-and-process', async () => {
    try {
      await captureScreenshot(mainWindow);
      processScreenshots(mainWindow, true);
      return true;
    } catch (error) {
      console.error('Error in capture-screenshot-and-process:', error);
      mainWindow.webContents.send('notification', {
        body: `Failed to capture screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error'
      });
      return false;
    }
  });

  // Register other IPC listeners
  ipcMain.on('take-screenshot', () => {
    captureScreenshot(mainWindow)
      .then(() => processScreenshots(mainWindow, true))
      .catch(error => {
        console.error('Error taking screenshot:', error);
        mainWindow.webContents.send('notification', {
          body: `Failed to take screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`,
          type: 'error'
        });
      });
  });

  ipcMain.on('process-screenshots', (_, useStreaming = true) => {
    processScreenshots(mainWindow, useStreaming);
  });

  ipcMain.on('add-context-screenshot', () => {
    addContextScreenshot(mainWindow);
  });

  // Clear screenshots when resetting
  ipcMain.on('clear-result', () => {
    sessionScreenshots = [];
    mainWindow.webContents.send('clear-result');
  });
}

// Ensure the screenshot directory exists
function ensureScreenshotDirectory() {
  try {
    if (!fs.existsSync(screenshotDirectory)) {
      fs.mkdirSync(screenshotDirectory, { recursive: true });
    }
  } catch (error) {
    console.error('Error creating screenshot directory:', error);
  }
}

// Capture a screenshot
async function captureScreenshot(mainWindow: BrowserWindow): Promise<string> {
  try {
    // Show loading state
    mainWindow.webContents.send('loading', true);
    mainWindow.webContents.send('update-instruction', 'Taking screenshot...');

    // Temporarily hide the window to avoid capturing it
    const wasVisible = mainWindow.isVisible();
    mainWindow.hide();

    // Give some time for the window to hide
    await new Promise(resolve => setTimeout(resolve, 100));

    // Get the primary display
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    // Capture the entire screen
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height }
    });

    // Show the window again
    if (wasVisible) {
      mainWindow.show();
    }

    // We want the primary display
    const source = sources.find(source => 
      source.display_id === primaryDisplay.id.toString() || 
      source.name === 'Entire Screen' || 
      source.name.includes('Screen 1')
    );

    if (!source) {
      throw new Error('Could not find a suitable screen to capture');
    }

    // Get the screenshot from the thumbnail
    const screenshot = source.thumbnail;

    // Generate a unique filename
    const timestamp = Date.now();
    const filename = `screenshot-${timestamp}-${uuidv4().substring(0, 8)}.png`;
    const filePath = path.join(screenshotDirectory, filename);

    // Save the screenshot to disk
    fs.writeFileSync(filePath, screenshot.toPNG());

    // Add to session screenshots
    sessionScreenshots.push({ 
      filePath, 
      timestamp, 
      width: screenshot.getSize().width, 
      height: screenshot.getSize().height 
    });

    mainWindow.webContents.send('notification', {
      body: 'Screenshot captured',
      type: 'success'
    });

    // Update instruction
    mainWindow.webContents.send('update-instruction', 'Processing screenshot...');

    return filePath;
  } catch (error) {
    console.error('Error capturing screenshot:', error);
    mainWindow.webContents.send('notification', {
      body: `Failed to capture screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`,
      type: 'error'
    });
    throw error;
  }
}

// Process screenshots with AI
function processScreenshots(mainWindow: BrowserWindow, useStreaming = true) {
  try {
    if (sessionScreenshots.length === 0) {
      mainWindow.webContents.send('notification', {
        body: 'No screenshots to process. Take a screenshot first.',
        type: 'warning'
      });
      mainWindow.webContents.send('loading', false);
      return;
    }

    // Show loading state
    mainWindow.webContents.send('loading', true);
    mainWindow.webContents.send('update-instruction', 'Analyzing screenshot...');

    // Extract file paths for processing
    const screenshotPaths = sessionScreenshots.map(s => s.filePath);

    // This function is expected to exist in main.js from the original codebase
    // We need to invoke it via IPC to the main process
    mainWindow.webContents.send('process-screenshots-internal', {
      screenshots: screenshotPaths,
      useStreaming
    });
  } catch (error) {
    console.error('Error processing screenshots:', error);
    mainWindow.webContents.send('notification', {
      body: `Failed to process screenshots: ${error instanceof Error ? error.message : 'Unknown error'}`,
      type: 'error'
    });
    mainWindow.webContents.send('loading', false);
  }
}

// Add a context screenshot (for continuing a conversation)
async function addContextScreenshot(mainWindow: BrowserWindow) {
  try {
    mainWindow.webContents.send('update-instruction', 'Capturing additional context...');

    // Capture a new screenshot
    const filePath = await captureScreenshot(mainWindow);

    // This function is expected to exist in main.js from the original codebase
    mainWindow.webContents.send('add-context-screenshot-internal', {
      screenshot: filePath
    });
  } catch (error) {
    console.error('Error adding context screenshot:', error);
    mainWindow.webContents.send('notification', {
      body: `Failed to add context: ${error instanceof Error ? error.message : 'Unknown error'}`,
      type: 'error'
    });
    mainWindow.webContents.send('loading', false);
  }
} 