import React from 'react';
import { getExplorationPercent, getAchievedMilestones } from '../../utils/learningProgress';

interface ProgressBarProps {
  /** Current sub-module name for highlighting */
  currentModule?: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ currentModule }) => {
  const percent = getExplorationPercent();
  const achieved = getAchievedMilestones();

  if (percent === 0) return null;

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-lg border border-slate-200/60 px-3 py-2 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium text-slate-500">
          学习进度 {currentModule && <span className="text-indigo-500">· {currentModule}</span>}
        </span>
        <div className="flex items-center gap-1">
          {achieved.slice(-3).map(m => (
            <span key={m.id} className="text-xs" title={`${m.title}: ${m.description}`}>
              {m.icon}
            </span>
          ))}
          <span className="text-[10px] font-bold text-indigo-600 ml-1">{percent}%</span>
        </div>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-400 to-blue-500 rounded-full transition-all duration-700"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};

export default ProgressBar;
