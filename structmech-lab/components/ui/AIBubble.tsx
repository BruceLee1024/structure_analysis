import React, { useState, useEffect, useCallback } from 'react';
import { X, Sparkles } from 'lucide-react';
import { TriggeredMessage } from '../../utils/aiTriggers';

interface AIBubbleProps {
  message: TriggeredMessage | null;
  /** Auto-dismiss after this many ms (0 = never) */
  autoDismissMs?: number;
}

const priorityStyles: Record<string, string> = {
  high: 'border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50',
  medium: 'border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50',
  low: 'border-slate-200 bg-gradient-to-r from-slate-50 to-white',
};

const priorityIcon: Record<string, string> = {
  high: '⚡',
  medium: '💡',
  low: '📝',
};

const AIBubble: React.FC<AIBubbleProps> = ({ message, autoDismissMs = 15000 }) => {
  const [visible, setVisible] = useState(false);
  const [currentMsg, setCurrentMsg] = useState<TriggeredMessage | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const dismiss = useCallback(() => {
    setVisible(false);
    if (currentMsg) {
      setDismissed(prev => new Set(prev).add(currentMsg.triggerId));
    }
  }, [currentMsg]);

  useEffect(() => {
    if (!message) return;
    if (dismissed.has(message.triggerId)) return;

    setCurrentMsg(message);
    setVisible(true);

    if (autoDismissMs > 0) {
      const timer = setTimeout(dismiss, autoDismissMs);
      return () => clearTimeout(timer);
    }
  }, [message, autoDismissMs, dismissed, dismiss]);

  if (!visible || !currentMsg) return null;

  const style = priorityStyles[currentMsg.priority] || priorityStyles.low;
  const icon = priorityIcon[currentMsg.priority] || '💡';

  return (
    <div className={`relative rounded-xl border ${style} p-3 pr-8 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300`}>
      <button
        onClick={dismiss}
        className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white/80 hover:bg-white flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
      >
        <X size={12} />
      </button>
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 mt-0.5">
          <div className="w-6 h-6 rounded-lg bg-white/80 flex items-center justify-center shadow-sm">
            <Sparkles size={14} className="text-blue-500" />
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-medium text-slate-400 mb-0.5 flex items-center gap-1">
            <span>{icon}</span> AI 助教提示
          </div>
          <div className="text-sm text-slate-700 leading-relaxed">
            {currentMsg.message}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIBubble;
