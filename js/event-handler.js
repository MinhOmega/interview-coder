const { ipcMain, app, desktopCapturer, Menu, BrowserWindow, systemPreferences } = require("electron");
const { IPC_CHANNELS } = require("./constants");
const { isLinux, isWindows, isMac, modifierKey } = require("./config");
const ChatHandler = require("./chat-handler");
const fs = require("fs");
const { getUserDataPath } = require("./utils");

let chatHandler;

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
  // Make sure AI providers are initialized first
  const initStatus = aiProviders.initializeFromConfig();
  console.log("AI initialization status in event handler:", initStatus);

  // Initialize the chat handler
  chatHandler = new ChatHandler(aiProviders, configManager);

  ipcMain.handle(IPC_CHANNELS.GET_CURRENT_SETTINGS, () => {
    return configManager.getCurrentSettings();
  });

  ipcMain.on(IPC_CHANNELS.UPDATE_MODEL_SETTINGS, (_, settings) => {
    // Update settings and get the result
    const updatedSettings = configManager.updateSettings(settings);

    // Notify main window only if settings were updated
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send(IPC_CHANNELS.MODEL_CHANGED);
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
    const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
    if (!isDev) return;

    console.log("Manual reload triggered");

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
      if (process.env.NODE_ENV === "development" || !app.isPackaged) {
        template.splice(2, 0, {
          label: "Force Reload (Dev)",
          click: () => {
            mainWindow.webContents.reloadIgnoringCache();
          },
        });
      }

      const menu = Menu.buildFromTemplate(template);
      menu.popup(BrowserWindow.fromWebContents(mainWindow.webContents));
    }
  });

  // Handle chat messages
  ipcMain.on(IPC_CHANNELS.SEND_CHAT_MESSAGE, async (event, messages, systemPrompt) => {
    try {
      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      if (!senderWindow) return;

      const windowId = senderWindow.id;

      // Lazy-initialize if needed
      if (!chatHandler) {
        console.log("Creating new chat handler instance");
        chatHandler = new ChatHandler(aiProviders, configManager);
      }

      // Check if we need to show settings window due to no API keys
      const apiKey = configManager.getApiKey();
      const provider = configManager.getAiProvider();
      if (!apiKey) {
        console.warn("No API key found, suggesting Settings window");
        // Only suggest settings if we're not using Ollama
        if (provider !== "ollama") {
          event.sender.send(IPC_CHANNELS.CHAT_MESSAGE_RESPONSE, {
            role: "assistant",
            content: `No API key has been configured. Please go to Settings (${modifierKey}+,) and enter your API key.`,
          });

          // Open settings window
          windowManager.createModelSelectionWindow();
          return;
        }
      }

      // Process the message with system prompt if provided
      const response = await chatHandler.processMessage(messages, windowId, systemPrompt);

      // Send response back to the renderer
      event.sender.send(IPC_CHANNELS.CHAT_MESSAGE_RESPONSE, response);
    } catch (error) {
      console.error("Error processing chat message:", error);

      // Send error response
      event.sender.send(IPC_CHANNELS.CHAT_MESSAGE_RESPONSE, {
        role: "assistant",
        content: `Error: ${
          error.message || "Failed to process your message"
        }. Please check your settings or try again later.`,
      });
    }
  });

  // Handle system prompt getting and updating
  ipcMain.handle(IPC_CHANNELS.GET_SYSTEM_PROMPT, async () => {
    try {
      if (chatHandler) {
        return chatHandler.loadSystemPrompt();
      }
      return "";
    } catch (error) {
      console.error("Error getting system prompt:", error);
      return "";
    }
  });
  
  ipcMain.on(IPC_CHANNELS.UPDATE_SYSTEM_PROMPT, (event, prompt) => {
    try {
      const systemPromptFile = getUserDataPath('systemPrompt.txt');
      fs.writeFileSync(systemPromptFile, prompt, 'utf8');
      
      // Update in all chat handlers
      if (chatHandler) {
        // Update system prompt for all windows
        const windows = BrowserWindow.getAllWindows();
        windows.forEach(window => {
          const windowId = window.id;
          chatHandler.systemPrompts.set(windowId, prompt);
        });
      }
      
      event.sender.send(IPC_CHANNELS.NOTIFICATION, {
        body: "System prompt updated successfully",
        type: "success"
      });
    } catch (error) {
      console.error("Error updating system prompt:", error);
      event.sender.send(IPC_CHANNELS.ERROR, "Failed to update system prompt: " + error.message);
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
  if (isMac) {
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

  if (isWindows || isLinux) {
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
