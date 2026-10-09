import React from 'react';

const COLORS: Record<string, string> = {
  blue: 'bg-gradient-to-br from-blue-50 to-blue-100/50 text-blue-700 border-blue-200',
  red: 'bg-gradient-to-br from-red-50 to-red-100/50 text-red-700 border-red-200',
  green: 'bg-gradient-to-br from-green-50 to-green-100/50 text-green-700 border-green-200',
  purple: 'bg-gradient-to-br from-purple-50 to-purple-100/50 text-purple-700 border-purple-200',
  orange: 'bg-gradient-to-br from-orange-50 to-orange-100/50 text-orange-700 border-orange-200',
};

const ResultCard: React.FC<{ label: string; value: string; unit: string; color?: string; aiHint?: string }> = ({ label, value, unit, color = 'blue', aiHint }) => (
  <div className={`learning-result-card ${COLORS[color] ?? COLORS.blue} text-left min-w-0 h-full flex flex-col`}>
    <div className="learning-result-label">
      {label}
    </div>
    <div className="learning-result-value">
      {value}
      {unit && <span className="learning-result-unit">{unit}</span>}
    </div>
    {aiHint && (
      <div className="learning-result-hint line-clamp-2" title={aiHint}>
        {aiHint}
      </div>
    )}
  </div>
);

export default ResultCard;
