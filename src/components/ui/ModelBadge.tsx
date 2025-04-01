import React, { useEffect, useState } from 'react';
import { invokeIpcMethod } from '../../hooks/useElectron';

interface ModelSettings {
  aiProvider: string;
  currentModel: string;
  ollamaUrl?: string;
}

export interface ModelBadgeProps {
  onOpenSettings?: () => void;
}

export const ModelBadge: React.FC<ModelBadgeProps> = ({ onOpenSettings }) => {
  const [settings, setSettings] = useState<ModelSettings>({
    aiProvider: 'openai',
    currentModel: 'gpt-4o-mini'
  });

  // Load model settings on mount and when model changes
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const modelSettings = await invokeIpcMethod<ModelSettings>('get-current-settings');
        if (modelSettings) {
          setSettings(modelSettings);
          
          // Also save to localStorage as backup
          localStorage.setItem('model-settings', JSON.stringify(modelSettings));
        }
      } catch (error) {
        console.error('Error getting model settings:', error);
        
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

    fetchSettings();

    // Listen for model change events
    const handleModelChange = (event: Event) => {
      const customEvent = event as CustomEvent<ModelSettings>;
      if (customEvent.detail) {
        setSettings(customEvent.detail);
        localStorage.setItem('model-settings', JSON.stringify(customEvent.detail));
      } else {
        fetchSettings();
      }
    };

    window.addEventListener('model-settings-updated', handleModelChange);
    
    return () => {
      window.removeEventListener('model-settings-updated', handleModelChange);
    };
  }, []);

  // Format provider name
  const getProviderName = () => {
    switch (settings.aiProvider) {
      case 'openai': return 'OpenAI';
      case 'ollama': return 'Ollama';
      case 'gemini': return 'Gemini';
      default: return settings.aiProvider || 'AI';
    }
  };

  const handleClick = () => {
    if (onOpenSettings) {
      onOpenSettings();
    }
  };

  return (
    <div className="model-badge" onClick={handleClick} title="Click to change model">
      {getProviderName()}: {settings.currentModel || 'Default Model'}
    </div>
  );
}; 