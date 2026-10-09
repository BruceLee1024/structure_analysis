import React, { useState } from 'react';
import LoadDirectionControl from './LoadDirectionControl';
import { normalizeLoadAngle } from '../../utils/loadDirection';
import { learningChartPalette as palette } from './learningChartPalette';
import { EngineeringFigure, EngineeringSupport, EngineeringDimension, engineeringInk as INK, engineeringMuted as MUTED, formatEngineeringValue as number } from './EngineeringFigure';
import { TRUSS_MEMBERS, type LearningTrussResult, type TrussNodeLoad, type TrussNodeName } from '../../utils/learningTruss';
import { ForceFlowLayer } from './ForceFlow';
import { trussFlowModel } from '../../utils/forceFlowModels';

interface Props {
  L: number; H: number; showAxial: boolean; loads: TrussNodeLoad[]; result: LearningTrussResult;
  activeId?: string | null; onSelectLoad?: (id: string) => void; onAngleChange?: (id: string, angle: number) => void;
  activeNode?: TrussNodeName; activeLoadLabel?: string; onSelectNode?: (node: TrussNodeName) => void;
}
function ForceArrow({ x, y, fx, fy, color, outward = false }: { x: number; y: number; fx: number; fy: number; color: string; outward?: boolean }) {
  const magnitude = Math.hypot(fx, fy);
  if (magnitude < 1e-8) return null;
  const ux = fx / magnitude, uy = -fy / magnitude;
  const tipX = x + ux * (outward ? 38 : -6), tipY = y + uy * (outward ? 38 : -6);
  const baseX = tipX - ux * 7, baseY = tipY - uy * 7;
  return <g stroke={color} fill={color} strokeWidth="1.4" pointerEvents="none">
    <line x1={x + ux * (outward ? 6 : -38)} y1={y + uy * (outward ? 6 : -38)} x2={tipX} y2={tipY} />
    <path d={`M ${tipX},${tipY} L ${baseX - uy * 3},${baseY + ux * 3} L ${baseX + uy * 3},${baseY - ux * 3} Z`} stroke="none" />
  </g>;
}

