const { ipcMain, app, desktopCapturer, Menu, BrowserWindow, systemPreferences } = require("electron");
const { IPC_CHANNELS } = require("./constants");

/**
 * Sets up event handlers for the application's IPC communication
 * 
 * @param {BrowserWindow} mainWindow - The main application window
 * @param {Object} configManager - Manager for application configuration
 * @param {Object} windowManager - Manager for window visibility and state
 * @param {Object} aiProviders - Provider for AI model interactions
 * @returns {Object} The configured ipcMain object
 */
function setupEventHandlers(mainWindow, configManager, windowManager, aiProviders) {
  ipcMain.handle(IPC_CHANNELS.GET_CURRENT_SETTINGS, () => {
    return configManager.getCurrentSettings();
  });

  ipcMain.on(IPC_CHANNELS.UPDATE_MODEL_SETTINGS, (_, settings) => {
    configManager.updateSettings(settings);

    if (mainWindow) {
      mainWindow.webContents.send("model-changed");
    }
  });

  ipcMain.handle(IPC_CHANNELS.GET_OLLAMA_MODELS, async () => {
    try {
      return await aiProviders.getOllamaModels();
    } catch (error) {
      console.error("Error getting Ollama models:", error);
      return [];
    }
  });

  ipcMain.on(IPC_CHANNELS.TOGGLE_DEVTOOLS, () => {
    if (mainWindow) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools();
      }
    }
  });

  // Handler for manual reloading in development mode
  ipcMain.on(IPC_CHANNELS.DEV_RELOAD, () => {
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    if (!isDev) return;
    
    console.log('Manual reload triggered');
    
    if (mainWindow) {
      mainWindow.webContents.reloadIgnoringCache();
    }
    
    const modelListWindow = windowManager.getModelListWindow();
    if (modelListWindow) {
      modelListWindow.webContents.reloadIgnoringCache();
    }
  });

  ipcMain.on(IPC_CHANNELS.SHOW_CONTEXT_MENU, () => {
    if (mainWindow) {
      const template = [
        {
          label: "Inspect Element",
          click: () => {
            mainWindow.webContents.openDevTools();
          },
        },
        { type: "separator" },
        { label: "Reload", click: () => mainWindow.reload() },
        { type: "separator" },
        { label: "Copy", role: "copy" },
        { label: "Paste", role: "paste" },
      ];

      // Add development-only menu items
      if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
        template.splice(2, 0, {
          label: "Force Reload (Dev)",
          click: () => {
            mainWindow.webContents.reloadIgnoringCache();
          }
        });
      }

      const menu = Menu.buildFromTemplate(template);
      menu.popup(BrowserWindow.fromWebContents(mainWindow.webContents));
    }
  });

  return ipcMain;
}

/**
 * Sets up screen capture detection to hide the application when screen sharing is detected
 * 
 * @param {BrowserWindow} mainWindow - The main application window
 * @param {Object} windowManager - Manager for window visibility and state
 */
function setupScreenCaptureDetection(mainWindow, windowManager) {
  if (process.platform === "darwin") {
    try {
      const hasScreenCapturePermission = systemPreferences.getMediaAccessStatus("screen");

      if (hasScreenCapturePermission === "granted") {
        systemPreferences.subscribeWorkspaceNotification("NSWorkspaceScreenIsSharedDidChangeNotification", () => {
          const isBeingCaptured = systemPreferences.getMediaAccessStatus("screen") === "granted";

          if (isBeingCaptured) {
            windowManager.toggleWindowVisibility(false);
            if (mainWindow?.webContents) {
              mainWindow.webContents.send(IPC_CHANNELS.SCREEN_SHARING_DETECTED);
            }
          }
        });
      }
    } catch (error) {
      console.error("Error setting up screen capture detection:", error);
    }
  }

  if (process.platform === "win32" || process.platform === "linux") {
    try {
      let checkInterval = setInterval(() => {
        desktopCapturer
          .getSources({ types: ["screen"] })
          .then((sources) => {
            if (sources.length > 1) {
              windowManager.toggleWindowVisibility(false);

              if (mainWindow?.webContents) {
                mainWindow.webContents.send(IPC_CHANNELS.SCREEN_SHARING_DETECTED);
              }
            }
          })
          .catch((error) => {
            console.error("Error checking screen sources:", error);
          });
      }, 5000);

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
  setupScreenCaptureDetection,
};
