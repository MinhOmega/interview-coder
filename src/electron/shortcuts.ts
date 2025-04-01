import { globalShortcut, app } from "electron";
import { IShortcutsHelperDeps } from "./main";
import { configHelper } from "./ConfigHelper";

export class ShortcutsHelper {
  private deps: IShortcutsHelperDeps;
  private registeredShortcuts: { [key: string]: () => void } = {};

  constructor(deps: IShortcutsHelperDeps) {
    this.deps = deps;
    
    // Initialize shortcut registry
    this.setupShortcuts();
  }

  /**
   * Set up all shortcut handlers
   */
  private setupShortcuts(): void {
    // Toggle visibility - always active
    this.registeredShortcuts["CommandOrControl+B"] = () => {
      console.log("Command/Ctrl + B pressed. Toggling window visibility.");
      this.deps.toggleMainWindow();
    };

    // Screenshot shortcuts
    this.registeredShortcuts["CommandOrControl+H"] = async () => {
      const mainWindow = this.deps.getMainWindow();
      if (mainWindow) {
        console.log("Taking screenshot...");
        try {
          const screenshotPath = await this.deps.takeScreenshot();
          const preview = await this.deps.getImagePreview(screenshotPath);
          mainWindow.webContents.send("screenshot-taken", {
            path: screenshotPath,
            preview
          });
        } catch (error) {
          console.error("Error capturing screenshot:", error);
        }
      }
    };

    // Add additional screenshot
    this.registeredShortcuts["CommandOrControl+A"] = async () => {
      const mainWindow = this.deps.getMainWindow();
      if (mainWindow) {
        console.log("Taking additional screenshot...");
        try {
          const screenshotPath = await this.deps.takeScreenshot();
          const preview = await this.deps.getImagePreview(screenshotPath);
          mainWindow.webContents.send("screenshot-taken", {
            path: screenshotPath,
            preview,
            isAdditional: true
          });
          mainWindow.webContents.send("notification", {
            body: "Additional screenshot added",
            type: "success"
          });
        } catch (error) {
          console.error("Error capturing additional screenshot:", error);
        }
      }
    };

    // Area screenshot
    this.registeredShortcuts["CommandOrControl+D"] = () => {
      const mainWindow = this.deps.getMainWindow();
      if (mainWindow) {
        console.log("Starting area screenshot...");
        mainWindow.webContents.send("notification", {
          body: "Select an area to capture...",
          type: "info"
        });
        
        if (this.deps.captureArea) {
          this.deps.captureArea();
        }
      }
    };

    // Model selector shortcuts
    this.registeredShortcuts["CommandOrControl+M"] = () => {
      console.log("Command/Ctrl + M pressed. Opening model selector.");
      const mainWindow = this.deps.getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send("show-model-selector");
      }
    };

