import { TrussJointEquilibrium } from '../ui/EquilibriumInspector';
import { useQuasiStatic, scaleLoads } from '../../hooks/useQuasiStatic';
import { ForceFlowScope, ForceFlowControls } from '../ui/ForceFlow';
import { directionForAngle } from '../../utils/loadDirection';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Ruler, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Slider } from '../Slider';
import { NumericLoadInput as NumericEntry } from '../ui/LoadInput';
import AITutor from '../AITutor';
import ResultCard from '../ui/ResultCard';
import SolutionSteps from '../ui/SolutionSteps';
import CollapsiblePanel from '../ui/CollapsiblePanel';
import AIBubble from '../ui/AIBubble';
import LearningMilestone from '../ui/LearningMilestone';
import TrussEngineeringCharts from '../ui/TrussEngineeringCharts';
import { learningChartStyle } from '../ui/learningChartPalette';
import { formatEngineeringValue as number } from '../ui/EngineeringFigure';
import { useAIEngine } from '../../hooks/useAIEngine';
import { solveLearningTruss, trussLoadComponents, TRUSS_MEMBERS, TRUSS_NODE_NAMES, type TrussNodeLoad, type TrussNodeName, type LearningTrussResult } from '../../utils/learningTruss';

type Direction = 'down' | 'up' | 'left' | 'right' | 'custom';
type EditableLoad = TrussNodeLoad & { direction: Direction };
const angles: Record<Exclude<Direction, 'custom'>, number> = { down: -90, up: 90, left: 180, right: 0 };

