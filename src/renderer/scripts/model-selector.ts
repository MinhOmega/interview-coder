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

// Define types for our settings
interface Settings {
  aiProvider: 'openai' | 'gemini' | 'ollama';
  openaiApiKey?: string;
  openaiModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  ollamaUrl?: string;
  ollamaModel?: string;
  currentModel?: string;
}

// DOM elements
const form = document.getElementById('model-form') as HTMLFormElement;
const providerSelect = document.getElementById('ai-provider') as HTMLSelectElement;
const openaiSection = document.getElementById('openai-section') as HTMLElement;
const geminiSection = document.getElementById('gemini-section') as HTMLElement;
const ollamaSection = document.getElementById('ollama-section') as HTMLElement;
const testBtn = document.getElementById('test-connection') as HTMLButtonElement;
const notification = document.getElementById('notification') as HTMLElement;

// Input elements
const openaiApiKey = document.getElementById('openai-api-key') as HTMLInputElement;
const openaiModel = document.getElementById('openai-model') as HTMLSelectElement;
const geminiApiKey = document.getElementById('gemini-api-key') as HTMLInputElement;
const geminiModel = document.getElementById('gemini-model') as HTMLSelectElement;
const ollamaUrl = document.getElementById('ollama-url') as HTMLInputElement;
const ollamaModelSelect = document.getElementById('ollama-model') as HTMLSelectElement;

// Show sections based on selected provider
function showSelectedSection(provider: string): void {
  openaiSection.style.display = provider === 'openai' ? 'block' : 'none';
  geminiSection.style.display = provider === 'gemini' ? 'block' : 'none';
  ollamaSection.style.display = provider === 'ollama' ? 'block' : 'none';
}

// Show notification
function showNotification(message: string, type = 'success'): void {
  notification.textContent = message;
  notification.className = 'notification ' + type;
  
  setTimeout(() => {
    notification.className = 'notification';
  }, 5000);
}

