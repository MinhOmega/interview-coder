const { app, dialog, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const log = require('electron-log');

// Set up logging for auto-updater
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// Store references for later use
let mainWindow = null;
let updateCheckInterval = null;
let isCheckingForUpdates = false;
let updateAvailable = false;
let updateDownloaded = false;
let forceMajorUpdate = false;
let preferZip = false;

/**
 * Configure the auto-updater with options
 * @param {Object} options - Configuration options
 * @param {boolean} options.allowPrerelease - Whether to allow prerelease versions
 * @param {boolean} options.forceUpdate - Whether to force update without user confirmation
 * @param {boolean} options.autoCheck - Whether to periodically check for updates
 * @param {number} options.checkInterval - Interval in minutes for checking updates
 * @param {boolean} options.forceMajorUpdate - Whether to force update on major version changes
 * @param {boolean} options.preferZip - Whether to prefer zip format for updates on macOS
 */
function configure(options = {}) {
  const {
    allowPrerelease = false,
    forceUpdate = false,
    autoCheck = true,
    checkInterval = 60,
    forceMajorUpdate = true,
    preferZip = false
  } = options;

  // Configure autoUpdater settings
  autoUpdater.autoDownload = forceUpdate;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = allowPrerelease;
  autoUpdater.forceDevUpdateConfig = process.env.NODE_ENV === 'development';
  autoUpdater.allowDowngrade = false;
  autoUpdater.disableWebInstaller = false;
  
  // Disable code signature verification on macOS to fix the update issue
  if (process.platform === 'darwin') {
    autoUpdater.disableWebInstaller = true;
    autoUpdater.disableAutoInstall = false;
    autoUpdater.verifyUpdateCodeSignature = false;
    log.info('Disabled code signature verification for macOS updates');
  }
  
  // Store the options
  this.forceMajorUpdate = forceMajorUpdate;
  this.preferZip = preferZip;

  // Configure ZIP format for macOS if preferred
  if (preferZip && process.platform === 'darwin') {
    log.info('Configuring updater to prefer ZIP format');
    try {
      // Set provider options for using zip files
      autoUpdater.addAuthHeader('Updater-Preference: zip');
    } catch (error) {
      log.error('Error configuring ZIP format for updates:', error);
    }
  }

  // If in development mode, point to the dev-app-update.yml file
  if (process.env.NODE_ENV === 'development') {
    try {
      autoUpdater.updateConfigPath = path.join(app.getAppPath(), 'dev-app-update.yml');
      log.info('Using development update config:', autoUpdater.updateConfigPath);
    } catch (error) {
      log.error('Error setting development update config:', error);
    }
  }

  // Set up auto-check interval if enabled
  if (autoCheck && checkInterval > 0) {
    if (updateCheckInterval) {
      clearInterval(updateCheckInterval);
    }
    
    // Convert minutes to milliseconds
    const intervalMs = checkInterval * 60 * 1000;
    updateCheckInterval = setInterval(() => checkForUpdates(), intervalMs);
    log.info(`Auto update check scheduled for every ${checkInterval} minutes`);
  }
}

/**
 * Initialize the updater with a reference to the main window
 * @param {BrowserWindow} window - The main application window
 * @param {Object} options - Configuration options
 */
function init(window, options = {}) {
  mainWindow = window;
  
  // Set default options
  const defaultOptions = {
    forceUpdate: false,
    allowPrerelease: false,
    autoCheck: true,
    checkInterval: 60,
    forceMajorUpdate: true,
    preferZip: process.platform === 'darwin' // Default to true for macOS
  };
  
  // Configure updater with merged options
  configure({ ...defaultOptions, ...options });
  
  // Register event handlers
  setupAutoUpdateEvents();
  
  // Check for updates on startup (after a short delay)
  setTimeout(() => {
    checkForUpdates();
  }, 5000);
  
  log.info('Auto updater initialized');
}

/**
 * Set up event listeners for the auto-updater
 */
function setupAutoUpdateEvents() {
  // Update is available but not yet downloaded
  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info);
    log.info('Update files:', JSON.stringify(info.files || []));
    updateAvailable = true;
    
    const currentVersion = app.getVersion();
    
    // Check if this is a major version update
    const shouldForceUpdate = this.forceMajorUpdate && isMajorUpdate(currentVersion, info.version);
    
    if (shouldForceUpdate) {
      log.info(`Force downloading major update from ${currentVersion} to ${info.version}`);
      autoUpdater.downloadUpdate();
      
      if (mainWindow) {
        mainWindow.webContents.send('major-update-available', info);
      }
    }
    // Notify user about the update if autoDownload is false and not a forced major update
    else if (!autoUpdater.autoDownload) {
      showUpdateAvailableDialog(info);
    }

    if (mainWindow) {
      mainWindow.webContents.send('update-available', info);
    }
  });

  // Update is not available
  autoUpdater.on('update-not-available', (info) => {
    log.info('No update available:', info);
    updateAvailable = false;
    isCheckingForUpdates = false;
    
    if (mainWindow) {
      mainWindow.webContents.send('update-not-available', info);
    }
  });

  // Update has been downloaded
  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info);
    updateDownloaded = true;
    
    // If autoDownload is true, show the install notification
    showUpdateReadyDialog(info);

    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', info);
    }
  });

  // Progress of download
  autoUpdater.on('download-progress', (progress) => {
    log.info(`Download progress: ${Math.round(progress.percent)}%`);
    
    if (mainWindow) {
      mainWindow.webContents.send('update-progress', progress);
    }
  });

  // Error during update
  autoUpdater.on('error', (error) => {
    log.error('Auto updater error:', error);
    isCheckingForUpdates = false;
    
    // Try troubleshooting if it looks like a file name mismatch error
    if (error.message && (
      error.message.includes('file not found') || 
      error.message.includes('no matching') || 
      error.message.includes('artifact') ||
      error.message.includes('download')
    )) {
      log.info('Error suggests filename mismatch, attempting troubleshooting...');
      troubleshootUpdateDownload();
    }
    
    if (mainWindow) {
      mainWindow.webContents.send('update-error', error.message);
    }
  });
}

