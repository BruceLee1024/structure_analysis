import { EngineeringSupport } from './EngineeringFigure';
import React from 'react';
import { learningChartPalette as palette } from './learningChartPalette';

interface FrameChartsProps {
  L: number;
  H: number;
  P: number;
  q: number;
  hPos: number;
  results: {
    FyA: number;
    M_E: number;
    M_beam_max: number;
    xStar: number;
    Mmax: number;
    Qmax: number;
    Nmax: number;
    Q_col_below: number;
    Q_beam_left: number;
    Q_beam_right: number;
    N_left: number;
    N_right: number;
    N_beam: number;
  };
}

const INK = palette.ink, MUTED = palette.muted;
const MOMENT = palette.moment, SHEAR = palette.shear, AXIAL = palette.axial;
const LEFT = 90, RIGHT = 270, TOP = 74, BASE = 174;
const number = (value: number, signed = false) => {
  if (!Number.isFinite(value)) return '—';
  const rounded = Math.abs(value) < 1e-8 ? 0 : value;
  const text = Math.abs(rounded) >= 10000 ? rounded.toExponential(2) : Number(rounded.toFixed(2)).toString();
  return `${signed && rounded > 0 ? '+' : ''}${text.replace('-', '−')}`;
};

function FrameSupport({ x, roller = false }: { x: number; roller?: boolean }) {
  return <EngineeringSupport x={x} y={BASE} roller={roller}/>;
}