export default function TrussEngineeringCharts({ L, H, showAxial, loads, result, activeNode, activeLoadLabel, onSelectNode, activeId, onSelectLoad, onAngleChange }: Props) {
  const [controlId, setControlId] = useState<string | null>(null);
  const selectedLoad = loads.find(l => l.id === activeId);
  const baseY = 160;
  const topY = baseY - Math.max(32, Math.min(80, 240 * H / L));
  const nodes = Object.fromEntries(result.joints.map(j => [j.name, { x: 60 + 240 * j.x / L, y: j.y === 0 ? baseY : topY }])) as Record<TrussNodeName, { x: number; y: number }>;
  const colorFor = (value: number) => Math.abs(value) < 1e-8 ? palette.axis : value > 0 ? palette.tension : palette.compression;
  const members = <g fill="none" stroke={INK} strokeWidth="1.4" strokeLinecap="round">{TRUSS_MEMBERS.map(member => {
    const a = nodes[member.start], b = nodes[member.end];
    return <line key={member.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
  })}</g>;
  const joints = (interactive = false) => <>
    <EngineeringSupport x={nodes.A.x} y={baseY} /><EngineeringSupport x={nodes.B.x} y={baseY} roller />
    {result.joints.map(joint => {
      const n = nodes[joint.name];
      return <g key={joint.name} role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? `${activeLoadLabel ? '将荷载移到' : '添加荷载到'}节点 ${joint.name}` : undefined}
        className={interactive ? 'truss-selectable-joint' : undefined} onClick={interactive ? () => onSelectNode?.(joint.name) : undefined}
        onKeyDown={interactive ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectNode?.(joint.name); } } : undefined}>
        {interactive && <circle className="truss-joint-hit" cx={n.x} cy={n.y} r="9" fill={activeNode === joint.name ? '#d7edf0' : 'transparent'} stroke={activeNode === joint.name ? palette.shear : 'transparent'} />}
        <circle cx={n.x} cy={n.y} r="2.7" fill="#fff" stroke={INK} strokeWidth="1.1" />
        <text x={n.x + (joint.name === 'A' ? -16 : joint.name === 'B' ? 16 : 0)} y={n.y + (n.y === topY ? -11 : 15)} textAnchor="middle" fill={INK} fontSize="10" fontWeight="600">{joint.name}</text>
      </g>;
    })}
  </>;
  const caption = <text x="180" y="37" textAnchor="middle" fill={MUTED} fontSize="10">蓝色受拉 · 玫红受压 · 浅灰为零杆</text>;
  const groupFigure = (group: 'chord' | 'web', title: string) => {
    const selected = TRUSS_MEMBERS.filter(m => m.group === group);
    const maximum = Math.max(0, ...selected.map(m => Math.abs(result.forces[m.id])));
    return <EngineeringFigure tone="axial" title={title} detail={`|N|max = ${number(maximum)} kN`}>
      <g data-annotation-band="true"><text x="180" y="20" textAnchor="middle" fill={palette.axial} fontSize="12" fontWeight="600">{title} · 正拉负压</text>{caption}</g>
      <g data-force-geometry="true">{members}{selected.map(member => {
        const a = nodes[member.start], b = nodes[member.end], value = result.forces[member.id];
        const zero = Math.abs(value) < 1e-8;
        const vertical = member.id === 'CE' || member.id === 'DG';
        const labelX = (a.x + b.x) / 2 + (vertical ? member.id === 'CE' ? -14 : 14 : 0);
        const labelY = group === 'chord' ? (member.id === 'CD' ? topY - 12 : baseY + 29) : (a.y + b.y) / 2 - 7;
        return <g key={member.id}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={colorFor(value)} strokeWidth={zero ? 1.4 : 2.8} strokeDasharray={zero ? '3 3' : undefined}><title>{member.id}：{number(value, true)} kN</title></line>
          {showAxial && !zero && <text x={labelX} y={labelY} fill={colorFor(value)} textAnchor="middle" fontSize="10" fontWeight="600" stroke={palette.paper} strokeWidth="3" paintOrder="stroke">{number(value, true)}</text>}</g>;
      })}{joints()}</g>
      <text x="180" y="212" textAnchor="middle" fill={MUTED} fontSize="10">{group === 'chord' ? 'AE · EF · FG · GB · CD' : 'AC · CF · FD · DB · CE · DG'} · N (kN)</text>
    </EngineeringFigure>;
  };
  const { ax, ay, by } = result.reactions;
  return <div className="learning-diagram-grid learning-diagrams-4 engineering-charts truss-engineering-charts">
    <EngineeringFigure tone="load" title="结构示意" detail={`${loads.length} 项荷载 · L = ${number(L)} m`} structure interactive>
      <g data-annotation-band="true"><text x="180" y="20" textAnchor="middle" fill={palette.load} fontSize="11" fontWeight="600">{loads.length ? '各项节点荷载 (kN) · 同节点计算叠加' : '当前无荷载'}</text>
        <text x="180" y="37" textAnchor="middle" fill={MUTED} fontSize="10">{activeLoadLabel ? `${activeLoadLabel} · 点击箭头调方向，节点调位置` : '点击节点添加荷载'}</text></g>
      {members}
      <ForceFlowLayer model={trussFlowModel(result, (x, y) => ({ x: 60 + 240 * x / L, y: y === 0 ? baseY : topY }))} />
      <g>{[...loads.filter(l => l.id !== activeId), ...loads.filter(l => l.id === activeId)].map(load => {
        const n = nodes[load.node], a = load.angle * Math.PI / 180, fx = load.magnitude * Math.cos(a), fy = load.magnitude * Math.sin(a);
        const outward = fy > 0, ux = Math.cos(a), uy = -Math.sin(a), i = loads.findIndex(l => l.id === load.id);
        const tailX = n.x + ux * (outward ? 38 : -38), tailY = n.y + uy * (outward ? 38 : -38);
        const select = () => { onSelectLoad?.(load.id); setControlId(load.id); };
        return <g key={load.id} role="button" tabIndex={0} className="beam-drawable-load" aria-label={`选择图中荷载 ${i + 1}`} onClick={select} onDoubleClick={e => { e.stopPropagation(); onAngleChange?.(load.id, normalizeLoadAngle(load.angle + 180)); select(); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); } }}>
          <title>荷载 {i + 1} · {load.node} · {number(load.magnitude)} kN · {load.angle}°</title>
          <line x1={n.x} y1={n.y} x2={tailX} y2={tailY} stroke="transparent" strokeWidth="14" />
          <ForceArrow x={n.x} y={n.y} fx={fx} fy={fy} color={load.id === activeId ? palette.load : '#748696'} outward={outward} />
          {load.magnitude > 1e-8 && <text x={Math.max(28, Math.min(332, tailX + 5))} y={Math.max(55, Math.min(145, tailY - 5))} fill={palette.load} fontSize="9" fontWeight="600" textAnchor="middle" stroke={palette.paper} strokeWidth="3" paintOrder="stroke" pointerEvents="none">{number(load.magnitude)}</text>}
        </g>;
      })}</g>
      {joints(true)}<EngineeringDimension left={60} right={300} top={topY} base={baseY} L={L} H={H} />
      {selectedLoad && controlId === selectedLoad.id && onAngleChange && <LoadDirectionControl {...nodes[selectedLoad.node]} angle={selectedLoad.angle} onAngleChange={angle => onAngleChange(selectedLoad.id, angle)} onReverse={() => onAngleChange(selectedLoad.id, normalizeLoadAngle(selectedLoad.angle + 180))} onClose={() => setControlId(null)} />}
    </EngineeringFigure>
    {groupFigure('chord', '弦杆轴力')}{groupFigure('web', '腹杆轴力')}
    <EngineeringFigure tone="shear" title="支座反力" detail="向右、向上为正">
      <g data-annotation-band="true" textAnchor="middle"><text x="180" y="20" fill={palette.shear} fontSize="11" fontWeight="600">Ay = {number(ay, true)} · By = {number(by, true)} kN</text>
        <text x="180" y="37" fill={MUTED} fontSize="10">Ax = {number(ax, true)} kN · A 铰支座 / B 滚动支座</text></g>
      <g data-force-geometry="true">{members}{joints()}<ForceArrow x={40} y={baseY} fx={0} fy={ay} color={palette.shear} /><ForceArrow x={320} y={baseY} fx={0} fy={by} color={palette.shear} />
        <ForceArrow x={nodes.A.x} y={baseY - 22} fx={ax} fy={0} color={palette.shear} /></g>
      <text x="180" y="212" textAnchor="middle" fill={MUTED} fontSize="10">按当前全部荷载求整体平衡</text>
    </EngineeringFigure>
  </div>;
}
