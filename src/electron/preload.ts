import { contextBridge, ipcRenderer } from 'electron';

// List of allowed send channels for security purposes
const ALLOWED_SEND_CHANNELS = [
  // Window management
  'toggle-visibility',
  'reset-process',
  
  // Screenshot management
  'process-screenshots',
  'take-screenshot',
  'add-context-screenshot',
  'delete-last-screenshot',
  
  // Content management
  'clear-result',
  'report-solution-error',
  
  // Model handling
  'update-model-settings',
  'open-model-selector',
  
  // Notifications
  'notification',
  'warning',
  'error',
  
  // UI instructions
  'update-instruction',
  'hide-instruction',
  'hide-content',
  
  // Settings and models
  'get-current-settings',
  'get-ollama-models',
  
  // Misc
  'toggle-devtools',
  'log-keyboard-shortcut',
  'screen-sharing-detected'
];

// List of allowed receive channels
const ALLOWED_RECEIVE_CHANNELS = [
  // Instructions and UI state
  'update-instruction',
  'hide-instruction',
  'update-visibility',
  
  // View management
  'update-view',
  'reset-view',
  
  // Content handling
  'analysis-result',
  'loading',
  'clear-result',
  
  // Notifications
  'notification',
  'warning',
  'error',
  
  // Screenshots
  'screenshot-taken',
  'delete-last-screenshot',
  
  // Model handling
  'show-model-selector',
  'open-model-selector',
  'model-changed',
  
  // Streaming
  'stream-start',
  'stream-chunk',
  'stream-update',
  'stream-end',
  
  // Additional channels
  'screen-sharing-detected',
  'get-current-settings',
  'get-ollama-models'
];

// List of allowed invoke channels
const ALLOWED_INVOKE_CHANNELS = [
  'get-current-settings',
  'get-ollama-models',
  'get-image-preview',
  'delete-screenshot',
  'get-screenshot-queue',
  'get-extra-screenshot-queue',
  'process-screenshots',
  'verify-ollama-model',
  'get-env-variable'
];

// Create a secure API to expose to the renderer process
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    // Send a message to the main process
    send: (channel: string, ...args: any[]) => {
      if (ALLOWED_SEND_CHANNELS.includes(channel)) {
        ipcRenderer.send(channel, ...args);
      } else {
        console.warn(`Blocked send attempt to unauthorized channel: ${channel}`);
      }
    },

    // Listen for messages from the main process
    on: (channel: string, callback: (...args: any[]) => void) => {
      if (ALLOWED_RECEIVE_CHANNELS.includes(channel)) {
        // Create a wrapper for the callback to ensure we don't pass the event object
        const subscription = (_event: any, ...args: any[]) => callback(...args);
        ipcRenderer.on(channel, subscription);

        // Return an unsubscribe function to clean up the listener
        return () => {
          ipcRenderer.removeListener(channel, subscription);
        };
      } else {
        console.warn(`Blocked listen attempt on unauthorized channel: ${channel}`);
        // Return a no-op unsubscribe function
        return () => {};
      }
    },
    
    // Remove a listener
    removeListener: (channel: string, callback: (...args: any[]) => void) => {
      if (ALLOWED_RECEIVE_CHANNELS.includes(channel)) {
        ipcRenderer.removeListener(channel, callback);
      } else {
        console.warn(`Blocked removing listener on unauthorized channel: ${channel}`);
      }
    },
    
    // Invoke a method in the main process and wait for a response
    invoke: async (channel: string, ...args: any[]): Promise<any> => {
      if (ALLOWED_INVOKE_CHANNELS.includes(channel)) {
        try {
          return await ipcRenderer.invoke(channel, ...args);
        } catch (error) {
          console.error(`Error invoking ${channel}:`, error);
          throw error;
        }
      } else {
        console.warn(`Blocked invoking on unauthorized channel: ${channel}`);
        throw new Error(`Unauthorized invoke attempt on channel: ${channel}`);
      }
    }
  }
});

// Log when preload script has executed
console.log('Preload script has been loaded'); 