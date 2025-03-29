import { BrowserWindow, screen, systemPreferences, BrowserWindowConstructorOptions } from 'electron';
import { WindowOptions } from '../../types/app';

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private modelListWindow: BrowserWindow | null = null;
  private isWindowVisible = true;

  constructor() {}

  public createMainWindow(): BrowserWindow {
    // Get primary display dimensions for centering
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: displayWidth, height: displayHeight } = primaryDisplay.workAreaSize;

    // Window dimensions
    const windowWidth = 800;
    const windowHeight = 600;

    const windowOptions: BrowserWindowConstructorOptions = {
      width: windowWidth,
      height: windowHeight,
      x: Math.floor((displayWidth - windowWidth) / 2),
      y: Math.floor((displayHeight - windowHeight) / 2),
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      paintWhenInitiallyHidden: true,
      movable: true,
      roundedCorners: true,
      titleBarStyle: 'hidden' as const,
      titleBarOverlay: false,
      trafficLightPosition: { x: -999, y: -999 },
      fullscreenable: true,
      skipTaskbar: true,
      autoHideMenuBar: true,
      hasShadow: true,
      enableLargerThanScreen: false,
    };

    this.mainWindow = new BrowserWindow(windowOptions);
    this.mainWindow.loadFile('index.html');
    this.mainWindow.setContentProtection(true);
    this.mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);

    this.setupScreenCaptureDetection();

    return this.mainWindow;
  }

  public createModelSelectionWindow(): void {
    if (this.modelListWindow) {
      this.modelListWindow.focus();
      return;
    }

    if (!this.mainWindow) {
      throw new Error('Main window not initialized');
    }

    this.modelListWindow = new BrowserWindow({
      width: 500,
      height: 600,
      parent: this.mainWindow,
      modal: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    this.modelListWindow.loadFile('model-selector.html');

    this.modelListWindow.on('closed', () => {
      this.modelListWindow = null;
    });
  }

  public toggleWindowVisibility(forceState?: boolean): void {
    this.isWindowVisible = typeof forceState === 'boolean' ? forceState : !this.isWindowVisible;

    if (this.mainWindow) {
      if (this.isWindowVisible) {
        this.mainWindow.show();
        this.mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
        if (this.modelListWindow) {
          this.modelListWindow.show();
          this.modelListWindow.setOpacity(1);
        }
      } else {
        this.mainWindow.hide();
        this.mainWindow.setAlwaysOnTop(false);
        if (this.modelListWindow) {
          this.modelListWindow.hide();
          this.modelListWindow.setOpacity(0);
        }
      }

      // Notify renderer about visibility change
      this.mainWindow.webContents.send('update-visibility', this.isWindowVisible);
    }
  }

  public moveWindow(direction: 'left' | 'right' | 'up' | 'down'): void {
    if (!this.mainWindow) return;

    const [x, y] = this.mainWindow.getPosition();
    const moveAmount = 50;

    switch (direction) {
      case 'left':
        this.mainWindow.setPosition(x - moveAmount, y);
        break;
      case 'right':
        this.mainWindow.setPosition(x + moveAmount, y);
        break;
      case 'up':
        this.mainWindow.setPosition(x, y - moveAmount);
        break;
      case 'down':
        this.mainWindow.setPosition(x, y + moveAmount);
        break;
    }
  }

  private setupScreenCaptureDetection(): void {
    if (process.platform === 'darwin') {
      try {
        const hasScreenCapturePermission = systemPreferences.getMediaAccessStatus('screen');

        if (hasScreenCapturePermission === 'granted') {
          console.log('Screen capture permission is granted');

          systemPreferences.subscribeWorkspaceNotification(
            'NSWorkspaceScreenIsSharedDidChangeNotification',
            () => {
              const isBeingCaptured = systemPreferences.getMediaAccessStatus('screen') === 'granted';
              console.log('Screen sharing status changed:', isBeingCaptured ? 'sharing active' : 'sharing inactive');

              if (isBeingCaptured) {
                this.toggleWindowVisibility(false);

                if (this.mainWindow?.webContents) {
                  this.mainWindow.webContents.send('screen-sharing-detected');
                }
              }
            }
          );
        }
      } catch (error) {
        console.error('Error setting up screen capture detection:', error);
      }
    }
  }

  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  public getModelListWindow(): BrowserWindow | null {
    return this.modelListWindow;
  }

  public isVisible(): boolean {
    return this.isWindowVisible;
  }
} 