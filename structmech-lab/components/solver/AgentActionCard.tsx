import React from 'react';
import { describeAgentAction } from '@/utils/agent/actionText';
import type { AgentParseResult } from '@/utils/agent/types';

interface AgentActionCardProps {
  parsed: AgentParseResult;
  onConfirm: () => void;
}

const AgentActionCard: React.FC<AgentActionCardProps> = ({ parsed, onConfirm }) => (
  <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3">
    <p className="text-sm font-semibold text-amber-100">{parsed.summary}</p>
    <p className="mt-1 text-xs text-amber-200/80">风险等级：{parsed.riskLevel}</p>
    {parsed.reasons && parsed.reasons.length > 0 ? (
      <div className="mt-2 space-y-1 text-xs text-amber-50/90">
        {parsed.reasons.map(reason => (
          <p key={reason}>{reason}</p>
        ))}
      </div>
    ) : null}
    {parsed.actions.length > 0 ? (
      <div className="mt-3 rounded-xl border border-amber-400/20 bg-slate-900/30 p-3">
        <p className="text-xs font-semibold text-amber-100">执行计划</p>
        <div className="mt-2 space-y-2 text-xs text-amber-50/90">
          {parsed.actions.map((action, index) => (
            <div key={`${action.kind}-${index}`} className="flex gap-2">
              <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-[10px] font-bold text-amber-200">
                {index + 1}
              </span>
              <p>{describeAgentAction(action, 'future')}</p>
            </div>
          ))}
        </div>
      </div>
    ) : null}
    {parsed.clarification ? <p className="mt-2 text-xs text-amber-50/90">{parsed.clarification}</p> : null}
    <button
      type="button"
      onClick={onConfirm}
      className="mt-3 rounded-xl bg-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-900"
    >
      确认执行
    </button>
  </div>
);

export default AgentActionCard;
