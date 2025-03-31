import { app, BrowserWindow, screen, shell, ipcMain } from "electron";
import path from "path";
import fs from "fs";
import { initializeIpcHandlers } from "./ipcHandlers";
import { ProcessingHelper } from "./ProcessingHelper";
import { ScreenshotHelper } from "./ScreenshotHelper";
import { ShortcutsHelper } from "./shortcuts";
import { initAutoUpdater } from "./autoUpdater";
import { configHelper } from "./ConfigHelper";
import * as dotenv from "dotenv";

// Constants
const isDev = process.env.NODE_ENV === "development";

// Application State
const state = {
  // Window management properties
  mainWindow: null as BrowserWindow | null,
  isWindowVisible: false,
  windowPosition: null as { x: number; y: number } | null,
  windowSize: null as { width: number; height: number } | null,
  screenWidth: 0,
  screenHeight: 0,
  step: 0,
  currentX: 0,
  currentY: 0,

  // Application helpers
  screenshotHelper: null as ScreenshotHelper | null,
  shortcutsHelper: null as ShortcutsHelper | null,
  processingHelper: null as ProcessingHelper | null,

  // View and state management
  view: "queue" as "queue" | "solutions" | "debug",
  problemInfo: null as any,
  hasDebugged: false,

  // Processing events
  PROCESSING_EVENTS: {
    UNAUTHORIZED: "processing-unauthorized",
    NO_SCREENSHOTS: "processing-no-screenshots",
    OUT_OF_CREDITS: "out-of-credits",
    API_KEY_INVALID: "api-key-invalid",
    INITIAL_START: "initial-start",
    PROBLEM_EXTRACTED: "problem-extracted",
    SOLUTION_SUCCESS: "solution-success",
    INITIAL_SOLUTION_ERROR: "solution-error",
    DEBUG_START: "debug-start",
    DEBUG_SUCCESS: "debug-success",
    DEBUG_ERROR: "debug-error"
  } as const
};

// Export interfaces and initialize classes in other files

// Register the protocol
if (process.platform === "darwin") {
  app.setAsDefaultProtocolClient("interview-coder");
} else {
  app.setAsDefaultProtocolClient("interview-coder", process.execPath, [
    path.resolve(process.argv[1] || "")
  ]);
}

// Handle the protocol. In this case, we choose to show an Error Box.
if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient("interview-coder", process.execPath, [
    path.resolve(process.argv[1])
  ]);
}

// Force Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (event, commandLine) => {
    // Someone tried to run a second instance, we should focus our window.
    if (state.mainWindow) {
      if (state.mainWindow.isMinimized()) state.mainWindow.restore();
      state.mainWindow.focus();
    }
  });
}

