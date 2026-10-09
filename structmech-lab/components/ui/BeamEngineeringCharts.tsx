import React, { useRef, useState } from 'react';
import { learningChartPalette as palette } from './learningChartPalette';
import { EngineeringSupport, formatEngineeringValue as number } from './EngineeringFigure';
import { beamForceDirection, type LearningBeamInput, type LearningBeamResult, type LearningBeamLoad, type BeamStation } from '../../utils/learningBeam';
import LoadDirectionControl from './LoadDirectionControl';
import { normalizeLoadAngle } from '../../utils/loadDirection';
import { ForceFlowLayer, useForceReference } from './ForceFlow';
import { beamFlowModel } from '../../utils/forceFlowModels';

const LEFT = 46, RIGHT = 314, BEAM_Y = 145, TOP = 32, BOTTOM = 162;
function scaleDomain(values: number[]) {
  const min = Math.min(0, ...values), max = Math.max(0, ...values), range = Math.max(max - min, 1);
  const power = 10 ** Math.floor(Math.log10(range / 4));
  const step = ([1, 2, 2.5, 5, 10].find(n => n >= range / 4 / power) ?? 10) * power;
  const low = Math.floor(min / step) * step, high = Math.ceil(max / step) * step;
  return { low, high: high === low ? low + step : high, step };
}
function Dimension({ x1, x2, label }: { x1: number; x2: number; label: string }) {
  return <g stroke={palette.muted} strokeWidth=".7" fill={palette.muted}><line x1={x1} x2={x2} y1="204" y2="204" />
    {[x1, x2].map((x, i) => <g key={i}><line x1={x} x2={x} y1="199" y2="209" /><line x1={x - 3} x2={x + 3} y1="207" y2="201" /></g>)}
    <text x={(x1 + x2) / 2} y="196" textAnchor="middle" stroke="none" fontSize="10">{label}</text></g>;
}
function arrowGeometry(x: number, direction: { x: number; y: number }, size: number) {
  const ux = direction.x, uy = -direction.y;
  const outward = direction.y > 0 || (direction.y === 0 && ((x < 100 && ux > 0) || (x > 260 && ux < 0)));
  const dx = outward ? ux : -ux, dy = outward ? uy : -uy;
  size = Math.max(0, Math.min(size,
    dx > 0 ? (346 - x) / dx : dx < 0 ? (x - 14) / -dx : Infinity,
    dy > 0 ? (172 - BEAM_Y) / dy : dy < 0 ? (BEAM_Y - 56) / -dy : Infinity));
  const tipX = x + ux * (outward ? size : -5), tipY = BEAM_Y + uy * (outward ? size : -5);
  const tailX = x + ux * (outward ? 5 : -size), tailY = BEAM_Y + uy * (outward ? 5 : -size);
  return { tipX, tipY, tailX, tailY, ux, uy, farX: outward ? tipX : tailX, farY: outward ? tipY : tailY };
}
function Arrow({ x, direction, size, color }: { x: number; direction: { x: number; y: number }; size: number; color: string }) {
  if (size < 6) return null;
  const a = arrowGeometry(x, direction, size), bx = a.tipX - a.ux * 6, by = a.tipY - a.uy * 6;
  return <g stroke={color} fill={color} strokeWidth="1.3"><line x1={a.tailX} y1={a.tailY} x2={a.tipX} y2={a.tipY} stroke="transparent" strokeWidth="12" /><line x1={a.tailX} y1={a.tailY} x2={a.tipX} y2={a.tipY} />
    <path d={`M ${a.tipX},${a.tipY} L ${bx - a.uy * 2.7},${by + a.ux * 2.7} L ${bx + a.uy * 2.7},${by - a.ux * 2.7} Z`} stroke="none" /></g>;
}
function Couple({ x, clockwise, color }: { x: number; clockwise: boolean; color: string }) {
  // The tangent arrow at the right distinguishes clockwise from counterclockwise.
  return <g stroke={color} fill={color} strokeWidth="1.5" transform={`translate(${x} ${BEAM_Y - 16}) scale(${clockwise ? -1 : 1} 1)`}>
    <circle r="17" fill="transparent" stroke="none" /><path d="M 0,-13 A 13,13 0 1 0 13,0" fill="none" /><path d="M 13,0 L 10,6 L 16,6 Z" stroke="none" /></g>;
}
const describe = (load: LearningBeamLoad) => load.type === 'moment' ? `M = ${number(load.magnitude)} kN·m · ${load.rotation === 'ccw' ? '逆时针' : '顺时针'} · x = ${number(load.position)} m`
  : load.type === 'point' ? `P = ${number(load.magnitude)} kN · θ = ${number(load.angle)}° · x = ${number(load.position)} m`
  : `q = ${number(load.magnitude)}${load.type === 'linear' ? `→${number(load.endMagnitude!)}` : ''} kN/m · ${number(load.start)}–${number(load.end)} m`;