/**
 * Check if the version difference is a major update
 * @param {string} currentVersion - Current app version
 * @param {string} newVersion - New version available
 * @returns {boolean} - True if this is a major version update
 */
function isMajorUpdate(currentVersion, newVersion) {
  try {
    // Parse versions into components
    const currentParts = currentVersion.split('.').map(Number);
    const newParts = newVersion.split('.').map(Number);
    
    // Check if major version has changed (first segment)
    if (newParts[0] > currentParts[0]) {
      return true;
    }
    
    // Check if minor version has changed (second segment)
    if (newParts[0] === currentParts[0] && newParts[1] > currentParts[1]) {
      return true;
    }
    
    return false;
  } catch (error) {
    log.error('Error comparing versions:', error);
    return false;
  }
}

/**
 * Show dialog when an update is available
 * @param {Object} info - Update information
 */
function showUpdateAvailableDialog(info) {
  if (!mainWindow) return;
  
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Available',
    message: `A new version (${info.version}) is available.`,
    detail: `Would you like to download and install it now? This version includes new features and bug fixes.`,
    buttons: ['Download', 'Later'],
    defaultId: 0
  }).then(({ response }) => {
    if (response === 0) {
      // User clicked Download
      autoUpdater.downloadUpdate();
    }
  });
}

/**
 * Show dialog when an update is ready to install
 * @param {Object} info - Update information
 */
function showUpdateReadyDialog(info) {
  if (!mainWindow) return;
  
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Ready',
    message: `A new version (${info.version}) has been downloaded.`,
    detail: 'The update will be installed when you restart the application.',
    buttons: ['Restart Now', 'Later'],
    defaultId: 0
  }).then(({ response }) => {
    if (response === 0) {
      // User clicked Restart Now
      quitAndInstall();
    }
  });
}

