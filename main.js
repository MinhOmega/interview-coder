const { app, BrowserWindow, ipcMain, nativeImage, Menu, MenuItem, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const log = require("electron-log");

const configManager = require("./js/config-manager");
const windowManager = require("./js/window-manager");
const screenshotManager = require("./js/screenshot-manager");
const hotkeyManager = require("./js/hotkey-manager");
const aiProviders = require("./js/ai-providers");
const aiProcessing = require("./js/ai-processing");
const eventHandler = require("./js/event-handler");
const uiModeManager = require("./js/ui-mode-manager");
const modeManager = require("./js/mode-manager");
const { IPC_CHANNELS, AI_PROVIDERS, PROCESSING_MODES } = require("./js/constants");
const { getAppPath, isCommandAvailable } = require("./js/utils");
const { isLinux, isMac, isWindows } = require("./js/config");
const toastManager = require("./js/toast-manager");
const macOSPermissions = isMac ? require("./js/macos-permissions") : null;
const ChatHandler = require("./js/chat-handler");
const UpdateManager = require("./js/update-manager");

// Set up hot reload for development
const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

// Configure electron-log
log.transports.file.level = "info";
log.transports.console.level = isDev ? "debug" : "info";
log.transports.file.maxSize = 10 * 1024 * 1024; // 10MB
log.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}";

// Use the non-deprecated errorHandler instead of catchErrors
log.errorHandler.startCatching({
  showDialog: false,
  onError(error) {
    log.error("Uncaught error:", error);
  },
});

// Don't replace console with electron-log to avoid timestamp spam
// Object.assign(console, log.functions);
log.info("Starting application with electron-log integration");

if (isDev) {
  try {
    require("electron-reload")(__dirname, {
      electron: path.join(__dirname, "node_modules", ".bin", "electron"),
      hardResetMethod: "exit",
      ignored: [/node_modules/, /[\/\\]\./, /\.git/, /\.map$/, /package-lock\.json$/],
    });
    log.info("Hot reload enabled for development");
  } catch (err) {
    log.error("Failed to initialize hot reload:", err);
  }
}

// Development mode notification
if (isDev) {
  log.info("Running in development mode with hot reload");
} else {
  log.info("Running in production mode");
}

axios.defaults.family = 4;

// Initialize ChatHandler
let chatHandler;
// Initialize UpdateManager
let updateManager;

function resetProcess(resetMode = true) {
  // Cancel all active AI requests first
  aiProcessing.cancelAllRequests();

  const mainWindow = windowManager.getMainWindow();

  screenshotManager.resetScreenshots();

  // Only reset mode if explicitly requested (for Cmd+R)
  if (resetMode) {
    // resetMode will update instruction internally
    modeManager.resetMode(mainWindow);
  } else {
    // Only update instruction if not resetting mode
    const instruction = modeManager.getModeInstruction(
      false,
      0,
      hotkeyManager.getModifierKey(),
    );
    windowManager.updateInstruction(instruction);
  }

  if (mainWindow) {
    // Batch IPC messages
    mainWindow.webContents.send(IPC_CHANNELS.CLEAR_RESULT);
    mainWindow.webContents.send(IPC_CHANNELS.CANCEL_AI_REQUEST);
  }
}

async function processScreenshotsWithAI() {
  const mainWindow = windowManager.getMainWindow();
  const screenshots = screenshotManager.getScreenshots();

  if (screenshots.length === 0) {
    toastManager.warning("No screenshots to process. Take a screenshot first.");
    return;
  }

  if (!mainWindow) {
    log.error("No main window available");
    return;
  }

  const currentMode = modeManager.getMode();
  const modeInfo = modeManager.getModeInfo();

  try {
    // Single instruction update before processing
    const processingMessage = currentMode === PROCESSING_MODES.UI_IMPLEMENTATION
      ? "Analyzing UI design..."
      : currentMode === PROCESSING_MODES.QUICK_ANSWER
      ? "Finding answer..."
      : "Analyzing problem...";

    windowManager.updateInstruction(`${modeInfo.icon} ${processingMessage}`);

    // Use appropriate processing based on current mode
    switch (currentMode) {
      case PROCESSING_MODES.UI_IMPLEMENTATION:
        await aiProcessing.processScreenshotsForUI(
          mainWindow,
          configManager.getAiProvider(),
          configManager.getCurrentModel(),
          aiProviders.verifyOllamaModel,
          aiProviders.generateWithOllama,
          aiProviders.generateWithGemini,
          true,
        );
        break;

      case PROCESSING_MODES.QUICK_ANSWER:
        await aiProcessing.processScreenshotsForDirectAnswer(
          mainWindow,
          configManager.getAiProvider(),
          configManager.getCurrentModel(),
          aiProviders.verifyOllamaModel,
          aiProviders.generateWithOllama,
          aiProviders.generateWithGemini,
          true,
        );
        break;

      case PROCESSING_MODES.ANALYTICS:
      default:
        await aiProcessing.processScreenshots(
          mainWindow,
          configManager.getAiProvider(),
          configManager.getCurrentModel(),
          aiProviders.verifyOllamaModel,
          aiProviders.generateWithOllama,
          aiProviders.generateWithGemini,
          true,
        );
        break;
    }
  } catch (error) {
    log.error("Error processing screenshots:", error);
    toastManager.error("Failed to process screenshots: " + error.message);
    windowManager.updateInstruction(
      modeManager.getModeInstruction(
        screenshots.length > 0,
        screenshots.length,
        hotkeyManager.getModifierKey(),
      ),
    );
  }
}

