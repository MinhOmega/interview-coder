import { sendIpcMessage, invokeIpcMethod } from '../hooks/useElectron';

interface ModelSettings {
  aiProvider: string;
  currentModel: string;
}

/**
 * Service to handle AI model operations and settings
 */
export class AIService {
  /**
   * Get the current AI model settings
   * @returns Promise resolving to the current model settings
   */
  static async getCurrentSettings(): Promise<ModelSettings | null> {
    try {
      return await invokeIpcMethod<ModelSettings>('get-current-settings');
    } catch (error) {
      console.error('Error getting model settings:', error);
      sendIpcMessage('notification', {
        body: 'Failed to get model settings',
        type: 'error'
      });
      return null;
    }
  }

  /**
   * Open the model selector dialog
   */
  static openModelSelector(): void {
    sendIpcMessage('open-model-selector');
  }

  /**
   * Reset the current AI conversation context
   */
  static resetConversation(): void {
    sendIpcMessage('clear-result');
    sendIpcMessage('notification', {
      body: 'Conversation reset',
      type: 'info'
    });
  }

  /**
   * Report an issue with the AI response
   * @param errorDescription Description of the error
   */
  static reportError(errorDescription: string): void {
    if (!errorDescription || errorDescription.trim() === '') {
      return;
    }
    
    sendIpcMessage('report-solution-error', errorDescription);
    sendIpcMessage('notification', {
      body: 'Error reported',
      type: 'info'
    });
  }

  /**
   * Update the instruction banner message
   * @param message The instruction message to display
   */
  static updateInstruction(message: string): void {
    sendIpcMessage('update-instruction', message);
  }

  /**
   * Hide the instruction banner
   */
  static hideInstruction(): void {
    sendIpcMessage('hide-instruction');
  }
} 