// Window management functions
async function createWindow(): Promise<void> {
  if (state.mainWindow) {
    if (state.mainWindow.isMinimized()) state.mainWindow.restore();
    state.mainWindow.focus();
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workAreaSize;
  state.screenWidth = workArea.width;
  state.screenHeight = workArea.height;
  state.step = 60;
  state.currentY = 50;

  const windowSettings: Electron.BrowserWindowConstructorOptions = {
    width: 800,
    height: 600,
    minWidth: 750,
    minHeight: 550,
    x: state.currentX,
    y: 50,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: isDev
        ? path.join(__dirname, "../dist-electron/preload.js")
        : path.join(__dirname, "preload.js"),
      scrollBounce: true
    },
    show: true,
    frame: false,
    transparent: true,
    fullscreenable: false,
    hasShadow: false,
    opacity: 1.0,  // Start with full opacity
    backgroundColor: "#00000000",
    focusable: true,
    skipTaskbar: true,
    type: "panel",
    paintWhenInitiallyHidden: true,
    titleBarStyle: "hidden",
    enableLargerThanScreen: true,
    movable: true
  };

  state.mainWindow = new BrowserWindow(windowSettings);

  // Add more detailed logging for window events
  state.mainWindow.webContents.on("did-finish-load", () => {
    console.log("Window finished loading");
  });
  
  state.mainWindow.webContents.on(
    "did-fail-load",
    async (event, errorCode, errorDescription) => {
      console.error("Window failed to load:", errorCode, errorDescription);
      if (isDev) {
        // In development, retry loading after a short delay
        console.log("Retrying to load development server...");
        setTimeout(() => {
          state.mainWindow?.loadURL("http://localhost:54321").catch((error) => {
            console.error("Failed to load dev server on retry:", error);
          });
        }, 1000);
      }
    }
  );

  if (isDev) {
    // In development, load from the dev server
    console.log("Loading from development server: http://localhost:54321");
    state.mainWindow.loadURL("http://localhost:54321").catch((error) => {
      console.error("Failed to load dev server, falling back to local file:", error);
      // Fallback to local file if dev server is not available
      const indexPath = path.join(__dirname, "../dist/index.html");
      console.log("Falling back to:", indexPath);
      if (fs.existsSync(indexPath)) {
        state.mainWindow?.loadFile(indexPath);
      } else {
        console.error("Could not find index.html in dist folder");
      }
    });
  } else {
    // In production, load from the built files
    const indexPath = path.join(__dirname, "../dist/index.html");
    console.log("Loading production build:", indexPath);
    
    if (fs.existsSync(indexPath)) {
      state.mainWindow.loadFile(indexPath);
    } else {
      console.error("Could not find index.html in dist folder");
    }
  }

  // Configure window behavior
  state.mainWindow.webContents.setZoomFactor(1);
  if (isDev) {
    state.mainWindow.webContents.openDevTools();
  }
  state.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log("Attempting to open URL:", url);
    if (url.includes("google.com") || url.includes("supabase.co")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  // Enhanced screen capture resistance
  state.mainWindow.setContentProtection(true);

  state.mainWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true
  });
  state.mainWindow.setAlwaysOnTop(true, "screen-saver", 1);

  // Additional screen capture resistance settings
  if (process.platform === "darwin") {
    // Prevent window from being captured in screenshots
    state.mainWindow.setHiddenInMissionControl(true);
    state.mainWindow.setWindowButtonVisibility(false);
    state.mainWindow.setBackgroundColor("#00000000");

    // Prevent window from being included in window switcher
    state.mainWindow.setSkipTaskbar(true);

    // Disable window shadow
    state.mainWindow.setHasShadow(false);
  }

  // Prevent the window from being captured by screen recording
  state.mainWindow.webContents.setBackgroundThrottling(false);
  state.mainWindow.webContents.setFrameRate(60);

  // Set up window listeners
  state.mainWindow.on("move", handleWindowMove);
  state.mainWindow.on("resize", handleWindowResize);
  state.mainWindow.on("closed", handleWindowClosed);

  // Initialize window state
  const bounds = state.mainWindow.getBounds();
  state.windowPosition = { x: bounds.x, y: bounds.y };
  state.windowSize = { width: bounds.width, height: bounds.height };
  state.currentX = bounds.x;
  state.currentY = bounds.y;
  state.isWindowVisible = true;
  
  // Set opacity based on user preferences or hide initially
  // Ensure the window is visible for the first launch or if opacity > 0.1
  const savedOpacity = configHelper.getOpacity();
  console.log(`Initial opacity from config: ${savedOpacity}`);
  
  // Always make sure window is shown first
  state.mainWindow.showInactive(); // Use showInactive for consistency
  
  if (savedOpacity <= 0.1) {
    console.log('Initial opacity too low, setting to 0 and hiding window');
    state.mainWindow.setOpacity(0);
    state.isWindowVisible = false;
  } else {
    console.log(`Setting initial opacity to ${savedOpacity}`);
    state.mainWindow.setOpacity(savedOpacity);
    state.isWindowVisible = true;
  }
}

function handleWindowMove(): void {
  if (!state.mainWindow) return;
  const bounds = state.mainWindow.getBounds();
  state.windowPosition = { x: bounds.x, y: bounds.y };
  state.currentX = bounds.x;
  state.currentY = bounds.y;
}

function handleWindowResize(): void {
  if (!state.mainWindow) return;
  const bounds = state.mainWindow.getBounds();
  state.windowSize = { width: bounds.width, height: bounds.height };
}

function handleWindowClosed(): void {
  state.mainWindow = null;
  state.isWindowVisible = false;
  state.windowPosition = null;
  state.windowSize = null;
}

// Window visibility functions
function hideMainWindow(): void {
  if (!state.mainWindow?.isDestroyed()) {
    const bounds = state.mainWindow?.getBounds();
    state.windowPosition = { x: bounds?.x || 0, y: bounds?.y || 0 };
    state.windowSize = { width: bounds?.width || 0, height: bounds?.height || 0 };
    state.mainWindow?.setIgnoreMouseEvents(true, { forward: true });
    state.mainWindow?.setOpacity(0);
    state.isWindowVisible = false;
    console.log('Window hidden, opacity set to 0');
  }
}

function showMainWindow(): void {
  if (!state.mainWindow?.isDestroyed()) {
    if (state.windowPosition && state.windowSize) {
      state.mainWindow?.setBounds({
        ...state.windowPosition,
        ...state.windowSize
      });
    }
    state.mainWindow?.setIgnoreMouseEvents(false);
    state.mainWindow?.setAlwaysOnTop(true, "screen-saver", 1);
    state.mainWindow?.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true
    });
    state.mainWindow?.setContentProtection(true);
    state.mainWindow?.setOpacity(0); // Set opacity to 0 before showing
    state.mainWindow?.showInactive(); // Use showInactive instead of show+focus
    state.mainWindow?.setOpacity(1); // Then set opacity to 1 after showing
    state.isWindowVisible = true;
    console.log('Window shown with showInactive(), opacity set to 1');
  }
}

