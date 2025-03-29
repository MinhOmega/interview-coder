import { Rectangle } from 'electron';

export interface ScreenshotSavedEvent {
  path: string;
  isArea: boolean;
  dimensions: {
    width: number;
    height: number;
  };
  fileName?: string;
}

export interface ModelNotFoundEvent {
  model: string;
  error: string;
  suggestedModels: string[];
}

export interface IPCChannels {
  // Main to Renderer
  'screenshot-saved': ScreenshotSavedEvent;
  'analysis-result': string;
  'stream-start': void;
  'stream-chunk': string;
  'stream-update': string;
  'stream-end': void;
  'loading': boolean;
  'error': string;
  'warning': string;
  'update-instruction': string;
  'hide-instruction': void;
  'update-visibility': boolean;
  'screen-sharing-detected': void;
  'model-not-found': ModelNotFoundEvent;
  'clear-result': void;
  'hide-content': void;

  // Renderer to Main
  'minimize-window': void;
  'maximize-window': void;
  'close-window': void;
  'area-cancelled': void;
  'area-selected': Rectangle;
}

export type IPCMainChannels = {
  [K in keyof IPCChannels]: (event: Electron.IpcMainEvent, ...args: IPCChannels[K] extends void ? [] : [IPCChannels[K]]) => void;
};

export type IPCRendererChannels = {
  [K in keyof IPCChannels]: (...args: IPCChannels[K] extends void ? [] : [IPCChannels[K]]) => void;
}; 