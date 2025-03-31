import { app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';

// Configure logging
log.transports.file.level = 'info';
autoUpdater.logger = log;

/**
 * Initialize the auto-updater
 */
export function initAutoUpdater(): void {
  // Configure auto updater events
  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info);
    
    // Notify the main window about update availability
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      mainWindow.webContents.send('notification', {
        body: `Update v${info.version} available. Downloading...`,
        type: 'success'
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available:', info);
  });

  autoUpdater.on('error', (err) => {
    log.error('Error in auto-updater:', err);
    
    // Only notify about errors in production
    if (process.env.NODE_ENV === 'production') {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        mainWindow.webContents.send('notification', {
          body: `Update error: ${err.message}`,
          type: 'error'
        });
      }
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const logMessage = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
    log.info(logMessage);
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info);
    
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      mainWindow.webContents.send('notification', {
        body: `Update v${info.version} downloaded. Will be installed on next restart.`,
        type: 'success'
      });
    }
  });

  // Check for updates (but not in development)
  const isDev = process.env.NODE_ENV === 'development';
  
  if (!isDev) {
    // Wait until app is ready
    if (app.isReady()) {
      checkForUpdates();
    } else {
      app.on('ready', () => {
        checkForUpdates();
      });
    }
  } else {
    log.info('Auto-updater disabled in development mode');
  }
}

/**
 * Check for updates
 */
function checkForUpdates(): void {
  try {
    log.info('Checking for updates...');
    
    // For GitHub releases
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'yourusername',
      repo: 'your-repo-name',
      private: false,
      vPrefixedTagName: true
    });
    
    // Check for updates
    autoUpdater.checkForUpdatesAndNotify();
    
    // Set a timer to check again every 4 hours
    setInterval(() => {
      autoUpdater.checkForUpdatesAndNotify();
    }, 4 * 60 * 60 * 1000);
  } catch (error) {
    log.error('Failed to check for updates:', error);
  }
} 