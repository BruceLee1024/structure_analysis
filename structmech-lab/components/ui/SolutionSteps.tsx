import React, { useState } from 'react';

interface Step {
  title: string;
  equation?: string;
  result?: string;
  explanation?: string;
  /** AI-generated "why" explanation, shown on click */
  aiWhy?: string;
}

interface SolutionStepsProps {
  steps: Step[];
  title?: string;
}

const SolutionSteps: React.FC<SolutionStepsProps> = ({ steps, title = '求解过程' }) => {
  const [expanded, setExpanded] = useState(false);
  const [whyOpen, setWhyOpen] = useState<Record<number, boolean>>({});

  const toggleWhy = (idx: number) => {
    setWhyOpen(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <span className="text-base">📝</span> {title}
        </h4>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {steps.map((step, i) => (
            <div key={i} className="flex gap-3 items-start">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  {step.title}
                  {step.aiWhy && (
                    <button
                      onClick={() => toggleWhy(i)}
                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded-md transition-all ${
                        whyOpen[i]
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600'
                      }`}
                    >
                      <span>🤔</span> 为什么？
                    </button>
                  )}
                </div>
                {step.equation && (
                  <div className="mt-1 px-3 py-1.5 bg-gradient-to-r from-slate-50 to-blue-50/30 rounded-lg border border-slate-100 font-serif text-sm text-slate-800">
                    {step.equation}
                  </div>
                )}
                {step.result && (
                  <div className="mt-1 text-sm font-mono font-bold text-blue-700">
                    = {step.result}
                  </div>
                )}
                {step.explanation && (
                  <div className="mt-0.5 text-xs text-slate-500">{step.explanation}</div>
                )}
                {step.aiWhy && whyOpen[i] && (
                  <div className="mt-1.5 px-3 py-2 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-lg border border-indigo-100 text-xs text-slate-700 leading-relaxed">
                    <span className="text-indigo-500 font-medium">AI 解读：</span> {step.aiWhy}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SolutionSteps;
