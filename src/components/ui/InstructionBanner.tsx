import React from 'react';
import '../../styles/InstructionBanner.css';

export interface InstructionBannerProps {
  instruction: string;
}

export const InstructionBanner: React.FC<InstructionBannerProps> = ({ 
  instruction 
}) => {
  // Split instructions by line breaks to handle them individually
  const instructionLines = instruction.split('\n').filter(line => line.trim());
  
  return (
    <div className="instruction-banner visible">
      {instructionLines.length > 0 ? (
        <div className="instruction-content">
          {instructionLines.map((line, index) => (
            <div key={index} className="instruction-line">
              {line}
            </div>
          ))}
        </div>
      ) : (
        <div className="instruction-content" dangerouslySetInnerHTML={{ __html: instruction }} />
      )}
    </div>
  );
}; 