import { GlobalEquilibrium, SectionEquilibrium } from '../ui/EquilibriumInspector';
import { useQuasiStatic, scaleLoads } from '../../hooks/useQuasiStatic';
import { ForceFlowScope, ForceFlowControls } from '../ui/ForceFlow';
import { normalizeLoadAngle, directionForAngle } from '../../utils/loadDirection';
import React, { useMemo, useState, useEffect } from 'react';
import { SlidersHorizontal, Ruler } from 'lucide-react';
import { Slider } from '../Slider';
import CollapsiblePanel from '../ui/CollapsiblePanel';
import ResultCard from '../ui/ResultCard';
import SolutionSteps from '../ui/SolutionSteps';
import AITutor from '../AITutor';
import MemberLoadEditor, { newMemberLoad, memberLoadSummary } from '../ui/MemberLoadEditor';
import PlanarEngineeringCharts from '../ui/PlanarEngineeringCharts';
import { formatEngineeringValue as fmt } from '../ui/EngineeringFigure';
import { learningChartStyle } from '../ui/learningChartPalette';
import { useAIEngine } from '../../hooks/useAIEngine';
import { planarMembers, solveLearningPlanar, type PlanarKind, type PlanarLoad } from '../../utils/learningPlanar';
const titles = { frame: '静定刚架', arch: '三铰拱', composite: '组合结构' };
export default function StaticPlanar({ kind }: { kind: PlanarKind }) {
  const [L, setL] = useState(kind === 'arch' ? 20 : kind === 'composite' ? 12 : 6), [H, setH] = useState(kind === 'arch' ? 5 : 6);
  const [loads, setLoads] = useState<PlanarLoad[]>(() => kind === 'arch' ? [{ ...newMemberLoad('initial-q', 'uniform'), magnitude: 10 }]
    : [{ ...newMemberLoad('initial-p'), member: 0, magnitude: kind === 'composite' ? 40 : 10, angle: 0, position: kind === 'composite' ? 1 : .5 }, { ...newMemberLoad('initial-q', 'uniform', 1), magnitude: kind === 'composite' ? 15 : 20 }]);
  const [activeId, setActiveId] = useState<string | null>(kind === 'arch' ? 'initial-q' : 'initial-p');
  const geometry = useMemo(() => ({ kind, L, H }), [kind, L, H]), members = planarMembers(geometry);
  const { sync } = useAIEngine({ module: 'static', subModule: kind });
  const playback = useQuasiStatic(JSON.stringify({ geometry, loads }));
  const targetResult = useMemo(() => { try { return solveLearningPlanar(geometry,loads); } catch { return null; } },[geometry,loads]);
  const appliedLoads = useMemo(() => scaleLoads(loads,playback.factor),[loads,playback.factor]);
  const calculation = useMemo(() => { try { return { result: solveLearningPlanar(geometry, appliedLoads), error: '' }; } catch (e) { return { result: null, error: e instanceof Error ? e.message : '请检查参数' }; } }, [geometry, appliedLoads]);
  const { result, error } = calculation;
  const description = kind === 'frame' ? 'A 铰支座 · B 滚动支座 · 梁柱刚接' : kind === 'arch' ? 'A、B 铰支座 · 拱顶 C 内铰 · 抛物线拱轴' : 'A 固定端 · B 铰支座 · C、D 梁端铰接';
  const summary = appliedLoads.map((l, i) => `荷载 ${i + 1}：${memberLoadSummary(l, members)}`).join('\n') || '当前无荷载';
  useEffect(() => { sync({ L, H, loadCount: loads.length, loads: summary, support: description }, result ? { ...result.reactions, ...result.peaks } : { error }); }, [L, H, loads.length, summary, description, result, error, sync]);
  const context = `${titles[kind]}，${description}。L=${L} m，${kind === 'arch' ? '矢高' : '高度'}=${H} m。\n${summary}\n${result ? `反力 ${JSON.stringify(result.reactions)}；最大绝对内力 ${JSON.stringify(result.peaks)}。力单位 kN，弯矩单位 kN·m。` : error}\n${kind === 'arch' ? '分布荷载按水平投影每米计。' : '位置沿所选杆件起点计，相对位置随尺寸同步。'}正角度从向右方向逆时针计，弯矩逆时针为正。`;
  const move = (id: string, member: number, t: number) => setLoads(prev => prev.map(l => {
    if (l.id !== id) return l;
    const position = Math.max(0, Math.min(1, Math.round(t * 10000) / 10000));
    if (l.type === 'point' || l.type === 'moment') return { ...l, member, position };
    const width = l.end - l.start, start = Math.min(1 - width, position);
    return { ...l, member, start, end: start + width };
  }));
  const steps = result ? [
    { title: '分解并叠加所有荷载', equation: 'Fx = P cosθ；Fy = P sinθ\nΣMA,荷载 = Σ(xFy−yFx+C) + ∫(xqᵧ−yqₓ) ds', result: `ΣFx = ${fmt(result.external.x, true)} kN\nΣFy = ${fmt(result.external.y, true)} kN`, explanation: `${loads.length} 项荷载共同加载，局部分布荷载按实际范围与形心积分` },
    { title: '整体平衡求反力', equation: 'ΣFx=0；ΣFy=0；ΣMA=0', result: `Ax=${fmt(result.reactions.Ax, true)}；Ay=${fmt(result.reactions.Ay, true)}\nBx=${fmt(result.reactions.Bx, true)}；By=${fmt(result.reactions.By, true)} kN`, explanation: description },
    ...(kind === 'frame' ? [] : [{ title: '加入内部铰的平衡条件', equation: kind === 'arch' ? 'MC = 0（左半拱对 C 取矩）' : 'MC = 0；MD = 0（分别取柱、梁隔离体）', result: kind === 'composite' ? `MA = ${fmt(result.reactions.MA, true)} kN·m` : `水平推力 Ax = ${fmt(result.reactions.Ax, true)} kN`, explanation: '内部铰传递两个方向的力，不传递弯矩；支座与铰的约束同时满足' }]),
    { title: '逐截面求 M、V、N', equation: 'M = −ΣM截面；N = −ΣF·t\nV = ΣF·n', result: `|M|max=${fmt(result.peaks.M)} kN·m\n|V|max=${fmt(result.peaks.V)}；|N|max=${fmt(result.peaks.N)} kN`, explanation: '沿 A→C→D→B 定向；拱沿 A→C→B。轴力正拉负压，集中作用处保留左右极限', aiWhy: '先取截面一侧作为隔离体，把所有支座反力、集中力、力偶和部分分布荷载加入平衡。水平、斜向荷载也参与弯矩及轴力计算，不能套用单一竖向均布荷载公式。' },
  ] : [];
  return <ForceFlowScope showControls={false} initialField={kind === 'arch' ? 'N' : 'V'} playback={playback} peaks={targetResult?.peaks ?? { N: 0, V: 0, M: 0 }} invalid={!result}><div className="learning-page" style={learningChartStyle as React.CSSProperties}>

    <CollapsiblePanel title="参数" icon="🔧" side="left" storageKey={`param-panel-${kind}`}><div className="beam-parameter-panel beam-multi-load-panel">
      <header className="parameter-panel-heading"><h4><SlidersHorizontal size={14} />参数设置</h4><p>100% 目标荷载 · 修改后恢复满载</p></header>
      <p className="parameter-section-hint">{description}</p>
      <details className="truss-geometry beam-geometry"><summary><Ruler size={12} />几何尺寸<span>{fmt(L)} × {fmt(H)} m</span></summary><div className="truss-geometry-controls">
        <Slider label="跨度 L" value={L} min={4} max={40} step={.1} unit="m" onChange={n => setL(Math.max(.1, n))} /><Slider label={kind === 'arch' ? '矢高 f' : '柱高 H'} value={H} min={1} max={15} step={.1} unit="m" onChange={n => setH(Math.max(.1, n))} />
      </div></details>
      <MemberLoadEditor loads={loads} onChange={setLoads} members={members} activeId={activeId} onSelect={setActiveId} />
      <ForceFlowControls compact />
      <footer className="parameter-panel-footer">{kind === 'arch' ? '位置与分布强度按水平投影计。' : '距离沿所选杆件起点计。'}尺寸改变时，荷载相对位置同步。</footer>
    </div></CollapsiblePanel>
    <div className="learning-analysis-area flex-1 flex flex-col gap-3 min-w-0">
      {result ? <><PlanarEngineeringCharts geometry={geometry} loads={appliedLoads} result={result} activeId={activeId} onSelect={setActiveId} onAngleChange={(id, angle) => setLoads(prev => prev.map(l => l.id === id ? { ...l, angle } : l))} onReverseLoad={id => setLoads(prev => prev.map(l => l.id !== id ? l : l.type === 'moment' ? { ...l, rotation: l.rotation === 'cw' ? 'ccw' : 'cw' } : { ...l, angle: normalizeLoadAngle(l.angle + 180) }))} onMove={move} onPlace={(member, t) => { if (activeId) move(activeId, member, t); else { const id = `draw-${Date.now()}`; setLoads(prev => [...prev, { ...newMemberLoad(id), member, position: t }]); setActiveId(id); } }} />
        <div className="learning-metrics-grid learning-metrics-4"><ResultCard label="A 竖向反力" value={fmt(result.reactions.Ay, true)} unit="kN" color="blue" aiHint={`Ax=${fmt(result.reactions.Ax, true)} kN`} /><ResultCard label="B 竖向反力" value={fmt(result.reactions.By, true)} unit="kN" color="purple" aiHint={kind === 'composite' ? `MA=${fmt(result.reactions.MA, true)} kN·m` : `Bx=${fmt(result.reactions.Bx, true)} kN`} /><ResultCard label="最大绝对弯矩" value={fmt(result.peaks.M)} unit="kN·m" color="red" /><ResultCard label="最大绝对轴力" value={fmt(result.peaks.N)} unit="kN" color="green" /></div>
        <GlobalEquilibrium external={result.external} reaction={{x:result.reactions.Ax+result.reactions.Bx,y:result.reactions.Ay+result.reactions.By,m:result.reactions.MA+result.reactions.By*L}} forceScale={Math.abs(result.reactions.Ax)+Math.abs(result.reactions.Ay)+Math.abs(result.reactions.Bx)+Math.abs(result.reactions.By)} length={L+H} /><SectionEquilibrium members={members.map((m,i)=>({id:String(i),label:m.label,length:m.length,at:t=>result.at(i,t)}))} /><SolutionSteps title="求解过程" steps={steps} />
      </> : <div role="alert" className="truss-calculation-error">{error}</div>}
    </div>
    <CollapsiblePanel title="AI助手" icon="🤖" side="right" defaultOpen={false} storageKey={`ai-panel-${kind}`}><AITutor context={context} moduleTitle={titles[kind]} suggestedQuestions={['多个不同方向的荷载怎么叠加？', '支座反力为什么可能反向？', '内部铰为什么不传弯矩？']} /></CollapsiblePanel>
  </div></ForceFlowScope>;
}
