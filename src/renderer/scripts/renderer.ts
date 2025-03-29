// Detect platform for correct key labels
const isMac = navigator.platform.includes('Mac');
const modifierKey = isMac ? 'Command' : 'Ctrl';

// Export type definition for window.api
export {};

declare global {
  interface Window {
    api: {
      send: (channel: string, data?: any) => void;
      receive: (channel: string, func: Function) => void;
      invoke: (channel: string, data?: any) => Promise<any>;
    };
  }
}

// Setup marked options
declare const marked: any;
marked.setOptions({
  sanitize: true,
  breaks: true,
  gfm: true
});

// DOM elements
const instructionBanner = document.getElementById('instruction-banner') as HTMLElement;
const responseOverlay = document.getElementById('response-overlay') as HTMLElement;
const modelBadge = document.getElementById('model-badge') as HTMLElement;
const loadingContent = document.getElementById('loading-content') as HTMLElement;
const resultContent = document.getElementById('result-content') as HTMLElement;
const notification = document.getElementById('notification') as HTMLElement;

// Show/hide overlay and notification functions
const showOverlay = (): void => {
  responseOverlay.classList.add('visible');
};

const hideOverlay = (): void => {
  responseOverlay.classList.remove('visible');
};

const updateBanner = (text: string, show = true): void => {
  instructionBanner.style.opacity = show ? '1' : '0';
  if (text) instructionBanner.textContent = text;
};

// Update the model display
const updateModelDisplay = async (): Promise<void> => {
  try {
    // @ts-ignore - window.api is injected by the preload script
    const settings = await window.api.invoke('get-current-settings');
    let provider;
    
    if (settings.aiProvider === 'openai') {
      provider = 'OpenAI';
    } else if (settings.aiProvider === 'gemini') {
      provider = 'Gemini';
    } else {
      provider = 'Ollama';
    }
    
    modelBadge.textContent = `${provider}: ${settings.currentModel}`;
  } catch (error) {
    console.error('Error getting current model:', error);
  }
};

// Call once at startup
updateModelDisplay();

// Notification function
function showNotification(message: string, type = 'success'): void {
  // Reset any existing classes
  notification.classList.remove('success', 'warning', 'error', 'visible');
  
  // Set the message and type
  notification.textContent = message;
  notification.classList.add(type);
  notification.classList.add('visible');
  
  // Hide after 5 seconds (for success/warning) or 8 seconds (for errors)
  const timeout = type === 'error' ? 8000 : 5000;
  setTimeout(() => {
    notification.classList.remove('visible');
  }, timeout);
}

// Event handlers for different message types
const handlers: Record<string, (event: any, ...args: any[]) => void> = {
  'analysis-result': (event: any, result: string) => {
    loadingContent.style.display = 'none';
    resultContent.style.display = 'block';
    resultContent.innerHTML = marked.parse(result);
    showOverlay();
    updateBanner(`${modifierKey}+Shift+R: Repeat process`);
  },
  
  'stream-start': () => {
    resultContent.style.display = 'block';
    resultContent.innerHTML = '';
    showOverlay();
  },
  
  'stream-chunk': (event: any, chunk: string) => {
    resultContent.innerHTML = marked.parse(resultContent.textContent + chunk);
    // Scroll to bottom to show latest content
    resultContent.scrollTop = resultContent.scrollHeight;
  },
  
  'stream-end': () => {
    updateBanner(`${modifierKey}+Shift+R: Repeat process`);
  },
  
  'error': (event: any, error: string) => {
    loadingContent.style.display = 'none';
    resultContent.style.display = 'block';
    showOverlay();
    resultContent.innerHTML = 
      `<div class="error-message">
        <strong>Error:</strong> ${error}
        <br><small>Press ${modifierKey}+Shift+R to try again</small>
      </div>`;
    
    showNotification(error, 'error');
  },
  
  'warning': (event: any, warning: string) => {
    showNotification(warning, 'warning');
    
    if (resultContent.innerHTML === '') {
      resultContent.style.display = 'block';
      showOverlay();
    }
    
    // Add warning to the top of the result content
    const warningElement = document.createElement('div');
    warningElement.className = 'warning-message';
    warningElement.innerHTML = `<strong>Warning:</strong> ${warning}`;
    
    // Insert at the top
    resultContent.insertBefore(warningElement, resultContent.firstChild);
  },
  
  'model-not-found': (event: any, data: any) => {
    loadingContent.style.display = 'none';
    resultContent.style.display = 'block';
    showOverlay();
    
    let suggestionsHtml = '';
    if (data.suggestedModels && data.suggestedModels.length > 0) {
      suggestionsHtml = `
        <div style="margin-top: 15px;">
          <strong>Available vision models:</strong>
          <ul>
            ${data.suggestedModels.map((model: string) => `<li>${model}</li>`).join('')}
          </ul>
          <p>
            You can pull these models with:
            <pre>ollama pull ${data.suggestedModels[0]}</pre>
            or select an existing model via ${modifierKey}+Shift+M
          </p>
        </div>
      `;
    }
    
    resultContent.innerHTML = 
      `<div class="error-message">
        <strong>Model not found:</strong> ${data.model}
        <p>${data.error}</p>
        ${suggestionsHtml}
      </div>`;
  },
  
  'update-instruction': (event: any, instruction: string) => {
    updateBanner(instruction, true);
  },
  
  'hide-instruction': () => {
    updateBanner('', false);
  },
  
  'clear-result': () => {
    resultContent.innerHTML = "";
    hideOverlay();
  },
  
  'loading': (event: any, isLoading: boolean) => {
    if (isLoading) {
      showOverlay();
      resultContent.style.display = 'none';
      loadingContent.style.display = 'flex';
    } else {
      loadingContent.style.display = 'none';
    }
  },
  
  'model-changed': () => {
    updateModelDisplay();
  },
  
  'screenshot-saved': (event: any, data: any) => {
    const { path, isArea, dimensions } = data;
    const typeText = isArea ? "Area screenshot" : "Full screenshot";
    const dimensionsText = dimensions ? ` (${dimensions.width}x${dimensions.height})` : '';
    showNotification(`${typeText}${dimensionsText} saved: ${path}`);
  }
};

// Register event handlers
Object.entries(handlers).forEach(([channel, handler]) => {
  // @ts-ignore - window.api is injected by the preload script
  window.api.receive(channel, handler);
});

// Initial instruction
updateBanner(`${modifierKey}+Shift+S: Full Screen | ${modifierKey}+Shift+D: Area | ${modifierKey}+Shift+A: Multi-mode | ${modifierKey}+Shift+M: Models | ${modifierKey}+Shift+Q: Close`); 