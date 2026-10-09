import React from 'react';
import { learningChartPalette as palette } from './learningChartPalette';
import { EngineeringFigure, EngineeringSupport, EngineeringDimension, engineeringInk as INK, engineeringMuted as MUTED, formatEngineeringValue as number } from './EngineeringFigure';

interface Props { P: number; q: number; L: number; H: number; beamReaction: number; beamMoment: number; columnMoment: number; columnShear: number; }
const LEFT = 90, RIGHT = 270, TOP = 74, BASE = 168;
const MOMENT = palette.moment, SHEAR = palette.shear;

export default function CompositeEngineeringCharts({ P, q, L, H, beamReaction, beamMoment, columnMoment, columnShear }: Props) {
  const mScale = 28 / (Math.max(Math.abs(beamMoment), Math.abs(columnMoment)) || 1);
  const vScale = 28 / (Math.max(Math.abs(beamReaction), Math.abs(columnShear)) || 1);
  const base = <>
    <path d={`M ${LEFT},${BASE} V ${TOP} H ${RIGHT} V ${BASE}`} fill="none" stroke={INK} strokeWidth="2" />
    <EngineeringSupport x={LEFT} y={BASE} /><EngineeringSupport x={RIGHT} y={BASE} />
    <g fill="#fff" stroke={INK} strokeWidth="1.2"><circle cx={LEFT} cy={TOP} r="3" /><circle cx={RIGHT} cy={TOP} r="3" /></g>
    <g fill={INK} fontSize="11" fontWeight="600"><text x={LEFT - 15} y={TOP - 10} textAnchor="end">C</text><text x={RIGHT + 15} y={TOP - 10}>D</text><text x={LEFT - 15} y={BASE + 5} textAnchor="end">A</text><text x={RIGHT + 15} y={BASE + 5}>B</text></g>
  </>;
  const force = (d: string, color: string) => <path d={d} fill={color} fillOpacity=".16" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />;
  const beamCurve = Array.from({ length: 61 }, (_, i) => {
    const t = i / 60;
    return `${LEFT + (RIGHT - LEFT) * t},${TOP + q * L * L * t * (1 - t) / 2 * mScale}`;
  });
  return <div className="learning-diagram-grid learning-diagrams-3 engineering-charts composite-engineering-charts">
    <EngineeringFigure tone="load" title="组合结构" detail={`L = ${number(L)} m · H = ${number(H)} m`} structure>
      <g data-annotation-band="true" fill={palette.load} fontSize="11" fontWeight="600"><text x="20" y="20">P = {number(P)} kN</text><text x="235" y="20" textAnchor="middle">q = {number(q)} kN/m</text></g>
      {base}
      <g stroke={palette.load} fill={palette.load} strokeWidth="1.1"><line x1={LEFT + 5} x2={RIGHT - 5} y1="48" y2="48" />
        {Array.from({ length: 9 }, (_, i) => LEFT + 5 + (RIGHT - LEFT - 10) * i / 8).map(x => <g key={x}><line x1={x} x2={x} y1="48" y2={TOP - 8} /><path d={`M ${x - 2.5},${TOP - 10} L ${x},${TOP - 3} L ${x + 2.5},${TOP - 10} Z`} stroke="none" /></g>)}
        <line x1="48" x2={LEFT - 7} y1="121" y2="121" /><path d={`M ${LEFT - 12},118 L ${LEFT - 3},121 L ${LEFT - 12},124 Z`} stroke="none" /><text x="58" y="113" stroke="none" fontSize="11">P</text>
      </g>
      <EngineeringDimension left={LEFT} right={RIGHT} top={TOP} base={BASE} L={L} H={H} />
    </EngineeringFigure>
    <EngineeringFigure tone="moment" title="弯矩 M" detail={`|M|max = ${number(Math.max(Math.abs(beamMoment), Math.abs(columnMoment)))} kN·m`}>
      <g data-annotation-band="true" textAnchor="middle"><text x="180" y="20" fill={MOMENT} fontSize="12" fontWeight="600">梁跨中 {number(beamMoment, true)} kN·m</text><text x="180" y="37" fill={MUTED} fontSize="11">梁端铰接 · M_C = M_D = 0</text></g>
      <g data-force-geometry="true">
        {force(`M ${LEFT},${BASE} H ${LEFT - columnMoment * mScale} L ${LEFT},${TOP} Z`, MOMENT)}
        {force(`M ${LEFT},${TOP} L ${beamCurve.join(' L ')} L ${RIGHT},${TOP} Z`, MOMENT)}
        {force(`M ${RIGHT},${TOP} L ${RIGHT + columnMoment * mScale},${BASE} H ${RIGHT} Z`, MOMENT)}
        {base}<circle cx="180" cy={TOP + beamMoment * mScale} r="2.7" fill={MOMENT} stroke="#fff" strokeWidth="1" />
      </g>
      <text x="180" y="212" textAnchor="middle" fill={MOMENT} fontSize="11">柱底弯矩 {number(columnMoment)} kN·m</text>
    </EngineeringFigure>
    <EngineeringFigure tone="shear" title="剪力 V" detail={`|V|max = ${number(Math.max(Math.abs(beamReaction), Math.abs(columnShear)))} kN`}>
      <g data-annotation-band="true" fill={SHEAR} fontSize="11" fontWeight="600"><text x="20" y="18">梁左端 {number(beamReaction, true)}</text><text x="340" y="18" textAnchor="end">梁右端 {number(-beamReaction, true)}</text><text x="180" y="36" textAnchor="middle" fill={MUTED} fontWeight="400">剪力 V (kN) · 梁沿跨度线性变化</text></g>
      <g data-force-geometry="true">
        {force(`M ${LEFT},${BASE} H ${LEFT + columnShear * vScale} V ${TOP} H ${LEFT} Z`, SHEAR)}
        {force(`M ${LEFT},${TOP} V ${TOP - beamReaction * vScale} L ${RIGHT},${TOP + beamReaction * vScale} V ${TOP} Z`, SHEAR)}
        {force(`M ${RIGHT},${TOP} H ${RIGHT - columnShear * vScale} V ${BASE} H ${RIGHT} Z`, SHEAR)}
        {base}<line x1="180" x2="180" y1={TOP - 5} y2={TOP + 5} stroke={SHEAR} strokeWidth="1" />
      </g>
      <text x="180" y="212" textAnchor="middle" fill={SHEAR} fontSize="11">柱剪力 {number(columnShear)} kN · 梁跨中 V = 0</text>
    </EngineeringFigure>
  </div>;
}
