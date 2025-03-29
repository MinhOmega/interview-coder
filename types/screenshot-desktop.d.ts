declare module 'screenshot-desktop' {
  interface ScreenshotOptions {
    filename?: string;
    screen?: number;
  }

  function screenshot(options?: ScreenshotOptions): Promise<Buffer>;
  function listDisplays(): Promise<Array<{ id: number }>>;

  export = screenshot;
} 