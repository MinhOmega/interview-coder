import { ipcMain, BrowserWindow } from 'electron';
import { IPCMainChannels } from '../../types/ipc';
import { WindowManager } from './window';
import { ShortcutManager } from './shortcuts';

export class IPCManager {
  private windowManager: WindowManager;
  private shortcutManager: ShortcutManager;

  constructor(windowManager: WindowManager, shortcutManager: ShortcutManager) {
    this.windowManager = windowManager;
    this.shortcutManager = shortcutManager;
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Window control handlers
    ipcMain.on('minimize-window', () => {
      const mainWindow = this.windowManager.getMainWindow();
      if (mainWindow) {
        mainWindow.minimize();
      }
    });

    ipcMain.on('maximize-window', () => {
      const mainWindow = this.windowManager.getMainWindow();
      if (mainWindow) {
        if (mainWindow.isMaximized()) {
          mainWindow.unmaximize();
        } else {
          mainWindow.maximize();
        }
      }
    });

    ipcMain.on('close-window', () => {
      const mainWindow = this.windowManager.getMainWindow();
      if (mainWindow) {
        mainWindow.close();
      }
    });

    // Area screenshot handlers
    ipcMain.on('area-cancelled', () => {
      const mainWindow = this.windowManager.getMainWindow();
      if (mainWindow) {
        mainWindow.show();
      }
    });

    ipcMain.on('area-selected', () => {
      const mainWindow = this.windowManager.getMainWindow();
      if (mainWindow) {
        mainWindow.show();
        // Handle area selection...
      }
    });

    // Settings handlers
    ipcMain.handle('get-current-settings', () => {
      return {
        aiProvider: process.env.AI_PROVIDER || 'openai',
        openaiModel: process.env.OPENAI_MODEL || 'gpt-4-vision-preview',
        geminiModel: process.env.GEMINI_MODEL || 'gemini-pro-vision',
        ollamaModel: process.env.OLLAMA_MODEL || 'deepseek-r1:14b',
        ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'
      };
    });
  }

  public send<K extends keyof IPCMainChannels>(
    channel: K,
    ...args: Parameters<IPCMainChannels[K]>
  ): void {
    const mainWindow = this.windowManager.getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(channel, ...args);
    }
  }

  public sendToWindow<K extends keyof IPCMainChannels>(
    window: BrowserWindow,
    channel: K,
    ...args: Parameters<IPCMainChannels[K]>
  ): void {
    window.webContents.send(channel, ...args);
  }
} 