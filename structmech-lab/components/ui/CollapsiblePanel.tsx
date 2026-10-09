import React, { useState, useCallback } from 'react';
import { Bot, SlidersHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';

interface CollapsiblePanelProps {
  title: string;
  icon: string;
  children: React.ReactNode;
  side: 'left' | 'right';
  defaultOpen?: boolean;
  storageKey?: string;
}

const CollapsiblePanel: React.FC<CollapsiblePanelProps> = ({ title, children, side, defaultOpen = true, storageKey }) => {
  const [open, setOpen] = useState(() => {
    if (storageKey) {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) return saved === 'true';
    }
    return defaultOpen;
  });

  const toggle = useCallback(() => {
    setOpen(prev => {
      const next = !prev;
      if (storageKey) localStorage.setItem(storageKey, String(next));
      return next;
    });
  }, [storageKey]);

  const Icon = side === 'left' ? SlidersHorizontal : Bot;
  const Chevron = side === 'left' ? (open ? ChevronLeft : ChevronRight) : (open ? ChevronRight : ChevronLeft);

  return (
    <div className={`learning-side-panel panel-${side} ${open ? 'is-open' : 'is-collapsed'} flex-shrink-0 flex flex-col relative transition-all duration-200 ${open ? 'w-full lg:w-64' : 'w-full lg:w-10'}`}>
      {/* Collapsed strip — desktop only */}
      <button
        type="button"
        aria-label={`展开${title}`}
        aria-expanded={false}
        tabIndex={open ? -1 : 0}
        aria-hidden={open}
        className={`absolute inset-0 bg-white rounded-2xl border border-slate-200/80 shadow-sm hidden lg:flex flex-col items-center py-3 gap-2 cursor-pointer hover:bg-slate-50 transition-opacity select-none ${open ? 'lg:opacity-0 lg:pointer-events-none' : 'lg:opacity-100'}`}
        onClick={toggle}
      >
        <Icon size={16} aria-hidden="true" />
        <div className="text-xs font-semibold text-slate-500 tracking-wider" style={{ writingMode: 'vertical-rl' }}>
          {title}
        </div>
        <Chevron size={16} className="mt-auto" />
      </button>
      {/* Mobile toggle bar */}
      {!open && (
        <button aria-label={`展开${title}`} aria-expanded={false} onClick={toggle} className="lg:hidden w-full flex items-center gap-2 px-3 py-2.5 bg-white rounded-2xl border border-slate-200/80 shadow-sm text-sm text-slate-600 hover:bg-slate-50">
          <Icon size={16} aria-hidden="true" /><span className="font-medium">{title}</span><Chevron size={16} className="ml-auto" />
        </button>
      )}
      {/* Expanded content — always mounted to preserve child state */}
      <div inert={!open} className={`learning-panel-body flex-1 flex flex-col transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none h-0 lg:h-0 overflow-hidden'}`}>
        <button
          onClick={toggle}
          className={`absolute top-2 ${side === 'left' ? 'right-2' : 'left-2'} z-10 w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 flex items-center justify-center text-sm transition-colors`}
          title={`收起${title}`}
          aria-label={`收起${title}`}
          aria-expanded={open}
        >
          <Chevron size={14} />
        </button>
        <div className="learning-panel-content flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
};

export default CollapsiblePanel;