interface Props {
  input: LearningBeamInput; diagram: LearningBeamResult; beamLabel: string; activeId: string | null;
  emptyHint?: string;
  onAngleChange?: (id: string, angle: number) => void; onReverseLoad?: (id: string) => void;
  onSelectLoad: (id: string) => void; onMoveLoad: (id: string, x: number) => void; onPlaceLoad: (x: number) => void;
}
export function StructureDrawing({ input, diagram, activeId, onSelectLoad, onMoveLoad, onPlaceLoad, emptyHint, onAngleChange, onReverseLoad }: Props) {
  const [controlId, setControlId] = useState<string | null>(null);
  const moved = useRef(false);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; pointerId: number; startX: number; initial: number } | null>(null);
  const sx = (x: number) => LEFT + x / diagram.length * (RIGHT - LEFT);
  const worldX = (clientX: number, clientY: number) => {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return 0;
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return Math.max(0, Math.min(diagram.length, (point.x - LEFT) / (RIGHT - LEFT) * diagram.length));
  };
  const activeIndex = input.loads.findIndex(load => load.id === activeId), active = input.loads[activeIndex];
  return <svg ref={svg} className="engineering-figure beam-model-figure" width="100%" height="100%" viewBox="0 0 360 220" preserveAspectRatio="xMidYMid meet" role="group" aria-label="梁结构与多荷载交互图"
    onPointerMove={e => {
      const current = drag.current;
      if (current && e.pointerId === current.pointerId) { const delta = worldX(e.clientX, e.clientY) - current.startX; if (Math.abs(delta) > diagram.length / 120) moved.current = true; if (moved.current) { setControlId(null); onMoveLoad(current.id, current.initial + delta); } }
    }} onPointerUp={e => { if (drag.current?.pointerId === e.pointerId) drag.current = null; }}
    onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
    <title>点击梁定位当前荷载；拖动荷载箭头或分布荷载边线移动</title>
    <g data-annotation-band="true" textAnchor="middle"><text x="180" y="19" fill={palette.load} fontSize="11" fontWeight="600">{active ? `荷载 ${activeIndex + 1} · ${describe(active)}` : emptyHint ? '当前无入跨荷载' : '当前无荷载'}</text>
      <text x="180" y="36" fill={palette.muted} fontSize="10">{active ? '点击箭头调方向 · 双击反向 · 拖动移动' : emptyHint ?? '点击梁上任意位置添加集中力'}</text></g>
    <g pointerEvents="none"><line x1={LEFT} x2={RIGHT} y1={BEAM_Y} y2={BEAM_Y} stroke={palette.ink} strokeWidth="2.2" />
      {input.beamType === 'cantilever' ? <EngineeringSupport x={LEFT} y={BEAM_Y} kind="fixed" rotation={90} />
        : <><EngineeringSupport x={LEFT} y={BEAM_Y} /><EngineeringSupport x={sx(input.L)} y={BEAM_Y} roller /></>}
      <g fill={palette.ink} fontSize="11" fontWeight="600"><text x={LEFT} y="182" textAnchor="middle">A</text><text x={input.beamType === 'cantilever' ? RIGHT : sx(input.L)} y="182" textAnchor="middle">B</text>{input.beamType === 'overhanging' && <text x={RIGHT} y="182" textAnchor="middle">C</text>}</g>
    </g>
    <ForceFlowLayer model={beamFlowModel(input, diagram, x => ({ x: sx(x), y: BEAM_Y }))} />
    <rect className="beam-position-hit" x={LEFT} y={BEAM_Y - 8} width={RIGHT - LEFT} height="16" fill="transparent" role="button" tabIndex={0} aria-label="在梁上设置荷载位置"
      onPointerDown={e => { if (e.button === 0) onPlaceLoad(worldX(e.clientX, e.clientY)); }}
      onKeyDown={e => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const current = active ? ('position' in active ? active.position : active.start) : diagram.length / 2; onPlaceLoad(current + (e.key === 'ArrowRight' ? .1 : -.1)); }
        if (e.key === 'Enter' && !active) onPlaceLoad(diagram.length / 2);
      }} />
    {input.loads.map((load, i) => {
      const selected = load.id === activeId, color = selected ? palette.load : '#748696';
      return <g key={load.id} className={`beam-drawable-load ${selected ? 'is-active' : ''}`} role="button" tabIndex={0} aria-label={`选择图中荷载 ${i + 1}`}
        onPointerDown={e => {
          if (e.button !== 0) return;
          e.preventDefault(); e.stopPropagation(); moved.current = false; onSelectLoad(load.id);
          drag.current = { id: load.id, pointerId: e.pointerId, startX: worldX(e.clientX, e.clientY), initial: 'position' in load ? load.position : load.start };
          e.currentTarget.setPointerCapture(e.pointerId);
        }} onClick={() => { if (!moved.current) { onSelectLoad(load.id); setControlId(load.id); } }} onDoubleClick={e => { e.stopPropagation(); onReverseLoad?.(load.id); setControlId(load.id); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectLoad(load.id); setControlId(load.id); } }}>
        <title>荷载 {i + 1}：{describe(load)}</title>
        {load.type === 'moment' ? (load.magnitude > 1e-10 ? <Couple x={sx(load.position)} clockwise={load.rotation === 'cw'} color={color} /> : <circle cx={sx(load.position)} cy={BEAM_Y} r="3" fill={color} />)
          : load.type === 'point' ? <>{load.magnitude > 1e-10 && <Arrow x={sx(load.position)} direction={beamForceDirection(load.angle)} size={selected ? 63 : 45} color={color} />}<circle cx={sx(load.position)} cy={BEAM_Y} r={selected ? 4 : 2.5} fill={color} stroke={palette.paper} strokeWidth="1.4" /></>
          : (() => {
            const direction = beamForceDirection(load.angle), endMagnitude = load.type === 'linear' ? load.endMagnitude! : load.magnitude;
            const maximum = Math.max(load.magnitude, endMagnitude, 1e-10), size = selected ? 62 : 38;
            const arrows = Array.from({ length: 9 }, (_, j) => {
              const x = sx(load.start + (load.end - load.start) * j / 8), intensity = load.magnitude + (endMagnitude - load.magnitude) * j / 8;
              return { x, intensity, size: intensity / maximum * size };
            });
            const a = arrowGeometry(sx(load.start), direction, load.magnitude / maximum * size), b = arrowGeometry(sx(load.end), direction, endMagnitude / maximum * size);
            return <><line x1={a.farX} y1={a.farY} x2={b.farX} y2={b.farY} stroke={color} strokeWidth="1.4" />
              <line x1={a.farX} y1={a.farY} x2={b.farX} y2={b.farY} stroke="transparent" strokeWidth="12" />
              {arrows.map((a, j) => <g key={j}><Arrow x={a.x} direction={direction} size={a.size} color={color} /></g>)}</>;
          })()}
      </g>;
    })}
    {input.beamType === 'overhanging' ? <><Dimension x1={LEFT} x2={sx(input.L)} label={`${number(input.L)} m`} /><Dimension x1={sx(input.L)} x2={RIGHT} label={`${number(input.overhang)} m`} /></>
      : <Dimension x1={LEFT} x2={RIGHT} label={`L = ${number(diagram.length)} m`} />}
    {active && controlId === active.id && onAngleChange && <LoadDirectionControl x={sx('position' in active ? active.position : (active.start + active.end) / 2)} y={BEAM_Y} moment={active.type === 'moment'} angle={active.type === 'moment' ? 0 : active.angle} onAngleChange={angle => onAngleChange(active.id, angle)} onReverse={() => active.type === 'moment' ? onReverseLoad?.(active.id) : onAngleChange(active.id, normalizeLoadAngle(active.angle + 180))} onClose={() => setControlId(null)} />}
  </svg>;
}

