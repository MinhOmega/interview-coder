import { app, globalShortcut, BrowserWindow } from 'electron';
import { ScreenshotHelper } from './ScreenshotHelper';

interface ShortcutsConfig {
  getMainWindow: () => BrowserWindow | null;
  toggleWindowVisibility: () => void;
  moveWindow: (direction: 'left' | 'right' | 'up' | 'down') => void;
  resetProcess: () => void;
  screenshotHelper: ScreenshotHelper | null;
  processScreenshots: () => void;
}

interface Shortcut {
  key: string;
  handler: () => void;
  alwaysActive?: boolean;
}

export class ShortcutsHelper {
  private mainWindow: BrowserWindow | null = null;
  private toggleWindowVisibility: () => void;
  private moveWindow: (direction: 'left' | 'right' | 'up' | 'down') => void;
  private resetProcess: () => void;
  private processScreenshots: () => void;
  private screenshotHelper: ScreenshotHelper | null;
  private isWindowVisible: boolean = true;

  // Check if running on macOS
  private isMac = process.platform === "darwin";
  private modifierKey = this.isMac ? "Command" : "Ctrl";

  // Define shortcuts configuration
  private SHORTCUTS: Record<string, Shortcut> = {
    TOGGLE_VISIBILITY: {
      key: `${this.modifierKey}+B`,
      handler: () => this.toggleWindowVisibility(),
      alwaysActive: true,
    },
    PROCESS_SCREENSHOTS: {
      key: `${this.modifierKey}+Enter`,
      handler: () => this.processScreenshots(),
    },
    MOVE_LEFT: {
      key: `${this.modifierKey}+Left`,
      handler: () => this.moveWindow('left'),
    },
    MOVE_RIGHT: {
      key: `${this.modifierKey}+Right`,
      handler: () => this.moveWindow('right'),
    },
    MOVE_UP: {
      key: `${this.modifierKey}+Up`,
      handler: () => this.moveWindow('up'),
    },
    MOVE_DOWN: {
      key: `${this.modifierKey}+Down`,
      handler: () => this.moveWindow('down'),
    },
    TAKE_SCREENSHOT: {
      key: `${this.modifierKey}+H`,
      handler: async () => {
        try {
          if (!this.mainWindow || !this.screenshotHelper) return;
          
          this.mainWindow.webContents.send("update-instruction", "Taking screenshot...");
          const img = await this.screenshotHelper.captureScreenshot(this.mainWindow);
          
          // Take a screenshot and automatically process it
          if (this.mainWindow) {
            this.mainWindow.webContents.send("update-instruction", "Processing screenshot with AI...");
            this.processScreenshots();
          }
        } catch (error) {
          console.error(`${this.modifierKey}+H error:`, error);
          if (this.mainWindow) {
            this.mainWindow.webContents.send("error", `Error processing command: ${error instanceof Error ? error.message : String(error)}`);
            this.mainWindow.webContents.send("update-instruction", "Press Cmd+H to take a screenshot");
          }
        }
      },
    },
    RESET: {
      key: `${this.modifierKey}+R`,
      handler: () => this.resetProcess(),
    },
    QUIT: {
      key: `${this.modifierKey}+Q`,
      handler: () => {
        console.log("Quitting application...");
        app.quit();
      },
    },
    SETTINGS: {
      key: `${this.modifierKey}+,`,
      handler: () => {
        if (this.mainWindow) {
          this.mainWindow.webContents.send("open-model-selector");
        }
      },
    },
  };

  constructor(config: ShortcutsConfig) {
    this.toggleWindowVisibility = config.toggleWindowVisibility;
    this.moveWindow = config.moveWindow;
    this.resetProcess = config.resetProcess;
    this.processScreenshots = config.processScreenshots;
    this.screenshotHelper = config.screenshotHelper;

    // Get main window reference
    const updateMainWindow = () => {
      this.mainWindow = config.getMainWindow();
    };
    
    // Initial setup
    updateMainWindow();
    
    // Setup periodic refresh of the main window reference
    setInterval(updateMainWindow, 5000);
  }

  /**
   * Register all keyboard shortcuts
   * @param isVisible Current window visibility state
   */
  registerShortcuts(isVisible: boolean): void {
    this.isWindowVisible = isVisible;
    this.updateHotkeys(isVisible);
  }

  /**
   * Update hotkey registration based on visibility
   */
  private updateHotkeys(isVisible: boolean): void {
    // Unregister all existing shortcuts
    globalShortcut.unregisterAll();

    // Register shortcuts based on visibility state
    Object.values(this.SHORTCUTS).forEach((shortcut) => {
      if (isVisible || shortcut.alwaysActive) {
        globalShortcut.register(shortcut.key, shortcut.handler);
      }
    });
  }

  /**
   * Update the window visibility state
   */
  updateVisibility(isVisible: boolean): void {
    if (this.isWindowVisible !== isVisible) {
      this.isWindowVisible = isVisible;
      this.updateHotkeys(isVisible);
    }
  }

  /**
   * Unregister all shortcuts (called on app quit)
   */
  unregisterAll(): void {
    globalShortcut.unregisterAll();
  }

  /**
   * Get all registered shortcuts for display in the UI
   */
  getShortcutsInfo(): { key: string; description: string }[] {
    return [
      { key: this.SHORTCUTS.TOGGLE_VISIBILITY.key, description: "Toggle window visibility" },
      { key: this.SHORTCUTS.PROCESS_SCREENSHOTS.key, description: "Process screenshots" },
      { key: this.SHORTCUTS.TAKE_SCREENSHOT.key, description: "Take screenshot" },
      { key: this.SHORTCUTS.MOVE_LEFT.key, description: "Move window left" },
      { key: this.SHORTCUTS.MOVE_RIGHT.key, description: "Move window right" },
      { key: this.SHORTCUTS.MOVE_UP.key, description: "Move window up" },
      { key: this.SHORTCUTS.MOVE_DOWN.key, description: "Move window down" },
      { key: this.SHORTCUTS.RESET.key, description: "Reset" },
      { key: this.SHORTCUTS.QUIT.key, description: "Quit application" },
      { key: this.SHORTCUTS.SETTINGS.key, description: "Open settings" }
    ];
  }
} 