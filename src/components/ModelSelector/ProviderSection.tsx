import React from 'react';

interface ProviderSectionProps {
  selectedProvider: string;
  onProviderChange: (provider: string) => void;
}

export const ProviderSection: React.FC<ProviderSectionProps> = ({
  selectedProvider,
  onProviderChange
}) => {
  // Provider options with their metadata
  const providers = [
    {
      id: 'openai',
      name: 'OpenAI',
      description: 'Requires API Key',
      icon: '🤖' // You can replace with actual image paths if available
    },
    {
      id: 'ollama',
      name: 'Ollama',
      description: 'Local, free',
      icon: '🏠'
    },
    {
      id: 'gemini',
      name: 'Gemini',
      description: 'Google AI, Requires API Key',
      icon: '🌐'
    }
  ];

  return (
    <div className="provider-section">
      <h2>Select AI Provider</h2>
      <div className="provider-options">
        {providers.map(provider => (
          <div
            key={provider.id}
            className={`provider-option ${selectedProvider === provider.id ? 'selected' : ''}`}
            onClick={() => onProviderChange(provider.id)}
          >
            <div className="provider-icon">{provider.icon}</div>
            <span className="provider-name">{provider.name}</span>
            <span className="provider-description">{provider.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}; 