function toggleMainWindow(): void {
  console.log(`Toggling window. Current state: ${state.isWindowVisible ? 'visible' : 'hidden'}`);
  if (state.isWindowVisible) {
    hideMainWindow();
  } else {
    showMainWindow();
  }
}

// Window movement functions
function moveWindowHorizontal(updateFn: (x: number) => number): void {
  if (!state.mainWindow) return;
  state.currentX = updateFn(state.currentX);
  state.mainWindow.setPosition(
    Math.round(state.currentX),
    Math.round(state.currentY)
  );
}

function moveWindowVertical(updateFn: (y: number) => number): void {
  if (!state.mainWindow) return;

  const newY = updateFn(state.currentY);
  // Allow window to go 2/3 off screen in either direction
  const maxUpLimit = (-(state.windowSize?.height || 0) * 2) / 3;
  const maxDownLimit =
    state.screenHeight + ((state.windowSize?.height || 0) * 2) / 3;

  // Only update if within bounds
  if (newY >= maxUpLimit && newY <= maxDownLimit) {
    state.currentY = newY;
    state.mainWindow.setPosition(
      Math.round(state.currentX),
      Math.round(state.currentY)
    );
  }
}

// Window dimension functions
function setWindowDimensions(width: number, height: number): void {
  if (!state.mainWindow?.isDestroyed()) {
    const [currentX, currentY] = state.mainWindow?.getPosition() || [0, 0];
    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workAreaSize;
    const maxWidth = Math.floor(workArea.width * 0.5);

    state.mainWindow?.setBounds({
      x: Math.min(currentX, workArea.width - maxWidth),
      y: currentY,
      width: Math.min(width + 32, maxWidth),
      height: Math.ceil(height)
    });
  }
}

// Environment setup
function loadEnvVariables() {
  if (isDev) {
    console.log("Loading env variables from:", path.join(process.cwd(), ".env"));
    dotenv.config({ path: path.join(process.cwd(), ".env") });
  } else {
    console.log(
      "Loading env variables from:",
      path.join(process.resourcesPath, ".env")
    );
    dotenv.config({ path: path.join(process.resourcesPath, ".env") });
  }
  console.log("Environment variables loaded");
}

