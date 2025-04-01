import path from 'path';
import fs from 'fs';
import { app, BrowserWindow, desktopCapturer, screen } from 'electron';
import screenshotDesktop from 'screenshot-desktop';

/**
 * Helper class to manage screenshots
 */
export class ScreenshotHelper {
  private screenshotDir: string;
  private extraScreenshotDir: string;
  private screenshotQueue: string[] = [];
  private extraScreenshotQueue: string[] = [];
  private view: 'queue' | 'solutions' | 'debug';

  constructor(initialView: 'queue' | 'solutions' | 'debug') {
    this.view = initialView;
    
    // Create screenshot directories
    const appDataPath = app.getPath('userData');
    this.screenshotDir = path.join(appDataPath, 'screenshots');
    this.extraScreenshotDir = path.join(appDataPath, 'extra-screenshots');
    
    // Ensure directories exist
    this.ensureDirectoryExists(this.screenshotDir);
    this.ensureDirectoryExists(this.extraScreenshotDir);
  }

  /**
   * Ensure a directory exists
   */
  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Set current view
   */
  setView(view: 'queue' | 'solutions' | 'debug'): void {
    this.view = view;
  }

  /**
   * Get screenshot queue
   */
  getScreenshotQueue(): string[] {
    return this.screenshotQueue;
  }

  /**
   * Get extra screenshot queue
   */
  getExtraScreenshotQueue(): string[] {
    return this.extraScreenshotQueue;
  }

  /**
   * Clear screenshot queues
   */
  clearQueues(): void {
    // Clear arrays
    this.screenshotQueue = [];
    this.extraScreenshotQueue = [];
    
    // Optionally, remove files from disk
    this.clearDirectory(this.screenshotDir);
    this.clearDirectory(this.extraScreenshotDir);
  }