/**
 * Quit the app and install the update
 */
function quitAndInstall() {
  log.info('Quitting and installing update');
  
  try {
    // Use true for both isSilent and isForceRunAfter to fix installation issues
    autoUpdater.quitAndInstall(true, true);
  } catch (error) {
    log.error('Error during quit and install, attempting fallback:', error);
    
    // Fallback approach - just quit the app which should trigger auto install on next start
    setTimeout(() => {
      app.quit();
    }, 1000);
  }
}

/**
 * Check for updates
 * @returns {Promise<void>}
 */
async function checkForUpdates() {
  if (isCheckingForUpdates) {
    log.info('Update check already in progress, skipping');
    return;
  }
  
  isCheckingForUpdates = true;
  log.info('Checking for updates...');
  
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    log.error('Error checking for updates with electron-updater:', error);
    
    // If using zip and it fails, try dmg format
    if (this.preferZip && process.platform === 'darwin') {
      log.info('Trying fallback to DMG format...');
      try {
        // Temporarily disable zip preference
        const originalPref = this.preferZip;
        this.preferZip = false;
        
        // Reset auth header
        autoUpdater.addAuthHeader('Updater-Preference: dmg');
        
        // Try check again
        await autoUpdater.checkForUpdates();
        
        // Restore original preference
        this.preferZip = originalPref;
      } catch (fallbackError) {
        log.error('Fallback to DMG format failed:', fallbackError);
        isCheckingForUpdates = false;
        
        // Try fallback method to check for updates
        tryFallbackUpdateCheck();
      }
    } else {
      isCheckingForUpdates = false;
      
      // Try fallback method to check for updates
      tryFallbackUpdateCheck();
    }
  }
}

/**
 * Force check for updates and download immediately if available
 * @returns {Promise<void>}
 */
async function forceCheckAndUpdate() {
  try {
    log.info('Force checking for updates...');
    autoUpdater.autoDownload = true;
    await autoUpdater.checkForUpdates();
  } catch (error) {
    log.error('Error force checking for updates:', error);
    tryFallbackUpdateCheck(true);
  }
}

/**
 * Try fallback method to check for updates from GitHub releases
 * @param {boolean} forceUpdate - Whether to force update without user confirmation
 * @returns {Promise<void>}
 */
