const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { OpenAI } = require("openai");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");
const configManager = require("./js/config-manager");
const windowManager = require("./js/window-manager");
const screenshotManager = require("./js/screenshot-manager");
const hotkeyManager = require("./js/hotkey-manager");
const aiProviders = require("./js/ai-providers");
const aiProcessing = require("./js/ai-processing");
const eventHandler = require("./js/event-handler");
const { IPC_CHANNELS } = require("./js/constants");

axios.defaults.family = 4;

let openai = null;
let geminiAI = null;

try {
  aiProviders.initializeAIClients();
} catch (err) {
  console.error("Error setting up AI clients:", err);
}

// Request screen recording permission on macOS (needed for production builds)
async function checkScreenCapturePermissions() {
  if (process.platform === 'darwin') {
    try {
      const { systemPreferences } = require('electron');
      
      // Check screen capture permission
      const screenPermission = systemPreferences.getMediaAccessStatus('screen');
      console.log(`Screen capture permission status: ${screenPermission}`);
      
      // Check microphone permission
      const micPermission = systemPreferences.getMediaAccessStatus('microphone');
      console.log(`Microphone permission status: ${micPermission}`);
      
      // Log permission statuses for debugging
      if (screenPermission !== 'granted') {
        console.log('Screen recording permission not granted');
      }
      
      if (micPermission !== 'granted') {
        console.log('Microphone permission not granted');
      }
    } catch (error) {
      console.error('Error checking media permissions:', error);
    }
  }
}

function resetProcess() {
  screenshotManager.resetScreenshots();
  windowManager.updateInstruction(
    windowManager.getDefaultInstructions(
      screenshotManager.getMultiPageMode(),
      screenshotManager.getScreenshots().length,
      hotkeyManager.getModifierKey(),
    ),
  );

  const mainWindow = windowManager.getMainWindow();
  if (mainWindow) {
    mainWindow.webContents.send(IPC_CHANNELS.CLEAR_RESULT);
  }
}

async function processScreenshotsWithAI() {
  const mainWindow = windowManager.getMainWindow();
  const screenshots = screenshotManager.getScreenshots();

  if (screenshots.length === 0) {
    mainWindow.webContents.send(IPC_CHANNELS.WARNING, "No screenshots to process. Take a screenshot first.");
    return;
  }

  try {
    windowManager.updateInstruction("Processing screenshots with AI...");

    await aiProcessing.processScreenshots(
      mainWindow,
      configManager.getAiProvider(),
      configManager.getCurrentModel(),
      aiProviders.verifyOllamaModel,
      aiProviders.generateWithOllama,
      aiProviders.generateWithGemini,
      openai,
      true,
    );
  } catch (error) {
    console.error("Error processing screenshots:", error);
    mainWindow.webContents.send(IPC_CHANNELS.ERROR, "Failed to process screenshots: " + error.message);
    windowManager.updateInstruction(
      windowManager.getDefaultInstructions(
        screenshotManager.getMultiPageMode(),
        screenshotManager.getScreenshots().length,
        hotkeyManager.getModifierKey(),
      ),
    );
  }
}

