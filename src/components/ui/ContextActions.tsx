import React from 'react';

interface ContextActionsProps {
  onAddContext: () => void;
  onReportError: () => void;
}

export const ContextActions: React.FC<ContextActionsProps> = ({
  onAddContext,
  onReportError
}) => {
  return (
    <div className="context-actions">
      <button 
        className="toolbar-button btn-add-context" 
        id="btn-add-context"
        onClick={onAddContext}
      >
        <span className="icon">📷</span>
        <span>Add screenshot to continue</span>
      </button>
      
      <button 
        className="toolbar-button btn-report-error" 
        id="btn-report-error"
        onClick={onReportError}
      >
        <span className="icon">🔄</span>
        <span>Report error in solution</span>
      </button>
    </div>
  );
}; 