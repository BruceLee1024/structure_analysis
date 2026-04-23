import React, { useState, useCallback } from 'react';

interface CollapsiblePanelProps {
  title: string;
  icon: string;
  children: React.ReactNode;
  side: 'left' | 'right';
  defaultOpen?: boolean;
  storageKey?: string;
}

const CollapsiblePanel: React.FC<CollapsiblePanelProps> = ({ title, icon, children, side, defaultOpen = true, storageKey }) => {
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

  const chevron = side === 'left'
    ? (open ? '‹' : '›')
    : (open ? '›' : '‹');

  return (
    <div className={`flex-shrink-0 flex flex-col relative transition-all duration-200 lg:sticky lg:top-5 lg:self-start lg:max-h-[calc(100vh-3.5rem)] ${open ? 'w-full lg:w-64' : 'w-full lg:w-10'}`}>
      {/* Collapsed strip — desktop only */}
      <div
        className={`absolute inset-0 bg-white rounded-2xl border border-slate-200/80 shadow-sm hidden lg:flex flex-col items-center py-3 gap-2 cursor-pointer hover:bg-slate-50 transition-opacity select-none ${open ? 'lg:opacity-0 lg:pointer-events-none' : 'lg:opacity-100'}`}
        onClick={toggle}
      >
        <span className="text-base">{icon}</span>
        <div className="text-xs font-semibold text-slate-500 tracking-wider" style={{ writingMode: 'vertical-rl' }}>
          {title}
        </div>
        <span className="text-slate-400 text-sm mt-auto">{chevron}</span>
      </div>
      {/* Mobile toggle bar */}
      {!open && (
        <button onClick={toggle} className="lg:hidden w-full flex items-center gap-2 px-3 py-2.5 bg-white rounded-2xl border border-slate-200/80 shadow-sm text-sm text-slate-600 hover:bg-slate-50">
          <span>{icon}</span><span className="font-medium">{title}</span><span className="ml-auto text-slate-400">▼</span>
        </button>
      )}
      {/* Expanded content — always mounted to preserve child state */}
      <div className={`flex-1 flex flex-col transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none h-0 lg:h-0 overflow-hidden'}`}>
        <button
          onClick={toggle}
          className={`absolute top-2 ${side === 'left' ? 'right-2' : 'left-2'} z-10 w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 flex items-center justify-center text-sm transition-colors`}
          title={`收起${title}`}
        >
          {chevron}
        </button>
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
};

export default CollapsiblePanel;
