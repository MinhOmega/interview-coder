const { API_KEYS } = require('./config');

function maskApiKey(key) {
  if (!key || key.length < 8) return key;
  const firstFour = key.substring(0, 4);
  const lastFour = key.substring(key.length - 4);
  const maskedLength = key.length - 8;
  return firstFour + '*'.repeat(maskedLength) + lastFour;
}

function updateApiKeyStatus(provider, message, type = 'info') {
  const statusElement = document.getElementById(API_KEYS[provider].statusId);
  if (statusElement) {
    statusElement.textContent = message;
    statusElement.className = `api-key-status ${type}`;
  }
}

function saveApiKey(provider, key) {
  API_KEYS[provider].key = key;
  localStorage.setItem(API_KEYS[provider].storageKey, key);
  updateApiKeyStatus(provider, 'API key saved successfully', 'success');
}

function loadApiKeys() {
  Object.keys(API_KEYS).forEach(provider => {
    const savedKey = localStorage.getItem(API_KEYS[provider].storageKey);
    if (savedKey) {
      API_KEYS[provider].key = savedKey;
      const input = document.getElementById(API_KEYS[provider].inputId);
      if (input) {
        input.value = maskApiKey(savedKey);
        updateApiKeyStatus(provider, 'Loaded from local storage', 'success');
      }
    }
  });
}

function hasValidApiKey(provider) {
  return API_KEYS[provider] && API_KEYS[provider].key.trim() !== '';
}

async function validateAndFetchModels(provider, key, loadModelsCallback) {
  try {
    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        updateApiKeyStatus(provider, 'API key is valid', 'success');
        if (loadModelsCallback) {
          loadModelsCallback();
        }
      } else {
        updateApiKeyStatus(provider, 'Invalid API key', 'error');
      }
    } else if (provider === 'gemini') {
      updateApiKeyStatus(provider, 'API key is valid', 'success');
      if (loadModelsCallback) {
        loadModelsCallback();
      }
    }
  } catch (error) {
    console.error(`Error validating ${provider} API key:`, error);
    updateApiKeyStatus(provider, `Error: ${error.message}`, 'error');
  }
}

module.exports = {
  maskApiKey,
  updateApiKeyStatus,
  saveApiKey,
  loadApiKeys,
  hasValidApiKey,
  validateAndFetchModels
}; 