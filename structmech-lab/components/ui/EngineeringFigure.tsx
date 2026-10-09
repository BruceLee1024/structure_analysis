import React from 'react';
import { learningChartPalette as palette } from './learningChartPalette';

export const engineeringInk = palette.ink;
export const engineeringMuted = palette.muted;
export const formatEngineeringValue = (value: number, signed = false) => {
  if (!Number.isFinite(value)) return '—';
  const n = Math.abs(value) < 1e-8 ? 0 : value;
  // Remove floating-point noise at decimal rounding boundaries (e.g. 9.375).
  const rounded = n + Math.sign(n) * Number.EPSILON * Math.max(1, Math.abs(n)) * 8;
  const text = Math.abs(n) >= 10000 ? n.toExponential(2) : Number(rounded.toFixed(2)).toString();
  return `${signed && n > 0 ? '+' : ''}${text.replace('-', '−')}`;
};

export function EngineeringFigure({ title, detail, structure = false, interactive = false, tone, children }: {
  title: string; detail: string; structure?: boolean; interactive?: boolean; tone?: 'load' | 'moment' | 'shear' | 'axial' | 'tension' | 'compression'; children: React.ReactNode;
}) {
  return <div data-chart-tone={tone} className={`learning-chart-card ${structure ? 'learning-structure-card' : ''} overflow-hidden flex flex-col`}>
    <div className="learning-card-header border-b flex items-center justify-between flex-shrink-0"><h3>{title}</h3><span>{detail}</span></div>
    <div className="learning-card-plot flex-1 min-h-0">
      <svg width="100%" height="100%" viewBox="0 0 360 220" preserveAspectRatio="xMidYMid meet" className="engineering-figure" role={interactive ? 'group' : 'img'} aria-label={`${title}，${detail}`}>
        <title>{title}：{detail}</title>{children}
      </svg>
    </div>
  </div>;
}

export type EngineeringSupportKind = 'pinned' | 'roller' | 'fixed' | 'guided' | 'rotation';
export function EngineeringSupport({ x, y, roller = false, kind, rotation = 0, ink = engineeringInk, paper = '#fff' }: { x: number; y: number; roller?: boolean; kind?: EngineeringSupportKind; rotation?: number; ink?: string; paper?: string }) {
  const type = kind ?? (roller ? 'roller' : 'pinned');
  const ground = type === 'roller' ? 20 : type === 'pinned' ? 16 : type === 'guided' ? 18 : 0;
  return <g transform={`translate(${x} ${y}) rotate(${rotation})`} stroke={ink} strokeWidth="1" fill="none" strokeLinejoin="round" data-support-kind={type}>
    {(type==='pinned'||type==='roller') && <path d="M0,1 L-8,12 H8 Z" fill={paper}/>}
    {type==='roller' && <><circle cx="-5" cy="15" r="2" fill={paper}/><circle cx="5" cy="15" r="2" fill={paper}/></>}
    {type==='guided' && <><path d="M-9,0 H9 V7 H-9 Z" fill={paper}/><circle cx="-5" cy="11" r="2" fill={paper}/><circle cx="5" cy="11" r="2" fill={paper}/><path d="M-13,15 H13"/></>}
    {type==='rotation' ? <><circle r="7" fill={paper}/><path d="M-4,-3 L0,3 L4,-3 M-10,-8 L-6,-12 M-3,-10 L1,-14 M5,-8 L9,-12"/></> : <>
      <line x1="-13" x2="13" y1={ground} y2={ground} strokeWidth={type==='fixed'?1.6:1}/>
      {[-9,-3,3,9].map(offset=><line key={offset} x1={offset} x2={offset-4} y1={ground} y2={ground+4} strokeWidth=".7"/>)}
    </>}
  </g>;
}

export function EngineeringDimension({ left, right, top, base, L, H }: { left: number; right: number; top: number; base: number; L: number; H: number }) {
  return <g stroke={engineeringMuted} fill={engineeringMuted} strokeWidth=".7">
    <line x1={left} x2={right} y1="207" y2="207" />
    {[left, right].map(x => <g key={x}><line x1={x} x2={x} y1="202" y2="213" /><line x1={x - 3} x2={x + 3} y1="210" y2="204" /></g>)}
    <text x={(left + right) / 2} y="199" textAnchor="middle" stroke="none" fontSize="11">L = {formatEngineeringValue(L)} m</text>
    <line x1="324" x2="324" y1={top} y2={base} />
    {[top, base].map(y => <g key={y}><line x1="319" x2="330" y1={y} y2={y} /><line x1="321" x2="327" y1={y - 3} y2={y + 3} /></g>)}
    <text transform={`translate(342 ${(top + base) / 2}) rotate(-90)`} textAnchor="middle" stroke="none" fontSize="11">H = {formatEngineeringValue(H)} m</text>
  </g>;
}
