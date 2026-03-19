import React from 'react';

const COLORS: Record<string, string> = {
  blue: 'bg-gradient-to-br from-blue-50 to-blue-100/50 text-blue-700 border-blue-200',
  red: 'bg-gradient-to-br from-red-50 to-red-100/50 text-red-700 border-red-200',
  green: 'bg-gradient-to-br from-green-50 to-green-100/50 text-green-700 border-green-200',
  purple: 'bg-gradient-to-br from-purple-50 to-purple-100/50 text-purple-700 border-purple-200',
  orange: 'bg-gradient-to-br from-orange-50 to-orange-100/50 text-orange-700 border-orange-200',
};

const ResultCard: React.FC<{ label: string; value: string; unit: string; color?: string; aiHint?: string }> = ({ label, value, unit, color = 'blue', aiHint }) => (
  <div className={`${COLORS[color] ?? COLORS.blue} rounded-lg p-2.5 text-center flex-1 min-w-[90px] border`}>
    <div className="text-[11px] text-slate-500 mb-0.5 truncate">{label}</div>
    <div className="text-base font-bold leading-tight">{value} <span className="text-[10px] font-medium opacity-80">{unit}</span></div>
    {aiHint && (
      <div className="mt-1 pt-1 border-t border-current/10 text-[10px] leading-snug opacity-70 text-left">
        💡 {aiHint}
      </div>
    )}
  </div>
);

export default ResultCard;
