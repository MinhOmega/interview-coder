import React from 'react';

interface InstructionBannerProps {
  message: string;
  isVisible: boolean;
}

export const InstructionBanner: React.FC<InstructionBannerProps> = ({ 
  message, 
  isVisible 
}) => {
  return (
    <div 
      className={`instruction-banner ${isVisible ? 'visible' : ''}`}
      dangerouslySetInnerHTML={{ __html: message.replace(/\n/g, '<br>') }}
    />
  );
}; 