import { app } from 'electron';
import { WindowManager } from './window';
import { ShortcutManager } from './shortcuts';
import { IPCManager } from './ipc';
import { ConfigManager } from './config';
import { AIService } from './ai';
import { ScreenshotService } from './screenshot';
import { Shortcuts } from '../../types/app';
import * as path from 'path';

class Application {
  private windowManager: WindowManager;
  private shortcutManager: ShortcutManager;
  private ipcManager: IPCManager;
  private configManager: ConfigManager;
  private aiService: AIService;
  private screenshotService: ScreenshotService | null = null;

  constructor() {
    // Initialize managers
    this.configManager = new ConfigManager();
    this.windowManager = new WindowManager();
    
    // Set up shortcuts
    const shortcuts: Shortcuts = {
      TOGGLE_VISIBILITY: {
        key: `${this.configManager.getModifierKey()}+Shift+Space`,
        handler: () => this.windowManager.toggleWindowVisibility(),
        alwaysActive: true,
      },
      PROCESS_SCREENSHOTS: {
        key: `${this.configManager.getModifierKey()}+Return`,
        handler: () => this.processScreenshots(),
      },
      TAKE_SCREENSHOT: {
        key: `${this.configManager.getModifierKey()}+Shift+1`,
        handler: () => this.captureScreenshot(),
      },
      AREA_SCREENSHOT: {
        key: `${this.configManager.getModifierKey()}+Shift+2`,
        handler: () => this.captureArea(),
      },
      OPEN_SETTINGS: {
        key: `${this.configManager.getModifierKey()}+,`,
        handler: () => {}, // TODO: Implement settings
      },
      MOVE_LEFT: {
        key: `${this.configManager.getModifierKey()}+Left`,
        handler: () => this.windowManager.moveWindow('left'),
      },
      MOVE_RIGHT: {
        key: `${this.configManager.getModifierKey()}+Right`,
        handler: () => this.windowManager.moveWindow('right'),
      },
      MOVE_UP: {
        key: `${this.configManager.getModifierKey()}+Up`,
        handler: () => this.windowManager.moveWindow('up'),
      },
      MOVE_DOWN: {
        key: `${this.configManager.getModifierKey()}+Down`,
        handler: () => this.windowManager.moveWindow('down'),
      },
      MULTI_PAGE: {
        key: `${this.configManager.getModifierKey()}+Shift+M`,
        handler: () => {}, // TODO: Implement multi-page mode
      },
      RESET: {
        key: `${this.configManager.getModifierKey()}+Shift+R`,
        handler: () => this.resetProcess(),
      },
      QUIT: {
        key: `${this.configManager.getModifierKey()}+Q`,
        handler: () => app.quit(),
        alwaysActive: true,
      },
      MODEL_SELECTION: {
        key: `${this.configManager.getModifierKey()}+Shift+O`,
        handler: () => this.windowManager.createModelSelectionWindow(),
      },
    };

    this.shortcutManager = new ShortcutManager(shortcuts);
    this.ipcManager = new IPCManager(this.windowManager, this.shortcutManager);

    // Initialize AI service with configuration
    this.aiService = new AIService(
      'openai',
      this.configManager.getDefaultModel(),
      process.env.OPENAI_API_KEY,
      process.env.GEMINI_API_KEY,
      this.configManager.getOllamaBaseUrl()
    );
  }

  public async start(): Promise<void> {
    try {
      await app.whenReady();

      // Create main window
      const mainWindow = this.windowManager.createMainWindow();
      await mainWindow.loadFile(path.join(__dirname, '../index.html'));

      // Initialize screenshot service
      this.screenshotService = new ScreenshotService(mainWindow);

      // Register shortcuts
      this.shortcutManager.updateHotkeys(true);

      app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
          app.quit();
        }
      });

      app.on('activate', () => {
        if (this.windowManager.getMainWindow() === null) {
          const mainWindow = this.windowManager.createMainWindow();
          void mainWindow.loadFile(path.join(__dirname, '../index.html'));
        }
      });

    } catch (error) {
      console.error('Failed to start application:', error);
      app.quit();
    }
  }

  private async captureScreenshot(): Promise<void> {
    try {
      if (!this.screenshotService) return;

      const mainWindow = this.windowManager.getMainWindow();
      if (!mainWindow) return;

      mainWindow.webContents.send('loading', true);
      await this.screenshotService.captureFullScreen();
      mainWindow.webContents.send('loading', false);
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      this.windowManager.getMainWindow()?.webContents.send('error', 'Failed to capture screenshot');
    }
  }

  private async captureArea(): Promise<void> {
    try {
      if (!this.screenshotService) return;

      const mainWindow = this.windowManager.getMainWindow();
      if (!mainWindow) return;

      mainWindow.webContents.send('loading', true);
      mainWindow.hide();

      // TODO: Implement area selection logic
      const rect = { width: 800, height: 600 }; // Placeholder
      await this.screenshotService.captureArea(rect);

      mainWindow.show();
      mainWindow.webContents.send('loading', false);
    } catch (error) {
      console.error('Failed to capture area:', error);
      this.windowManager.getMainWindow()?.webContents.send('error', 'Failed to capture area');
    }
  }

  private async processScreenshots(): Promise<void> {
    try {
      const mainWindow = this.windowManager.getMainWindow();
      if (!mainWindow) return;

      mainWindow.webContents.send('loading', true);

      // TODO: Implement screenshot processing with AI
      const result = await this.aiService.generate({
        messages: [{ type: 'text', text: 'Analyze this screenshot' }],
        model: this.configManager.getDefaultModel(),
      });

      mainWindow.webContents.send('analysis-result', result);
      mainWindow.webContents.send('loading', false);
    } catch (error) {
      console.error('Failed to process screenshots:', error);
      this.windowManager.getMainWindow()?.webContents.send('error', 'Failed to process screenshots');
    }
  }

  private resetProcess(): void {
    const mainWindow = this.windowManager.getMainWindow();
    if (!mainWindow) return;

    mainWindow.webContents.send('clear-result');
    // Additional reset logic if needed
  }
}

// Start the application
const application = new Application();
void application.start(); 