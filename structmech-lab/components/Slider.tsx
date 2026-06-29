import React, { useState, useRef, useEffect, useCallback } from 'react';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
  unit?: string;
}

export const Slider: React.FC<SliderProps> = ({ label, value, min, max, step = 1, onChange, unit = '' }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const decimals = step < 0.001 ? 4 : step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitValue = useCallback(() => {
    setEditing(false);
    const parsed = parseFloat(draft);
    if (!isNaN(parsed)) {
      if (step >= 1) {
        const stepped = Math.round(parsed / step) * step;
        onChange(parseFloat(stepped.toFixed(0)));
      } else {
        onChange(parseFloat(parsed.toFixed(4)));
      }
    }
  }, [draft, step, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitValue();
    if (e.key === 'Escape') setEditing(false);
  };

  return (
    <div className="mb-3">
      <div className="flex justify-between items-center mb-2">
        <label className="text-sm font-semibold text-slate-700">{label}</label>
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              type="number"
              value={draft}
              step={step}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitValue}
              onKeyDown={handleKeyDown}
              className="w-24 text-sm font-mono text-blue-700 bg-white px-2 py-1 rounded-lg border-2 border-blue-400 text-right outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            {unit && <span className="text-xs text-slate-500">{unit}</span>}
          </div>
        ) : (
          <button
            onClick={() => { setDraft(parseFloat(value.toFixed(4)).toString()); setEditing(true); }}
            className="text-sm font-mono text-blue-700 bg-blue-50 px-3 py-1 rounded-lg font-medium hover:bg-blue-100 hover:ring-2 hover:ring-blue-300 transition-all cursor-text"
            title="点击输入精确值"
          >
            {value.toFixed(decimals)} {unit}
          </button>
        )}
      </div>
      <input
        type="range"
        min={Math.min(min, value)}
        max={Math.max(max, value)}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 hover:bg-slate-300 transition-colors"
      />
      {(value < min || value > max) && (
        <div className="text-[10px] text-amber-600 mt-1">默认范围: {min}–{max} {unit}</div>
      )}
    </div>
  );
};