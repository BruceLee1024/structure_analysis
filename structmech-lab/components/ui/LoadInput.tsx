import React, { useEffect, useRef, useState } from 'react';

export type LoadDirection = 'down' | 'up' | 'left' | 'right' | 'custom';
export const LOAD_ANGLES = { down: -90, up: 90, left: 180, right: 0 };
export function LoadDirectionSelect({ label, value, onChange }: { label: string; value: LoadDirection; onChange: (direction: LoadDirection) => void }) {
  return <select aria-label={label} value={value} onChange={e => onChange(e.target.value as LoadDirection)}>
    <option value="down">↓ 向下</option><option value="up">↑ 向上</option><option value="right">→ 向右</option><option value="left">← 向左</option><option value="custom">↗ 自定义角度</option>
  </select>;
}
export function NumericLoadInput({ value, onChange, label, signed = false, unit, min = 0, max }: {
  value: number; onChange: (n: number) => void; label: string; signed?: boolean; unit: string; min?: number; max?: number;
}) {
  const [draft, setDraft] = useState(String(value));
  const editing = useRef(false);
  const emittedValue = useRef(value);
  useEffect(() => {
    if (!editing.current || value !== emittedValue.current) {
      editing.current = false;
      setDraft(String(value));
    }
    emittedValue.current = value;
  }, [value]);
  const commit = () => {
    editing.current = false;
    const parsed = draft.trim() === '' ? NaN : Number(draft);
    const next = Number.isFinite(parsed) ? Math.min(max ?? Infinity, signed ? parsed : Math.max(min, parsed)) : value;
    setDraft(String(next));
    emittedValue.current = next;
    if (next !== value) onChange(next);
  };
  return <div className="truss-load-number"><input type="number" aria-label={label} step="any" min={signed ? undefined : min} max={max} value={draft}
    onChange={e => {
      editing.current = true; setDraft(e.target.value);
      const next = e.target.value.trim() === '' ? NaN : Number(e.target.value);
      if (Number.isFinite(next) && (signed || next >= min) && (max === undefined || next <= max)) {
        emittedValue.current = next;
        onChange(next);
      }
    }} onBlur={commit} onKeyDown={e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { editing.current = false; setDraft(String(value)); }
    }} /><span>{unit}</span></div>;
}
