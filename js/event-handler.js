// Event handler for IPC events
const { ipcMain, app, dialog, desktopCapturer, shell, Menu, BrowserWindow } = require("electron");

// Setup IPC event handlers
function setupEventHandlers(mainWindow, configManager, windowManager, aiProviders) {
  // Handler for getting current settings
  ipcMain.handle("get-current-settings", () => {
    return configManager.getCurrentSettings();
  });

  // Handler for updating model settings
  ipcMain.on("update-model-settings", (event, settings) => {
    // Update global settings
    configManager.updateSettings(settings);

    // Save to local storage via renderer (more reliable than electron-store for simple settings)
    if (mainWindow) {
      mainWindow.webContents.send("model-changed");
    }
  });

  // Handler for Ollama models
  ipcMain.handle("get-ollama-models", async () => {
    try {
      return await aiProviders.getOllamaModels();
    } catch (error) {
      console.error("Error getting Ollama models:", error);
      return [];
    }
  });

  // Toggle DevTools when requested
  ipcMain.on("toggle-devtools", () => {
    if (mainWindow) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
        mainWindow.webContents.send("devtools-toggled", false);
      } else {
        mainWindow.webContents.openDevTools();
        mainWindow.webContents.send("devtools-toggled", true);
      }
    }
  });

  // Show context menu for inspection
  ipcMain.on("show-context-menu", () => {
    if (mainWindow) {
      const template = [
        {
          label: "Inspect Element",
          click: () => {
            mainWindow.webContents.openDevTools();
            mainWindow.webContents.send("devtools-toggled", true);
          },
        },
        { type: "separator" },
        { label: "Reload", click: () => mainWindow.reload() },
        { type: "separator" },
        { label: "Copy", role: "copy" },
        { label: "Paste", role: "paste" },
      ];

      const menu = Menu.buildFromTemplate(template);
      menu.popup(BrowserWindow.fromWebContents(mainWindow.webContents));
    }
  });

  // Window control handlers
  ipcMain.on("minimize-window", () => {
    if (mainWindow) {
      mainWindow.minimize();
    }
  });

  ipcMain.on("maximize-window", () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on("close-window", () => {
    if (mainWindow) {
      mainWindow.close();
    }
  });

  // Screenshot area handlers
  ipcMain.on("area-cancelled", () => {
    mainWindow.show();
  });

  ipcMain.on("area-selected", async (event, rect) => {
    try {
      // Handle the old format from area-selector.html
      const timestamp = Date.now();
      const fileName = `area_screenshot_${timestamp}.png`;
      const picturesDir = app.getPath("pictures");
      const imagePath = require("path").join(picturesDir, fileName);

      try {
        // Take a full screenshot with screenshot-desktop
        await require("screenshot-desktop")({ filename: imagePath });

        // Read the image file to base64
        const imageBuffer = require("fs").readFileSync(imagePath);
        const base64Image = `data:image/png;base64,${imageBuffer.toString("base64")}`;

        // Get dimensions
        const dimensions = { width: rect.width || 0, height: rect.height || 0 };

        // Notify user about saved screenshot
        mainWindow.webContents.send("notification", {
          body: `Area screenshot saved to ${imagePath} (${dimensions.width}x${dimensions.height})`,
          type: "success",
        });

        mainWindow.webContents.send("warning", "Using full screenshot instead of area selection");

        // Process with AI
        windowManager.updateInstruction("Processing area screenshot with AI...");
        
        // Add screenshot to collection and process
        const screenshotManager = require('./screenshot-manager');
        screenshotManager.addScreenshot(base64Image);
        
        // Process the screenshots - this needs to be handled by the caller
        mainWindow.webContents.send("screenshot-ready-for-processing", true);
      } catch (err) {
        console.error("Error handling backward compatibility screenshot:", err);
        mainWindow.webContents.send("error", `Failed to capture area: ${err.message}`);
        windowManager.updateInstruction("Press Cmd+H to take a screenshot");
      }
    } catch (err) {
      console.error("Error in backward compatibility area-selected handler:", err);
      mainWindow.webContents.send("error", `Failed to process area selection: ${err.message}`);
      windowManager.updateInstruction("Press Cmd+H to take a screenshot");
    }
  });

  return ipcMain;
}

// Setup screen capture detection
function setupScreenCaptureDetection(mainWindow, windowManager) {
  if (process.platform === "darwin") {
    // macOS screen capture detection
    const { systemPreferences } = require("electron");

    try {
      // Check if screen recording permission is granted
      const hasScreenCapturePermission = systemPreferences.getMediaAccessStatus("screen");

      if (hasScreenCapturePermission === "granted") {
        // Check if screen is being captured/shared
        systemPreferences.subscribeWorkspaceNotification("NSWorkspaceScreenIsSharedDidChangeNotification", () => {
          const isBeingCaptured = systemPreferences.getMediaAccessStatus("screen") === "granted";

          if (isBeingCaptured) {
            // Screen is being shared, make window nearly invisible
            windowManager.toggleWindowVisibility(false);

            // Also notify the renderer
            if (mainWindow?.webContents) {
              mainWindow.webContents.send("screen-sharing-detected");
            }
          }
        });
      }
    } catch (error) {
      console.error("Error setting up screen capture detection:", error);
    }
  }

  // Add listener for screen sharing detection on Windows/Linux
  if (process.platform === "win32" || process.platform === "linux") {
    try {
      // Use desktopCapturer as a way to detect screen sharing
      let checkInterval = setInterval(() => {
        desktopCapturer
          .getSources({ types: ["screen"] })
          .then((sources) => {
            // If more than one screen source is found, it might indicate screen sharing
            if (sources.length > 1) {
              windowManager.toggleWindowVisibility(false);

              // Notify the renderer
              if (mainWindow?.webContents) {
                mainWindow.webContents.send("screen-sharing-detected");
              }
            }
          })
          .catch((error) => {
            console.error("Error checking screen sources:", error);
          });
      }, 5000); // Check every 5 seconds

      // Clear interval when window is closed
      mainWindow.on("closed", () => {
        clearInterval(checkInterval);
        checkInterval = null;
      });
    } catch (error) {
      console.error("Error setting up screen sharing detection:", error);
    }
  }
}

module.exports = {
  setupEventHandlers,
  setupScreenCaptureDetection
}; 