export default function StaticTruss() {
  const [L, setL] = useState(12), [H, setH] = useState(4);
  const [loads, setLoads] = useState<EditableLoad[]>([{ id: 'load-1', node: 'F', magnitude: 50, angle: -90, direction: 'down' }]);
  const serial = useRef(2);
  const [activeId, setActiveId] = useState<string | null>('load-1');
  const [showAxial, setShowAxial] = useState(true);
  const { bubble, sync, milestone, dismissMilestone } = useAIEngine({ module: 'static', subModule: 'truss' });
  const playback = useQuasiStatic(JSON.stringify({ L, H, loads }));
  const targetResult = useMemo(() => { try { return solveLearningTruss(L,H,loads); } catch { return null; } },[L,H,loads]);
  const appliedLoads = useMemo(() => scaleLoads(loads, playback.factor),[loads,playback.factor]);
  const calculation = useMemo<{ result: LearningTrussResult | null; error: string }>(() => {
    try { return { result: solveLearningTruss(L, H, appliedLoads), error: '' }; }
    catch (error) { return { result: null, error: error instanceof Error ? error.message : '请检查参数' }; }
  }, [L, H, appliedLoads]);
  const { result, error } = calculation;
  const activeLoad = loads.find(load => load.id === activeId);
  const activeIndex = loads.findIndex(load => load.id === activeId);
  const patchLoad = (id: string, change: Partial<EditableLoad>) => setLoads(prev => prev.map(load => load.id === id ? { ...load, ...change } : load));
  const addLoad = (node: TrussNodeName = 'F') => {
    const id = `load-${serial.current++}`;
    setLoads(prev => [...prev, { id, node, magnitude: 20, angle: -90, direction: 'down' }]);
    setActiveId(id);
  };
  const removeLoad = (id: string) => {
    setLoads(prev => prev.filter(load => load.id !== id));
    if (activeId === id) setActiveId(loads.find(load => load.id !== id)?.id ?? null);
  };
  const loadSummary = appliedLoads.map((load, i) => {
    const force = trussLoadComponents(load);
    return `荷载${i + 1}: 节点${load.node}, ${number(load.magnitude)} kN, ${number(load.angle)}°, Fx=${number(force.x, true)}, Fy=${number(force.y, true)} kN`;
  }).join('\n') || '无外荷载';
  useEffect(() => {
    const lower = result ? Math.min(...['AE', 'EF', 'FG', 'GB'].map(id => result.forces[id])) : 0;
    sync({ L, H, loads: loadSummary, loadCount: loads.length }, result ? {
      RA: result.reactions.ay, RB: result.reactions.by, Ax: result.reactions.ax,
      N_bottom: lower, N_top: result.forces.CD, memberForces: JSON.stringify(result.forces),
    } : { status: error, N_bottom: 0, N_top: 0 });
  }, [L, H, loadSummary, loads.length, result, error, sync]);
  const context = `模块: 静定桁架\n跨度 L=${number(L)} m，高度 H=${number(H)} m\n当前荷载（0°向右，90°向上）：\n${loadSummary}\n` + (result
    ? `支座反力: Ax=${number(result.reactions.ax, true)}, Ay=${number(result.reactions.ay, true)}, By=${number(result.reactions.by, true)} kN\n各杆轴力（正拉负压）: ${TRUSS_MEMBERS.map(m => `${m.id}=${number(result.forces[m.id], true)}`).join(', ')} kN。CE、DG 为实际竖杆。`
    : `当前未得到有效结果：${error}`);
  const solveSteps = result ? [
    { title: '分解节点荷载', equation: 'Px = P cosθ；Py = P sinθ', result: `ΣPx = ${number(result.resultant.x, true)} kN\nΣPy = ${number(result.resultant.y, true)} kN`, explanation: `${loads.length} 项荷载按节点叠加；0°向右、90°向上`, aiWhy: '先把每个荷载分解为水平与竖向分量。同节点的分量可以相加，整体平衡还需保留各节点的位置。' },
    { title: '整体对 A 取矩', equation: `By × ${number(L)} + (${number(result.resultant.moment)}) = 0`, result: `By = ${number(result.reactions.by, true)} kN`, explanation: '外荷载矩 Σ(x·Py − y·Px)，逆时针为正', aiWhy: '在 A 点取矩可消去 Ax 和 Ay。高处的水平荷载也有力矩，因此反力不一定左右相等。' },
    { title: '求 A 支座反力', equation: 'Ax = −ΣPx；Ay = −ΣPy − By', result: `Ax = ${number(result.reactions.ax, true)} kN\nAy = ${number(result.reactions.ay, true)} kN`, explanation: '支座反力以向右、向上为正' },
    { title: '逐节点求杆件轴力', equation: 'Σ(N cosα) + Px + Rx = 0\nΣ(N sinα) + Py + Ry = 0', result: '11 根杆件独立求解', explanation: '7 个节点，共 14 个平衡方程', aiWhy: '先假定所有杆件受拉，杆力沿杆轴离开节点。求出的正值为拉力，负值为压力；非对称荷载下不能直接套用对称结果。' },
    { title: '核对节点平衡', equation: '检查每个节点的 ΣFx 与 ΣFy', result: `最大残差 ${result.jointResidual.toExponential(1)} kN`, explanation: '所有杆件的数值见杆件轴力表' },
  ] : [];

  return <ForceFlowScope playback={playback} showControls={false} initialField="N" fields={['N']} peaks={{ N: Math.max(0, ...Object.values(targetResult?.forces ?? {}).map(Math.abs)), V: 0, M: 0 }} invalid={!result}><div className="learning-page" style={learningChartStyle as React.CSSProperties}>

    <CollapsiblePanel title="参数" icon="🔧" side="left" storageKey="param-panel-truss">
      <div className="beam-parameter-panel truss-parameter-panel">
        <div className="parameter-panel-heading"><h4><SlidersHorizontal size={14} />参数设置</h4><p>100% 目标荷载 · 修改后恢复满载</p></div>
        <details className="truss-geometry" open><summary><Ruler size={12} />几何尺寸<span>L {number(L)} · H {number(H)} m</span></summary><div className="truss-geometry-controls">
          <Slider label="桁架跨度 L" value={L} min={8} max={24} unit="m" onChange={n => setL(Math.max(0.1, n))} />
          <Slider label="桁架高度 H" value={H} min={2} max={8} step={0.5} unit="m" onChange={n => setH(Math.max(0.1, n))} />
          <p className="parameter-section-hint">H/L = {(H / L).toFixed(2)} · α = {(Math.atan2(H, L / 4) * 180 / Math.PI).toFixed(1)}°</p>
        </div></details>
        <section className="truss-load-editor" aria-label="节点荷载编辑器">
          <div className="truss-load-heading"><span>节点荷载 <small>{loads.length} 项</small></span><button type="button" onClick={() => addLoad()}><Plus size={12} />新增</button></div>
          <p className="truss-load-guide">选中荷载，再点击图中节点可调整位置。</p>
          {loads.map((load, i) => <div className={`truss-load-card ${load.id === activeId ? 'is-active' : ''}`} key={load.id} onFocus={() => setActiveId(load.id)}>
            <div className="truss-load-card-heading"><button type="button" aria-label={`选择荷载 ${i + 1}`} aria-pressed={load.id === activeId} onClick={() => setActiveId(load.id)}><i />荷载 {i + 1}<span>{load.node}</span></button>
              <button className="truss-load-remove" type="button" aria-label={`删除荷载 ${i + 1}`} onClick={() => removeLoad(load.id)}><Trash2 size={12} /></button></div>
            <div className="truss-load-fields">
              <label><span>作用节点</span><select aria-label={`荷载 ${i + 1} 作用节点`} value={load.node} onChange={e => { patchLoad(load.id, { node: e.target.value as TrussNodeName }); setActiveId(load.id); }}>{TRUSS_NODE_NAMES.map(node => <option key={node} value={node}>节点 {node}</option>)}</select></label>
              <label><span>大小</span><NumericEntry value={load.magnitude} unit="kN" label={`荷载 ${i + 1} 大小`} onChange={magnitude => patchLoad(load.id, { magnitude })} /></label>
              <label className="truss-load-direction"><span>方向</span><select aria-label={`荷载 ${i + 1} 方向`} value={load.direction} onChange={e => {
                const direction = e.target.value as Direction;
                patchLoad(load.id, { direction, angle: direction === 'custom' ? 45 : angles[direction] });
              }}><option value="down">↓ 向下</option><option value="up">↑ 向上</option><option value="right">→ 向右</option><option value="left">← 向左</option><option value="custom">↗ 自定义角度</option></select></label>
              {load.direction === 'custom' && <label className="truss-load-angle"><span>角度</span><NumericEntry value={load.angle} unit="°" signed label={`荷载 ${i + 1} 角度`} onChange={angle => patchLoad(load.id, { angle })} /></label>}
            </div>
            {load.direction === 'custom' && <p className="truss-load-angle-guide">0° 向右 · 90° 向上 · 逆时针为正</p>}
          </div>)}
          {loads.length === 0 && <p className="truss-load-empty">当前无荷载。点击“新增”或图中节点添加。</p>}
        </section>
        <ForceFlowControls compact />
      <div className="parameter-panel-footer"><label className="truss-show-axial"><input type="checkbox" checked={showAxial} onChange={e => setShowAxial(e.target.checked)} />显示图中轴力值</label></div>
      </div>
    </CollapsiblePanel>
    <div className="learning-analysis-area flex-1 flex flex-col gap-3 min-w-0">
      {milestone && <LearningMilestone milestone={milestone} onDismiss={dismissMilestone} />}
      {result ? <>
        <TrussEngineeringCharts L={L} H={H} loads={appliedLoads} result={result} showAxial={showAxial} activeId={activeId} onSelectLoad={setActiveId} onAngleChange={(id, angle) => patchLoad(id, { angle, direction: directionForAngle(angle) })} activeNode={activeLoad?.node} activeLoadLabel={activeLoad ? `荷载 ${activeIndex + 1}` : undefined}
          onSelectNode={node => activeLoad ? patchLoad(activeLoad.id, { node }) : addLoad(node)} />
        <div className="learning-metrics-grid learning-metrics-4">
          <ResultCard label="最大拉力" value={number(Math.max(0, ...TRUSS_MEMBERS.map(member => result.forces[member.id])), true)} unit="kN" color="blue" />
          <ResultCard label="最大压力" value={number(Math.min(0, ...TRUSS_MEMBERS.map(member => result.forces[member.id])))} unit="kN" color="red" />
          <ResultCard label="A 竖向反力" value={number(result.reactions.ay, true)} unit="kN" color="green" aiHint={`A 水平反力 Ax = ${number(result.reactions.ax, true)} kN`} />
          <ResultCard label="B 竖向反力" value={number(result.reactions.by, true)} unit="kN" color="purple" aiHint="向上为正，向下为负" />
        </div>
        <details className="truss-member-results"><summary>杆件轴力 · 11 根<span>正值受拉 · 负值受压 · 单位 kN</span></summary>
          <div className="truss-member-results-scroll"><table aria-label="杆件轴力表"><thead><tr><th scope="col">杆件</th><th scope="col">轴力 N</th><th scope="col">状态</th></tr></thead><tbody>{TRUSS_MEMBERS.map(member => {
            const value = result.forces[member.id], state = Math.abs(value) < 1e-8 ? 'zero' : value > 0 ? 'tension' : 'compression';
            return <tr key={member.id} data-force-state={state}><th scope="row">{member.id}</th><td>{number(value, true)}</td><td>{state === 'zero' ? '零杆' : state === 'tension' ? '受拉' : '受压'}</td></tr>;
          })}</tbody></table></div>
        </details>
        <TrussJointEquilibrium result={result} /><AIBubble message={bubble?.triggerId === 'truss-tension-compression' && !(['AE', 'EF', 'FG', 'GB'].every(id => result.forces[id] > 0) && result.forces.CD < 0) ? null : bubble} /><SolutionSteps steps={solveSteps} title="求解过程" />
      </> : <div role="alert" className="truss-calculation-error">{error}</div>}
    </div>
    <CollapsiblePanel title="AI助手" icon="🤖" side="right" defaultOpen={false} storageKey="ai-panel-truss"><AITutor context={context} moduleTitle="静定桁架" suggestedQuestions={['不同节点加载会怎样？', '水平荷载如何影响反力？', '为什么拉压状态会改变？']} /></CollapsiblePanel>
  </div></ForceFlowScope>;
}
