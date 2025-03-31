import React from 'react';

interface TopToolbarProps {
  onToggleVisibility: () => void;
  onProcess: () => void;
  onAutoScreenshot: () => void;
  onReset: () => void;
  onSettings: () => void;
}

export const TopToolbar: React.FC<TopToolbarProps> = ({
  onToggleVisibility,
  onProcess,
  onAutoScreenshot,
  onReset,
  onSettings
}) => {
  // Detect platform for correct key labels
  const isMac = navigator.platform.includes('Mac');
  const modifierKey = isMac ? '⌘' : 'Ctrl';
  
  return (
    <div className="top-toolbar">
      <button 
        className="toolbar-button" 
        id="btn-toggle-visibility" 
        title={`Show/Hide (${modifierKey}+B)`}
        onClick={onToggleVisibility}
      >
        <span className="icon">👁️</span>
        <span>Show/Hide</span>
        <span className="shortcut" id="toggle-shortcut">{modifierKey} B</span>
      </button>

      <button 
        className="toolbar-button" 
        id="btn-process" 
        title={`Process Screenshots (${modifierKey}+Enter)`}
        onClick={onProcess}
      >
        <span className="icon">📸</span>
        <span>Process Images</span>
        <span className="shortcut" id="process-shortcut">{modifierKey} ↵</span>
      </button>

      <button 
        className="toolbar-button" 
        id="btn-auto-screenshot" 
        title={`Screenshot & Process (${modifierKey}+H)`}
        onClick={onAutoScreenshot}
      >
        <span className="icon">📷</span>
        <span>Auto Screenshot</span>
        <span className="shortcut">{modifierKey} H</span>
      </button>

      <button 
        className="toolbar-button" 
        id="btn-reset" 
        title={`Reset (${modifierKey}+R)`}
        onClick={onReset}
      >
        <span className="icon">🔄</span>
        <span>Start Over</span>
        <span className="shortcut" id="reset-shortcut">{modifierKey} R</span>
      </button>

      <button 
        className="toolbar-button" 
        id="btn-settings" 
        title={`Settings (${modifierKey}+,)`}
        onClick={onSettings}
      >
        <span className="icon">⚙️</span>
        <span>Settings</span>
        <span className="shortcut">{modifierKey} ,</span>
      </button>
    </div>
  );
}; 