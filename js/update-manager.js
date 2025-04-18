const { app, dialog, BrowserWindow, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
const path = require("path");
const axios = require("axios");
const { IPC_CHANNELS } = require("./constants");

// Configure updater logging
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = "info";

// Update server options are configured in package.json via "publish" field
// Status tracking
let updateAvailable = false;
let updateDownloaded = false;
let currentUpdateInfo = null;
let mainWindow = null;
let lastUpdateCheck = null;
const UPDATE_CHECK_INTERVAL = 1000 * 60 * 60; // Check once per hour

// GitHub repo info from package.json
let repoOwner = "";
let repoName = "";
let currentVersion = "";

// Configure update behavior
const setupAutoUpdater = (appWindow) => {
  mainWindow = appWindow;

  // Get repo info and current version from package.json
  try {
    const packageJson = require('../package.json');
    currentVersion = packageJson.version;
    
    if (packageJson.build && packageJson.build.publish && packageJson.build.publish.length > 0) {
      const publishConfig = packageJson.build.publish.find(p => p.provider === "github");
      if (publishConfig) {
        repoOwner = publishConfig.owner;
        repoName = publishConfig.repo;
      }
    }
    
    log.info(`App version: ${currentVersion}, Repo: ${repoOwner}/${repoName}`);
  } catch (error) {
    log.error("Error reading package.json:", error);
  }

  // Disable auto download - we'll handle the download process manually
  autoUpdater.autoDownload = false;
  
  // Check for updates when app starts (with slight delay to prevent slowdown)
  setTimeout(() => {
    checkForUpdates();
  }, 3000);

  // Set up updater events
  autoUpdater.on("checking-for-update", () => {
    log.info("Checking for updates...");
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.UPDATE_STATUS, {
        status: "checking",
        message: "Checking for updates..."
      });
    }
  });

  autoUpdater.on("update-available", (info) => {
    log.info("Update available:", info);
    updateAvailable = true;
    currentUpdateInfo = info;
    
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.UPDATE_STATUS, {
        status: "available",
        message: `Update available: v${info.version}`,
        info: info
      });
      
      // Show notification dialog to user
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Update Available",
        message: `A new version (${info.version}) of Interview Coder is available!`,
        detail: `Would you like to download it now? You will be notified when it's ready to install.`,
        buttons: ["Download", "Later"],
        defaultId: 0
      }).then(({ response }) => {
        if (response === 0) {
          // Start download if user agrees
          autoUpdater.downloadUpdate().catch(err => {
            log.error("Download failed:", err);
          });
        }
      });
    }
  });

  autoUpdater.on("update-not-available", () => {
    log.info("No updates available");
    updateAvailable = false;
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.UPDATE_STATUS, {
        status: "not-available",
        message: "Your app is up to date."
      });
    }
  });

  autoUpdater.on("download-progress", (progressObj) => {
    log.info(`Download progress: ${progressObj.percent.toFixed(2)}%`);
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.UPDATE_STATUS, {
        status: "downloading",
        message: `Downloading update: ${progressObj.percent.toFixed(2)}%`,
        progress: progressObj
      });
    }
  });

  autoUpdater.on("update-downloaded", (info) => {
    log.info("Update downloaded:", info);
    updateDownloaded = true;
    
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.UPDATE_STATUS, {
        status: "downloaded",
        message: "Update ready to install!",
        info: info
      });
      
      // Show notification dialog to user
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Update Ready",
        message: "Update Downloaded",
        detail: `Version ${info.version} has been downloaded. Would you like to install it now? The application will restart.`,
        buttons: ["Install & Restart", "Later"],
        defaultId: 0
      }).then(({ response }) => {
        if (response === 0) {
          // Quit and install if user agrees
          autoUpdater.quitAndInstall(false, true);
        }
      });
    }
  });

  autoUpdater.on("error", (error) => {
    log.error("Auto updater error:", error);
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.UPDATE_STATUS, {
        status: "error",
        message: `Update error: ${error.message}`
      });
      
      // If the electron-updater fails, try manual check as a fallback
      if (error.message.includes("latest-mac.yml") || error.message.includes("404")) {
        log.info("Auto-updater failed, trying manual version check...");
        checkVersionManually();
      }
    }
  });

  // Register IPC handlers for renderer-initiated events
  setupIpcHandlers();
  
  // Set up periodic update checks
  setInterval(() => {
    const now = new Date().getTime();
    if (!lastUpdateCheck || (now - lastUpdateCheck) > UPDATE_CHECK_INTERVAL) {
      checkForUpdates();
    }
  }, UPDATE_CHECK_INTERVAL);
};

// Check for updates using electron-updater
const checkForUpdates = () => {
  try {
    lastUpdateCheck = new Date().getTime();
    autoUpdater.checkForUpdates();
  } catch (error) {
    log.error("Error checking for updates:", error);
    // Try manual check as fallback
    checkVersionManually();
  }
};

