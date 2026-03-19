import React, { useState, useRef, useEffect } from 'react';

interface AIAnnotationProps {
  /** SVG x coordinate for the ? icon */
  x: number;
  /** SVG y coordinate for the ? icon */
  y: number;
  /** Explanation text */
  text: string;
  /** Icon radius (default 7) */
  r?: number;
  /** Popover position relative to icon */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Accent color */
  color?: string;
}

const AIAnnotation: React.FC<AIAnnotationProps> = ({
  x, y, text, r = 7, position = 'top', color = '#6366f1',
}) => {
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Popover offset
  const getOffset = () => {
    switch (position) {
      case 'top': return { tx: x, ty: y - r - 6, anchor: 'middle' as const, vAlign: 'bottom' };
      case 'bottom': return { tx: x, ty: y + r + 6, anchor: 'middle' as const, vAlign: 'top' };
      case 'left': return { tx: x - r - 6, ty: y, anchor: 'end' as const, vAlign: 'middle' };
      case 'right': return { tx: x + r + 6, ty: y, anchor: 'start' as const, vAlign: 'middle' };
    }
  };

  const offset = getOffset();

  return (
    <g className="cursor-pointer">
      {/* Pulsing ring */}
      <circle cx={x} cy={y} r={r + 2} fill="none" stroke={color} strokeWidth="1" opacity="0.3">
        <animate attributeName="r" values={`${r + 1};${r + 4};${r + 1}`} dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.3;0.1;0.3" dur="2s" repeatCount="indefinite" />
      </circle>

      {/* Icon circle */}
      <circle
        cx={x} cy={y} r={r}
        fill="white" stroke={color} strokeWidth="1.5"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="hover:fill-indigo-50 transition-colors"
      />
      <text
        x={x} y={y + 1}
        textAnchor="middle" dominantBaseline="middle"
        className="text-[9px] font-bold pointer-events-none select-none"
        fill={color}
      >
        ?
      </text>

      {/* Popover */}
      {open && (
        <foreignObject
          x={position === 'left' ? offset.tx - 180 : position === 'right' ? offset.tx : offset.tx - 90}
          y={position === 'top' ? offset.ty - 60 : position === 'bottom' ? offset.ty : offset.ty - 30}
          width="180"
          height="80"
          className="overflow-visible"
        >
          <div
            ref={popRef}
            className="bg-white rounded-lg shadow-lg border border-indigo-100 p-2 text-[11px] leading-relaxed text-slate-700"
            style={{ maxWidth: 180 }}
          >
            <div className="flex items-start gap-1">
              <span className="text-indigo-500 flex-shrink-0 mt-0.5">💡</span>
              <span>{text}</span>
            </div>
          </div>
        </foreignObject>
      )}
    </g>
  );
};

export default AIAnnotation;