const FrameEngineeringCharts: React.FC<FrameChartsProps> = ({ L, H, P, q, hPos, results: r }) => {
  const loadY = BASE - hPos / 100 * (BASE - TOP);
  const mScale = 28 / (r.Mmax || 1), qScale = 28 / (r.Qmax || 1), nScale = 28 / (r.Nmax || 1);
  const beamPoints = Array.from({ length: 61 }, (_, i) => {
    const x = L * i / 60;
    return `${LEFT + (RIGHT - LEFT) * i / 60},${TOP + (r.FyA * x - q * x * x / 2 - r.M_E) * mScale}`;
  });
  const peakX = LEFT + r.xStar / (L || 1) * (RIGHT - LEFT);
  const peakY = TOP + r.M_beam_max * mScale;
  const base = <>
    <path d={`M ${LEFT},${BASE} V ${TOP} H ${RIGHT} V ${BASE}`} fill="none" stroke={INK} strokeWidth="2.3" strokeLinejoin="round" />
    {[LEFT, RIGHT].map(x => <rect key={x} x={x - 2} y={TOP - 2} width="4" height="4" fill={INK} />)}
    <FrameSupport x={LEFT} /><FrameSupport x={RIGHT} roller />
    <g fill={INK} fontSize="11" fontWeight="600">
      <text x={LEFT - 16} y={BASE + 5} textAnchor="end">A</text>
      <text x={RIGHT + 16} y={BASE + 5}>B</text>
      <text x={LEFT - 13} y={TOP - 9} textAnchor="end">E</text>
      <text x={RIGHT + 13} y={TOP - 9}>D</text>
    </g>
  </>;
  const forcePath = (d: string, color: string) => <path d={d} fill={color} fillOpacity=".16" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />;

  const cards = [
    {
      title: '结构示意', detail: `L = ${number(L)} m · H = ${number(H)} m`,
      drawing: <>
        <g data-annotation-band="true" fill={palette.load}>
          <text x="20" y="20" fontSize="11" fontWeight="600">P = {number(P)} kN</text>
          <text x="225" y="20" fontSize="12" fontWeight="600" textAnchor="middle">q = {number(q)} kN/m</text>
        </g>
        {base}
        <g stroke={palette.load} fill={palette.load} strokeWidth="1.1">
          <line x1={LEFT} x2={RIGHT} y1="48" y2="48" />
          {Array.from({ length: 9 }, (_, i) => LEFT + (RIGHT - LEFT) * i / 8).map(x => <g key={x}>
            <line x1={x} x2={x} y1="48" y2={TOP - 8} />
            <path d={`M ${x - 2.5},${TOP - 10} L ${x},${TOP - 3} L ${x + 2.5},${TOP - 10} Z`} stroke="none" />
          </g>)}
          <line x1="48" x2={LEFT - 7} y1={loadY} y2={loadY} />
          <path d={`M ${LEFT - 12},${loadY - 3} L ${LEFT - 3},${loadY} L ${LEFT - 12},${loadY + 3} Z`} stroke="none" />
          <text x="58" y={loadY - 8} fontSize="11" stroke="none">P</text>
        </g>
        <g stroke={MUTED} fill={MUTED} strokeWidth=".7">
          <line x1={LEFT} x2={RIGHT} y1="209" y2="209" />
          {[LEFT, RIGHT].map(x => <g key={x}><line x1={x} x2={x} y1="203" y2="214" /><line x1={x - 3} x2={x + 3} y1="212" y2="206" /></g>)}
          <text x="180" y="201" textAnchor="middle" stroke="none" fontSize="11">L = {number(L)} m</text>
          <line x1="315" x2="315" y1={TOP} y2={BASE} />
          {[TOP, BASE].map(y => <g key={y}><line x1="309" x2="320" y1={y} y2={y} /><line x1="312" x2="318" y1={y - 3} y2={y + 3} /></g>)}
          <text transform="translate(333 128) rotate(-90)" textAnchor="middle" stroke="none" fontSize="11">H = {number(H)} m</text>
        </g>
      </>,
    },
    {
      title: '弯矩 M', detail: `|M|max = ${number(r.Mmax)} kN·m`,
      drawing: <>
        <g data-annotation-band="true" fill={MOMENT} fontSize="11" fontWeight="600">
          <text x="20" y="18">E 端 {number(-r.M_E, true)}</text>
          <text x="180" y="18" textAnchor="middle">梁内极值 {number(r.M_beam_max, true)}</text>
          <text x="340" y="18" textAnchor="end">D 端 0</text>
          <text x="180" y="36" textAnchor="middle" fill={MUTED} fontWeight="400">M (kN·m) · 梁下、柱外侧为正</text>
        </g>
        <g data-force-geometry="true">
          {forcePath(`M ${LEFT},${BASE} L ${LEFT - r.M_E * mScale},${loadY} V ${TOP} H ${LEFT} Z`, MOMENT)}
          {forcePath(`M ${LEFT},${TOP} L ${beamPoints.join(' L ')} L ${RIGHT},${TOP} Z`, MOMENT)}
          {base}
          <circle cx={peakX} cy={peakY} r="2.7" fill={MOMENT} stroke="#fff" strokeWidth="1" />
        </g>
        <g fill={MOMENT} fontSize="11" fontWeight="600">
          <text x="20" y="212">左柱顶 {number(r.M_E, true)}</text>
          <text x="340" y="212" textAnchor="end">右柱 M = 0</text>
        </g>
      </>,
    },
    {
      title: '剪力 Q', detail: `|Q|max = ${number(r.Qmax)} kN`,
      drawing: <>
        <g data-annotation-band="true" fill={SHEAR} fontSize="11" fontWeight="600">
          <text x="20" y="18">E 端 {number(r.Q_beam_left, true)}</text>
          <text x="340" y="18" textAnchor="end">D 端 {number(r.Q_beam_right, true)}</text>
          <text x="180" y="36" textAnchor="middle" fill={MUTED} fontSize="11" fontWeight="400">Q (kN) · 梁剪力沿梁长线性变化</text>
        </g>
        <g data-force-geometry="true">
          {forcePath(`M ${LEFT},${BASE} H ${LEFT + r.Q_col_below * qScale} V ${loadY} H ${LEFT} Z`, SHEAR)}
          {forcePath(`M ${LEFT},${TOP} L ${LEFT},${TOP - r.Q_beam_left * qScale} L ${RIGHT},${TOP - r.Q_beam_right * qScale} V ${TOP} Z`, SHEAR)}
          {base}
          <line x1={peakX} x2={peakX} y1={TOP - 5} y2={TOP + 5} stroke={SHEAR} strokeWidth="1" />
        </g>
        <g fontSize="11" fill={SHEAR}>
          <text x="20" y="212">左柱 {number(r.Q_col_below, true)}</text>
          <text x="180" y="212" textAnchor="middle" fill={MUTED} fontSize="10">x* = {number(r.xStar)} m</text>
          <text x="340" y="212" textAnchor="end">右柱 Q = 0</text>
        </g>
      </>,
    },
    {
      title: '轴力 N', detail: `|N|max = ${number(r.Nmax)} kN`,
      drawing: <>
        <g data-annotation-band="true" textAnchor="middle">
          <text x="180" y="20" fill={AXIAL} fontSize="12" fontWeight="600">梁 N = {number(r.N_beam, true)} kN</text>
          <text x="180" y="37" fill={MUTED} fontSize="11">轴力 N (kN) · 压力为负</text>
        </g>
        <g data-force-geometry="true">
          {forcePath(`M ${LEFT},${BASE} H ${LEFT - r.N_left * nScale} V ${TOP} H ${LEFT} Z`, AXIAL)}
          {forcePath(`M ${LEFT},${TOP} V ${TOP + r.N_beam * nScale} H ${RIGHT} V ${TOP} Z`, AXIAL)}
          {forcePath(`M ${RIGHT},${TOP} H ${RIGHT + r.N_right * nScale} V ${BASE} H ${RIGHT} Z`, AXIAL)}
          {base}
        </g>
        <g fill={AXIAL} fontSize="11" fontWeight="600">
          <text x="20" y="212">左柱 {number(r.N_left, true)} kN</text>
          <text x="340" y="212" textAnchor="end">右柱 {number(r.N_right, true)} kN</text>
        </g>
      </>,
    },
  ];

  return <div className="learning-diagram-grid learning-diagrams-4 engineering-charts frame-engineering-charts">
    {cards.map((card, i) => <div key={card.title} data-chart-tone={["load", "moment", "shear", "axial"][i]} className={`learning-chart-card ${i === 0 ? 'learning-structure-card' : ''} overflow-hidden flex flex-col`}>
      <div className="learning-card-header border-b flex items-center justify-between flex-shrink-0"><h3>{card.title}</h3><span>{card.detail}</span></div>
      <div className="learning-card-plot flex-1 min-h-0">
        <svg width="100%" height="100%" viewBox="0 0 360 220" preserveAspectRatio="xMidYMid meet" className="engineering-figure" role="img" aria-label={`${card.title}，${card.detail}`}>
          <title>{card.title}：{card.detail}</title>
          {card.drawing}
        </svg>
      </div>
    </div>)}
  </div>;
};

export default FrameEngineeringCharts;
