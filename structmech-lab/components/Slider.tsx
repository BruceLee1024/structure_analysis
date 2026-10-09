import React, { useState, useRef, useEffect, useId } from 'react';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
  unit?: string;
  hint?: string;
}

const formatValue = (value: number) => Number(value.toFixed(4)).toString();

export const Slider: React.FC<SliderProps> = ({ label, value, min, max, step = 1, onChange, unit = '', hint }) => {
  const id = useId();
  const [draft, setDraft] = useState(() => formatValue(value));
  const dirty = useRef(false);
  // Keep external updates visible without replacing an unfinished number entry.
  useEffect(() => {
    if (!dirty.current) setDraft(formatValue(value));
  }, [value]);

  const commitValue = () => {
    if (!dirty.current) return;
    dirty.current = false;
    const parsed = draft.trim() === '' ? NaN : Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(formatValue(value));
      return;
    }
    // Preserve integer-step controls and the existing precise-entry behavior:
    // the slider's default range is a convenience, not an input restriction.
    const next = step >= 1 ? Math.round(parsed / step) * step : Number(parsed.toFixed(4));
    setDraft(formatValue(next));
    if (next !== value) onChange(next);
  };

  const rangeMin = Math.min(min, value);
  const rangeMax = Math.max(max, value);
  const progress = rangeMax > rangeMin ? (value - rangeMin) / (rangeMax - rangeMin) * 100 : 0;
  const outsideRange = value < min || value > max;
  const hasHint = Boolean(hint || outsideRange);

  return (
    <div className="parameter-control">
      <div className="parameter-control-row">
        <label htmlFor={`${id}-number`}>{label}</label>
        <div className="parameter-value-field">
          <input
            id={`${id}-number`}
            type="number"
            step={step}
            value={draft}
            aria-describedby={hasHint ? `${id}-hint` : undefined}
            title="直接输入，按 Enter 或移开焦点应用"
            onChange={e => { dirty.current = true; setDraft(e.target.value); }}
            onBlur={commitValue}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitValue(); }
              if (e.key === 'Escape') { e.preventDefault(); dirty.current = false; setDraft(formatValue(value)); }
            }}
          />
          {unit && <span className="parameter-unit">{unit}</span>}
        </div>
      </div>
      <input
        id={`${id}-range`}
        type="range"
        aria-label={`${label}滑杆`}
        aria-valuetext={`${value}${unit ? ` ${unit}` : ''}`}
        aria-describedby={hasHint ? `${id}-hint` : undefined}
        min={rangeMin}
        max={rangeMax}
        step={step}
        value={value}
        style={{ '--range-progress': `${progress}%` } as React.CSSProperties}
        onChange={e => {
          const next = Number(e.target.value);
          dirty.current = false;
          setDraft(formatValue(next));
          onChange(next);
        }}
      />
      <div className="parameter-range-labels" aria-hidden="true"><span>{rangeMin}</span><span>{rangeMax}</span></div>
      {hasHint && <div id={`${id}-hint`} className="parameter-control-hint">
        {hint && <p>{hint}</p>}
        {outsideRange && <p className="parameter-range-notice">默认范围：{min}–{max} {unit}</p>}
      </div>}
    </div>
  );
};