app.whenReady().then(async () => {
  console.log("Application is ready, checking permissions...");
  
  // Check screen capture permissions
  await checkScreenCapturePermissions();
  
  const mainWindow = windowManager.createMainWindow();
  
  // Provide clear permission status to the user
  if (process.platform === 'darwin') {
    try {
      const { systemPreferences } = require('electron');
      const screenPermission = systemPreferences.getMediaAccessStatus('screen');
      const micPermission = systemPreferences.getMediaAccessStatus('microphone');
      
      if (screenPermission !== 'granted') {
        setTimeout(() => {
          mainWindow.webContents.send(IPC_CHANNELS.NOTIFICATION, {
            title: "Permission Required",
            body: "This app requires screen recording permission to work correctly. Please enable it in System Preferences.",
            type: "warning"
          });
        }, 2000);
      }
    } catch (err) {
      console.error("Error checking permissions:", err);
    }
  }
  
  eventHandler.setupEventHandlers(mainWindow, configManager, windowManager, aiProviders);
  const screenshotInstance = screenshotManager.initScreenshotCapture(mainWindow);

  hotkeyManager.registerHandlers({
    TOGGLE_VISIBILITY: () => {
      const isVisible = windowManager.toggleWindowVisibility();
      hotkeyManager.updateHotkeys(isVisible);
    },
    PROCESS_SCREENSHOTS: () => {
      if (screenshotManager.getScreenshots().length === 0) {
        mainWindow.webContents.send(IPC_CHANNELS.WARNING, "No screenshots to process. Take a screenshot first.");
        return;
      }
      processScreenshotsWithAI();
    },
    OPEN_SETTINGS: () => windowManager.createModelSelectionWindow(),
    MOVE_LEFT: () => windowManager.moveWindow("left"),
    MOVE_RIGHT: () => windowManager.moveWindow("right"),
    MOVE_UP: () => windowManager.moveWindow("up"),
    MOVE_DOWN: () => windowManager.moveWindow("down"),
    TAKE_SCREENSHOT: async () => {
      try {
        windowManager.updateInstruction("Taking screenshot...");
        const img = await screenshotManager.captureScreenshot(mainWindow);
        screenshotManager.addScreenshot(img);
        windowManager.updateInstruction("Processing screenshot with AI...");
        await processScreenshotsWithAI();
      } catch (error) {
        console.error(`${hotkeyManager.getModifierKey()}+H error:`, error);
        mainWindow.webContents.send(IPC_CHANNELS.ERROR, `Error processing command: ${error.message}`);
        windowManager.updateInstruction(
          windowManager.getDefaultInstructions(
            screenshotManager.getMultiPageMode(),
            screenshotManager.getScreenshots().length,
            hotkeyManager.getModifierKey(),
          ),
        );
      }
    },
    // AREA_SCREENSHOT: () => {
    //   try {
    //     windowManager.updateInstruction("Select an area to screenshot...");
    //     screenshotInstance.startCapture();
    //   } catch (error) {
    //     console.error(`${hotkeyManager.getModifierKey()}+D error:`, error);
    //     mainWindow.webContents.send(IPC_CHANNELS.ERROR, `Error starting area capture: ${error.message}`);
    //     windowManager.updateInstruction(
    //       windowManager.getDefaultInstructions(
    //         screenshotManager.getMultiPageMode(),
    //         screenshotManager.getScreenshots().length,
    //         hotkeyManager.getModifierKey(),
    //       ),
    //     );
    //   }
    // },
    MULTI_PAGE: async () => {
      try {
        if (!screenshotManager.getMultiPageMode()) {
          screenshotManager.setMultiPageMode(true);
          windowManager.updateInstruction(
            `Multi-mode: ${
              screenshotManager.getScreenshots().length
            } screenshots. ${hotkeyManager.getModifierKey()}+A to add more, ${hotkeyManager.getModifierKey()}+Enter to analyze`,
          );
        }
        windowManager.updateInstruction("Taking screenshot for multi-mode...");
        const img = await screenshotManager.captureScreenshot(mainWindow);
        screenshotManager.addScreenshot(img);
        windowManager.updateInstruction(
          `Multi-mode: ${
            screenshotManager.getScreenshots().length
          } screenshots captured. ${hotkeyManager.getModifierKey()}+A to add more, ${hotkeyManager.getModifierKey()}+Enter to analyze`,
        );
      } catch (error) {
        console.error(`${hotkeyManager.getModifierKey()}+A error:`, error);
        mainWindow.webContents.send(IPC_CHANNELS.ERROR, `Error processing command: ${error.message}`);
      }
    },
    RESET: () => resetProcess(),
    QUIT: () => {
      app.quit();
    },
    MODEL_SELECTION: () => windowManager.createModelSelectionWindow(),
  });

  screenshotInstance.on("ok", async (data) => {
    try {
      const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
      const imagePath = path.join(app.getPath("pictures"), `screenshot-${timestamp}.png`);

      fs.writeFileSync(imagePath, data.buffer);
      const base64Image = `data:image/png;base64,${data.buffer.toString("base64")}`;
      screenshotManager.addScreenshot(base64Image);
      const dimensions = { width: data.bounds.width, height: data.bounds.height };
      
      // Clear notification about screenshot capture
      mainWindow.webContents.send(IPC_CHANNELS.NOTIFICATION, {
        body: `Screenshot captured (${dimensions.width}x${dimensions.height})`,
        type: "success",
      });
      
      // Show notification that we're preparing to process
      mainWindow.webContents.send(IPC_CHANNELS.NOTIFICATION, {
        body: `Processing screenshot with ${configManager.getAiProvider()}...`,
        type: "info",
      });
      
      // Add small delay to allow notifications to be seen by user
      await new Promise(resolve => setTimeout(resolve, 800));

      await processScreenshotsWithAI();
    } catch (error) {
      console.error("Error handling screenshot:", error);
      mainWindow.webContents.send(IPC_CHANNELS.ERROR, `Failed to process screenshot: ${error.message}`);
      
      // Show detailed error notification
      mainWindow.webContents.send(IPC_CHANNELS.NOTIFICATION, {
        body: `Screenshot capture failed: ${error.message}`,
        type: "error",
      });
      
      mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);
    }
  });

  screenshotInstance.on("cancel", () => {});
  eventHandler.setupScreenCaptureDetection(mainWindow, windowManager);
  hotkeyManager.updateHotkeys(true);

  setTimeout(() => {
    windowManager.updateInstruction(
      windowManager.getDefaultInstructions(
        screenshotManager.getMultiPageMode(),
        screenshotManager.getScreenshots().length,
        hotkeyManager.getModifierKey(),
      ),
    );
  }, 1000);

  ipcMain.on(IPC_CHANNELS.SCREENSHOT_READY_FOR_PROCESSING, async () => {
    await processScreenshotsWithAI();
  });
});

app.on("window-all-closed", () => {
  hotkeyManager.unregisterAll();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const mainWindow = windowManager.createMainWindow();
    // Register hotkeys again
    hotkeyManager.updateHotkeys(true);
  }
});
