import React from 'react';

// 结构力学 SVG 共享原语：defs (渐变/滤镜/marker/pattern) + 支座 + 荷载原件
// 设计准则：精致、统一风格、所有描边使用 round linecap/linejoin、控制字号与层次。

export const StructuralDefs: React.FC<{ id?: string }> = ({ id = 'sd' }) => (
  <defs>
    {/* 支座金属渐变 */}
    <linearGradient id={`${id}-support`} x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stopColor="#cbd5e1" />
      <stop offset="50%" stopColor="#94a3b8" />
      <stop offset="100%" stopColor="#64748b" />
    </linearGradient>
    {/* 杆件金属渐变 (深色) */}
    <linearGradient id={`${id}-member`} x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stopColor="#475569" />
      <stop offset="50%" stopColor="#334155" />
      <stop offset="100%" stopColor="#1e293b" />
    </linearGradient>
    {/* 地面斜线 pattern */}
    <pattern id={`${id}-ground`} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="6" stroke="#94a3b8" strokeWidth="1" />
    </pattern>
    {/* 阴影滤镜 (轻微) */}
    <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="0.6" stdDeviation="0.6" floodColor="#000" floodOpacity="0.18" />
    </filter>
    {/* 内力图阴影 (更轻) */}
    <filter id={`${id}-soft`} x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="0.4" stdDeviation="0.4" floodColor="#000" floodOpacity="0.12" />
    </filter>
    {/* 箭头 marker (荷载) */}
    <marker id={`${id}-arrow-red`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#dc2626" />
    </marker>
    <marker id={`${id}-arrow-red-sm`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#dc2626" />
    </marker>
    {/* 弯矩/剪力/轴力 颜色渐变 (用于填充区) */}
    <linearGradient id={`${id}-m-fill`} x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stopColor="#ef4444" stopOpacity="0.35" />
      <stop offset="100%" stopColor="#ef4444" stopOpacity="0.08" />
    </linearGradient>
    <linearGradient id={`${id}-v-fill`} x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
      <stop offset="100%" stopColor="#10b981" stopOpacity="0.08" />
    </linearGradient>
    <linearGradient id={`${id}-n-fill`} x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.08" />
    </linearGradient>
  </defs>
);

// 固定铰支座 (Pin) —— 三角形 + 地面 + 斜线
export const PinSupport: React.FC<{ cx: number; cy: number; size?: number; defsId?: string }> = ({
  cx, cy, size = 7, defsId = 'sd',
}) => {
  const h = size * 1.25;
  const w = size;
  return (
    <g filter={`url(#${defsId}-shadow)`}>
      <polygon
        points={`${cx},${cy} ${cx - w},${cy + h} ${cx + w},${cy + h}`}
        fill={`url(#${defsId}-support)`}
        stroke="#475569"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      <circle cx={cx} cy={cy} r="1.1" fill="#1e293b" />
      <line x1={cx - w - 2} y1={cy + h} x2={cx + w + 2} y2={cy + h} stroke="#475569" strokeWidth="1" strokeLinecap="round" />
      <rect x={cx - w - 2} y={cy + h} width={(w + 2) * 2} height={size * 0.7} fill={`url(#${defsId}-ground)`} />
    </g>
  );
};

// 滚动铰支座 (Roller) —— 圆 + 底线 + 斜线地面
export const RollerSupport: React.FC<{ cx: number; cy: number; size?: number; defsId?: string }> = ({
  cx, cy, size = 7, defsId = 'sd',
}) => {
  const r = size * 0.55;
  const y0 = cy + r;
  return (
    <g filter={`url(#${defsId}-shadow)`}>
      <circle cx={cx} cy={cy} r={r} fill={`url(#${defsId}-support)`} stroke="#475569" strokeWidth="0.8" />
      <line x1={cx - size - 2} y1={y0 + 0.8} x2={cx + size + 2} y2={y0 + 0.8} stroke="#475569" strokeWidth="1" strokeLinecap="round" />
      <rect x={cx - size - 2} y={y0 + 0.8} width={(size + 2) * 2} height={size * 0.6} fill={`url(#${defsId}-ground)`} />
    </g>
  );
};

// 固定端支座 —— 竖向墙面 + 斜线
export const FixedSupport: React.FC<{
  cx: number; cy: number; size?: number; defsId?: string;
  orientation?: 'left' | 'right' | 'bottom';
}> = ({ cx, cy, size = 10, defsId = 'sd', orientation = 'left' }) => {
  if (orientation === 'bottom') {
    return (
      <g filter={`url(#${defsId}-shadow)`}>
        <line x1={cx - size} y1={cy} x2={cx + size} y2={cy} stroke="#475569" strokeWidth="1.5" strokeLinecap="round" />
        <rect x={cx - size} y={cy} width={size * 2} height={size * 0.6} fill={`url(#${defsId}-ground)`} />
      </g>
    );
  }
  // left/right: vertical wall
  const dir = orientation === 'left' ? -1 : 1;
  return (
    <g filter={`url(#${defsId}-shadow)`}>
      <line x1={cx} y1={cy - size} x2={cx} y2={cy + size} stroke="#475569" strokeWidth="1.5" strokeLinecap="round" />
      <rect
        x={dir === -1 ? cx - size * 0.6 : cx}
        y={cy - size}
        width={size * 0.6}
        height={size * 2}
        fill={`url(#${defsId}-ground)`}
      />
    </g>
  );
};

// 集中力箭头 (垂直向下/向上)
export const PointLoadV: React.FC<{
  x: number; yTop: number; yBase: number; label?: string; defsId?: string; color?: string;
}> = ({ x, yTop, yBase, label, defsId = 'sd', color = '#dc2626' }) => (
  <g>
    <line x1={x} y1={yTop} x2={x} y2={yBase} stroke={color} strokeWidth="1.6" strokeLinecap="round" markerEnd={`url(#${defsId}-arrow-red)`} />
    {label && <text x={x + 3} y={yTop + 3} className="fill-red-600 font-bold" style={{ fontSize: 9 }}>{label}</text>}
  </g>
);

// 水平集中力箭头
export const PointLoadH: React.FC<{
  xStart: number; xEnd: number; y: number; label?: string; defsId?: string;
}> = ({ xStart, xEnd, y, label, defsId = 'sd' }) => (
  <g>
    <line x1={xStart} y1={y} x2={xEnd} y2={y} stroke="#dc2626" strokeWidth="1.6" strokeLinecap="round" markerEnd={`url(#${defsId}-arrow-red)`} />
    {label && <text x={xStart - 1} y={y - 3} className="fill-red-600 font-bold" textAnchor="end" style={{ fontSize: 9 }}>{label}</text>}
  </g>
);

// 均布荷载 (多支箭头 + 顶部横线)
export const DistributedLoadV: React.FC<{
  x1: number; x2: number; yTop: number; yBase: number; count?: number; label?: string; defsId?: string;
}> = ({ x1, x2, yTop, yBase, count = 8, label, defsId = 'sd' }) => {
  const arrows = Array.from({ length: count }, (_, i) => x1 + (i * (x2 - x1)) / (count - 1));
  return (
    <g>
      {/* 顶部横线 + 浅填充 */}
      <rect x={x1} y={yTop} width={x2 - x1} height={yBase - yTop - 2} fill="#fecaca" fillOpacity="0.35" />
      <line x1={x1} y1={yTop} x2={x2} y2={yTop} stroke="#dc2626" strokeWidth="1.2" strokeLinecap="round" />
      {arrows.map((x, i) => (
        <line key={i} x1={x} y1={yTop + 1} x2={x} y2={yBase} stroke="#dc2626" strokeWidth="1.2" strokeLinecap="round" markerEnd={`url(#${defsId}-arrow-red-sm)`} />
      ))}
      {label && <text x={(x1 + x2) / 2} y={yTop - 2} className="fill-red-600 font-bold" textAnchor="middle" style={{ fontSize: 9 }}>{label}</text>}
    </g>
  );
};

// 节点圆点 (用于桁架/拱)
export const StructuralNode: React.FC<{ cx: number; cy: number; r?: number }> = ({ cx, cy, r = 2.5 }) => (
  <circle cx={cx} cy={cy} r={r} fill="#fff" stroke="#1e293b" strokeWidth="1.2" />
);
