import { globalShortcut } from 'electron';
import { Shortcuts } from '../../types/app';

export class ShortcutManager {
  private shortcuts: Shortcuts;
  private isVisible: boolean;

  constructor(shortcuts: Shortcuts) {
    this.shortcuts = shortcuts;
    this.isVisible = true;
  }

  public updateHotkeys(isVisible: boolean): void {
    this.isVisible = isVisible;

    // Unregister all existing shortcuts
    globalShortcut.unregisterAll();

    // Register shortcuts based on visibility state
    Object.values(this.shortcuts).forEach((shortcut) => {
      if (this.isVisible || shortcut.alwaysActive) {
        globalShortcut.register(shortcut.key, shortcut.handler);
      }
    });
  }

  public unregisterAll(): void {
    globalShortcut.unregisterAll();
  }

  public isRegistered(key: string): boolean {
    return globalShortcut.isRegistered(key);
  }
} 