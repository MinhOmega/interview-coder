import { BrowserWindow, desktopCapturer, screen, DesktopCapturerSource } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import screenshot from 'screenshot-desktop';
import sizeOf from 'image-size/dist/index.js';
import { ScreenshotSavedEvent } from '../../types/ipc';

interface ExtendedDesktopCapturerSource extends DesktopCapturerSource {
  display?: {
    bounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ScreenshotDimensions {
  width: number;
  height: number;
}

export interface ScreenshotResult {
  base64Image: string;
  imagePath: string;
  dimensions: ScreenshotDimensions;
}

export class ScreenshotService {
  private mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  public async captureFullScreen(): Promise<ScreenshotResult> {
    try {
      console.log('Capturing screen content...');

      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
      const imagePath = path.join(process.env.PICTURES_PATH || '', `screenshot-${timestamp}.png`);

      // Hide the main window temporarily for capturing
      const wasVisible = this.mainWindow.isVisible();
      if (wasVisible) {
        this.mainWindow.hide();
        // Wait a bit for the window to hide
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      let base64Image = '';
      let dimensions: ScreenshotDimensions = { width: 0, height: 0 };

      try {
        // Get all screen sources
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: {
            width: screen.getPrimaryDisplay().workAreaSize.width,
            height: screen.getPrimaryDisplay().workAreaSize.height,
          },
        });

        // Get the primary display
        const primaryDisplay = screen.getPrimaryDisplay();

        // Find the source that matches the primary display
        const source = sources.find((s: ExtendedDesktopCapturerSource) => {
          const bounds = s.display?.bounds || s.bounds;
          return (
            bounds?.x === 0 &&
            bounds?.y === 0 &&
            bounds?.width === primaryDisplay.size.width &&
            bounds?.height === primaryDisplay.size.height
          );
        }) || sources[0];

        if (!source) {
          throw new Error('No screen source found');
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
        await captureWin.loadURL('data:text/html,<html><body></body></html>');

        // Inject capture script
        const imageData = await captureWin.webContents.executeJavaScript(`
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
                if (ctx) {
                  ctx.drawImage(video, 0, 0);
                  const imageData = canvas.toDataURL('image/png');
                  video.remove();
                  stream.getTracks()[0].stop();
                  resolve(imageData);
                } else {
                  resolve(null);
                }
              };

              document.body.appendChild(video);
            } catch (err) {
              resolve(null);
              console.error('Capture error:', err);
            }
          });
        `);

        // Close the capture window
        captureWin.close();

        if (!imageData) {
          throw new Error('Failed to capture screen');
        }

        // Save the image
        const base64Data = imageData.replace(/^data:image\/png;base64,/, '');
        fs.writeFileSync(imagePath, base64Data, 'base64');
        base64Image = imageData;
        dimensions = {
          width: primaryDisplay.size.width,
          height: primaryDisplay.size.height,
        };
      } catch (captureError) {
        console.error('Desktop capturer failed:', captureError);

        // Fallback to screenshot-desktop
        await screenshot({ filename: imagePath });
        const imageBuffer = fs.readFileSync(imagePath);
        base64Image = `data:image/png;base64,${imageBuffer.toString('base64')}`;

        // Get image dimensions using image-size
        const imageDimensions = sizeOf(imageBuffer);
        dimensions = {
          width: imageDimensions?.width || 0,
          height: imageDimensions?.height || 0,
        };
      }

      // Show the main window again
      if (wasVisible) {
        this.mainWindow.show();
      }

      // Verify the screenshot was taken
      if (!fs.existsSync(imagePath)) {
        throw new Error('Screenshot file was not created');
      }

      const stats = fs.statSync(imagePath);
      if (stats.size < 1000) {
        throw new Error('Screenshot file is too small, likely empty');
      }

      // Notify about saved screenshot
      const event: ScreenshotSavedEvent = {
        path: imagePath,
        isArea: false,
        dimensions,
      };
      this.mainWindow.webContents.send('screenshot-saved', event);

      console.log(`Screenshot saved to ${imagePath} (${dimensions.width}x${dimensions.height})`);
      return { base64Image, imagePath, dimensions };
    } catch (error) {
      console.error('Screenshot capture failed:', error);
      throw error;
    }
  }

  public async captureArea(rect: { width: number; height: number }): Promise<ScreenshotResult> {
    try {
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
      const imagePath = path.join(process.env.PICTURES_PATH || '', `area-screenshot-${timestamp}.png`);

      // Take the screenshot
      await screenshot({ filename: imagePath });

      // Read the image file to base64
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = `data:image/png;base64,${imageBuffer.toString('base64')}`;

      const dimensions = {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };

      // Notify about saved screenshot
      const event: ScreenshotSavedEvent = {
        path: imagePath,
        isArea: true,
        dimensions,
      };
      this.mainWindow.webContents.send('screenshot-saved', event);

      return { base64Image, imagePath, dimensions };
    } catch (error) {
      console.error('Area screenshot capture failed:', error);
      throw error;
    }
  }
} 