const { API_KEYS } = require('./config');
const { saveApiKey } = require('./api-key-manager');

let currentProvider = null;

// Show API key modal
function showApiKeyModal(provider) {
  const apiKeyModal = document.getElementById('api-key-modal');
  const modalTitle = document.getElementById('api-key-modal-title');
  const modalMessage = document.getElementById('api-key-modal-message');
  const modalApiKeyInput = document.getElementById('modal-api-key');
  
  currentProvider = provider;
  
  modalTitle.textContent = API_KEYS[provider].modalTitle;
  modalMessage.textContent = API_KEYS[provider].modalMessage;
  modalApiKeyInput.value = API_KEYS[provider].key;
  
  apiKeyModal.style.display = 'block';
}

// Hide API key modal
function hideApiKeyModal() {
  const apiKeyModal = document.getElementById('api-key-modal');
  const modalApiKeyInput = document.getElementById('modal-api-key');
  const modalApiKeyStatus = document.getElementById('modal-api-key-status');
  
  apiKeyModal.style.display = 'none';
  modalApiKeyInput.value = '';
  modalApiKeyStatus.textContent = '';
  currentProvider = null;
}

// Initialize modal event listeners
function initializeModals() {
  const apiKeyModal = document.getElementById('api-key-modal');
  const saveApiKeyBtn = document.getElementById('save-api-key');
  const cancelApiKeyBtn = document.getElementById('cancel-api-key');
  const closeModalBtn = document.querySelector('.close-modal');
  const modalApiKeyInput = document.getElementById('modal-api-key');
  const modalApiKeyStatus = document.getElementById('modal-api-key-status');
  
  // Save API key button
  saveApiKeyBtn.addEventListener('click', () => {
    if (currentProvider) {
      const key = modalApiKeyInput.value.trim();
      if (key) {
        saveApiKey(currentProvider, key);
        const mainInput = document.getElementById(API_KEYS[currentProvider].inputId);
        if (mainInput) {
          mainInput.value = key;
        }
        hideApiKeyModal();
      } else {
        modalApiKeyStatus.textContent = 'API key is required';
        modalApiKeyStatus.className = 'api-key-status error';
      }
    }
  });
  
  // Cancel and close buttons
  cancelApiKeyBtn.addEventListener('click', hideApiKeyModal);
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', hideApiKeyModal);
  }
  
  // Close modal when clicking outside
  window.addEventListener('click', (e) => {
    if (e.target === apiKeyModal) {
      hideApiKeyModal();
    }
  });
  
  // Add keyboard shortcuts for modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && apiKeyModal.style.display === 'block') {
      hideApiKeyModal();
    }
    if (e.key === 'Enter' && apiKeyModal.style.display === 'block') {
      saveApiKeyBtn.click();
    }
  });
}

// Handle provider selection with API key check
function handleProviderSelection(provider) {
  if ((provider === 'openai' || provider === 'gemini') && !API_KEYS[provider].key.trim()) {
    showApiKeyModal(provider);
    return false;
  }
  return true;
}

module.exports = {
  showApiKeyModal,
  hideApiKeyModal,
  initializeModals,
  handleProviderSelection
}; 