// Load current settings when page loads
async function loadSettings(): Promise<void> {
  try {
    const settings = await window.api.invoke('get-current-settings');
    
    // Update provider select
    if (settings.aiProvider) {
      providerSelect.value = settings.aiProvider;
      showSelectedSection(settings.aiProvider);
    }
    
    // Update OpenAI settings
    if (settings.openaiApiKey) {
      openaiApiKey.value = settings.openaiApiKey;
    }
    if (settings.openaiModel) {
      openaiModel.value = settings.openaiModel;
    }
    
    // Update Gemini settings
    if (settings.geminiApiKey) {
      geminiApiKey.value = settings.geminiApiKey;
    }
    if (settings.geminiModel) {
      geminiModel.value = settings.geminiModel;
    }
    
    // Update Ollama settings
    if (settings.ollamaUrl) {
      ollamaUrl.value = settings.ollamaUrl;
    }
    
    // Load Ollama models
    if (settings.aiProvider === 'ollama') {
      await loadOllamaModels();
      
      // Set selected model after loading
      if (settings.ollamaModel) {
        ollamaModelSelect.value = settings.ollamaModel;
      }
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    showNotification('Failed to load settings', 'error');
  }
}

// Load Ollama models
async function loadOllamaModels(): Promise<void> {
  // Clear current options
  ollamaModelSelect.innerHTML = '';
  
  try {
    // Get URL from input
    const url = ollamaUrl.value.trim();
    if (!url) {
      // Add a placeholder option
      const option = document.createElement('option');
      option.text = 'Enter Ollama URL first';
      option.disabled = true;
      option.selected = true;
      ollamaModelSelect.add(option);
      return;
    }
    
    // Show loading in select
    const loadingOption = document.createElement('option');
    loadingOption.text = 'Loading models...';
    loadingOption.disabled = true;
    loadingOption.selected = true;
    ollamaModelSelect.add(loadingOption);
    
    // Fetch models from main process
    const models = await window.api.invoke('get-ollama-models', { url });
    
    // Remove loading option
    ollamaModelSelect.innerHTML = '';
    
    // Add models to select
    if (models && models.length > 0) {
      // Add prompt to select a model
      const defaultOption = document.createElement('option');
      defaultOption.text = 'Select a model';
      defaultOption.value = '';
      defaultOption.disabled = true;
      defaultOption.selected = true;
      ollamaModelSelect.add(defaultOption);
      
      // Add actual models
      models.forEach((model: string) => {
        const option = document.createElement('option');
        option.text = model;
        option.value = model;
        ollamaModelSelect.add(option);
      });
    } else {
      // No models found
      const option = document.createElement('option');
      option.text = 'No models found';
      option.disabled = true;
      option.selected = true;
      ollamaModelSelect.add(option);
    }
  } catch (error) {
    console.error('Error loading Ollama models:', error);
    
    // Show error in select
    ollamaModelSelect.innerHTML = '';
    const option = document.createElement('option');
    option.text = 'Error loading models';
    option.disabled = true;
    option.selected = true;
    ollamaModelSelect.add(option);
    
    showNotification('Failed to load Ollama models', 'error');
  }
}

// Test Ollama connection
async function testOllamaConnection(): Promise<void> {
  const url = ollamaUrl.value.trim();
  if (!url) {
    showNotification('Please enter Ollama URL', 'error');
    return;
  }
  
  try {
    testBtn.textContent = 'Testing...';
    testBtn.disabled = true;
    
    await loadOllamaModels();
    
    showNotification('Connection successful!');
  } catch (error) {
    console.error('Error testing connection:', error);
    showNotification('Connection failed', 'error');
  } finally {
    testBtn.textContent = 'Test Connection';
    testBtn.disabled = false;
  }
}

// Save settings
async function saveSettings(event: Event): Promise<void> {
  event.preventDefault();
  
  // Get selected provider
  const provider = providerSelect.value as 'openai' | 'gemini' | 'ollama';
  
  // Create settings object
  const settings: Settings = {
    aiProvider: provider
  };
  
  // Add provider-specific settings
  if (provider === 'openai') {
    settings.openaiApiKey = openaiApiKey.value;
    settings.openaiModel = openaiModel.value;
    settings.currentModel = openaiModel.value;
  } else if (provider === 'gemini') {
    settings.geminiApiKey = geminiApiKey.value;
    settings.geminiModel = geminiModel.value;
    settings.currentModel = geminiModel.value;
  } else if (provider === 'ollama') {
    settings.ollamaUrl = ollamaUrl.value;
    settings.ollamaModel = ollamaModelSelect.value;
    settings.currentModel = ollamaModelSelect.value;
  }
  
  // Basic validation
  if (provider === 'openai' && (!settings.openaiApiKey || !settings.openaiModel)) {
    showNotification('Please enter OpenAI API key and select a model', 'error');
    return;
  } else if (provider === 'gemini' && (!settings.geminiApiKey || !settings.geminiModel)) {
    showNotification('Please enter Gemini API key and select a model', 'error');
    return;
  } else if (provider === 'ollama' && (!settings.ollamaUrl || !settings.ollamaModel)) {
    showNotification('Please enter Ollama URL and select a model', 'error');
    return;
  }
  
  try {
    // Save settings through main process
    await window.api.send('update-model-settings', settings);
    
    showNotification('Settings saved successfully');
    
    // Close the window after a short delay
    setTimeout(() => {
      window.close();
    }, 1500);
  } catch (error) {
    console.error('Error saving settings:', error);
    showNotification('Failed to save settings', 'error');
  }
}

// Event listeners
window.addEventListener('DOMContentLoaded', loadSettings);
providerSelect.addEventListener('change', () => showSelectedSection(providerSelect.value));
testBtn.addEventListener('click', testOllamaConnection);
form.addEventListener('submit', saveSettings);

// Cancel button
document.getElementById('cancel-btn')?.addEventListener('click', () => window.close()); 