// Initialize application
async function initializeApp() {
  try {
    // Set custom cache directory to prevent permission issues
    const appDataPath = path.join(app.getPath('appData'), 'interview-coder-v1');
    const sessionPath = path.join(appDataPath, 'session');
    const tempPath = path.join(appDataPath, 'temp');
    const cachePath = path.join(appDataPath, 'cache');
    
    // Create directories if they don't exist
    for (const dir of [appDataPath, sessionPath, tempPath, cachePath]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    
    app.setPath('userData', appDataPath);
    app.setPath('sessionData', sessionPath);      
    app.setPath('temp', tempPath);
    app.setPath('cache', cachePath);
      
    loadEnvVariables();
    
    // Ensure a configuration file exists
    if (!configHelper.hasApiKey()) {
      console.log("No API key found in configuration. User will need to set up.");
    }
    
    // Initialize the screenshot helper
    state.screenshotHelper = new ScreenshotHelper(state.view);
    
    // Initialize processing helper
    state.processingHelper = new ProcessingHelper({
      getScreenshotHelper: () => state.screenshotHelper,
      getMainWindow,
      getView: () => state.view,
      setView: (view) => { state.view = view; },
      getProblemInfo: () => state.problemInfo,
      setProblemInfo: (info) => { state.problemInfo = info; },
      getScreenshotQueue: () => state.screenshotHelper?.getScreenshotQueue() || [],
      getExtraScreenshotQueue: () => state.screenshotHelper?.getExtraScreenshotQueue() || [],
      clearQueues: () => state.screenshotHelper?.clearQueues(),
      takeScreenshot: async () => {
        if (!state.screenshotHelper) {
          throw new Error("Screenshot helper not initialized");
        }
        return state.screenshotHelper.takeScreenshot();
      },
      getImagePreview: async (filepath) => {
        if (!state.screenshotHelper) {
          throw new Error("Screenshot helper not initialized");
        }
        return state.screenshotHelper.getImagePreview(filepath);
      },
      deleteScreenshot: async (path) => {
        if (!state.screenshotHelper) {
          return { success: false, error: "Screenshot helper not initialized" };
        }
        return state.screenshotHelper.deleteScreenshot(path);
      },
      setHasDebugged: (value) => { state.hasDebugged = value; },
      getHasDebugged: () => state.hasDebugged,
      PROCESSING_EVENTS: state.PROCESSING_EVENTS
    });
    
    // Initialize shortcuts helper
    state.shortcutsHelper = new ShortcutsHelper({
      getMainWindow,
      toggleWindowVisibility: toggleMainWindow,
      moveWindow: (direction: 'left' | 'right' | 'up' | 'down') => {
        switch (direction) {
          case 'left':
            moveWindowHorizontal(x => x - state.step);
            break;
          case 'right':
            moveWindowHorizontal(x => x + state.step);
            break;
          case 'up':
            moveWindowVertical(y => y - state.step);
            break;
          case 'down':
            moveWindowVertical(y => y + state.step);
            break;
        }
      },
      resetProcess: () => {
        // Clear any existing data
        if (state.screenshotHelper) {
          state.screenshotHelper.clearQueues();
        }
        
        if (state.mainWindow) {
          state.mainWindow.webContents.send('clear-result');
          state.mainWindow.webContents.send('update-instruction', 'Press Cmd+H to take a screenshot');
        }
      },
      processScreenshots: () => {
        if (state.processingHelper) {
          state.processingHelper.processScreenshots();
        } else {
          if (state.mainWindow) {
            state.mainWindow.webContents.send('error', 'Processing helper not initialized');
          }
        }
      },
      screenshotHelper: state.screenshotHelper
    });
    
    // Register shortcuts
    state.shortcutsHelper.registerShortcuts(state.isWindowVisible);
    
    // Initialize the IPC handlers
    initializeIpcHandlers({
      getMainWindow,
      setWindowDimensions,
      toggleMainWindow,
      // Add other required methods based on what is needed in ipcHandlers.ts
    });
    
    await createWindow();
    
    // Initialize auto-updater regardless of environment
    initAutoUpdater();
    console.log(
      "Auto-updater initialized in",
      isDev ? "development" : "production",
      "mode"
    );
  } catch (error) {
    console.error("Failed to initialize application:", error);
    app.quit();
  }
}

// Handle second instance
app.on("second-instance", (event, commandLine) => {
  console.log("second-instance event received:", commandLine);
  
  // Focus or create the main window
  if (!state.mainWindow) {
    createWindow();
  } else {
    if (state.mainWindow.isMinimized()) state.mainWindow.restore();
    state.mainWindow.focus();
  }
});

// Prevent multiple instances of the app
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
      state.mainWindow = null;
    }
  });
}

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// For simplicity, we're implementing stub versions of necessary functions
// In a real implementation, these would connect to actual functionality

// State getter/setter functions
function getMainWindow(): BrowserWindow | null {
  return state.mainWindow;
}

// Set up IPC listeners
function setupIpcListeners() {
  // Toggle window visibility
  ipcMain.on('toggle-visibility', () => {
    toggleMainWindow();
  });
  
  // Process screenshots
  ipcMain.on('process-screenshots', () => {
    // This would normally call the processing helper
    // For demo, just send a notification
    if (state.mainWindow) {
      state.mainWindow.webContents.send('notification', {
        body: 'Processing screenshots (demo mode)',
        type: 'success'
      });
    }
  });
  
  // Take screenshot 
  ipcMain.on('take-screenshot', () => {
    // This would normally call the screenshot helper
    // For demo, just send a notification
    if (state.mainWindow) {
      state.mainWindow.webContents.send('notification', {
        body: 'Screenshot taken (demo mode)',
        type: 'success'
      });
    }
  });
  
  // Open model selector
  ipcMain.on('open-model-selector', () => {
    if (state.mainWindow) {
      state.mainWindow.webContents.send('open-model-selector');
    }
  });
  
  // Update model settings
  ipcMain.on('update-model-settings', (event, settings) => {
    console.log('Model settings updated:', settings);
    if (state.mainWindow) {
      state.mainWindow.webContents.send('model-changed', settings);
    }
  });
}

// Initialize the app
app.whenReady().then(() => {
  // Initialize app first, which will set up IPC handlers through initializeIpcHandlers
  initializeApp().then(() => {
    // Setup any additional IPC listeners that aren't handled by initializeIpcHandlers
    // This is for backwards compatibility and should eventually be migrated to initializeIpcHandlers
    setupIpcListeners();
  }).catch(error => {
    console.error("Error during app initialization:", error);
    app.quit();
  });
});

// Export necessary functions and state for other modules
export { 
  state, 
  createWindow, 
  hideMainWindow, 
  showMainWindow, 
  toggleMainWindow, 
  setWindowDimensions,
  getMainWindow
}; 