    this.registeredShortcuts["CommandOrControl+,"] = () => {
      console.log("Command/Ctrl + , pressed. Opening model selector.");
      const mainWindow = this.deps.getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send("show-model-selector");
      }
    };

    // Process screenshots
    this.registeredShortcuts["CommandOrControl+Enter"] = async () => {
      if (this.deps.processingHelper) {
        await this.deps.processingHelper.processScreenshots();
      }
    };

    // Reset
    this.registeredShortcuts["CommandOrControl+R"] = () => {
      console.log("Command + R pressed. Resetting queues...");
      this.deps.clearQueues();
      console.log("Cleared queues.");
      this.deps.setView("queue");
      
      const mainWindow = this.deps.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("reset-view");
        mainWindow.webContents.send("reset");
      }
    };

    // Window movement shortcuts
    this.registeredShortcuts["CommandOrControl+Left"] = () => {
      console.log("Command/Ctrl + Left pressed. Moving window left.");
      this.deps.moveWindowLeft();
    };

    this.registeredShortcuts["CommandOrControl+Right"] = () => {
      console.log("Command/Ctrl + Right pressed. Moving window right.");
      this.deps.moveWindowRight();
    };

    this.registeredShortcuts["CommandOrControl+Down"] = () => {
      console.log("Command/Ctrl + Down pressed. Moving window down.");
      this.deps.moveWindowDown();
    };

    this.registeredShortcuts["CommandOrControl+Up"] = () => {
      console.log("Command/Ctrl + Up pressed. Moving window up.");
      this.deps.moveWindowUp();
    };

    // Quit application
    this.registeredShortcuts["CommandOrControl+Q"] = () => {
      console.log("Command/Ctrl + Q pressed. Quitting application.");
      app.quit();
    };

    // Opacity controls
    this.registeredShortcuts["CommandOrControl+["] = () => {
      console.log("Command/Ctrl + [ pressed. Decreasing opacity.");
      this.adjustOpacity(-0.1);
    };

    this.registeredShortcuts["CommandOrControl+]"] = () => {
      console.log("Command/Ctrl + ] pressed. Increasing opacity.");
      this.adjustOpacity(0.1);
    };
    
    // Zoom controls
    this.registeredShortcuts["CommandOrControl+-"] = () => {
      console.log("Command/Ctrl + - pressed. Zooming out.");
      const mainWindow = this.deps.getMainWindow();
      if (mainWindow) {
        const currentZoom = mainWindow.webContents.getZoomLevel();
        mainWindow.webContents.setZoomLevel(currentZoom - 0.5);
      }
    };
    
    this.registeredShortcuts["CommandOrControl+0"] = () => {
      console.log("Command/Ctrl + 0 pressed. Resetting zoom.");
      const mainWindow = this.deps.getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.setZoomLevel(0);
      }
    };
    
    this.registeredShortcuts["CommandOrControl+="] = () => {
      console.log("Command/Ctrl + = pressed. Zooming in.");
      const mainWindow = this.deps.getMainWindow();
      if (mainWindow) {
        const currentZoom = mainWindow.webContents.getZoomLevel();
        mainWindow.webContents.setZoomLevel(currentZoom + 0.5);
      }
    };
    
    // Delete last screenshot
    this.registeredShortcuts["CommandOrControl+L"] = () => {
      console.log("Command/Ctrl + L pressed. Deleting last screenshot.");
      const mainWindow = this.deps.getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send("delete-last-screenshot");
      }
    };
  }

  /**
   * Adjust window opacity
   */
  private adjustOpacity(delta: number): void {
    const mainWindow = this.deps.getMainWindow();
    if (!mainWindow) return;
    
    let currentOpacity = mainWindow.getOpacity();
    let newOpacity = Math.max(0.1, Math.min(1.0, currentOpacity + delta));
    console.log(`Adjusting opacity from ${currentOpacity} to ${newOpacity}`);
    
    mainWindow.setOpacity(newOpacity);
    
    // Save the opacity setting to config
    configHelper.setOpacity(newOpacity);
    
    // Check if we crossed the visibility threshold
    const wasVisible = currentOpacity > 0.1;
    const isVisible = newOpacity > 0.1;
    
    // If visibility state changed, update the window visibility and shortcuts
    if (wasVisible !== isVisible) {
      if (isVisible) {
        // If we're making the window visible, also make sure it's shown
        if (!this.deps.isVisible()) {
          this.deps.toggleMainWindow();
        }
      } else {
        // If we're making the window invisible, update shortcut registration
        this.updateShortcutsForVisibility(false);
      }
    }
  }

  /**
   * Register global shortcuts based on visibility
   */
  public registerGlobalShortcuts(): void {
    // First, unregister all existing shortcuts to ensure a clean slate
    globalShortcut.unregisterAll();

    // If window is visible, register all shortcuts
    if (this.deps.isVisible()) {
      console.log("Registering all shortcuts - app is visible");
      this.registerAllShortcuts();
    } else {
      // If window is hidden, only register the toggle visibility shortcut
      console.log("Registering only visibility toggle - app is hidden");
      this.registerVisibilityToggleOnly();
    }
    
    // Unregister shortcuts when quitting
    app.on("will-quit", () => {
      globalShortcut.unregisterAll();
    });
  }

  /**
   * Register all shortcuts
   */
  private registerAllShortcuts(): void {
    for (const [key, handler] of Object.entries(this.registeredShortcuts)) {
      globalShortcut.register(key, handler);
    }
  }

  /**
   * Register only the visibility toggle shortcut
   */
  private registerVisibilityToggleOnly(): void {
    globalShortcut.register("CommandOrControl+B", this.registeredShortcuts["CommandOrControl+B"]);
  }

  /**
   * Update shortcuts based on visibility
   */
  public updateShortcutsForVisibility(isVisible: boolean): void {
    // Unregister all existing shortcuts
    globalShortcut.unregisterAll();

    // Register appropriate shortcuts based on visibility
    if (isVisible) {
      this.registerAllShortcuts();
      console.log("Updated to all shortcuts - app is visible");
    } else {
      this.registerVisibilityToggleOnly();
      console.log("Updated to visibility toggle only - app is hidden");
    }
  }
} 