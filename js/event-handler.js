const { ipcMain, app, Menu, BrowserWindow, systemPreferences } = require("electron");
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

    // Initialize or update AI clients based on provider
    if (settings.aiProvider === 'openai' && settings.openaiApiKey) {
      aiProviders.updateAIClients('openai', settings.openaiApiKey);
    } else if (settings.aiProvider === 'gemini' && settings.geminiApiKey) {
      aiProviders.updateAIClients('gemini', settings.geminiApiKey);
    } else if (settings.aiProvider === 'ollama' && settings.ollamaUrl) {
      aiProviders.setOllamaBaseURL(settings.ollamaUrl);
    }

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
      console.log(`Initial screen capture permission: ${hasScreenCapturePermission}`);

      // Monitor permission changes
      systemPreferences.subscribeMediaAccessStatus('screen', (status, oldStatus) => {
        console.log(`Screen permission changed from ${oldStatus} to ${status}`);
        
        if (status === 'granted') {
          mainWindow?.webContents?.send(IPC_CHANNELS.NOTIFICATION, {
            title: "Permission Granted",
            body: "Screen recording permission has been granted. You can now take screenshots.",
            type: "success"
          });
        } else if (status === 'denied' || status === 'restricted') {
          mainWindow?.webContents?.send(IPC_CHANNELS.NOTIFICATION, {
            title: "Permission Denied",
            body: "Screen recording permission is denied. Please enable it in System Preferences > Security & Privacy > Privacy > Screen Recording.",
            type: "error"
          });
        }
      });

      // Use workspace notification to detect screen sharing
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
      } else {
        mainWindow?.webContents?.send(IPC_CHANNELS.NOTIFICATION, {
          title: "Permission Required",
          body: "Screen recording permission is required for this app to work correctly. Please enable it in System Preferences > Security & Privacy > Privacy > Screen Recording.",
          type: "warning"
        });
      }
    } catch (error) {
      console.error("Error setting up screen capture detection:", error);
    }
  }

  if (process.platform === "win32" || process.platform === "linux") {
    console.log("Screen capture detection is not implemented for this platform");
  }
}

module.exports = {
  setupEventHandlers,
  setupScreenCaptureDetection,
};