export function ForcePlot({ input, diagram, kind }: { input: LearningBeamInput; diagram: LearningBeamResult; kind: 'moment' | 'shear' | 'axial' }) {
  const reference = useForceReference();
  const data = diagram[kind], color = palette[kind], symbol = kind === 'moment' ? 'M' : kind === 'shear' ? 'V' : 'N', unit = kind === 'moment' ? 'kN·m' : 'kN';
  const referencePeak = reference?.[symbol];
  const domain = scaleDomain(referencePeak !== undefined ? [-referencePeak, referencePeak] : data.map(p => p.value));
  const sx = (x: number) => LEFT + x / diagram.length * (RIGHT - LEFT), sy = (value: number) => BOTTOM - (value - domain.low) / (domain.high - domain.low) * (BOTTOM - TOP);
  const zero = sy(0), line = data.map((p, i) => `${i ? 'L' : 'M'} ${sx(p.x)},${sy(p.value)}`).join(' ');
  const fill = `M ${LEFT},${zero} ${line.replace(/^M/, 'L')} L ${RIGHT},${zero} Z`;
  const ticks = Array.from({ length: Math.round((domain.high - domain.low) / domain.step) + 1 }, (_, i) => domain.low + i * domain.step);
  const points = kind === 'moment' ? [diagram.momentPeak] : kind === 'axial' ? [diagram.axialPeak] : [diagram.shearMax, diagram.shearMin].filter(p => Math.abs(p.value) > 1e-8);
  const annotation = (point: BeamStation, index: number) => {
    const x = sx(point.x), y = sy(point.value), anchor = x >= RIGHT - 25 ? 'end' : x <= LEFT + 25 ? 'start' : 'middle';
    return <g key={index}><circle cx={x} cy={y} r="2.7" fill={color} stroke="#fff" strokeWidth="1.1" /><text x={x + (anchor === 'start' ? 7 : anchor === 'end' ? -7 : 0)} y={Math.max(TOP + 12, Math.min(BOTTOM - 6, y - 10))} textAnchor={anchor} fill={color} fontSize="11" fontWeight="600" className="engineering-value-label">{number(point.value)}</text></g>;
  };
  const names = { moment: '弯矩', shear: '剪力', axial: '轴力' };
  const markers = [...new Set([...(input.beamType === 'overhanging' ? [input.L] : []), ...input.loads.flatMap(l => 'position' in l ? [l.position] : [l.start, l.end])])];
  return <svg className="engineering-figure" width="100%" height="100%" viewBox="0 0 360 220" role="img" aria-label={`${names[kind]}图，横轴为位置，单位米，纵轴单位${unit}`}>
    <title>{names[kind]}沿梁长的分布</title><desc>按所有荷载叠加计算；集中作用处保留左右极限。</desc>
    <text x={LEFT} y="18" fill={palette.muted} fontSize="11">{symbol} ({unit})</text>
    {ticks.map(value => <g key={value}><line x1={LEFT} x2={RIGHT} y1={sy(value)} y2={sy(value)} stroke={palette.grid} strokeWidth=".7" /><text x={LEFT - 8} y={sy(value) + 4} textAnchor="end" fill={palette.muted} fontSize="9">{number(value)}</text></g>)}
    {[0, 1, 2, 3, 4].map(i => <g key={i}><line x1={sx(diagram.length * i / 4)} x2={sx(diagram.length * i / 4)} y1={TOP} y2={BOTTOM} stroke={palette.grid} strokeWidth=".7" /><text x={sx(diagram.length * i / 4)} y={BOTTOM + 19} textAnchor="middle" fill={palette.muted} fontSize="9">{number(diagram.length * i / 4)}</text></g>)}
    <path d={fill} fill={color} fillOpacity=".16" /><line x1={LEFT} x2={RIGHT} y1={zero} y2={zero} stroke={palette.axis} strokeWidth="1" />
    <path d={`M ${LEFT},${TOP} V ${BOTTOM} H ${RIGHT}`} fill="none" stroke={palette.axis} strokeWidth=".9" />
    {markers.map(x => <line key={x} x1={sx(x)} x2={sx(x)} y1={TOP} y2={BOTTOM} stroke={palette.axis} strokeDasharray="3 4" strokeWidth=".6" opacity=".65" />)}
    <path d={line} stroke={color} strokeWidth="1.8" strokeLinejoin="round" fill="none" />{points.map(annotation)}
    <text x={RIGHT} y="198" textAnchor="end" fill={palette.muted} fontSize="10">x (m)</text>
    <text x={LEFT} y="213" fill={palette.muted} fontSize="9">{kind === 'moment' ? `下缘受拉为正 · 峰值 x = ${number(diagram.momentPeak.x)} m${diagram.momentPeak.side ? diagram.momentPeak.side === 'left' ? ' 左侧' : ' 右侧' : ''}` : kind === 'shear' ? '左截面向上为正 · 集中力处跳变' : '拉力为正，压力为负 · 包含水平分量'}</text>
  </svg>;
}

