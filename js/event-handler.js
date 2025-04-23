const { ipcMain, app, desktopCapturer, Menu, BrowserWindow, systemPreferences, shell, dialog } = require("electron");
const { IPC_CHANNELS, AI_PROVIDERS } = require("./constants");
const { isLinux, isWindows, isMac, modifierKey } = require("./config");
const ChatHandler = require("./chat-handler");
const fs = require("fs");
const { getUserDataPath } = require("./utils");
const toastManager = require("./toast-manager");
const log = require("electron-log");
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
      try {
        console.log(`Toggling DevTools on platform: ${process.platform}`);

        // Check if DevTools are already open
        const isDevToolsOpen = mainWindow.webContents.isDevToolsOpened();
        console.log(`DevTools are currently ${isDevToolsOpen ? "open" : "closed"}`);

        if (isDevToolsOpen) {
          mainWindow.webContents.closeDevTools();
          console.log("DevTools closed successfully");
        } else {
          // Platform-specific DevTools settings
          let options = {};

          // For macOS, open devtools in detached mode by default
          if (process.platform === "darwin") {
            options = { mode: "detach" };
          }

          mainWindow.webContents.openDevTools(options);
          console.log("DevTools opened successfully with options:", options);
        }
      } catch (error) {
        console.error(`Error toggling DevTools on ${process.platform}:`, error);

        // Provide more detailed error info to help debugging
        const errorInfo = {
          message: error.message,
          stack: error.stack,
          platform: process.platform,
          electronVersion: process.versions.electron,
          nodeVersion: process.versions.node,
          chromeVersion: process.versions.chrome,
        };

        console.error("DevTools error details:", errorInfo);

        // Try an alternative approach for problematic platforms
        try {
          if (!mainWindow.webContents.isDevToolsOpened()) {
            console.log("Trying alternative method to open DevTools...");
            mainWindow.webContents.openDevTools();
          }
        } catch (altError) {
          console.error("Alternative DevTools method also failed:", altError);
        }
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

      // Always use streaming for Gemini responses
      const useStreaming = provider === AI_PROVIDERS.GEMINI;

      // Set up streaming callback to handle chunks of text
      const streamCallback = (type, chunk, fullText) => {
        if (type === "start") {
          // Signal streaming start to the renderer
          event.sender.send(IPC_CHANNELS.CHAT_MESSAGE_STREAM_START);
        } else if (type === "chunk") {
          // Send streaming chunk to the renderer
          event.sender.send(IPC_CHANNELS.CHAT_MESSAGE_STREAM_CHUNK, chunk, fullText);
        } else if (type === "complete") {
          // Signal streaming completion to the renderer
          event.sender.send(IPC_CHANNELS.CHAT_MESSAGE_STREAM_END, {
            role: "assistant",
            content: fullText,
          });
        } else if (type === "error") {
          // Signal error to the renderer
          event.sender.send(IPC_CHANNELS.CHAT_MESSAGE_RESPONSE, {
            role: "assistant",
            content: `Error: ${
              chunk.message || "Failed to process your message"
            }. Please check your settings or try again later.`,
          });
        }
      };

      // Process the message with system prompt if provided, with streaming enabled
      const response = await chatHandler.processMessage(messages, windowId, systemPrompt, useStreaming, streamCallback);

      // For non-streaming responses or Ollama (which doesn't support streaming yet)
      if (!useStreaming || provider === AI_PROVIDERS.OLLAMA) {
        // Send response back to the renderer
        event.sender.send(IPC_CHANNELS.CHAT_MESSAGE_RESPONSE, response);
      }
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
      const systemPromptFile = getUserDataPath("systemPrompt.txt");
      fs.writeFileSync(systemPromptFile, prompt, "utf8");

      // Update in all chat handlers
      if (chatHandler) {
        // Update system prompt for all windows
        const windows = BrowserWindow.getAllWindows();
        windows.forEach((window) => {
          const windowId = window.id;
          chatHandler.systemPrompts.set(windowId, prompt);
        });
      }
      toastManager.success("System prompt updated successfully");
    } catch (error) {
      console.error("Error updating system prompt:", error);
      toastManager.error(`Failed to update system prompt: ${error.message}`);
    }
  });

  // Handle showing update dialog from renderer process
  ipcMain.on(IPC_CHANNELS.SHOW_UPDATE_DIALOG, async (event, updateData) => {
    try {
      log.info("Showing update dialog:", updateData);

      const isMajorUpdate = updateData.isMajorUpdate;
      const dialogOptions = {
        type: "info",
        title: isMajorUpdate ? "Major Update Required" : "Update Available",
        message: isMajorUpdate
          ? `A new major version (v${updateData.latestVersion}) is available.`
          : `A new version (v${updateData.latestVersion}) is available.`,
        detail: isMajorUpdate
          ? "This update is required to continue using the application."
          : `Current version: v${updateData.currentVersion}`,
        buttons: isMajorUpdate ? ["Download"] : ["Download", "Later"],
        defaultId: 0,
        cancelId: isMajorUpdate ? -1 : 1, // No cancel option for major updates
      };

      // For major updates, disable the close button
      if (isMajorUpdate) {
        dialogOptions.noLink = true;
      }

      // Show the dialog and get user response
      const { response } = await dialog.showMessageBox(mainWindow, dialogOptions);
      if (response === 1) {
        // Later button
        // Show an animated button in the toolbar
        log.info("User chose to update later, showing toolbar button");
        event.sender.send(IPC_CHANNELS.SHOW_UPDATE_TOOLBAR_BUTTON, updateData);
      }

      // For major updates, re-show the dialog if user tried to dismiss it
      if (isMajorUpdate) {
        // Small timeout to prevent immediate re-display
        app.exit(0);
      }
    } catch (error) {
      log.error("Error showing update dialog:", error);
    }
  });

  // Handle update action from renderer
  ipcMain.on(IPC_CHANNELS.UPDATE_ACTION, (event, data) => {
    if (data.action === "download" && data.url) {
      shell.openExternal(data.url);
      log.info(`Opening update download URL: ${data.url}`);
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
