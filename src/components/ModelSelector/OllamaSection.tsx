import React, { useState, useEffect } from 'react';
import { invokeIpcMethod } from '../../hooks/useElectron';

interface OllamaSectionProps {
  currentModel: string;
  ollamaUrl: string;
  onModelChange: (model: string) => void;
  onOllamaUrlChange: (url: string) => void;
}

interface OllamaModel {
  name: string;
  size: number;
  details?: {
    family?: string;
  };
  isVisionModel?: boolean;
}

export const OllamaSection: React.FC<OllamaSectionProps> = ({
  currentModel,
  ollamaUrl,
  onModelChange,
  onOllamaUrlChange
}) => {
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [statusType, setStatusType] = useState<'success' | 'error' | 'warning' | ''>('');
  const [showPullModal, setShowPullModal] = useState(false);
  const [modelToPull, setModelToPull] = useState('llava:latest');
  const [pulling, setPulling] = useState(false);
  const [pullStatus, setPullStatus] = useState('');
  const [hasVisionModels, setHasVisionModels] = useState(false);

  // Load Ollama models on mount and when URL changes
  useEffect(() => {
    loadOllamaModels();
  }, [ollamaUrl]);

  // Load models from Ollama
  const loadOllamaModels = async () => {
    setLoading(true);
    setStatus('Loading models...');
    setStatusType('');
    setHasVisionModels(false);

    try {
      const fetchedModels = await invokeIpcMethod<OllamaModel[]>('get-ollama-models');
      
      if (!fetchedModels || fetchedModels.length === 0) {
        setStatus('No models found. Is Ollama running?');
        setStatusType('error');
        setModels([]);
        setLoading(false);
        return;
      }

      // Check for vision models
      const visionModelNames = ['llava', 'bakllava', 'moondream', 'deepseek'];
      const hasVision = fetchedModels.some(model => 
        visionModelNames.some(name => model.name.toLowerCase().includes(name))
      );
      setHasVisionModels(hasVision);

      // Sort models by type and name
      const sortedModels = [...fetchedModels].sort((a, b) => {
        // Put vision models first
        const aIsVision = visionModelNames.some(name => a.name.toLowerCase().includes(name));
        const bIsVision = visionModelNames.some(name => b.name.toLowerCase().includes(name));
        
        if (aIsVision && !bIsVision) return -1;
        if (!aIsVision && bIsVision) return 1;
        
        // Then sort by name
        return a.name.localeCompare(b.name);
      });

      // Add isVisionModel flag to models
      const modelsWithVisionFlag = sortedModels.map(model => ({
        ...model,
        isVisionModel: visionModelNames.some(name => model.name.toLowerCase().includes(name))
      }));

      setModels(modelsWithVisionFlag);
      setStatus(`${modelsWithVisionFlag.length} models loaded`);
      setStatusType('success');
      
      // If current model isn't in the list, select the first one
      if (currentModel && !modelsWithVisionFlag.some(m => m.name === currentModel)) {
        if (modelsWithVisionFlag.length > 0) {
          onModelChange(modelsWithVisionFlag[0].name);
        }
      }
    } catch (error) {
      console.error('Error loading Ollama models:', error);
      setStatus(`Error: ${(error as Error).message}`);
      setStatusType('error');
      setModels([]);

      // Check if the error is likely due to Ollama not running
      if ((error as Error).message.includes('ECONNREFUSED') || 
          (error as Error).message.includes('ECONNRESET')) {
        setStatus('Cannot connect to Ollama. Is Ollama running?');
      }
    } finally {
      setLoading(false);
    }
  };

  // Test Ollama connection
  const testConnection = async () => {
    setStatus('Testing connection...');
    setStatusType('');

    try {
      const url = ollamaUrl.replace('localhost', '127.0.0.1');
      const response = await fetch(`${url}/api/version`, { method: 'GET' });
      
      if (response.ok) {
        const data = await response.json();
        setStatus(`Connected successfully! Ollama version: ${data.version}`);
        setStatusType('success');
        return true;
      } else {
        setStatus(`Error: Received status ${response.status}`);
        setStatusType('error');
        return false;
      }
    } catch (error) {
      setStatus(`Connection failed: ${(error as Error).message}`);
      setStatusType('error');
      return false;
    }
  };

  // Pull an Ollama model
  const pullOllamaModel = async () => {
    if (!modelToPull.trim()) {
      setPullStatus('Please enter a model name');
      return;
    }

    setPulling(true);
    setPullStatus(`Pulling model ${modelToPull}...`);

    try {
      const url = ollamaUrl.replace('localhost', '127.0.0.1');
      setPullStatus('Sending pull request...');
      
      const response = await fetch(`${url}/api/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: modelToPull,
          stream: false
        })
      });

      if (response.ok) {
        setPullStatus(`Successfully pulled model: ${modelToPull}`);
        
        // Reload the model list
        await loadOllamaModels();
        
        // Select the newly pulled model
        onModelChange(modelToPull);
        
        // Close the modal after a delay
        setTimeout(() => {
          setShowPullModal(false);
          setPullStatus('');
        }, 2000);
      } else {
        setPullStatus(`Error pulling model: ${response.statusText || 'Unknown error'}`);
      }
    } catch (error) {
      setPullStatus(`Error pulling model: ${(error as Error).message}`);
    } finally {
      setPulling(false);
    }
  };

  return (
    <>
      <h2>Ollama Models</h2>
      
      <div className="flex justify-between items-center">
        <span id="ollama-status" className={statusType}>
          {loading ? (
            <div id="ollama-loading">
              Loading models... <span className="loading"></span>
            </div>
          ) : status}
        </span>
        <button 
          id="refresh-models" 
          className="btn-primary"
          onClick={loadOllamaModels}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{marginRight: '6px'}}>
            <path d="M20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12C4 7.58172 7.58172 4 12 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M16 4H12V8H16V4Z" fill="currentColor"/>
          </svg>
          Refresh Models
        </button>
      </div>
      
      <div className="model-cards mt-4" id="ollama-model-cards" style={{ display: loading ? 'none' : 'grid' }}>
        {models.map(model => (
          <div 
            key={model.name}
            className={`model-card ${currentModel === model.name ? 'selected' : ''}`}
            data-model={model.name}
            onClick={() => onModelChange(model.name)}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onModelChange(model.name);
              }
            }}
          >
            <div className="model-card-title">{model.name}</div>
            <div className="model-card-description">
              {model.details && model.details.family 
                ? `${model.details.family} (${Math.round(model.size / 1024 / 1024)}MB)`
                : `Size: ${Math.round(model.size / 1024 / 1024)}MB`}
            </div>
            {model.isVisionModel && (
              <div className="model-card-badge vision">Vision</div>
            )}
          </div>
        ))}
      </div>
      
      {hasVisionModels && (
        <div id="vision-models-note" className="helper-text mt-1 mb-2">
          For image processing, it's recommended to use multi-modal models like:
          llava, bakllava, deepseek-r1, or moondream
        </div>
      )}

      <h3>Ollama URL</h3>
      <input 
        type="text" 
        id="ollama-url" 
        placeholder="http://127.0.0.1:11434" 
        value={ollamaUrl}
        onChange={(e) => onOllamaUrlChange(e.target.value)}
      />
      <div className="helper-text">Use 127.0.0.1 instead of localhost to avoid IPv6 connection issues</div>

      <div id="connection-test-result" className={`status ${statusType}`}>
        {status}
      </div>
      
      <div className="flex justify-between mt-4">
        <button id="test-connection" className="btn-primary" onClick={testConnection}>
          Test Connection
        </button>
        <button 
          id="pull-model-btn" 
          className="btn-warning" 
          onClick={() => {
            setModelToPull('llava:latest');
            setPullStatus('');
            setShowPullModal(true);
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{marginRight: '6px'}}>
            <path d="M12 4V16M12 16L7 11M12 16L17 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M20 20H4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          Pull Model
        </button>
      </div>

      {/* Pull model modal dialog */}
      {showPullModal && (
        <div id="pull-model-modal" className="modal" style={{ display: 'block' }}>
          <div className="modal-content">
            <span className="close-modal" onClick={() => setShowPullModal(false)}>&times;</span>
            <h3>Pull Ollama Model</h3>
            <p className="mb-2">Enter the name of the model to pull:</p>
            <input 
              type="text" 
              id="model-to-pull" 
              placeholder="e.g., llava:latest" 
              className="w-full mb-1"
              value={modelToPull}
              onChange={(e) => setModelToPull(e.target.value)}
            />
            <div className="helper-text mb-4">Recommended multimodal models: llava, bakllava, deepseek-r1, moondream</div>
            <div id="pull-status" className="status">{pullStatus}</div>
            <div className="flex justify-between mt-4">
              <button 
                id="confirm-pull" 
                className="btn-success" 
                onClick={pullOllamaModel}
                disabled={pulling}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{marginRight: '6px'}}>
                  <path d="M12 4V16M12 16L7 11M12 16L17 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M20 20H4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                {pulling ? 'Pulling...' : 'Pull Model'}
              </button>
              <button id="cancel-pull" className="btn" onClick={() => setShowPullModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}; 