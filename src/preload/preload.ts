import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'api', {
    // Send a message to the main process
    send: (channel: string, data: any) => {
      // whitelist channels
      const validChannels = [
        'update-model-settings',
        'area-selected',
        'area-selection-cancelled',
        'area-captured',
        'full-screen-captured'
      ];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    
    // Receive a message from the main process
    receive: (channel: string, func: Function) => {
      const validChannels = [
        'update-instruction',
        'hide-instruction',
        'loading',
        'analysis-result',
        'stream-start',
        'stream-chunk',
        'stream-end',
        'error',
        'warning',
        'model-not-found',
        'model-changed',
        'clear-result',
        'screenshot-saved'
      ];
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes `sender` 
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    },
    
    // Invoke a method in the main process and return the result
    invoke: async (channel: string, data?: any) => {
      const validChannels = [
        'get-ollama-models',
        'get-current-settings'
      ];
      if (validChannels.includes(channel)) {
        return await ipcRenderer.invoke(channel, data);
      }
      return null;
    }
  }
); 