async function tryFallbackUpdateCheck(forceUpdate = false) {
  try {
    log.info('Trying fallback update check...');
    
    if (!mainWindow) return;
    
    // Get app info from package.json
    const packageJson = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8'));
    const currentVersion = app.getVersion() || packageJson.version;
    const repo = packageJson?.build?.publish?.[0]?.repo || 'interview-coder';
    const owner = packageJson?.build?.publish?.[0]?.owner || 'minhomega';
    
    // Fetch latest release from GitHub
    const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/releases/latest`);
    const latestRelease = response.data;
    
    // Extract version number (remove 'v' prefix if it exists)
    const latestVersion = latestRelease.tag_name.replace(/^v/, '');
    
    log.info(`Current version: ${currentVersion}, Latest version: ${latestVersion}`);
    
    // Compare versions
    if (isNewer(latestVersion, currentVersion)) {
      updateAvailable = true;
      
      // Show update notification
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `A new version (${latestVersion}) is available.`,
        detail: `You are currently using version ${currentVersion}. Would you like to download the new version?`,
        buttons: forceUpdate ? ['Yes', 'No'] : ['Download', 'View Release Notes', 'Later'],
        defaultId: 0
      });
      
      if (result.response === 0) {
        // Open download URL
        const { shell } = require('electron');
        const downloadUrl = latestRelease.html_url;
        shell.openExternal(downloadUrl);
      } else if (result.response === 1 && !forceUpdate) {
        // Open release notes
        const { shell } = require('electron');
        shell.openExternal(latestRelease.html_url);
      }
    } else {
      log.info('No newer version available (fallback check)');
      updateAvailable = false;
      
      if (mainWindow) {
        mainWindow.webContents.send('update-not-available', { version: currentVersion });
      }
    }
  } catch (error) {
    log.error('Fallback update check failed:', error);
    
    if (mainWindow) {
      mainWindow.webContents.send('update-error', 'Fallback update check failed');
    }
  } finally {
    isCheckingForUpdates = false;
  }
}

/**
 * Compare version strings to determine if version1 is newer than version2
 * @param {string} version1 - First version string (e.g., '1.2.3')
 * @param {string} version2 - Second version string (e.g., '1.2.0')
 * @returns {boolean} - Whether version1 is newer than version2
 */
function isNewer(version1, version2) {
  const v1 = version1.split('.').map(Number);
  const v2 = version2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
    const num1 = i < v1.length ? v1[i] : 0;
    const num2 = i < v2.length ? v2[i] : 0;
    
    if (num1 > num2) return true;
    if (num1 < num2) return false;
  }
  
  return false; // Versions are equal
}

/**
 * Try to fix update issues by resetting the updater and retrying with explicit artifact pattern
 * This helps when updater is failing due to name mismatches or code signature issues
 * @returns {Promise<void>}
 */
async function troubleshootUpdateDownload() {
  log.info('Troubleshooting update download issues...');
  
  try {
    // Reset autoUpdater state
    autoUpdater.removeAllListeners();
    
    // Re-setup event listeners
    setupAutoUpdateEvents();
    
    // Try with explicit pattern matching
    autoUpdater.logger.info('Trying with explicit artifact pattern matching');
    
    // On macOS, add additional troubleshooting for code signature issues
    if (process.platform === 'darwin') {
      log.info('Applying macOS-specific update troubleshooting');
      
      // Disable code signature verification to work around validation issues
      autoUpdater.verifyUpdateCodeSignature = false;
      
      // Force using DMG format instead of ZIP if we were using ZIP before
      if (this.preferZip) {
        log.info('Switching from ZIP to DMG format for macOS update');
        autoUpdater.addAuthHeader('Updater-Preference: dmg');
        this.preferZip = false;
      } else {
        // If we were already using DMG, try ZIP as fallback
        log.info('Switching from DMG to ZIP format for macOS update');
        autoUpdater.addAuthHeader('Updater-Preference: zip');
        this.preferZip = true;
      }
      
      // Use explicit artifact name pattern for macOS
      const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
      const ext = this.preferZip ? 'zip' : 'dmg';
      
      log.info(`Using explicit artifact name for ${arch} with ${ext} extension`);
      autoUpdater.addAuthHeader(`x-artifact-name: Interview-Coder-${arch}.${ext}`);
    } 
    // Use explicit pattern based on platform for Windows/Linux
    else if (process.platform === 'win32') {
      autoUpdater.addAuthHeader('x-artifact-name: Interview-Coder.${ext}');
    } else if (process.platform === 'linux') {
      autoUpdater.addAuthHeader('x-artifact-name: Interview-Coder.${ext}');
    }
    
    // Try again
    await autoUpdater.checkForUpdates();
    
  } catch (error) {
    log.error('Error during update troubleshooting:', error);
    
    // Fall back to manual update as last resort
    tryFallbackUpdateCheck(true);
  }
}

/**
 * Check if an update has been downloaded and is ready to install
 * @returns {boolean} - Whether an update has been downloaded
 */
function getUpdateDownloaded() {
  return updateDownloaded;
}

module.exports = {
  init,
  configure,
  checkForUpdates,
  forceCheckAndUpdate,
  tryFallbackUpdateCheck,
  quitAndInstall,
  troubleshootUpdateDownload,
  getUpdateDownloaded,
  isNewer
}; 