import React from 'react';

interface OpenAISectionProps {
  currentModel: string;
  onModelChange: (model: string) => void;
}

// Array of OpenAI models with their details
const OPENAI_MODELS = [
  {
    id: 'gpt-4o-mini',
    title: 'GPT-4o Mini',
    description: 'Smaller, faster version of GPT-4o',
    hasVision: false
  },
  {
    id: 'gpt-4o',
    title: 'GPT-4o',
    description: 'Latest multimodal model with vision',
    hasVision: true
  },
  {
    id: 'gpt-4-vision-preview',
    title: 'GPT-4 Vision',
    description: 'Specialized for vision tasks',
    hasVision: true
  },
  {
    id: 'gpt-4-turbo',
    title: 'GPT-4 Turbo',
    description: 'Powerful, cost-effective GPT-4',
    hasVision: false
  }
];

export const OpenAISection: React.FC<OpenAISectionProps> = ({
  currentModel,
  onModelChange
}) => {
  return (
    <div className="section" id="openai-section">
      <h2>OpenAI Models</h2>
      <div className="model-cards" id="openai-model-cards">
        {OPENAI_MODELS.map(model => (
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
    </div>
  );
}; 