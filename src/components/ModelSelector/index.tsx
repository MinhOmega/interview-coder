import React, { useState, useEffect } from 'react';
import { useElectron, invokeIpcMethod, sendIpcMessage } from '../../hooks/useElectron';
import { ProviderSection } from './ProviderSection';
import { OpenAISection } from './OpenAISection';
import { OllamaSection } from './OllamaSection';
import { GeminiSection } from './GeminiSection';
import './ModelSelector.css';

interface ModelSelectorProps {
  onClose: () => void;
}

interface ModelSettings {
  aiProvider: string;
  currentModel: string;
  ollamaUrl?: string;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ onClose }) => {
  const { ipcRenderer } = useElectron();
  const [settings, setSettings] = useState<ModelSettings>({
    aiProvider: 'openai',
    currentModel: 'gpt-4o-mini',
    ollamaUrl: 'http://127.0.0.1:11434'
  });
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusType, setStatusType] = useState<'success' | 'error' | 'warning' | ''>('');

  // Load current settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const currentSettings = await invokeIpcMethod<ModelSettings>('get-current-settings');
        if (currentSettings) {
          setSettings(currentSettings);
        }
      } catch (error) {
        console.error('Error getting current settings:', error);
        showStatus('Settings system not fully initialized. Using default configuration.', 'warning');
        
        // Try to get settings from localStorage as fallback
        try {
          const savedSettings = localStorage.getItem('model-settings');
          if (savedSettings) {
            setSettings(JSON.parse(savedSettings));
          }
        } catch (localStorageErr) {
          console.error('Error retrieving from localStorage:', localStorageErr);
        }
      }
    };

    loadSettings();
    
    // Close on ESC key
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Handle provider change
  const handleProviderChange = (provider: string) => {
    setSettings(prev => ({ ...prev, aiProvider: provider }));
  };

  // Handle model selection change
  const handleModelChange = (model: string) => {
    setSettings(prev => ({ ...prev, currentModel: model }));
  };

  // Handle Ollama URL change
  const handleOllamaUrlChange = (url: string) => {
    setSettings(prev => ({ ...prev, ollamaUrl: url }));
  };

  // Show status message
  const showStatus = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setStatusMessage(message);
    setStatusType(type);
    
    // Clear status after some time for success messages
    if (type === 'success') {
      setTimeout(() => {
        setStatusMessage('');
        setStatusType('');
      }, 3000);
    }
  };

  // Handle save button click
  const handleSave = async () => {
    setIsSaving(true);
    
    try {
      // Ensure we always use IPv4 for Ollama
      let { aiProvider, currentModel, ollamaUrl } = settings;
      
      if (aiProvider === 'ollama' && ollamaUrl) {
        ollamaUrl = ollamaUrl.replace('localhost', '127.0.0.1');
        
        // Test Ollama connection if using Ollama
        showStatus('Testing Ollama connection...', 'warning');
        
        try {
          const response = await fetch(`${ollamaUrl}/api/version`, { method: 'GET' });
          
          if (!response.ok) {
            showStatus(`Could not connect to Ollama at ${ollamaUrl}. Check if Ollama is running.`, 'error');
            setIsSaving(false);
            return;
          }
        } catch (error) {
          console.error('Ollama connection error:', error);
          showStatus(`Connection to Ollama failed: ${(error as Error).message}`, 'error');
          setIsSaving(false);
          return;
        }
      }
      
      // Update settings
      if (ipcRenderer) {
        ipcRenderer.send('update-model-settings', {
          aiProvider, 
          currentModel,
          ollamaUrl
        });
        
        showStatus('Settings saved!', 'success');
      } else {
        // Fallback to localStorage if IPC is not available
        localStorage.setItem('model-settings', JSON.stringify(settings));
        showStatus('Settings saved locally (fallback mode).', 'success');
      }
      
      // Notify any parent windows about the update
      try {
        window.opener?.postMessage({ 
          type: 'model-settings-updated', 
          settings 
        }, '*');
      } catch (e) {
        console.error('Error notifying parent window:', e);
      }
      
      // Close after a delay
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (error) {
      console.error('Error saving settings:', error);
      showStatus(`Could not save settings: ${(error as Error).message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle clicking outside to close
  const handleOutsideClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="model-selector-container" onClick={handleOutsideClick}>
      <div className="model-selector-content">
        <h1>Select AI Model</h1>
        
        <ProviderSection 
          selectedProvider={settings.aiProvider} 
          onProviderChange={handleProviderChange}
        />
        
        {settings.aiProvider === 'openai' && (
          <OpenAISection 
            currentModel={settings.currentModel}
            onModelChange={handleModelChange}
          />
        )}
        
        {settings.aiProvider === 'ollama' && (
          <OllamaSection 
            currentModel={settings.currentModel}
            ollamaUrl={settings.ollamaUrl || 'http://127.0.0.1:11434'}
            onModelChange={handleModelChange}
            onOllamaUrlChange={handleOllamaUrlChange}
          />
        )}
        
        {settings.aiProvider === 'gemini' && (
          <GeminiSection 
            currentModel={settings.currentModel}
            onModelChange={handleModelChange}
          />
        )}
        
        <div className="button-row">
          <button 
            className={`btn-save ${isSaving ? 'disabled' : ''}`}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
          
          <button 
            className="btn-cancel"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
        
        {statusMessage && (
          <div className={`status ${statusType}`}>
            {statusMessage}
          </div>
        )}
      </div>
    </div>
  );
}; 