import React, { useState, useEffect } from 'react';
import type { Milestone } from '../../utils/learningProgress';

interface LearningMilestoneProps {
  milestone: Milestone;
  onDismiss: () => void;
}

const LearningMilestone: React.FC<LearningMilestoneProps> = ({ milestone, onDismiss }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 100);
    const t2 = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 400);
    }, 6000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDismiss]);

  return (
    <div
      className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-500 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
      }`}
    >
      <div className="bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-50 border border-amber-200 rounded-2xl shadow-xl px-6 py-4 flex items-center gap-4 min-w-[320px]">
        <div className="text-4xl animate-bounce">{milestone.icon}</div>
        <div className="flex-1">
          <div className="text-xs font-medium text-amber-600 uppercase tracking-wider">
            成就解锁！
          </div>
          <div className="text-base font-bold text-slate-800 mt-0.5">
            {milestone.title}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {milestone.description}
          </div>
        </div>
        <button
          onClick={() => { setVisible(false); setTimeout(onDismiss, 400); }}
          className="text-slate-400 hover:text-slate-600 transition-colors p-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default LearningMilestone;