  /**
   * Clear a directory
   */
  private clearDirectory(dirPath: string): void {
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        try {
          fs.unlinkSync(filePath);
        } catch (error) {
          console.error(`Failed to delete file: ${filePath}`, error);
        }
      }
    }
  }

  /**
   * Take a screenshot
   */
  async takeScreenshot(
    onBeforeCapture?: () => void,
    onAfterCapture?: () => void
  ): Promise<string> {
    try {
      // Call the before capture callback (e.g., to hide the window)
      if (onBeforeCapture) {
        onBeforeCapture();
        // Add a small delay to ensure window is hidden
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      // Generate timestamp and filename
      const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
      const os = require("os");
      const path = require("path");
      const screenshotDir = path.join(os.homedir(), "Pictures", "Screenshots", "InterviewCoder");
      
      // Create directory if it doesn't exist
      const fs = require("fs");
      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }
      
      const filename = `screenshot-${timestamp}.png`;
      const filePath = path.join(screenshotDir, filename);

      // Take screenshot using screenshot-desktop
      const screenshot = require("screenshot-desktop");
      await screenshot({ filename: filePath });

      // Add to queue based on current view
      if (this.view === "queue") {
        this.screenshotQueue.push(filePath);
      } else {
        this.extraScreenshotQueue.push(filePath);
      }

      // Call the after capture callback (e.g., to show the window)
      if (onAfterCapture) {
        onAfterCapture();
      }

      console.log(`Screenshot saved to ${filePath}`);
      return filePath;
    } catch (error) {
      console.error("Error taking screenshot:", error);
      throw error;
    }
  }

  /**
   * Delete a screenshot
   */
  deleteScreenshot(filePath: string): { success: boolean; error?: string } {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File does not exist' };
      }
      
      fs.unlinkSync(filePath);
      
      // Remove from queues
      this.screenshotQueue = this.screenshotQueue.filter(p => p !== filePath);
      this.extraScreenshotQueue = this.extraScreenshotQueue.filter(p => p !== filePath);
      
      return { success: true };
    } catch (error) {
      console.error('Error deleting screenshot:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Delete the last screenshot in the queue
   */
  deleteLastScreenshot(): { success: boolean; error?: string; path?: string } {
    try {
      if (this.screenshotQueue.length === 0) {
        return { success: false, error: 'No screenshots in queue' };
      }
      
      const lastScreenshot = this.screenshotQueue[this.screenshotQueue.length - 1];
      const result = this.deleteScreenshot(lastScreenshot);
      
      return { 
        ...result, 
        path: result.success ? lastScreenshot : undefined 
      };
    } catch (error) {
      console.error('Error deleting last screenshot:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Get a base64-encoded image preview
   */
  async getImagePreview(filePath: string): Promise<string> {
    try {
      if (!fs.existsSync(filePath)) {
        console.error(`Image file not found: ${filePath}`);
        return '';
      }
      
      const data = fs.readFileSync(filePath);
      return `data:image/png;base64,${data.toString('base64')}`;
    } catch (error) {
      console.error('Error getting image preview:', error);
      return '';
    }
  }

  /**
   * Capture a screenshot of the entire screen or active window
   * This is a direct port of the captureScreenshot function from main.js
   */
  async captureScreenshot(mainWindow?: BrowserWindow | null): Promise<string> {
    try {
      console.log("Capturing screen content...");
  
      const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
      const imagePath = path.join(app.getPath("pictures"), `screenshot-${timestamp}.png`);
  
      // Hide the main window temporarily for capturing
      let wasVisible = false;
      if (mainWindow && mainWindow.isVisible()) {
        wasVisible = true;
        mainWindow.hide();
        // Wait a bit for the window to hide
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
  
      let success = false;
      let base64Image = "";
  
      try {
        // Get all screen sources
        const sources = await desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: {
            width: screen.getPrimaryDisplay().workAreaSize.width,
            height: screen.getPrimaryDisplay().workAreaSize.height,
          },
        });
  
        // Get the primary display
        const primaryDisplay = screen.getPrimaryDisplay();
  
        // Find the source that matches the primary display
        const source =
          sources.find((s) => {
            // Use type assertion since display property might not be directly accessible
            const sourceWithBounds = s as any;
            const bounds = sourceWithBounds.display?.bounds || sourceWithBounds.bounds;
            return (
              bounds.x === 0 &&
              bounds.y === 0 &&
              bounds.width === primaryDisplay.size.width &&
              bounds.height === primaryDisplay.size.height
            );
          }) || sources[0];
  
        if (!source) {
          throw new Error("No screen source found");
        }
  
        // Create a temporary hidden BrowserWindow to capture the screen
        const captureWin = new BrowserWindow({
          width: primaryDisplay.size.width,
          height: primaryDisplay.size.height,
          show: false,
          webPreferences: {
            offscreen: true,
            nodeIntegration: true,
            contextIsolation: false,
          },
        });
  
        // Load a minimal HTML file
        await captureWin.loadURL("data:text/html,<html><body></body></html>");
  
        // Inject capture script
        await captureWin.webContents.executeJavaScript(`
          new Promise(async (resolve) => {
            try {
              const stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                  mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: '${source.id}',
                    minWidth: ${primaryDisplay.size.width},
                    maxWidth: ${primaryDisplay.size.width},
                    minHeight: ${primaryDisplay.size.height},
                    maxHeight: ${primaryDisplay.size.height}
                  }
                }
              });
  
              const video = document.createElement('video');
              video.style.cssText = 'position: absolute; top: -10000px; left: -10000px;';
              video.srcObject = stream;
  
              video.onloadedmetadata = () => {
                video.play();
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0);
                
                const imageData = canvas.toDataURL('image/png');
                video.remove();
                stream.getTracks()[0].stop();
                resolve(imageData);
              };
  
              document.body.appendChild(video);
            } catch (err) {
              resolve(null);
              console.error('Capture error:', err);
            }
          });
        `);
  
        // Get the captured image
        const imageData = await captureWin.webContents.executeJavaScript(
          'document.querySelector("canvas").toDataURL("image/png")',
        );
  
        // Close the capture window
        captureWin.close();
  
        if (!imageData) {
          throw new Error("Failed to capture screen");
        }
  
        // Save the image
        const base64Data = imageData.replace(/^data:image\/png;base64,/, "");
        fs.writeFileSync(imagePath, base64Data, "base64");
        base64Image = imageData;
        success = true;
      } catch (captureError) {
        console.error("Desktop capturer failed:", captureError);
  
        // Fallback to screenshot-desktop
        try {
          await screenshotDesktop({ filename: imagePath });
          const imageBuffer = fs.readFileSync(imagePath);
          base64Image = `data:image/png;base64,${imageBuffer.toString("base64")}`;
          success = true;
        } catch (fallbackError) {
          console.error("Screenshot fallback failed:", fallbackError);
          throw fallbackError;
        }
      }
  
      // Show the main window again
      if (mainWindow && wasVisible) {
        mainWindow.show();
      }
  
      // Verify the screenshot was taken
      if (!fs.existsSync(imagePath)) {
        throw new Error("Screenshot file was not created");
      }
  
      const stats = fs.statSync(imagePath);
      if (stats.size < 1000) {
        throw new Error("Screenshot file is too small, likely empty");
      }
  
      // Get image dimensions
      const dimensions = { width: 0, height: 0 };
      try {
        // We would normally use image-size here
        // But for TypeScript compatibility we'll skip this for now
        /* const sizeOf = require("image-size");
        const imageDimensions = sizeOf(imagePath);
        dimensions.width = imageDimensions.width;
        dimensions.height = imageDimensions.height; */
      } catch (dimError) {
        console.error("Error getting image dimensions:", dimError);
      }
  
      // Notify about saved screenshot (if we have a window)
      if (mainWindow) {
        mainWindow.webContents.send("notification", {
          body: `Screenshot saved to ${imagePath} (${dimensions.width}x${dimensions.height})`,
          type: "success",
        });
      }
  
      console.log(`Screenshot saved to ${imagePath} (${dimensions.width}x${dimensions.height})`);
      return base64Image;
    } catch (error) {
      console.error("Screenshot capture failed:", error);
      throw error;
    }
  }
} 