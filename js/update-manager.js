/**
 * Update Manager for Interview Coder app
 * Handles version checking and update notifications
 */

const { app, globalShortcut } = require("electron");
const axios = require("axios");
const semver = require("semver");
const log = require("electron-log");
const { IPC_CHANNELS } = require("./constants");

class UpdateManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.currentVersion = app.getVersion();
    this.latestVersion = null;
    this.updateAvailable = false;
    this.isMajorUpdate = false;
    this.updateCheckInterval = 3600000; // Check every hour (in ms)
    this.intervalId = null;
    this.githubRepo = "MinhOmega/interview-coder";
    this.releaseUrl = `https://github.com/${this.githubRepo}/releases/tag/`;
    this.shortcutsDisabled = false;

    // Bind methods
    this.checkForUpdates = this.checkForUpdates.bind(this);
    this.notifyUpdateAvailable = this.notifyUpdateAvailable.bind(this);
    this.startUpdateChecking = this.startUpdateChecking.bind(this);
    this.stopUpdateChecking = this.stopUpdateChecking.bind(this);
    this.disableKeyboardShortcuts = this.disableKeyboardShortcuts.bind(this);
    this.restoreKeyboardShortcuts = this.restoreKeyboardShortcuts.bind(this);
    this.handleMajorUpdate = this.handleMajorUpdate.bind(this);
  }

  /**
   * Start periodic update checking
   */
  startUpdateChecking() {
    // Check immediately on startup
    this.checkForUpdates();

    // Then set up interval for periodic checks
    this.intervalId = setInterval(this.checkForUpdates, this.updateCheckInterval);
    log.info(`Update checking started. Current version: ${this.currentVersion}`);
  }

  /**
   * Stop periodic update checking
   */
  stopUpdateChecking() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    log.info("Update checking stopped");

    // Restore keyboard shortcuts if they were disabled
    this.restoreKeyboardShortcuts();
  }

  /**
   * Check for updates by fetching latest release from GitHub
   */
  async checkForUpdates() {
    try {
      log.info("Checking for updates...");
      const response = await axios.get(`https://api.github.com/repos/${this.githubRepo}/releases/latest`);

      if (response.status === 200) {
        const latestVersion = response.data.tag_name.replace("v", "");
        this.latestVersion = latestVersion;

        // Compare versions
        if (semver.gt(latestVersion, this.currentVersion)) {
          this.updateAvailable = true;

          // Check if it's a major or minor update
          const currentMajorMinor = `${semver.major(this.currentVersion)}.${semver.minor(this.currentVersion)}`;
          const latestMajorMinor = `${semver.major(latestVersion)}.${semver.minor(latestVersion)}`;

          this.isMajorUpdate = currentMajorMinor !== latestMajorMinor;

          log.info(`Update available: ${this.currentVersion} → ${latestVersion} (Major update: ${this.isMajorUpdate})`);

          // For major updates, handle special requirements
          if (this.isMajorUpdate) {
            this.handleMajorUpdate();
          }

          this.notifyUpdateAvailable();
        } else {
          log.info(`No updates available. Current: ${this.currentVersion}, Latest: ${latestVersion}`);
        }
      }
    } catch (error) {
      log.error("Error checking for updates:", error);
    }
  }

  /**
   * Handle special requirements for major updates
   */
  handleMajorUpdate() {
    // Disable keyboard shortcuts to prevent bypassing update dialog
    if (!this.shortcutsDisabled) {
      this.disableKeyboardShortcuts();
    }

    // Log that this is a major update that will force app quit
    log.info("Major update detected - app will need to be restarted after download");

    // If there are any pending operations that should be saved,
    // this would be a good place to trigger auto-saves
  }

  /**
   * Notify the renderer process about available updates
   */
  notifyUpdateAvailable() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      log.warn("Cannot send update notification: Main window not available");
      return;
    }

    const updateData = {
      currentVersion: this.currentVersion,
      latestVersion: this.latestVersion,
      isMajorUpdate: this.isMajorUpdate,
      downloadUrl: `${this.releaseUrl}v${this.latestVersion}`,
      // Add additional info for major updates
      requiresRestart: this.isMajorUpdate,
    };

    this.mainWindow.webContents.send(IPC_CHANNELS.UPDATE_AVAILABLE, updateData);
    log.info("Update notification sent to renderer");
  }

  /**
   * Disable keyboard shortcuts to prevent bypassing major update dialog
   */
  disableKeyboardShortcuts() {
    try {
      // Unregister all global shortcuts
      globalShortcut.unregisterAll();

      // Set flag to indicate shortcuts are disabled
      this.shortcutsDisabled = true;

      log.info("Keyboard shortcuts disabled for major update");
    } catch (error) {
      log.error("Error disabling keyboard shortcuts:", error);
    }
  }

  /**
   * Restore keyboard shortcuts
   */
  restoreKeyboardShortcuts() {
    if (this.shortcutsDisabled) {
      // We don't re-register shortcuts here as they're handled by the hotkey manager
      // Just set the flag to indicate shortcuts can be registered again
      this.shortcutsDisabled = false;
      log.info("Keyboard shortcuts can be restored");
    }
  }

  /**
   * Get current update status
   */
  getUpdateStatus() {
    return {
      currentVersion: this.currentVersion,
      latestVersion: this.latestVersion,
      updateAvailable: this.updateAvailable,
      isMajorUpdate: this.isMajorUpdate,
      downloadUrl: this.latestVersion ? `${this.releaseUrl}v${this.latestVersion}` : null,
      requiresRestart: this.isMajorUpdate,
    };
  }
}

/**
 * Renderer-side update notification handler
 * Used in the renderer process to handle incoming update notifications
 */
class UpdateNotificationHandler {
  constructor() {
    this.updateData = null;

    // Only initialize if we're in a renderer process with ipcRenderer available
    if (typeof window !== "undefined") {
      try {
        const { ipcRenderer } = require("electron");

        // Listen for update available events
        ipcRenderer.on(IPC_CHANNELS.UPDATE_AVAILABLE, this.handleUpdateAvailable.bind(this));
        log.info("Update notification handler initialized in renderer");
      } catch (error) {
        log.error("Error initializing update notification handler in renderer:", error);
      }
    }
  }

  /**
   * Handle update available notification from main process
   */
  handleUpdateAvailable(_, data) {
    log.info("Update available notification received in renderer:", data);
    this.updateData = data;

    // Send message to main process to show dialog
    try {
      const { ipcRenderer } = require("electron");
      ipcRenderer.send(IPC_CHANNELS.SHOW_UPDATE_DIALOG, data);
    } catch (error) {
      log.error("Error sending update dialog request from renderer:", error);
    }
  }
}

// Export the main UpdateManager class for the main process
module.exports = UpdateManager;

// Create an instance of the notification handler for the renderer
// This will be used in update-notification.js
module.exports.createNotificationHandler = () => new UpdateNotificationHandler();
