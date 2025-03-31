import React from 'react';

interface GeminiSectionProps {
  currentModel: string;
  onModelChange: (model: string) => void;
}

// Array of Gemini models with their details
const GEMINI_MODELS = [
  {
    id: 'gemini-1.5-pro',
    title: 'Gemini 1.5 Pro',
    description: 'Best for complex tasks, multimodal understanding, and long contexts',
    hasVision: true
  },
  {
    id: 'gemini-1.5-flash',
    title: 'Gemini 1.5 Flash',
    description: 'Fast and efficient for most use cases with vision',
    hasVision: true
  },
  {
    id: 'gemini-1.0-pro',
    title: 'Gemini 1.0 Pro',
    description: 'Original Pro model with strong reasoning',
    hasVision: false
  },
  {
    id: 'gemini-1.0-pro-vision',
    title: 'Gemini 1.0 Pro Vision',
    description: 'Dedicated vision model for image analysis',
    hasVision: true
  }
];

export const GeminiSection: React.FC<GeminiSectionProps> = ({
  currentModel,
  onModelChange
}) => {
  return (
    <div className="section" id="gemini-section">
      <h2>Gemini Models</h2>
      <div className="model-cards" id="gemini-model-cards">
        {GEMINI_MODELS.map(model => (
          <div 
            key={model.id}
            className={`model-card ${currentModel === model.id ? 'selected' : ''}`}
            data-model={model.id}
            onClick={() => onModelChange(model.id)}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onModelChange(model.id);
              }
            }}
          >
            <div className="model-card-title">{model.title}</div>
            <div className="model-card-description">{model.description}</div>
            {model.hasVision && (
              <div className="model-card-badge vision">Vision</div>
            )}
          </div>
        ))}
      </div>
      
      <div className="helper-text mt-2">
        Google Gemini requires an API key from Google AI Studio.
      </div>
    </div>
  );
}; 