export default function BeamEngineeringCharts(props: Props) {
  const { input, diagram, beamLabel } = props;
  const cards = [
    { title: beamLabel, tone: 'load' as const, detail: `${input.loads.length} 项荷载 · 总长 ${number(diagram.length)} m`, content: <StructureDrawing {...props} /> },
    { title: '弯矩 M', tone: 'moment' as const, detail: `|M|max = ${number(diagram.Mmax)} kN·m`, content: <ForcePlot input={input} diagram={diagram} kind="moment" /> },
    { title: '剪力 V', tone: 'shear' as const, detail: `|V|max = ${number(diagram.Vmax)} kN`, content: <ForcePlot input={input} diagram={diagram} kind="shear" /> },
    { title: '轴力 N', tone: 'axial' as const, detail: `|N|max = ${number(diagram.Nmax)} kN`, content: <ForcePlot input={input} diagram={diagram} kind="axial" /> },
  ];
  return <div className="learning-diagram-grid learning-diagrams-4 engineering-charts beam-engineering-charts">
    {cards.map((card, i) => <div key={card.title} data-chart-tone={card.tone} className={`learning-chart-card ${i === 0 ? 'learning-structure-card' : ''} overflow-hidden flex flex-col`}>
      <div className="learning-card-header border-b flex items-center justify-between flex-shrink-0"><h3>{card.title}</h3><span>{card.detail}</span></div>
      <div className="learning-card-plot flex-1 min-h-0">{card.content}</div>
    </div>)}
  </div>;
}
