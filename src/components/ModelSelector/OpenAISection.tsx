import React, { useState, useEffect } from 'react';
import { invokeIpcMethod } from '../../hooks/useElectron';

interface OpenAISectionProps {
  currentModel: string;
  onModelChange: (model: string) => void;
}

interface OpenAIModel {
  id: string;
  title: string;
  description: string;
  hasVision: boolean;
}

export const OpenAISection: React.FC<OpenAISectionProps> = ({
  currentModel,
  onModelChange
}) => {
  const [models, setModels] = useState<OpenAIModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('Loading OpenAI models...');
  const [statusType, setStatusType] = useState<'success' | 'error' | 'warning' | ''>('');

  // Fetch OpenAI models on component mount
  useEffect(() => {
    fetchOpenAIModels();
  }, []);

  // Function to fetch OpenAI models from the API
  const fetchOpenAIModels = async () => {
    setLoading(true);
    setStatus('Loading OpenAI models...');
    setStatusType('');

    try {
      // Try to get models from API
      const openaiApiKey = await invokeIpcMethod<string>('get-openai-api-key');
      
      if (!openaiApiKey) {
        // If no API key, fall back to default models
        setModels(getDefaultModels());
        setStatus('Using default model list (no API key found)');
        setStatusType('warning');
        setLoading(false);
        return;
      }

      // Make API request to get available models
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();

      if (data && data.data) {
        // Filter for relevant models
        const relevantModels = data.data.filter((model: any) => 
          model.id.includes('gpt-4') || 
          model.id.includes('gpt-3.5-turbo')
        );

        if (relevantModels.length === 0) {
          // Fall back to default models if none found
          setModels(getDefaultModels());
          setStatus('No suitable models found from API, using defaults');
          setStatusType('warning');
          setLoading(false);
          return;
        }

        // Transform the models data into our format
        const formattedModels = formatModels(relevantModels);
        setModels(formattedModels);
        setStatus(`${formattedModels.length} OpenAI models available`);
        setStatusType('success');
        
        // Check if current model exists in the fetched models
        if (currentModel && !formattedModels.some(m => m.id === currentModel)) {
          // If not, select a default model
          const defaultModel = formattedModels.find(m => m.id === 'gpt-4o-mini' || m.id === 'gpt-4o');
          if (defaultModel) {
            onModelChange(defaultModel.id);
          } else if (formattedModels.length > 0) {
            onModelChange(formattedModels[0].id);
          }
        }
      } else {
        // Fall back to default models
        setModels(getDefaultModels());
        setStatus('Invalid response from OpenAI API, using defaults');
        setStatusType('warning');
      }
    } catch (error) {
      console.error('Error fetching OpenAI models:', error);
      // Fall back to default models on error
      setModels(getDefaultModels());
      setStatus(`Error: ${(error as Error).message}. Using default models.`);
      setStatusType('error');
    } finally {
      setLoading(false);
    }
  };

  // Helper function to format API model data
  const formatModels = (apiModels: any[]): OpenAIModel[] => {
    // Map of model IDs to descriptive info
    const modelInfo: Record<string, Partial<OpenAIModel>> = {
      'gpt-4o-mini': {
        title: 'GPT-4o Mini',
        description: 'Smaller, faster version of GPT-4o',
        hasVision: false
      },
      'gpt-4o': {
        title: 'GPT-4o',
        description: 'Latest multimodal model with vision',
        hasVision: true
      },
      'gpt-4-vision-preview': {
        title: 'GPT-4 Vision',
        description: 'Specialized for vision tasks',
        hasVision: true
      },
      'gpt-4-turbo': {
        title: 'GPT-4 Turbo',
        description: 'Powerful, cost-effective GPT-4',
        hasVision: false
      },
      'gpt-4': {
        title: 'GPT-4',
        description: 'Standard GPT-4 model',
        hasVision: false
      },
      'gpt-3.5-turbo': {
        title: 'GPT-3.5 Turbo',
        description: 'Fast and efficient assistant model',
        hasVision: false
      }
    };

    // Define preferred order for models
    const preferredOrder = [
      'gpt-4o-mini',
      'gpt-4o',
      'gpt-4-vision-preview',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo'
    ];

    // Format and return only the models we have in our API results
    const formattedModels = apiModels
      .map(apiModel => {
        const baseId = apiModel.id.split(':')[0]; // Remove version suffix if present
        
        if (modelInfo[baseId]) {
          return {
            id: apiModel.id,
            title: modelInfo[baseId].title || apiModel.id,
            description: modelInfo[baseId].description || 'OpenAI model',
            hasVision: modelInfo[baseId].hasVision || false
          };
        }
        
        // For models not in our predefined list
        return {
          id: apiModel.id,
          title: apiModel.id,
          description: 'OpenAI model',
          hasVision: apiModel.id.includes('vision')
        };
      })
      // Sort according to preferred order
      .sort((a, b) => {
        const aBaseId = a.id.split(':')[0];
        const bBaseId = b.id.split(':')[0];
        
        const aIndex = preferredOrder.indexOf(aBaseId);
        const bIndex = preferredOrder.indexOf(bBaseId);
        
        // If both models are in the preferred list, sort by that order
        if (aIndex !== -1 && bIndex !== -1) {
          return aIndex - bIndex;
        }
        
        // If only one is in the preferred list, it comes first
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        
        // Otherwise sort alphabetically
        return a.id.localeCompare(b.id);
      });

    // Remove duplicates (keeping the first occurrence)
    const seen = new Set<string>();
    return formattedModels.filter(model => {
      const baseId = model.id.split(':')[0];
      if (seen.has(baseId)) return false;
      seen.add(baseId);
      return true;
    });
  };

  // Get default models when API is not available
  const getDefaultModels = (): OpenAIModel[] => {
    return [
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
  };

  return (
    <>
      <h2>OpenAI Models</h2>
      
      {loading || statusType ? (
        <div id="openai-loading" className={`flex justify-between items-center ${statusType}`}>
          {loading ? (
            <span>Loading OpenAI models... <span className="loading"></span></span>
          ) : (
            <span>{status}</span>
          )}
          <button 
            className="btn-primary"
            onClick={fetchOpenAIModels}
            disabled={loading}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{marginRight: '6px'}}>
              <path d="M20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12C4 7.58172 7.58172 4 12 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M16 4H12V8H16V4Z" fill="currentColor"/>
            </svg>
            Refresh Models
          </button>
        </div>
      ) : null}
      
      <div className="model-cards" id="openai-model-cards" style={{ display: loading ? 'none' : 'grid' }}>
        {models.map(model => (
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
    </>
  );
}; 