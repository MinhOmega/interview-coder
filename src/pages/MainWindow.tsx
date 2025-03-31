import React, { useState, useEffect, useRef } from 'react';
import { TopToolbar } from '../components/ui/TopToolbar';
import { InstructionBanner } from '../components/ui/InstructionBanner';
import { ResultContent } from '../components/ui/ResultContent';
import { LoadingContent } from '../components/ui/LoadingContent';
import { ContextActions } from '../components/ui/ContextActions';
import { ModelBadge } from '../components/ui/ModelBadge';
import { NotificationContainer } from '../components/ui/NotificationContainer';
import { useElectron } from '../hooks/useElectron';

interface MainWindowProps {
  onOpenModelSelector: () => void;
}

export const MainWindow: React.FC<MainWindowProps> = ({ onOpenModelSelector }) => {
  const { ipcRenderer } = useElectron();
  const [instruction, setInstruction] = useState<string>('');
  const [isInstructionVisible, setIsInstructionVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string>('');
  const [isWindowVisible, setIsWindowVisible] = useState(true);
  const [notifications, setNotifications] = useState<Array<{ id: string; type: string; message: string }>>([]);
  const [showContextActions, setShowContextActions] = useState(false);
  
  const notificationTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  
  // Handle IPC messages
  useEffect(() => {
    if (!ipcRenderer) return;
    
    // Set up IPC listeners
    const updateInstructionUnsubscribe = ipcRenderer.on('update-instruction', (instruction: string) => {
      setInstruction(instruction);
      setIsInstructionVisible(true);
    });
    
    const hideInstructionUnsubscribe = ipcRenderer.on('hide-instruction', () => {
      setIsInstructionVisible(false);
    });
    
    const updateVisibilityUnsubscribe = ipcRenderer.on('update-visibility', (isVisible: boolean) => {
      setIsWindowVisible(isVisible);
      document.body.classList.toggle('invisible-mode', !isVisible);
    });
    
    const notificationUnsubscribe = ipcRenderer.on('notification', (data: { body: string; type: string }) => {
      addNotification(data.body, data.type || 'success');
    });
    
    const warningUnsubscribe = ipcRenderer.on('warning', (message: string) => {
      addNotification(message, 'warning');
    });
    
    const errorUnsubscribe = ipcRenderer.on('error', (message: string) => {
      addNotification(message, 'error');
    });
    
    const loadingUnsubscribe = ipcRenderer.on('loading', (isLoading: boolean) => {
      setIsLoading(isLoading);
      if (isLoading) {
        setAnalysisResult('');
        setShowContextActions(false);
      }
    });
    
    const analysisResultUnsubscribe = ipcRenderer.on('analysis-result', (markdown: string) => {
      setAnalysisResult(markdown);
      setShowContextActions(true);
    });
    
    const clearResultUnsubscribe = ipcRenderer.on('clear-result', () => {
      setAnalysisResult('');
      setShowContextActions(false);
    });
    
    // Streaming response handlers
    const streamStartUnsubscribe = ipcRenderer.on('stream-start', () => {
      setAnalysisResult('');
      setShowContextActions(false);
    });
    
    let streamBuffer = '';
    const streamChunkUnsubscribe = ipcRenderer.on('stream-chunk', (chunk: string) => {
      streamBuffer += chunk;
      setAnalysisResult(streamBuffer);
    });
    
    const streamUpdateUnsubscribe = ipcRenderer.on('stream-update', (fullText: string) => {
      streamBuffer = fullText;
      setAnalysisResult(streamBuffer);
    });
    
    const streamEndUnsubscribe = ipcRenderer.on('stream-end', () => {
      setAnalysisResult(streamBuffer);
      setShowContextActions(true);
      setIsInstructionVisible(false);
      streamBuffer = '';
    });
    
    // Clean up listeners on unmount
    return () => {
      updateInstructionUnsubscribe();
      hideInstructionUnsubscribe();
      updateVisibilityUnsubscribe();
      notificationUnsubscribe();
      warningUnsubscribe();
      errorUnsubscribe();
      loadingUnsubscribe();
      analysisResultUnsubscribe();
      clearResultUnsubscribe();
      streamStartUnsubscribe();
      streamChunkUnsubscribe();
      streamUpdateUnsubscribe();
      streamEndUnsubscribe();
      
      // Clear any remaining notification timeouts
      notificationTimeoutsRef.current.forEach((timeout) => {
        clearTimeout(timeout);
      });
    };
  }, [ipcRenderer]);
  
  // Function to add a notification with automatic removal
  const addNotification = (message: string, type: string = 'success') => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, message, type }]);
    
    // Set timeout to remove notification after 5 seconds
    const timeout = setTimeout(() => {
      setNotifications(prev => prev.filter(notification => notification.id !== id));
      notificationTimeoutsRef.current.delete(id);
    }, 5000);
    
    notificationTimeoutsRef.current.set(id, timeout);
  };
  
  // Handlers for toolbar actions
  const handleToggleVisibility = () => {
    if (ipcRenderer) {
      ipcRenderer.send('toggle-visibility');
    }
  };
  
  const handleProcess = () => {
    if (ipcRenderer) {
      ipcRenderer.send('process-screenshots');
    }
  };
  
  const handleAutoScreenshot = () => {
    if (ipcRenderer) {
      ipcRenderer.send('take-screenshot');
      
      // Add a small delay to allow screenshot to be processed
      setTimeout(() => {
        ipcRenderer.send('process-screenshots');
      }, 300);
    }
  };
  
  const handleReset = () => {
    if (ipcRenderer) {
      ipcRenderer.send('clear-result');
      ipcRenderer.send('reset-process');
    }
  };
  
  const handleSettings = () => {
    onOpenModelSelector();
  };
  
  const handleAddContext = () => {
    if (ipcRenderer) {
      ipcRenderer.send('add-context-screenshot');
    }
  };
  
  const handleReportError = () => {
    if (ipcRenderer) {
      const errorDescription = prompt('Please describe the error in the solution:');
      if (errorDescription && errorDescription.trim() !== '') {
        ipcRenderer.send('report-solution-error', errorDescription);
      }
    }
  };
  
  return (
    <div className={`app-container ${!isWindowVisible ? 'invisible-mode' : ''}`}>
      <TopToolbar 
        onToggleVisibility={handleToggleVisibility} 
        onProcess={handleProcess}
        onAutoScreenshot={handleAutoScreenshot}
        onReset={handleReset}
        onSettings={handleSettings}
      />
      
      <div className="content-container">
        <InstructionBanner 
          message={instruction} 
          isVisible={isInstructionVisible} 
        />
        
        <div className="main-content">
          {isLoading ? (
            <LoadingContent />
          ) : (
            <ResultContent markdown={analysisResult} />
          )}
        </div>
        
        <ModelBadge />
        
        {showContextActions && (
          <ContextActions 
            onAddContext={handleAddContext}
            onReportError={handleReportError}
          />
        )}
        
        <NotificationContainer notifications={notifications} />
      </div>
    </div>
  );
}; 