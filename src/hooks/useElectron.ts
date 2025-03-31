import { useEffect, useState } from 'react';

// Define the interface for the IPC renderer
interface IpcRenderer {
  on: (channel: string, callback: any) => (() => void);
  send: (channel: string, ...args: any[]) => void;
  invoke: <T>(channel: string, ...args: any[]) => Promise<T>;
}

// Global reference to window.electron
let electronApi: { ipcRenderer?: IpcRenderer } | undefined;

// Initialize the electron API
if (typeof window !== 'undefined') {
  electronApi = (window as any).electron;
}

/**
 * Hook to access Electron's IPC renderer
 * @returns Object containing the ipcRenderer
 */
export function useElectron() {
  const [ipcRenderer, setIpcRenderer] = useState<IpcRenderer | undefined>(electronApi?.ipcRenderer);

  useEffect(() => {
    // Check if the electron API is available after component mounts
    if (electronApi?.ipcRenderer && !ipcRenderer) {
      setIpcRenderer(electronApi.ipcRenderer);
    }
  }, [ipcRenderer]);

  return { ipcRenderer };
}

/**
 * Wrapper function to send IPC messages to the main process
 * @param channel The channel to send the message on
 * @param args Any arguments to send with the message
 */
export function sendIpcMessage(channel: string, ...args: any[]) {
  if (electronApi?.ipcRenderer) {
    electronApi.ipcRenderer.send(channel, ...args);
  } else {
    console.error(`Failed to send IPC message on channel ${channel}: ipcRenderer not available`);
  }
}

/**
 * Wrapper function to invoke IPC methods on the main process and get a response
 * @param channel The channel to invoke the method on
 * @param args Any arguments to send with the method invocation
 * @returns A promise that resolves with the result from the main process
 */
export async function invokeIpcMethod<T>(channel: string, ...args: any[]): Promise<T> {
  if (electronApi?.ipcRenderer) {
    return electronApi.ipcRenderer.invoke<T>(channel, ...args);
  }
  console.error(`Failed to invoke IPC method on channel ${channel}: ipcRenderer not available`);
  throw new Error(`IPC renderer not available for channel ${channel}`);
} 