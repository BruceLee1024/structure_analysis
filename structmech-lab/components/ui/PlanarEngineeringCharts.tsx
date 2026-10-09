import React, { useRef, useState } from 'react';
import { learningChartPalette as p } from './learningChartPalette';
import { EngineeringSupport, EngineeringDimension, formatEngineeringValue as fmt } from './EngineeringFigure';
import { beamForceDirection } from '../../utils/learningBeam';
import { planarPoint, planarMembers, type PlanarGeometry, type PlanarLoad, type PlanarResult, type XY } from '../../utils/learningPlanar';
import { memberLoadNames } from './MemberLoadEditor';
import LoadDirectionControl from './LoadDirectionControl';
import { normalizeLoadAngle } from '../../utils/loadDirection';
import { ForceFlowLayer, useForceReference } from './ForceFlow';
import { planarFlowModel } from '../../utils/forceFlowModels';
interface Props { geometry: PlanarGeometry; loads: PlanarLoad[]; result: PlanarResult; activeId: string | null; onSelect: (id: string) => void; onMove: (id: string, member: number, t: number) => void; onPlace: (member: number, t: number) => void; onAngleChange?: (id: string, angle: number) => void; onReverseLoad?: (id: string) => void }
function ForceArrow({ x, y, angle, size, color }: XY & { angle: number; size: number; color: string }) {
  const d = beamForceDirection(angle), dx = d.x, dy = -d.y;
  const outward = d.y > 0 || (Math.abs(d.y) < 1e-8 && x < 100 && dx > 0);
  const ax = outward ? dx : -dx, ay = outward ? dy : -dy;
  const length = Math.max(0, Math.min(size, ax > 0 ? (335 - x) / ax : ax < 0 ? (x - 25) / -ax : Infinity, ay > 0 ? (177 - y) / ay : ay < 0 ? (y - 52) / -ay : Infinity));
  if (length < 4) return null;
  const tx = x + dx * (outward ? length : -4), ty = y + dy * (outward ? length : -4), bx = tx - dx * 5, by = ty - dy * 5;
  return <g stroke={color} fill={color} strokeWidth="1.2"><line x1={x + dx * (outward ? 4 : -length)} y1={y + dy * (outward ? 4 : -length)} x2={tx} y2={ty} stroke="transparent" strokeWidth="12" /><line x1={x + dx * (outward ? 4 : -length)} y1={y + dy * (outward ? 4 : -length)} x2={tx} y2={ty} /><path d={`M ${tx},${ty} L ${bx - dy * 2.4},${by + dx * 2.4} L ${bx + dy * 2.4},${by - dx * 2.4} Z`} stroke="none" /></g>;
}
export default function PlanarEngineeringCharts({ geometry: g, loads, result, activeId, onSelect, onMove, onPlace, onAngleChange, onReverseLoad }: Props) {
  const reference = useForceReference();
  const [controlId, setControlId] = useState<string | null>(null);
  const moved = useRef(false);
  const model = useRef<SVGSVGElement>(null), drag = useRef<{ id: string; pointer: number; member: number; initial: number; start: number } | null>(null);
  const sx = (x: number) => 75 + x / g.L * 210, sy = (y: number) => 174 - y / g.H * 94;
  const point = (member: number, t: number) => { const q = planarPoint(g, member, t); return { x: sx(q.x), y: sy(q.y) }; };
  const members = planarMembers(g), selected = loads.find(l => l.id === activeId);
  const baseCount = g.kind === 'arch' ? 81 : 2;
  const basePaths = members.map((_, j) => Array.from({ length: baseCount }, (_, i) => point(j, i / (baseCount - 1))));
  const path = (points: XY[]) => points.map((q, i) => `${i ? 'L' : 'M'}${q.x},${q.y}`).join(' ');
  const parameter = (event: React.PointerEvent, member: number) => {
    const matrix = model.current?.getScreenCTM(); if (!matrix) return .5;
    const q = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const a = point(member, 0), b = point(member, 1), dx = b.x - a.x, dy = b.y - a.y;
    return Math.max(0, Math.min(1, g.kind === 'arch' ? (q.x - a.x) / dx : ((q.x - a.x) * dx + (q.y - a.y) * dy) / (dx * dx + dy * dy)));
  };
  const base = <g pointerEvents="none">
    {basePaths.map((points, i) => <path key={i} d={path(points)} stroke={p.ink} strokeWidth="1.8" fill="none" />)}
    {g.kind === 'composite' ? <EngineeringSupport x={75} y={174} kind="fixed" /> : <EngineeringSupport x={75} y={174} />}
    <EngineeringSupport x={285} y={174} roller={g.kind === 'frame'} />
    <g fill={p.ink} fontSize="10"><text x="58" y="177">A</text><text x="299" y="177">B</text>{g.kind !== 'arch' && <><text x="63" y="72">C</text><text x="295" y="72">D</text></>}</g>
    {g.kind === 'arch' ? <><circle cx="180" cy="80" r="3" fill={p.paper} stroke={p.ink} /><text x="180" y="70" textAnchor="middle" fill={p.ink} fontSize="10">C</text></> : g.kind === 'composite' && [75, 285].map(x => <circle key={x} cx={x} cy="80" r="3" fill={p.paper} stroke={p.ink} />)}
  </g>;
  const annotation = (text: string, color: string = p.muted) => <text x="180" y="23" textAnchor="middle" fill={color} fontSize="10">{text}</text>;
  const structure = <svg ref={model} className="engineering-figure beam-model-figure" viewBox="0 0 360 220" width="100%" height="100%" role="group" aria-label="结构与多荷载交互图"
    onPointerMove={e => { const d = drag.current; if (d && d.pointer === e.pointerId) { const delta = parameter(e, d.member) - d.start; if (Math.abs(delta) > 1 / 120) moved.current = true; if (moved.current) { setControlId(null); onMove(d.id, d.member, d.initial + delta); } } }}
    onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
    {annotation(selected ? `${memberLoadNames[selected.type]} ${fmt(selected.magnitude)}${selected.type === 'linear' ? `→${fmt(selected.endMagnitude)}` : ''} ${selected.type === 'moment' ? 'kN·m' : selected.type === 'point' ? 'kN' : 'kN/m'} · ${selected.type === 'moment' ? selected.rotation === 'cw' ? '顺时针' : '逆时针' : `θ=${fmt(selected.angle)}°`}` : '选择荷载后点击杆件定位', p.load)}
    <text x="180" y="39" fill={p.muted} textAnchor="middle" fontSize="9">{g.kind === 'arch' ? '分布荷载按水平投影长度计' : '点击箭头调方向 · 双击反向 · 拖动移动'}</text>
    {base}
    <ForceFlowLayer model={planarFlowModel(g, loads, result, (x, y) => ({ x: sx(x), y: sy(y) }))} />
    {basePaths.map((points, i) => <path key={i} className="beam-position-hit" d={path(points)} stroke="transparent" strokeWidth="14" fill="none" role="button" tabIndex={0} aria-label={`在${members[i].label}设置荷载`}
      onPointerDown={e => { if (e.button === 0) onPlace(i, parameter(e, i)); }}
        onKeyDown={e => { if (e.key === 'Enter') onPlace(i, .5); }} />)}
    {loads.map((l, i) => {
      const active = activeId === l.id, color = active ? p.load : '#748696';
      return <g key={l.id} role="button" tabIndex={0} aria-label={`选择图中荷载 ${i + 1}`} className="beam-drawable-load" onClick={() => { if (!moved.current) { onSelect(l.id); setControlId(l.id); } }} onDoubleClick={e => { e.stopPropagation(); onReverseLoad?.(l.id); setControlId(l.id); }}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(l.id); setControlId(l.id); } }}
        onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); moved.current = false; onSelect(l.id); drag.current = { id: l.id, pointer: e.pointerId, member: l.member, initial: l.type === 'point' || l.type === 'moment' ? l.position : l.start, start: parameter(e, l.member) }; e.currentTarget.setPointerCapture(e.pointerId); }}>
        {l.type === 'point' ? <>{l.magnitude > 0 && <ForceArrow {...point(l.member, l.position)} angle={l.angle} size={active ? 42 : 30} color={color} />}<circle {...{ cx: point(l.member, l.position).x, cy: point(l.member, l.position).y }} r="3" fill={color} /></>
          : l.type === 'moment' ? l.magnitude === 0 ? <circle cx={point(l.member, l.position).x} cy={point(l.member, l.position).y} r="3" fill={color} /> : <g transform={`translate(${point(l.member, l.position).x} ${point(l.member, l.position).y}) scale(${l.rotation === 'cw' ? -1 : 1} 1)`} stroke={color} fill={color}><circle r="17" fill="transparent" stroke="none" /><path d="M0,-12 A12,12 0 1 0 12,0" fill="none" strokeWidth="1.4" /><path d="M12,0 L9,6 L15,6 Z" /></g>
          : Array.from({ length: 9 }, (_, j) => { const ratio = j / 8, q = l.magnitude + (l.type === 'linear' ? (l.endMagnitude - l.magnitude) * ratio : 0), max = Math.max(l.magnitude, l.type === 'linear' ? l.endMagnitude : 0, 1e-8); return <g key={j}>{q > 0 && <ForceArrow {...point(l.member, l.start + (l.end - l.start) * ratio)} angle={l.angle} size={(active ? 34 : 24) * q / max} color={color} />}</g>; })}
      </g>;
    })}
    {selected && controlId === selected.id && onAngleChange && <LoadDirectionControl {...point(selected.member, selected.type === 'point' || selected.type === 'moment' ? selected.position : (selected.start + selected.end) / 2)} moment={selected.type === 'moment'} angle={selected.angle} onAngleChange={angle => onAngleChange(selected.id, angle)} onReverse={() => selected.type === 'moment' ? onReverseLoad?.(selected.id) : onAngleChange(selected.id, normalizeLoadAngle(selected.angle + 180))} onClose={() => setControlId(null)} />}
    <EngineeringDimension left={75} right={285} top={80} base={174} L={g.L} H={g.H} />
  </svg>;
  const plot = (key: 'M' | 'V' | 'N') => {
    const color = key === 'M' ? p.moment : key === 'V' ? p.shear : p.axial, scale = 23 / (reference?.[key] || result.peaks[key] || 1);
    return <svg className="engineering-figure" viewBox="0 0 360 220" width="100%" height="100%" role="img" aria-label={`${key === 'M' ? '弯矩' : key === 'V' ? '剪力' : '轴力'}图`}>
      {annotation(g.kind === 'arch' ? `拱顶 M = ${fmt(result.at(0, .5).M)} kN·m` : g.kind === 'composite' ? 'C、D 铰接处弯矩为零' : '杆件依次沿 A→C→D→B 定向', color)}
      <text x="180" y="40" fill={p.muted} textAnchor="middle" fontSize="9">{key === 'N' ? '轴力正拉负压' : '按各杆件局部方向绘制 · 保留集中作用跳变'}</text>
      {result.diagrams.map((d, i) => {
        const pts = d.data.map((q, j) => {
          const prev = d.data[Math.max(0, j - 1)], next = d.data[Math.min(d.data.length - 1, j + 1)];
          let dx = sx(next.x) - sx(prev.x), dy = sy(next.y) - sy(prev.y);
          if (Math.hypot(dx, dy) < 1e-9) { const a = point(i, Math.max(0, q.t - .001)), b = point(i, Math.min(1, q.t + .001)); dx = b.x - a.x; dy = b.y - a.y; }
          const len = Math.hypot(dx, dy) || 1;
          return { x: sx(q.x) - dy / len * q[key] * scale, y: sy(q.y) + dx / len * q[key] * scale };
        });
        const first = point(i, 0), last = point(i, 1), baseline = [...basePaths[i]].reverse();
        return <g key={i}><path d={`${path(pts)} L${last.x},${last.y} ${path(baseline).replace(/^M/, 'L')} L${first.x},${first.y} Z`} fill={color} fillOpacity=".14" /><path d={path(pts)} fill="none" stroke={color} strokeWidth="1.5" /></g>;
      })}
      {base}
      <text x="180" y="211" textAnchor="middle" fill={color} fontSize="10">{result.diagrams.map((d, i) => `${g.kind === 'arch' ? '全拱' : ['左柱', '横梁', '右柱'][i]} ${fmt(Math.max(...d.data.map(q => Math.abs(q[key]))))}`).join(' · ')} {key === 'M' ? 'kN·m' : 'kN'}</text>
    </svg>;
  };
  return <div className="learning-diagram-grid learning-diagrams-4 engineering-charts">
    {[{ name: '结构示意', key: 'load', detail: `${loads.length} 项荷载`, svg: structure }, ...(['M', 'V', 'N'] as const).map(key => ({ name: { M: '弯矩 M', V: '剪力 V', N: '轴力 N' }[key], key: { M: 'moment', V: 'shear', N: 'axial' }[key], detail: `|${key}|max = ${fmt(result.peaks[key])} ${key === 'M' ? 'kN·m' : 'kN'}`, svg: plot(key) }))].map(card => <div key={card.key} data-chart-tone={card.key} className="learning-chart-card overflow-hidden flex flex-col"><div className="learning-card-header border-b flex items-center justify-between flex-shrink-0"><h3>{card.name}</h3><span>{card.detail}</span></div><div className="learning-card-plot flex-1 min-h-0">{card.svg}</div></div>)}
  </div>;
}
