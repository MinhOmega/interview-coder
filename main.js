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
require("dotenv").config();

// Set up hot reload for development
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
if (isDev) {
  try {
    require('electron-reload')(__dirname, {
      electron: path.join(__dirname, 'node_modules', '.bin', 'electron'),
      hardResetMethod: 'exit',
      ignored: [
        /node_modules/,
        /[\/\\]\./,
        /\.git/,
        /\.map$/,
        /package-lock\.json$/
      ]
    });
    console.log('Hot reload enabled for development');
  } catch (err) {
    console.error('Failed to initialize hot reload:', err);
  }
}

// Development mode notification
if (isDev) {
  console.log('Running in development mode with hot reload');
}

axios.defaults.family = 4;

let openai = null;

try {
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey && apiKey !== "YOUR_OPENAI_API_KEY") {
    openai = new OpenAI({ apiKey });
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (geminiApiKey && geminiApiKey !== "YOUR_GEMINI_API_KEY") {
    geminiAI = new GoogleGenerativeAI(geminiApiKey);
  }

  aiProviders.initializeAIClients();
} catch (err) {
  console.error("Error setting up AI clients:", err);
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

app.whenReady().then(() => {
  const mainWindow = windowManager.createMainWindow();
  eventHandler.setupEventHandlers(mainWindow, configManager, windowManager, aiProviders);
  const screenshotInstance = screenshotManager.initScreenshotCapture(mainWindow);

  // Set up hot reload for development mode with more granular control
  if (isDev) {
    try {
      const devConfig = require('./js/dev-config');
      // Pass windows to the hot reload module for targeted reloading
      devConfig.setupHotReload(mainWindow, windowManager.getModelListWindow());
    } catch (err) {
      console.error('Error setting up dev hot reload:', err);
    }
  }

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
      mainWindow.webContents.send(IPC_CHANNELS.NOTIFICATION, {
        body: `Window screenshot saved to ${imagePath} (${dimensions.width}x${dimensions.height})`,
        type: "success",
      });

      await processScreenshotsWithAI();
    } catch (error) {
      console.error("Error handling screenshot:", error);
      mainWindow.webContents.send(IPC_CHANNELS.ERROR, `Failed to process screenshot: ${error.message}`);
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
