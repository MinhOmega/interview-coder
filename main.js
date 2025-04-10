const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { OpenAI } = require("openai");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");
require("dotenv").config();

const configManager = require("./js/config-manager");
const windowManager = require("./js/window-manager");
const screenshotManager = require("./js/screenshot-manager");
const hotkeyManager = require("./js/hotkey-manager");
const aiProviders = require("./js/ai-providers");
const aiProcessing = require("./js/ai-processing");
const eventHandler = require("./js/event-handler");

axios.defaults.family = 4;

let openai = null;
let geminiAI = null;

try {
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey && apiKey !== "YOUR_OPENAI_API_KEY") {
    openai = new OpenAI({ apiKey });
  }

  // Initialize Gemini client
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (geminiApiKey && geminiApiKey !== "YOUR_GEMINI_API_KEY") {
    geminiAI = new GoogleGenerativeAI(geminiApiKey);
  }

  // Initialize AI providers
  aiProviders.initializeAIClients();
} catch (err) {
  console.error("Error setting up AI clients:", err);
}

// Function to reset the process
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
    mainWindow.webContents.send("clear-result");
  }
}

// Process screenshots based on current mode
async function processScreenshotsWithAI() {
  const mainWindow = windowManager.getMainWindow();
  const screenshots = screenshotManager.getScreenshots();

  if (screenshots.length === 0) {
    mainWindow.webContents.send("warning", "No screenshots to process. Take a screenshot first.");
    return;
  }

  try {
    windowManager.updateInstruction("Processing screenshots with AI...");

    // Process screenshots with AI
    await aiProcessing.processScreenshots(
      mainWindow,
      configManager.getAiProvider(),
      configManager.getCurrentModel(),
      aiProviders.verifyOllamaModel,
      aiProviders.generateWithOllama,
      aiProviders.generateWithGemini,
      openai,
      true, // Use streaming
    );
  } catch (error) {
    console.error("Error processing screenshots:", error);
    mainWindow.webContents.send("error", "Failed to process screenshots: " + error.message);
    windowManager.updateInstruction(
      windowManager.getDefaultInstructions(
        screenshotManager.getMultiPageMode(),
        screenshotManager.getScreenshots().length,
        hotkeyManager.getModifierKey(),
      ),
    );
  }
}

// Setup the application when ready
app.whenReady().then(() => {
  // Create the main window
  const mainWindow = windowManager.createMainWindow();

  // Setup event handlers
  eventHandler.setupEventHandlers(mainWindow, configManager, windowManager, aiProviders);

  // Initialize screenshot capture
  const screenshotInstance = screenshotManager.initScreenshotCapture(mainWindow);

  // Setup shortcut handlers
  hotkeyManager.registerHandlers({
    TOGGLE_VISIBILITY: () => {
      const isVisible = windowManager.toggleWindowVisibility();
      hotkeyManager.updateHotkeys(isVisible);
    },
    PROCESS_SCREENSHOTS: () => {
      if (screenshotManager.getScreenshots().length === 0) {
        mainWindow.webContents.send("warning", "No screenshots to process. Take a screenshot first.");
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
        mainWindow.webContents.send("error", `Error processing command: ${error.message}`);
        windowManager.updateInstruction(
          windowManager.getDefaultInstructions(
            screenshotManager.getMultiPageMode(),
            screenshotManager.getScreenshots().length,
            hotkeyManager.getModifierKey(),
          ),
        );
      }
    },
    AREA_SCREENSHOT: () => {
      try {
        windowManager.updateInstruction("Select an area to screenshot...");
        screenshotInstance.startCapture();
      } catch (error) {
        console.error(`${hotkeyManager.getModifierKey()}+D error:`, error);
        mainWindow.webContents.send("error", `Error starting area capture: ${error.message}`);
        windowManager.updateInstruction(
          windowManager.getDefaultInstructions(
            screenshotManager.getMultiPageMode(),
            screenshotManager.getScreenshots().length,
            hotkeyManager.getModifierKey(),
          ),
        );
      }
    },
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
        mainWindow.webContents.send("error", `Error processing command: ${error.message}`);
      }
    },
    RESET: () => resetProcess(),
    QUIT: () => {
      app.quit();
    },
    MODEL_SELECTION: () => windowManager.createModelSelectionWindow(),
  });

  // Listen for screenshot events
  screenshotInstance.on("ok", async (data) => {
    try {
      const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
      const imagePath = path.join(app.getPath("pictures"), `screenshot-${timestamp}.png`);

      // Save the image
      fs.writeFileSync(imagePath, data.buffer);

      // Convert to base64 for processing
      const base64Image = `data:image/png;base64,${data.buffer.toString("base64")}`;

      // Add to screenshots array and process
      screenshotManager.addScreenshot(base64Image);

      // Get dimensions
      const dimensions = { width: data.bounds.width, height: data.bounds.height };

      // Notify about saved screenshot
      mainWindow.webContents.send("notification", {
        body: `Window screenshot saved to ${imagePath} (${dimensions.width}x${dimensions.height})`,
        type: "success",
      });

      // Process the screenshot
      await processScreenshotsWithAI();
    } catch (error) {
      console.error("Error handling screenshot:", error);
      mainWindow.webContents.send("error", `Failed to process screenshot: ${error.message}`);
      // Hide instruction banner on error
      mainWindow.webContents.send("hide-instruction");
    }
  });

  // Listen for cancel event
  screenshotInstance.on("cancel", () => {});

  // Setup screen capture detection
  eventHandler.setupScreenCaptureDetection(mainWindow, windowManager);

  // Register hotkeys
  hotkeyManager.updateHotkeys(true);

  // Send initial status to renderer
  setTimeout(() => {
    windowManager.updateInstruction(
      windowManager.getDefaultInstructions(
        screenshotManager.getMultiPageMode(),
        screenshotManager.getScreenshots().length,
        hotkeyManager.getModifierKey(),
      ),
    );
  }, 1000);

  // Handle screenshot-ready-for-processing event
  ipcMain.on("screenshot-ready-for-processing", async () => {
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
