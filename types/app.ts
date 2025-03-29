import { BrowserWindow } from 'electron';
import Screenshots from 'electron-screenshots';

export interface AppState {
  isWindowVisible: boolean;
  screenshots: string[];
  multiPageMode: boolean;
  mainWindow: BrowserWindow | null;
  modelListWindow: BrowserWindow | null;
  screenshotInstance: Screenshots | null;
}

export interface AppConfig {
  OLLAMA_BASE_URL: string;
  DEFAULT_MODEL: string;
  DEFAULT_GEMINI_MODEL: string;
  DEFAULT_OLLAMA_MODEL: string;
  isMac: boolean;
  modifierKey: string;
}

export interface ShortcutConfig {
  key: string;
  handler: () => void | Promise<void>;
  alwaysActive?: boolean;
}

export interface Shortcuts {
  TOGGLE_VISIBILITY: ShortcutConfig;
  PROCESS_SCREENSHOTS: ShortcutConfig;
  OPEN_SETTINGS: ShortcutConfig;
  MOVE_LEFT: ShortcutConfig;
  MOVE_RIGHT: ShortcutConfig;
  MOVE_UP: ShortcutConfig;
  MOVE_DOWN: ShortcutConfig;
  TAKE_SCREENSHOT: ShortcutConfig;
  AREA_SCREENSHOT: ShortcutConfig;
  MULTI_PAGE: ShortcutConfig;
  RESET: ShortcutConfig;
  QUIT: ShortcutConfig;
  MODEL_SELECTION: ShortcutConfig;
}

export interface WindowOptions {
  width: number;
  height: number;
  x?: number;
  y?: number;
  webPreferences: {
    nodeIntegration: boolean;
    contextIsolation: boolean;
  };
  frame?: boolean;
  transparent?: boolean;
  backgroundColor?: string;
  alwaysOnTop?: boolean;
  paintWhenInitiallyHidden?: boolean;
  contentProtection?: boolean;
  movable?: boolean;
  roundedCorners?: boolean;
  titleBarStyle?: string;
  titleBarOverlay?: boolean;
  trafficLightPosition?: { x: number; y: number };
  fullscreenable?: boolean;
  skipTaskbar?: boolean;
  autoHideMenuBar?: boolean;
  hasShadow?: boolean;
  enableLargerThanScreen?: boolean;
} 