// Mode switching functions
function setAnalyticsMode() {
  const mainWindow = windowManager.getMainWindow();
  modeManager.setMode(PROCESSING_MODES.ANALYTICS, mainWindow);
  // Don't call updateModeInstruction() - setMode already updates everything
}

function setUIMode() {
  const mainWindow = windowManager.getMainWindow();
  modeManager.setMode(PROCESSING_MODES.UI_IMPLEMENTATION, mainWindow);
  // Don't call updateModeInstruction() - setMode already updates everything
}

function setQuickAnswerMode() {
  const mainWindow = windowManager.getMainWindow();
  modeManager.setMode(PROCESSING_MODES.QUICK_ANSWER, mainWindow);
  // Don't call updateModeInstruction() - setMode already updates everything
}

function updateModeInstruction() {
  const screenshots = screenshotManager.getScreenshots();
  const instruction = modeManager.getModeInstruction(
    screenshots.length > 0,
    screenshots.length,
    hotkeyManager.getModifierKey(),
  );
  windowManager.updateInstruction(instruction);
}

app.whenReady().then(async () => {
  // For macOS, ensure screen capture permissions are requested at startup
  if (isMac && macOSPermissions) {
    try {
      log.info("Initializing macOS permissions...");
      const permissionsStatus = await macOSPermissions.initializePermissions();
      log.info("macOS permissions initialized:", permissionsStatus);

      // Force permission request in production as a fallback
      if (!isDev && !permissionsStatus.screenCapturePermission) {
        log.info("Initial permission check failed, forcing permission request...");
        await macOSPermissions.forcePermissionRequest();
      }
    } catch (error) {
      log.error("Error initializing macOS permissions:", error);
    }
  }

  const mainWindow = windowManager.createMainWindow();

  // Show window when ready
  let windowShown = false;

  mainWindow.once("ready-to-show", () => {
    if (!windowShown) {
      mainWindow.show();
      windowShown = true;
    }
  });

  // Fallback: Show window after content loads if ready-to-show doesn't fire
  mainWindow.webContents.once("did-finish-load", () => {
    setTimeout(() => {
      if (!windowShown) {
        mainWindow.show();
        windowShown = true;
      }
    }, 150);  // Small delay to ensure content is painted
  });

  // Send initial mode to renderer when window is ready
  mainWindow.webContents.on("did-finish-load", () => {
    try {
      const modeInfo = modeManager.getModeInfo();
      const currentMode = modeManager.getMode();
      const instruction = modeManager.getModeInstruction(
        false,
        0,
        hotkeyManager.getModifierKey(),
      );

      // Send mode update to renderer
      mainWindow.webContents.send(IPC_CHANNELS.MODE_CHANGED, {
        mode: currentMode,
        modeInfo: modeInfo,
      });

      // Update instruction immediately
      windowManager.updateInstruction(instruction);
    } catch (error) {
      log.error("Error sending initial mode:", error);
    }
  });

  // Initialize AI clients from saved config
  const initStatus = aiProviders.initializeFromConfig();
  log.info("AI clients initialization status:", initStatus);
  if (initStatus.openai) {
    openai = aiProviders.getOpenAI();
  }

  // Initialize ChatHandler
  chatHandler = new ChatHandler(aiProviders, configManager);

  // Initialize update manager
  updateManager = new UpdateManager(mainWindow);
  updateManager.startUpdateChecking();

  // Handle API key initialization from UI
  ipcMain.handle(IPC_CHANNELS.INITIALIZE_AI_CLIENT, async (_, provider, apiKey, endpoint) => {
    try {
      log.info(`Initializing ${provider} client with provided API key`);
      const result = aiProviders.updateAIClients(provider, apiKey, endpoint);

      if (provider === AI_PROVIDERS.OPENAI && result) {
        // Update the openai reference for use in processScreenshots
        openai = aiProviders.getOpenAI();
      } else if (provider === AI_PROVIDERS.AZURE_FOUNDRY && result && endpoint) {
        // Update the Azure Foundry endpoint if provided
        aiProviders.setAzureFoundryEndpoint(endpoint);
      }

      return { success: result };
    } catch (error) {
      log.error(`Error initializing ${provider} client:`, error);
      return { success: false, error: error.message };
    }
  });

  // Handle saving API key to settings file
  ipcMain.handle(IPC_CHANNELS.SAVE_API_KEY, async (_, apiKey, provider) => {
    try {
      return configManager.saveApiKey(apiKey, provider);
    } catch (error) {
      log.error("Error saving API key:", error);
      return false;
    }
  });

  // Handle getting API key from settings file
  ipcMain.handle(IPC_CHANNELS.GET_API_KEY, async (event) => {
    try {
      return configManager.getApiKey();
    } catch (error) {
      log.error("Error getting API key:", error);
      return null;
    }
  });

  // Handle getting all API keys from settings file
  ipcMain.handle(IPC_CHANNELS.GET_ALL_API_KEYS, async (event) => {
    try {
      return configManager.getAllApiKeys();
    } catch (error) {
      log.error("Error getting all API keys:", error);
      return {};
    }
  });

  // Handle getting current mode
  ipcMain.handle(IPC_CHANNELS.GET_CURRENT_MODE, async (event) => {
    return {
      mode: modeManager.getMode(),
      modeInfo: modeManager.getModeInfo(),
    };
  });

  eventHandler.setupEventHandlers(mainWindow, configManager, windowManager, aiProviders);
  const screenshotInstance = screenshotManager.initScreenshotCapture();

  // Set up hot reload for development mode with more granular control
  if (isDev) {
    try {
      const devConfig = require("./js/dev-config");
      // Pass windows to the hot reload module for targeted reloading
      devConfig.setupHotReload(mainWindow, windowManager.getModelListWindow());
    } catch (err) {
      log.error("Error setting up dev hot reload:", err);
    }
  }

  hotkeyManager.registerHandlers({
    TOGGLE_VISIBILITY: () => windowManager.toggleWindowVisibility(),
    PROCESS_SCREENSHOTS: () => processScreenshotsWithAI(),
    SET_UI_MODE: () => setUIMode(),
    SET_QUICK_ANSWER_MODE: () => setQuickAnswerMode(),
    SET_ANALYTICS_MODE: () => setAnalyticsMode(),
    OPEN_SETTINGS: () => windowManager.createModelSelectionWindow(),
    MOVE_LEFT: () => windowManager.moveWindow("left"),
    MOVE_RIGHT: () => windowManager.moveWindow("right"),
    MOVE_UP: () => windowManager.moveWindow("up"),
    MOVE_DOWN: () => windowManager.moveWindow("down"),
    SCROLL_UP: () => windowManager.scrollContent("up"),
    SCROLL_DOWN: () => windowManager.scrollContent("down"),
    INCREASE_WINDOW_SIZE: () => windowManager.resizeWindow("increase"),
    DECREASE_WINDOW_SIZE: () => windowManager.resizeWindow("decrease"),
    TOGGLE_DEVTOOLS: () => windowManager.toggleDevTools(),
    TAKE_SCREENSHOT: async () => {
      try {
        // Don't reset mode when taking screenshot
        resetProcess(false);

        const modeInfo = modeManager.getModeInfo();
        const screenshotInstruction = `${modeInfo.icon} Taking screenshot...`;
        windowManager.updateInstruction(screenshotInstruction);

        const img = await screenshotManager.captureScreenshot(mainWindow);
        screenshotManager.addScreenshot(img);

        // Process directly without another instruction update
        await processScreenshotsWithAI();
      } catch (error) {
        log.error(`${hotkeyManager.getModifierKey()}+H error:`, error);
        toastManager.error(`Error processing command: ${error.message}`);
        windowManager.updateInstruction(
          modeManager.getModeInstruction(
            screenshotManager.getScreenshots().length > 0,
            screenshotManager.getScreenshots().length,
            hotkeyManager.getModifierKey(),
          ),
        );
      }
    },
    AREA_SCREENSHOT: () => {
      try {
        // Don't reset mode when taking area screenshot
        resetProcess(false);
        if (isLinux) {
          // Check if ImageMagick's import command is available
          if (!isCommandAvailable("import")) {
            windowManager.updateInstruction(
              "Area screenshot requires ImageMagick. Please install with: sudo apt-get install imagemagick",
            );

            // Use fallback full screen capture
            (async () => {
              try {
                windowManager.updateInstruction("Taking full screen screenshot as fallback...");
                const result = await screenshotManager.captureFullScreenFallback();
                const base64Image = `data:image/png;base64,${result.buffer.toString("base64")}`;
                screenshotManager.addScreenshot(base64Image);
                toastManager.success(
                  `Fullscreen screenshot saved to ${result.path} (${result.dimensions.width}x${result.dimensions.height})`,
                );

                // Process the screenshot with AI
                windowManager.updateInstruction("Processing screenshot with AI...");
                await processScreenshotsWithAI();
              } catch (fallbackError) {
                log.error("Fallback screenshot failed:", fallbackError);
                toastManager.error(`Fallback screenshot failed: ${fallbackError.message}`);
                windowManager.updateInstruction(
                  modeManager.getModeInstruction(
                    screenshotManager.getScreenshots().length > 0,
                    screenshotManager.getScreenshots().length,
                    hotkeyManager.getModifierKey(),
                  ),
                );
              }
            })();
            return;
          }
        }

        windowManager.updateInstruction("Select an area to screenshot...");
        const wasVisible = screenshotManager.autoHideWindow(mainWindow);
        screenshotInstance.startCapture();

        global.mainWindowWasVisible = wasVisible;
      } catch (error) {
        log.error(`${hotkeyManager.getModifierKey()}+D error:`, error);
        toastManager.error(`Error starting area capture: ${error.message}`);
        windowManager.updateInstruction(
          modeManager.getModeInstruction(
            screenshotManager.getScreenshots().length > 0,
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
        }
        const modeInfo = modeManager.getModeInfo();
        windowManager.updateInstruction("Taking screenshot for multi-mode...");
        const img = await screenshotManager.captureScreenshot(mainWindow);
        screenshotManager.addScreenshot(img);
        windowManager.updateInstruction(
          `${modeInfo.icon} ${modeInfo.shortName} Mode - Multi-mode: ${
            screenshotManager.getScreenshots().length
          } screenshots captured. ${hotkeyManager.getModifierKey()}+A to add more, ${hotkeyManager.getModifierKey()}+Enter to analyze`,
        );
      } catch (error) {
        log.error(`${hotkeyManager.getModifierKey()}+A error:`, error);
        toastManager.error(`Error processing command: ${error.message}`);
      }
    },
    RESET: () => resetProcess(true), // Reset everything including mode
    QUIT: () => app.quit(),
    TOGGLE_SPLIT_VIEW: () => windowManager.toggleSplitView(),
    SHOW_HOTKEYS: () => windowManager.showHotkeys(),
    CREATE_NEW_CHAT: () => {
      // First toggle split view off if it's on
      const mainWindow = windowManager.getMainWindow();
      if (mainWindow) {
        // Toggle off then on to create a new chat
        if (windowManager.toggleSplitView(false)) {
          // Force off
          windowManager.toggleSplitView(true); // Force on
          log.info("Created new chat via hotkey");
        } else {
          // Just toggle on if it was already off
          windowManager.toggleSplitView(true); // Force on
          log.info("Created new chat via hotkey (already off)");
        }
      }
    },
  });

  screenshotInstance.on("ok", async (event, buffer, data) => {
    try {
      // Show the main window if it was visible before
      if (global.mainWindowWasVisible) {
        mainWindow.show();
        global.mainWindowWasVisible = undefined;
      }

      // If the event is already prevented, don't proceed
      if (event && event.defaultPrevented) {
        return;
      }

      if (!buffer) {
        log.error("Screenshot buffer is invalid:", { event, buffer, data });
        toastManager.error("Failed to process screenshot: Invalid screenshot data");
        windowManager.updateInstruction(
          modeManager.getModeInstruction(
            screenshotManager.getScreenshots().length > 0,
            screenshotManager.getScreenshots().length,
            hotkeyManager.getModifierKey(),
          ),
        );
        return;
      }

      // Generate filename for the screenshot
      const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
      const picturesPath = getAppPath("pictures", "");
      const imagePath = path.join(picturesPath, `area-screenshot-${timestamp}.png`);

      // Save the image to disk first
      fs.writeFileSync(imagePath, buffer);

      // Verify the screenshot was saved correctly
      if (!fs.existsSync(imagePath)) {
        throw new Error("Screenshot file was not created");
      }

      const stats = fs.statSync(imagePath);
      if (stats.size < 1000) {
        throw new Error("Screenshot file is too small, likely empty");
      }

      // Get a higher quality version of the image using nativeImage
      const image = nativeImage.createFromBuffer(buffer);

      // Create dimensions object
      const dimensions = {
        width: image.getSize().width,
        height: image.getSize().height,
      };

      // Convert to high-quality PNG (with proper scale factor)
      const highQualityPngBuffer = image.toPNG({
        scaleFactor: 2.0,
      });

      // Overwrite the original file with the higher quality version
      fs.writeFileSync(imagePath, highQualityPngBuffer);

      // Convert to base64 for the app
      const base64Image = `data:image/png;base64,${highQualityPngBuffer.toString("base64")}`;

      // Add screenshot to the manager
      screenshotManager.addScreenshot(base64Image);

      // Show notification
      toastManager.success(`Area screenshot saved to ${imagePath} (${dimensions.width}x${dimensions.height})`);

      // Process the screenshot with AI
      await processScreenshotsWithAI();
    } catch (error) {
      log.error("Error handling screenshot:", error);
      toastManager.error(`Failed to process screenshot: ${error.message}`);
      mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);
    }
  });

  screenshotInstance.on("cancel", () => {
    // Show the main window if it was visible before
    if (global.mainWindowWasVisible) {
      mainWindow.show();
      global.mainWindowWasVisible = undefined;
    }
  });
  eventHandler.setupScreenCaptureDetection(mainWindow, windowManager);

  try {
    // Try to register hotkeys but don't crash if it fails
    const hotkeySuccess = hotkeyManager.updateHotkeys(true);

    if (!hotkeySuccess) {
      log.info("No hotkeys registered successfully, but application will continue running");
      // Show toast notification to user about hotkey issues
      setTimeout(() => {
        toastManager.error(
          "Keyboard shortcuts are unavailable on your system. The app will still function through mouse interaction.",
        );

        if (isWindows) {
          // For Windows, show fallback UI instructions
          setTimeout(() => {
            toastManager.info(
              "Use the system tray icon or app buttons to control the application instead of keyboard shortcuts.",
            );
          }, 2000);
        } else if (isLinux) {
          // For Linux, suggest installing additional packages
          setTimeout(() => {
            toastManager.info(
              "On Linux, you may need to install X11 development packages to enable keyboard shortcuts.",
            );
          }, 2000);
        }
      }, 2000);
    }
  } catch (hotkeyError) {
    log.error("Error registering hotkeys:", hotkeyError);
    // Don't crash, just continue without hotkeys
    toastManager.error(
      "An error occurred while setting up keyboard shortcuts. The app will still function through mouse interaction.",
    );
  }

  // Removed redundant setTimeout - initial instruction is already set in did-finish-load event

  ipcMain.on(IPC_CHANNELS.SCREENSHOT_READY_FOR_PROCESSING, async () => {
    await processScreenshotsWithAI();
  });

  // Register right-click context menu with DevTools
  mainWindow.webContents.on("context-menu", (_, params) => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Inspect Element",
        click: () => {
          mainWindow.webContents.inspectElement(params.x, params.y);
        },
      },
    ]);
    contextMenu.popup();
  });

  // Listen for clear conversation command
  ipcMain.on(IPC_CHANNELS.CLEAR_CONVERSATION, (event) => {
    try {
      // Get the window ID from the sender
      const windowId = event.sender.id;

      // Clear the conversation for this window
      if (chatHandler) {
        chatHandler.clearConversation(windowId);
        log.info(`Cleared conversation for window ${windowId}`);
      }
    } catch (error) {
      log.error("Error clearing conversation:", error);
    }
  });

  // Handle update action from renderer
  ipcMain.on(IPC_CHANNELS.UPDATE_ACTION, (event, data) => {
    if (data.action === "download" && data.url) {
      shell.openExternal(data.url);
      log.info(`Opening update download URL: ${data.url}`);
    }
  });
});

app.on("window-all-closed", () => {
  hotkeyManager.unregisterAll();
  if (!isMac) {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    windowManager.createMainWindow();

    try {
      hotkeyManager.updateHotkeys(true);
    } catch (error) {
      log.error("Error updating hotkeys on activate:", error);
    }
  }
});

app.on("before-quit", () => {
  // Stop update checking when app is about to quit
  updateManager.stopUpdateChecking();
});
