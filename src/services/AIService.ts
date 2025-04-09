import { sendIpcMessage, invokeIpcMethod } from '../hooks/useElectron';

// Types for AI interactions
export interface AIMessage {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
  };
}

export interface AIResponse {
  text: string;
  error?: string;
}

export interface ModelSettings {
  aiProvider: string;
  currentModel: string;
  ollamaUrl?: string;
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
   * Analyze screenshots with AI
   * @param screenshots Array of base64 encoded screenshots
   * @param useStreaming Whether to use streaming response
   * @returns Promise resolving when analysis is complete
   */
  static async analyzeScreenshots(screenshots: string[], useStreaming = true): Promise<void> {
    try {
      // Create the messages array with the prompt and screenshots
      const messages: AIMessage[] = [
        {
          type: 'text',
          text: `The screenshot shows a programming problem or question. 
I need you to provide the best possible solution with excellent performance and readability.

Guidelines:
1. Start with a clear understanding of the problem before diving into code.
2. Use modern practices, efficient algorithms, and optimize for both time and space complexity.
3. Structure your code with clean architecture principles.
4. Include robust error handling and edge case considerations.
5. If multiple solutions exist, present the optimal approach and explain your decision.

Your response MUST follow this exact structure with these three main sections:

# Analyzing the Problem
Provide a clear understanding of what the problem is asking, including:
- The key requirements and constraints
- Input/output specifications
- Important edge cases to consider
- Any implicit assumptions

# My Thoughts
Explain your strategy and implementation, including:
- Your overall approach to solving the problem
- Key algorithms, data structures, or patterns you're using
- The complete, well-commented implementation
- Any trade-offs or alternative approaches you considered

# Complexity
Analyze the efficiency of your solution:
- Time complexity with explanation
- Space complexity with explanation
- Potential bottlenecks
- Any further optimization possibilities

Format your response in clear, well-structured Markdown with proper code blocks for all code.`
        },
        ...screenshots.map(screenshot => ({
          type: 'image_url' as const,
          image_url: {
            url: screenshot.startsWith('data:') ? screenshot : `data:image/png;base64,${screenshot}`
          }
        }))
      ];

      // Send the analysis request to the main process
      await invokeIpcMethod('process-screenshots', { messages, useStreaming });

    } catch (error) {
      console.error('Error analyzing screenshots:', error);
      sendIpcMessage('notification', {
        body: `Failed to analyze screenshots: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error'
      });
      throw error;
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