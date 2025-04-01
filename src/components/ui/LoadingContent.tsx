import React from 'react';

interface LoadingContentProps {
  message?: string;
}

export const LoadingContent: React.FC<LoadingContentProps> = ({ message = "Analyzing..." }) => {
  return (
    <div className="loading-container">
      {message && <div className="loading-message">{message}</div>}
      
      {/* Section 1: Analyzing the Problem */}
      <div className="skeleton-section">
        <div className="skeleton-header"></div>
        <div className="skeleton-text line-90"></div>
        <div className="skeleton-text line-80"></div>
        <div className="skeleton-text line-90"></div>
      </div>

      {/* Section 2: My thoughts */}
      <div className="skeleton-section">
        <div className="skeleton-header"></div>
        <div className="skeleton-text line-90"></div>
        <div className="skeleton-text line-80"></div>
        <div className="skeleton-code"></div>
        <div className="skeleton-text line-70"></div>
      </div>

      {/* Section 3: Complexity */}
      <div className="skeleton-section">
        <div className="skeleton-header"></div>
        <div className="skeleton-text line-80"></div>
        <div className="skeleton-text line-90"></div>
      </div>
    </div>
  );
}; 