const {
  app,
  BrowserWindow,
  ipcMain,
  nativeImage,
  desktopCapturer,
  systemPreferences,
  Menu,
  MenuItem,
} = require("electron");
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
const { IPC_CHANNELS, AI_PROVIDERS } = require("./js/constants");
const { getAppPath, isCommandAvailable } = require("./js/utils");
const { isLinux, isMac, isWindows } = require("./js/config");
const toastManager = require("./js/toast-manager");
const macOSPermissions = isMac ? require("./js/macos-permissions") : null;

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

// Replace console with electron-log
Object.assign(console, log.functions);
console.log("Starting application with electron-log integration");

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
    toastManager.warning("No screenshots to process. Take a screenshot first.");
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
      true,
    );
  } catch (error) {
    log.error("Error processing screenshots:", error);
    toastManager.error("Failed to process screenshots: " + error.message);
    windowManager.updateInstruction(
      windowManager.getDefaultInstructions(
        screenshotManager.getMultiPageMode(),
        screenshotManager.getScreenshots().length,
        hotkeyManager.getModifierKey(),
      ),
    );
  }
}

/**
 * Captures a fallback screenshot of the entire screen using Electron's desktopCapturer
 * Used when area screenshot is not available
 */
async function captureFullScreenFallback() {
  try {
    // On macOS, ensure we have proper permissions first
    if (isMac) {
      const status = systemPreferences.getMediaAccessStatus("screen");
      if (status !== "granted") {
        await systemPreferences.askForMediaAccess("screen");
        // The actual permission status might not change immediately, but we've at least asked
      }
    }

    const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
    const picturesPath = getAppPath("pictures", "");
    const imagePath = path.join(picturesPath, `fullscreen-${timestamp}.png`);

    // Get screen sources with high resolution thumbnails
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 3840, height: 2160 }, // Request higher resolution thumbnail
      fetchWindowIcons: false,
    });

    if (sources.length === 0) {
      throw new Error("No screen sources found");
    }

    // Take screenshot of the primary screen
    const primarySource = sources[0];
    const thumbnail = primarySource.thumbnail;

    // Convert to PNG with high quality
    const pngBuffer = thumbnail.toPNG({ scaleFactor: 1.0 });

    // Save to disk
    fs.writeFileSync(imagePath, pngBuffer);

    return {
      buffer: pngBuffer,
      path: imagePath,
      dimensions: {
        width: thumbnail.getSize().width,
        height: thumbnail.getSize().height,
      },
    };
  } catch (error) {
    log.error("Error capturing fallback screenshot:", error);
    throw error;
  }
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

  // Create application menu with DevTools access
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools", accelerator: isMac ? "Cmd+Alt+I" : "Ctrl+Shift+I" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [{ type: "separator" }, { role: "front" }, { type: "separator" }, { role: "window" }]
          : [{ role: "close" }]),
      ],
    },
    {
      label: "Debug",
      submenu: [
        {
          label: "Toggle DevTools",
          accelerator: isMac ? "Cmd+Alt+I" : "Ctrl+Shift+I",
          click: () => {
            const mainWindow = windowManager.getMainWindow();
            if (mainWindow) {
              if (mainWindow.webContents.isDevToolsOpened()) {
                mainWindow.webContents.closeDevTools();
              } else {
                mainWindow.webContents.openDevTools();
              }
            }
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  const mainWindow = windowManager.createMainWindow();

  // Initialize AI clients from saved config
  const initStatus = aiProviders.initializeFromConfig();
  log.info("AI clients initialization status:", initStatus);
  if (initStatus.openai) {
    openai = aiProviders.getOpenAI();
  }

  // Linux-specific initialization
  if (isLinux) {
    // Verify that hotkeys are properly registered, especially Ctrl+B
    setTimeout(() => {
      try {
        const isRegistered = hotkeyManager.validateHotkeys();
        if (!isRegistered) {
          log.warn("Hotkeys may not be properly registered on Linux. Using fallback mechanisms.");

          // Show Linux shortcuts info
          const platformShortcuts = hotkeyManager.getPlatformShortcuts();
          toastManager.info(
            `For Linux: The key ${platformShortcuts.toggleVisibility} should toggle visibility. Please ensure X11 keyboard support is installed.`,
          );
        }
      } catch (error) {
        log.error("Error validating hotkeys on Linux:", error);
      }
    }, 2000);
  }

  // Handle API key initialization from UI
  ipcMain.handle(IPC_CHANNELS.INITIALIZE_AI_CLIENT, async (_, provider, apiKey) => {
    try {
      log.info(`Initializing ${provider} client with provided API key`);
      const result = aiProviders.updateAIClients(provider, apiKey);

      if (provider === AI_PROVIDERS.OPENAI && result) {
        // Update the openai reference for use in processScreenshots
        openai = aiProviders.getOpenAI();
      }

      return { success: result };
    } catch (error) {
      log.error(`Error initializing ${provider} client:`, error);
      return { success: false, error: error.message };
    }
  });

  // Handle saving API key to settings file
  ipcMain.handle(IPC_CHANNELS.SAVE_API_KEY, async (_, apiKey) => {
    try {
      return configManager.saveApiKey(apiKey);
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
    OPEN_SETTINGS: () => windowManager.createModelSelectionWindow(),
    MOVE_LEFT: () => windowManager.moveWindow("left"),
    MOVE_RIGHT: () => windowManager.moveWindow("right"),
    MOVE_UP: () => windowManager.moveWindow("up"),
    MOVE_DOWN: () => windowManager.moveWindow("down"),
    SCROLL_UP: () => windowManager.scrollContent("up"),
    SCROLL_DOWN: () => windowManager.scrollContent("down"),
    INCREASE_WINDOW_SIZE: () => windowManager.resizeWindow("increase"),
    DECREASE_WINDOW_SIZE: () => windowManager.resizeWindow("decrease"),
    TOGGLE_DEVTOOLS: () => {
      try {
        const mainWindow = windowManager.getMainWindow();
        if (mainWindow) {
          if (mainWindow.webContents.isDevToolsOpened()) {
            mainWindow.webContents.closeDevTools();
          } else {
            mainWindow.webContents.openDevTools();
          }
        }
      } catch (error) {
        log.error("Error toggling DevTools:", error);
      }
    },
    TAKE_SCREENSHOT: async () => {
      try {
        windowManager.updateInstruction("Taking screenshot...");
        const img = await screenshotManager.captureScreenshot(mainWindow);
        screenshotManager.addScreenshot(img);
        windowManager.updateInstruction("Processing screenshot with AI...");
        await processScreenshotsWithAI();
      } catch (error) {
        log.error(`${hotkeyManager.getModifierKey()}+H error:`, error);
        toastManager.error(`Error processing command: ${error.message}`);
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
                const result = await captureFullScreenFallback();
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
                  windowManager.getDefaultInstructions(
                    screenshotManager.getMultiPageMode(),
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
        log.error(`${hotkeyManager.getModifierKey()}+A error:`, error);
        toastManager.error(`Error processing command: ${error.message}`);
      }
    },
    RESET: () => resetProcess(),
    QUIT: () => {
      app.quit();
    },
    MODEL_SELECTION: () => windowManager.createModelSelectionWindow(),
    TOGGLE_SPLIT_VIEW: () => windowManager.toggleSplitView(),
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
          windowManager.getDefaultInstructions(
            screenshotManager.getMultiPageMode(),
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
    } else {
      // Shortcuts registered successfully
      // Inform users about platform-specific shortcuts
      if (isDev) {
        hotkeyManager.getPlatformShortcuts();
        setTimeout(() => {
          try {
            const modifier = hotkeyManager.getModifierKey();
            const platformName = {
              linux: "Linux",
              win32: "Windows",
              darwin: "macOS",
            }[process.platform];
            toastManager.info(`Using ${modifier} as the modifier key on ${platformName}`);
          } catch (error) {
            log.error("Error showing modifier key toast:", error);
          }
        }, 1000);
      }
    }
  } catch (hotkeyError) {
    log.error("Error registering hotkeys:", hotkeyError);
    // Don't crash, just continue without hotkeys
    toastManager.error(
      "An error occurred while setting up keyboard shortcuts. The app will still function through mouse interaction.",
    );
  }

  setTimeout(() => {
    try {
      windowManager.updateInstruction(
        windowManager.getDefaultInstructions(
          screenshotManager.getMultiPageMode(),
          screenshotManager.getScreenshots().length,
          hotkeyManager.getModifierKey(),
        ),
      );
    } catch (error) {
      log.error("Error updating instruction:", error);
    }
  }, 1000);

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