// Manual version check from GitHub API as a fallback mechanism
const checkVersionManually = async () => {
  // Skip if we don't have repo info
  if (!repoOwner || !repoName || !currentVersion) {
    log.warn("Missing repo information for manual version check");
    return;
  }
  
  try {
    log.info("Checking latest release via GitHub API");
    
    // Get latest release from GitHub API
    const response = await axios.get(
      `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`,
      { headers: { Accept: 'application/vnd.github.v3+json' } }
    );
    
    if (response.status === 200 && response.data) {
      const latestVersion = response.data.tag_name.replace('v', '');
      const releaseUrl = response.data.html_url;
      log.info(`Latest version: ${latestVersion}, Current version: ${currentVersion}`);
      
      // Compare versions
      if (isNewerVersion(latestVersion, currentVersion)) {
        log.info(`Manual check: Newer version ${latestVersion} available`);
        
        // Create manual update info
        const manualUpdateInfo = {
          version: latestVersion,
          releaseDate: response.data.published_at,
          releaseNotes: response.data.body || "",
          downloadUrl: releaseUrl
        };
        
        showManualUpdateDialog(manualUpdateInfo);
      } else {
        log.info("Manual check: App is up to date");
        if (mainWindow) {
          mainWindow.webContents.send(IPC_CHANNELS.UPDATE_STATUS, {
            status: "not-available",
            message: "Your app is up to date."
          });
        }
      }
    }
  } catch (error) {
    log.error("Error checking version manually:", error);
  }
};

// Show dialog for manual updates
const showManualUpdateDialog = (updateInfo) => {
  if (!mainWindow) return;
  
  dialog.showMessageBox(mainWindow, {
    type: "info",
    title: "Update Available",
    message: `A new version (${updateInfo.version}) is available!`,
    detail: `Current version: ${currentVersion}\n\nThe automatic updater couldn't download the update. Please visit the release page to download and install the latest version manually.`,
    buttons: ["Open Download Page", "Later"],
    defaultId: 0
  }).then(({ response }) => {
    if (response === 0) {
      // Open release page in browser
      const { shell } = require('electron');
      shell.openExternal(updateInfo.downloadUrl);
    }
  });
  
  // Also update the UI
  if (mainWindow) {
    mainWindow.webContents.send(IPC_CHANNELS.UPDATE_STATUS, {
      status: "available-manual",
      message: `Update available: v${updateInfo.version} (manual download required)`,
      info: updateInfo
    });
    
    // Update tracking variables
    updateAvailable = true;
    currentUpdateInfo = updateInfo;
  }
};

// Compare versions to check if the latest is newer
const isNewerVersion = (latest, current) => {
  const latestParts = latest.split('.').map(p => parseInt(p, 10));
  const currentParts = current.split('.').map(p => parseInt(p, 10));
  
  for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
    const latestPart = latestParts[i] || 0;
    const currentPart = currentParts[i] || 0;
    
    if (latestPart > currentPart) return true;
    if (latestPart < currentPart) return false;
  }
  
  return false; // Equal versions
};

// Setup IPC handlers for update-related events from renderer
const setupIpcHandlers = () => {
  // Handle manual update checks from UI
  ipcMain.handle(IPC_CHANNELS.CHECK_FOR_UPDATES, async () => {
    try {
      checkForUpdates();
      return { success: true };
    } catch (error) {
      log.error("Error initiating update check:", error);
      return { success: false, error: error.message };
    }
  });

  // Handle download request from UI
  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_UPDATE, async () => {
    try {
      if (updateAvailable && !updateDownloaded) {
        await autoUpdater.downloadUpdate();
        return { success: true };
      } else if (updateDownloaded) {
        return { success: true, alreadyDownloaded: true };
      } else {
        return { success: false, reason: "No update available" };
      }
    } catch (error) {
      log.error("Error downloading update:", error);
      // Try manual approach
      if (currentUpdateInfo && currentUpdateInfo.downloadUrl) {
        const { shell } = require('electron');
        shell.openExternal(currentUpdateInfo.downloadUrl);
        return { success: true, manual: true };
      }
      return { success: false, error: error.message };
    }
  });

  // Handle install request from UI
  ipcMain.handle(IPC_CHANNELS.INSTALL_UPDATE, async () => {
    try {
      if (updateDownloaded) {
        // Set a small timeout to allow response to be sent before app quits
        setTimeout(() => {
          autoUpdater.quitAndInstall(false, true);
        }, 200);
        return { success: true };
      } else {
        return { success: false, reason: "No update has been downloaded yet" };
      }
    } catch (error) {
      log.error("Error installing update:", error);
      return { success: false, error: error.message };
    }
  });

  // Handle request for current update status
  ipcMain.handle(IPC_CHANNELS.GET_UPDATE_STATUS, async () => {
    try {
      return {
        updateAvailable,
        updateDownloaded,
        currentUpdateInfo
      };
    } catch (error) {
      log.error("Error getting update status:", error);
      return { error: error.message };
    }
  });
  
  // Handle manual update check
  ipcMain.handle(IPC_CHANNELS.CHECK_FOR_UPDATES_MANUAL, async () => {
    try {
      await checkVersionManually();
      return { success: true };
    } catch (error) {
      log.error("Error checking for updates manually:", error);
      return { success: false, error: error.message };
    }
  });
};

module.exports = {
  setupAutoUpdater,
  checkForUpdates,
  checkVersionManually
}; 