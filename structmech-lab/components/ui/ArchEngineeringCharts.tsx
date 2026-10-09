import { EngineeringSupport } from './EngineeringFigure';
import React from 'react';
import { learningChartPalette as palette } from './learningChartPalette';

interface ArchChartsProps {
  L: number;
  f: number;
  q: number;
  crownForce: number;
  supportForce: number;
  beamMoment: number;
  reduction: number;
}

const INK = palette.ink, MUTED = palette.muted;
const GREEN = palette.shear, BLUE = palette.axial, RED = palette.moment;
const LEFT = 40, RIGHT = 280, CENTER = 160, BASE = 124;
const number = (value: number) => {
  if (!Number.isFinite(value)) return '—';
  const text = Math.abs(value) >= 10000 ? value.toExponential(2) : Number(value.toFixed(2)).toString();
  return text.replace('-', '−');
};

function ArchSupport({ x }: { x: number }) {
  return <EngineeringSupport x={x} y={BASE}/>;
}

const ArchEngineeringCharts: React.FC<ArchChartsProps> = ({ L, f, q, crownForce, supportForce, beamMoment, reduction }) => {
  // Reserve the top 44 units for annotations. Keep even steep/shallow arches
  // inside the drawing band, as these figures illustrate the structural form.
  const rise = Math.min(60, Math.max(8, f / L * (RIGHT - LEFT)));
  const crown = BASE - rise;
  const arch = `M ${LEFT},${BASE} Q ${CENTER},${BASE - 2 * rise} ${RIGHT},${BASE}`;
  const envelope = `M ${LEFT},${BASE} Q ${CENTER},${BASE - 2 * rise - 12} ${RIGHT},${BASE}`;
  const beam = `M ${LEFT},${BASE} Q ${CENTER},${BASE + 56} ${RIGHT},${BASE}`;

  const base = <g data-arch-geometry="true">
    <path d={arch} fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
    <ArchSupport x={LEFT} /><ArchSupport x={RIGHT} />
    <circle cx={CENTER} cy={crown} r="3" fill="#fff" stroke={INK} strokeWidth="1.2" />
  </g>;

  const cards = [
    {
      title: '三铰拱', detail: `L = ${number(L)} m · f = ${number(f)} m`,
      drawing: <>
        <g data-annotation-band="true" fill={palette.load} stroke={palette.load} strokeWidth="1">
          <text x={CENTER} y="18" textAnchor="middle" stroke="none" fontSize="12" fontWeight="600">q = {number(q)} kN/m</text>
          <line x1={LEFT} x2={RIGHT} y1="28" y2="28" />
          {Array.from({ length: 11 }, (_, i) => LEFT + (RIGHT - LEFT) * i / 10).map(x => <g key={x}>
            <line x1={x} x2={x} y1="28" y2="41" />
            <path d={`M ${x - 2.5},39 L ${x},44 L ${x + 2.5},39 Z`} stroke="none" />
          </g>)}
        </g>
        {base}
        <g stroke={MUTED} fill={MUTED} strokeWidth=".7">
          <line x1={CENTER} x2={CENTER} y1={crown + 4} y2={BASE} strokeDasharray="3 3" />
          <text x={CENTER} y="145" textAnchor="middle" stroke="none" fontSize="10">f = {number(f)} m</text>
          <line x1={LEFT} x2={RIGHT} y1="171" y2="171" />
          {[LEFT, RIGHT].map(x => <g key={x}>
            <line x1={x} x2={x} y1="165" y2="175" />
            <line x1={x - 3} x2={x + 3} y1="174" y2="168" />
          </g>)}
          <text x={CENTER} y="164" textAnchor="middle" stroke="none" fontSize="11">L = {number(L)} m</text>
        </g>
        <g fill={INK} fontSize="10" fontWeight="600"><text x={LEFT} y="157" textAnchor="middle">A</text><text x={RIGHT} y="157" textAnchor="middle">B</text></g>
      </>,
    },
    {
      title: '弯矩 M', detail: 'M = 0 kN·m',
      drawing: <>
        <g data-annotation-band="true" textAnchor="middle">
          <text x={CENTER} y="20" fill={RED} fontSize="14" fontWeight="600">M = 0</text>
          <text x={CENTER} y="37" fill={MUTED} fontSize="10">抛物线拱 · 全跨均布荷载</text>
        </g>
        {base}
        <path d={arch} fill="none" stroke={RED} strokeWidth="1.4" />
        <text x={CENTER} y="165" fill={MUTED} fontSize="11" textAnchor="middle">M = M梁 − H·y = 0</text>
      </>,
    },
    {
      title: '轴力 N', detail: `拱顶 ${number(crownForce)} kN`,
      drawing: <>
        <g data-annotation-band="true" textAnchor="middle">
          <text x={CENTER} y="20" fill={BLUE} fontSize="12" fontWeight="600">拱顶 N = {number(crownForce)} kN</text>
          <text x={CENTER} y="37" fill={MUTED} fontSize="10">轴力示意 · 压力为负</text>
        </g>
        <path d={`${envelope} Q ${CENTER},${BASE - 2 * rise} ${LEFT},${BASE} Z`} fill={BLUE} fillOpacity=".16" />
        {base}
        <path d={envelope} fill="none" stroke={BLUE} strokeWidth="1.5" />
        <g fill="none" stroke={MUTED} strokeWidth=".7">
          <line x1={CENTER} x2={CENTER} y1="42" y2={crown - 7} strokeDasharray="3 3" />
          <path d={`M 49,${BASE - rise * .14} L 20,146 V 153`} />
          <path d={`M 271,${BASE - rise * .14} L 300,146 V 153`} />
        </g>
        <g fill={BLUE} fontSize="11" fontWeight="600">
          <text x="20" y="167">A: {number(supportForce)} kN</text>
          <text x="300" y="167" textAnchor="end">B: {number(supportForce)} kN</text>
        </g>
      </>,
    },
    {
      title: '与简支梁对比', detail: `弯矩降低 ${reduction}%`,
      drawing: <>
        <g data-annotation-band="true" fontSize="11" fontWeight="600">
          <text x="24" y="19" fill={GREEN}>拱 Mmax = 0</text>
          <text x="296" y="19" textAnchor="end" fill={RED}>梁 Mmax = {number(beamMoment)}</text>
          <text x={CENTER} y="37" textAnchor="middle" fill={MUTED} fontSize="10" fontWeight="400">同跨度 · 同荷载</text>
        </g>
        <path d={`${beam} L ${LEFT},${BASE} Z`} fill={RED} fillOpacity=".16" />
        <line x1={LEFT} x2={RIGHT} y1={BASE} y2={BASE} stroke={palette.grid} strokeWidth=".7" />
        <path d={beam} fill="none" stroke={RED} strokeWidth="1.5" strokeDasharray="4 3" />
        {base}
        <path d={arch} fill="none" stroke={GREEN} strokeWidth="1.4" />
        <text x={CENTER} y="170" fill={MUTED} fontSize="10" textAnchor="middle">弯矩示意（kN·m）</text>
      </>,
    },
  ];

  return <div className="learning-diagram-grid learning-diagrams-4 engineering-charts arch-engineering-charts">
    {cards.map((card, i) => <div key={card.title} data-chart-tone={["load", "moment", "axial", "moment"][i]} className={`learning-chart-card ${i === 0 ? 'learning-structure-card' : ''} overflow-hidden flex flex-col`}>
      <div className="learning-card-header border-b flex items-center justify-between flex-shrink-0"><h3>{card.title}</h3><span>{card.detail}</span></div>
      <div className="learning-card-plot flex-1 min-h-0">
        <svg width="100%" height="100%" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid meet" className="engineering-figure" role="img" aria-label={`${card.title}，${card.detail}`}>
          <title>{card.title}：{card.detail}</title>
          {card.drawing}
        </svg>
      </div>
    </div>)}
  </div>;
};

export default ArchEngineeringCharts;
