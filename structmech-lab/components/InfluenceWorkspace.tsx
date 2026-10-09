import { GlobalEquilibrium, SectionEquilibrium } from './ui/EquilibriumInspector';
import { useQuasiStatic, scaleLoads } from '../hooks/useQuasiStatic';
import { normalizeLoadAngle, directionForAngle } from '../utils/loadDirection';
import React, { useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal, Ruler } from 'lucide-react';
import { Slider } from './Slider';
import CollapsiblePanel from './ui/CollapsiblePanel';
import ResultCard from './ui/ResultCard';
import SolutionSteps from './ui/SolutionSteps';
import AITutor from './AITutor';
import MemberLoadEditor, { newMemberLoad, memberLoadSummary } from './ui/MemberLoadEditor';
import { StructureDrawing, ForcePlot } from './ui/BeamEngineeringCharts';
import { ForceFlowScope, ForceFlowControls } from './ui/ForceFlow';
import { learningChartStyle, learningChartPalette as palette } from './ui/learningChartPalette';
import { formatEngineeringValue as fmt } from './ui/EngineeringFigure';
import { solveLearningBeam } from '../utils/learningBeam';
import { type PlanarLoad } from '../utils/learningPlanar';
import { memberLoadsToBeam, translateBeamLoads, influenceResponse, movingEnvelope, type InfluenceTarget } from '../utils/learningInfluence';
import { useAIEngine } from '../hooks/useAIEngine';
const targets: Record<InfluenceTarget, string> = { RA: 'A 竖向反力', RB: 'B 竖向反力', Mc: '截面 C 弯矩', Qc: '截面 C 剪力', Nc: '截面 C 轴力' };
function ResponsePlot({ data, title, unit, color, cursor }: { data: { x: number; max: number; min: number }[]; title: string; unit: string; color: string; cursor?: { x: number; value: number } }) {
  const L = data.at(-1)?.x || 1, high = Math.max(0, ...data.map(p => p.max), cursor?.value ?? 0), low = Math.min(0, ...data.map(p => p.min), cursor?.value ?? 0), range = Math.max(high - low, .01);
  const sy = (v: number) => 164 - (v - low) / range * 124, sx = (x: number) => 45 + x / L * 267;
  const line = (key: 'max' | 'min') => data.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x)},${sy(p[key])}`).join(' ');
  return <svg className="engineering-figure" width="100%" height="100%" viewBox="0 0 360 220" role="img" aria-label={title}>
    <text x="45" y="20" fill={color} fontSize="10">{title} ({unit || '无量纲'})</text>
    {[0, 1, 2, 3, 4].map(i => <g key={i}><line x1="45" x2="312" y1={sy(low + range * i / 4)} y2={sy(low + range * i / 4)} stroke={palette.grid} strokeWidth=".7" /><text x="38" y={sy(low + range * i / 4) + 3} textAnchor="end" fill={palette.muted} fontSize="9">{fmt(low + range * i / 4)}</text><text x={sx(L * i / 4)} y="185" textAnchor="middle" fill={palette.muted} fontSize="9">{fmt(L * i / 4)}</text></g>)}
    <path d={`${line('max')} ${data.slice().reverse().map(p => `L${sx(p.x)},${sy(p.min)}`).join(' ')} Z`} fill={color} fillOpacity=".14" />
    <path d={line('max')} fill="none" stroke={color} strokeWidth="1.7" /><path d={line('min')} fill="none" stroke={palette.shear} strokeWidth="1.3" />
    <path d="M45,40 V164 H312" fill="none" stroke={palette.axis} strokeWidth=".9" /><line x1="45" x2="312" y1={sy(0)} y2={sy(0)} stroke={palette.axis} strokeWidth=".7" />
    {cursor && <g><line x1={sx(cursor.x)} x2={sx(cursor.x)} y1="40" y2="164" stroke={palette.section} strokeDasharray="3 4" /><circle cx={sx(cursor.x)} cy={sy(cursor.value)} r="3" fill={color} /><text x={Math.max(60, Math.min(295, sx(cursor.x)))} y={Math.max(51, sy(cursor.value) - 9)} textAnchor="middle" fill={color} fontSize="10">{fmt(cursor.value)}</text></g>}
    <text x="312" y="202" fill={palette.muted} textAnchor="end" fontSize="9">x (m)</text>
    <text x="45" y="215" fill={palette.muted} fontSize="9">{cursor ? '标准单位荷载影响线 · 截面剪力保留跳变' : '上包络为最大值，下包络为最小值'}</text>
  </svg>;
}
export default function InfluenceWorkspace({ mode }: { mode: 'application' | 'envelope' }) {
  const moving = mode === 'envelope', title = moving ? '内力包络图' : '影响线应用';
  const [L, setL] = useState(10), [groupLength, setGroupLength] = useState(10), [section, setSection] = useState(.4), [target, setTarget] = useState<InfluenceTarget>('Mc'), [shift, setShift] = useState(0);
  const [loads, setLoads] = useState<PlanarLoad[]>(() => moving ? [0, .2, .4].map((position, i) => ({ ...newMemberLoad(`axle-${i}`), magnitude: [80, 100, 60][i], position })) : [{ ...newMemberLoad('app-p'), magnitude: 50 }]);
  const [activeId, setActiveId] = useState<string | null>(moving ? 'axle-0' : 'app-p');
  const { sync } = useAIEngine({ module: 'influence', subModule: mode });
  const memberLength = moving ? groupLength : L, members = [{ label: moving ? '移动轨迹（相对组起点）' : '梁 A–B（从左向右）', length: memberLength }];
  const raw = useMemo(() => memberLoadsToBeam(loads, memberLength), [loads, memberLength]);
  const targetApplied = useMemo(() => moving ? translateBeamLoads(raw, shift, L) : raw, [moving, raw, shift, L]);
  const playback = useQuasiStatic(JSON.stringify({ L, section, target, shift, raw }));
  const applied = useMemo(() => scaleLoads(targetApplied,playback.factor),[targetApplied,playback.factor]);
  const targetDiagram = useMemo(() => solveLearningBeam({ beamType: 'simple', L, overhang: 0, loads: targetApplied }),[L,targetApplied]);
  const input = useMemo(() => ({ beamType: 'simple' as const, L, overhang: 0, loads: applied }), [L, applied]);
  const diagram = useMemo(() => solveLearningBeam(input), [input]), c = section * L;
  const response = influenceResponse(L, applied, c, target);
  const targetEnvelope = useMemo(() => moving ? movingEnvelope(L, raw, target) : [], [moving,L,raw,target]);
  const envelope = useMemo(() => targetEnvelope.map(p => ({...p,max:p.max*playback.factor,min:p.min*playback.factor})),[targetEnvelope,playback.factor]);
  const max = moving ? Math.max(0, ...envelope.map(p => p.max)) : diagram.Mmax, min = moving ? Math.min(0, ...envelope.map(p => p.min)) : 0;
  const peak = moving ? envelope.reduce((a, p) => Math.max(Math.abs(p.max), Math.abs(p.min)) > Math.max(Math.abs(a.max), Math.abs(a.min)) ? p : a, envelope[0]) : null;
  const unit = target === 'Mc' ? 'kN·m' : 'kN';
  const il = useMemo(() => {
    const xs = [...new Set([...Array.from({ length: 101 }, (_, i) => i / 100 * L), c])].sort((a, b) => a - b);
    const value = (x: number) => influenceResponse(L, [{ id: 'unit', type: 'point', position: x, magnitude: 1, angle: target === 'Nc' ? 0 : -90 }], c, target);
    return xs.flatMap(x => Math.abs(x - c) < 1e-9 && (target === 'Qc' || target === 'Nc')
      ? target === 'Qc' ? [{ x, max: -c / L, min: -c / L }, { x, max: (L - c) / L, min: (L - c) / L }] : [{ x, max: 0, min: 0 }, { x, max: 1, min: 1 }]
      : [{ x, max: value(x), min: value(x) }]);
  }, [L, c, target]);
  const activeApplied = applied.find(l => l.id === activeId);
  const probe = activeApplied && 'position' in activeApplied ? activeApplied.position : c;
  const ordinate = influenceResponse(L, [{ id: 'probe', type: 'point', position: probe, magnitude: 1, angle: target === 'Nc' ? 0 : -90 }], c, target);
  const summary = scaleLoads<PlanarLoad>(loads,playback.factor).map((l, i) => `荷载 ${i + 1}：${memberLoadSummary(l, members)}`).join('\n') || '当前无荷载';
  useEffect(() => { sync({ L, section: c, target, shift, loads: summary }, { response, max, min }); }, [L, c, target, shift, summary, response, max, min, sync]);
  const context = `${title}；简支梁 L=${L}m，截面 C=${c}m，目标${targets[target]}。\n${summary}\n${moving ? `组起点平移 ${shift}m；仅入跨部分参与，局部线性分布荷载保留原始强度。包络极值为 ${max} 至 ${min} ${unit}。` : '多项荷载同时作用，集中力、部分线性分布荷载与力偶分别叠加。'}\n当前截面响应=${response} ${unit}。标准影响线采用向下的单位竖向力；轴力影响线采用向右的单位水平力。`;
  const move = (id: string, position: number) => setLoads(prev => prev.map(l => {
    if (l.id !== id) return l;
    const t = Math.max(0, Math.min(1, (position - (moving ? shift : 0)) / memberLength));
    if (l.type === 'point' || l.type === 'moment') return { ...l, position: t };
    const width = l.end - l.start, start = Math.min(1 - width, t); return { ...l, start, end: start + width };
  }));
  const structure = <StructureDrawing input={input} diagram={diagram} beamLabel="简支梁" activeId={activeId} emptyHint={moving ? '调整荷载组起点，查看入跨与出跨' : undefined} onSelectLoad={setActiveId} onAngleChange={(id, angle) => setLoads(prev => prev.map(l => l.id === id ? { ...l, angle } : l))} onReverseLoad={id => setLoads(prev => prev.map(l => l.id !== id ? l : l.type === 'moment' ? { ...l, rotation: l.rotation === 'cw' ? 'ccw' : 'cw' } : { ...l, angle: normalizeLoadAngle(l.angle + 180) }))} onMoveLoad={move} onPlaceLoad={x => { if (activeId) move(activeId, x); else { const id = `draw-${Date.now()}`; setLoads(prev => [...prev, { ...newMemberLoad(id), position: Math.max(0, Math.min(1, (x - (moving ? shift : 0)) / memberLength)) }]); setActiveId(id); } }} />;
  const cards = moving ? [{ title: `${targets[target]}包络`, detail: `${fmt(min)}–${fmt(max)} ${unit}`, svg: <ResponsePlot data={envelope} title={`${targets[target]}包络`} unit={unit} color={palette.moment} /> }, { title: '当前荷载组位置', detail: `组起点 x=${fmt(shift)} m`, svg: structure }]
    : [{ title: '荷载组合', detail: `${loads.length} 项共同加载`, svg: structure }, { title: `${targets[target]}影响线`, detail: '标准单位荷载', svg: <ResponsePlot data={il} title={`${targets[target]}影响线`} unit={target === 'Mc' ? 'm' : ''} color={palette.moment} cursor={{ x: probe, value: ordinate }} /> }];
  cards.push(...(['moment', 'shear', 'axial'] as const).map(kind => ({ title: { moment: '当前弯矩 M', shear: '当前剪力 V', axial: '当前轴力 N' }[kind], detail: `${fmt(diagram[kind === 'moment' ? 'Mmax' : kind === 'shear' ? 'Vmax' : 'Nmax'])} ${kind === 'moment' ? 'kN·m' : 'kN'}`, svg: <ForcePlot input={input} diagram={diagram} kind={kind} /> })));
  const steps = [
    { title: '定义可编辑荷载组合', equation: `${loads.length} 项集中力、分布荷载或力偶共同作用`, result: `${targets[target]}；截面 x=${fmt(c)} m`, explanation: '每项荷载可独立调整大小、方向、位置与加载区间' },
    { title: moving ? '整体移动并截取入跨部分' : '逐项积分与叠加', equation: moving ? 'x实际 = x组内 + x组起点；x实际 ∈ [0,L]' : target === 'Nc' ? 'N = ΣPx·y(xᵢ) + ∫qx(x)y(x) dx' : 'S = Σ(−Py)·y(xᵢ) + ∫(−qy)y(x) dx\n+ 力偶贡献（列力矩平衡）', result: `当前 S = ${fmt(response, true)} ${unit}`, explanation: '竖向力向上为正，标准竖向影响线采用向下单位力；水平分量参与轴力计算；线性荷载按实际强度积分' },
    ...(moving ? [{ title: '移动荷载求上下包络', equation: 'Smax(x)=max S(x,平移量)；Smin(x)=min S(x,平移量)', result: `${fmt(min)} 至 ${fmt(max)} ${unit}`, explanation: '计入支座与截面的荷载跨越位置；分布荷载另用密集扫描，截面极值为数值近似' }] : []),
    { title: '校核与当前内力图', equation: 'ΣFx=0；ΣFy=0；ΣMA=0', result: `Ay=${fmt(diagram.RA, true)}；By=${fmt(diagram.RB, true)} kN`, explanation: '改变任何荷载后，结构示意、内力图及结果同步更新' },
  ];
  return <ForceFlowScope showControls={false} playback={playback} peaks={{ N: targetDiagram.Nmax, V: targetDiagram.Vmax, M: targetDiagram.Mmax }}><div className="learning-page" style={learningChartStyle as React.CSSProperties}>
    <CollapsiblePanel title="参数" icon="🔧" side="left" storageKey={`param-panel-il-${mode}`}><div className="beam-parameter-panel beam-multi-load-panel">
      <header className="parameter-panel-heading"><h4><SlidersHorizontal size={14} />参数设置</h4><p>{moving ? '自定义荷载组 · 入跨与出跨' : '实际组合荷载 · 截面响应'}</p></header>
      <details className="truss-geometry beam-geometry"><summary><Ruler size={12} />几何与截面<span>L={fmt(L)} m</span></summary><div className="truss-geometry-controls"><Slider label="跨度 L" value={L} min={4} max={40} step={.1} unit="m" onChange={v => setL(Math.max(.1, v))} /><Slider label="截面 C 位置" value={section * 100} min={1} max={99} step={.1} unit="%" onChange={v => setSection(Math.max(.001, Math.min(.999, v / 100)))} />{moving && <Slider label="荷载组编辑长度" value={groupLength} min={1} max={50} step={.1} unit="m" onChange={v => setGroupLength(Math.max(.1, v))} />}</div></details>
      <label className="influence-target-control">分析目标<select aria-label="分析目标" className="beam-new-load-kind" value={target} onChange={e => setTarget(e.target.value as InfluenceTarget)}>{Object.entries(targets).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      {moving && <><Slider label="荷载组起点" value={shift} min={-groupLength} max={L + groupLength} step={.1} unit="m" onChange={setShift} />{peak && <button className="influence-critical-button" type="button" onClick={() => { setShift(Math.abs(peak.max) >= Math.abs(peak.min) ? peak.maxShift : peak.minShift); setSection(peak.x / L); }}>定位当前最不利荷载位置</button>}</>}
      <MemberLoadEditor loads={loads} onChange={setLoads} members={members} activeId={activeId} onSelect={setActiveId} note={moving ? '各荷载偏移可单独编辑，荷载组整体平移；出跨部分不参与。' : '任意组合实际荷载；标准单位荷载影响线用于对照。'} />
      <ForceFlowControls compact /><footer className="parameter-panel-footer">{moving ? '不等荷载、任意间距、局部分布荷载均参与移动组合。' : '集中力与力偶的位置、分布荷载的范围均可独立调整。'}</footer>
    </div></CollapsiblePanel>
    <div className="learning-analysis-area flex-1 flex flex-col gap-3 min-w-0"><div className="learning-diagram-grid learning-diagrams-4 engineering-charts">{cards.map(card => <div key={card.title} className="learning-chart-card overflow-hidden flex flex-col"><div className="learning-card-header border-b flex items-center justify-between flex-shrink-0"><h3>{card.title}</h3><span>{card.detail}</span></div><div className="learning-card-plot flex-1 min-h-0">{card.svg}</div></div>)}</div>
      <div className="learning-metrics-grid learning-metrics-4"><ResultCard label="当前目标响应" value={fmt(response, true)} unit={unit} color="blue" /><ResultCard label={moving ? '上包络最大值' : '最大绝对弯矩'} value={fmt(max)} unit={moving ? unit : 'kN·m'} color="red" /><ResultCard label={moving ? '下包络最小值' : 'A 竖向反力'} value={fmt(moving ? min : diagram.RA, true)} unit={moving ? unit : 'kN'} color="green" /><ResultCard label="荷载数量" value={String(loads.length)} unit="项" color="purple" /></div><GlobalEquilibrium external={{x:diagram.resultant.x,y:diagram.resultant.y,m:diagram.resultant.moment}} reaction={{x:diagram.Ax,y:diagram.RA+diagram.RB,m:diagram.RB*L}} forceScale={Math.abs(diagram.Ax)+Math.abs(diagram.RA)+Math.abs(diagram.RB)} length={L} /><SectionEquilibrium members={[{id:'beam',label:'简支梁 A–B',length:L,at:t=>({N:diagram.axialAt(t*L),V:diagram.shearAt(t*L),M:diagram.momentAt(t*L)})}]} /><SolutionSteps title="求解过程" steps={steps} />
    </div><CollapsiblePanel title="AI助手" icon="🤖" side="right" defaultOpen={false} storageKey={`ai-panel-il-${mode}`}><AITutor context={context} moduleTitle={title} suggestedQuestions={['多个荷载怎么用影响线叠加？', '局部分布荷载怎样积分？', '为什么会出现负包络？']} /></CollapsiblePanel>
  </div></ForceFlowScope>;
}
