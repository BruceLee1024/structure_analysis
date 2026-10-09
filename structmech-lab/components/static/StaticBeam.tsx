import { GlobalEquilibrium, SectionEquilibrium } from '../ui/EquilibriumInspector';
import { useQuasiStatic, scaleLoads } from '../../hooks/useQuasiStatic';
import { ForceFlowScope, ForceFlowControls } from '../ui/ForceFlow';
import { normalizeLoadAngle, directionForAngle } from '../../utils/loadDirection';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GitBranch, Plus, Ruler, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Slider } from '../Slider';
import { NumericLoadInput, LoadDirectionSelect, LOAD_ANGLES, type LoadDirection } from '../ui/LoadInput';
import AITutor from '../AITutor';
import ResultCard from '../ui/ResultCard';
import SolutionSteps from '../ui/SolutionSteps';
import CollapsiblePanel from '../ui/CollapsiblePanel';
import AIBubble from '../ui/AIBubble';
import LearningMilestone from '../ui/LearningMilestone';
import BeamEngineeringCharts from '../ui/BeamEngineeringCharts';
import { learningChartStyle } from '../ui/learningChartPalette';
import { formatEngineeringValue as number } from '../ui/EngineeringFigure';
import { useAIEngine } from '../../hooks/useAIEngine';
import { solveLearningBeam, beamLength, type LearningBeamType, type LearningBeamLoad, type LearningBeamResult } from '../../utils/learningBeam';

type LoadKind = LearningBeamLoad['type'];
interface EditableLoad {
  id: string; type: LoadKind; magnitude: number; endMagnitude: number; position: number; start: number; end: number;
  angle: number; direction: LoadDirection; rotation: 'cw' | 'ccw'; expanded: boolean;
}
const kindLabels: Record<LoadKind, string> = { point: '集中力', uniform: '均布荷载', linear: '线性分布荷载', moment: '集中弯矩' };
const beamLabels: Record<LearningBeamType, string> = { simple: '简支梁', cantilever: '悬臂梁', overhanging: '外伸梁' };
const createLoad = (id: string, type: LoadKind, length: number, position = length / 2): EditableLoad => ({
  id, type, magnitude: type === 'point' ? 20 : type === 'linear' ? 0 : 10, endMagnitude: 10, position, start: 0, end: length, angle: -90, direction: 'down', rotation: 'ccw', expanded: true,
});
const toLoad = (load: EditableLoad): LearningBeamLoad => load.type === 'point'
  ? { id: load.id, type: load.type, magnitude: load.magnitude, position: load.position, angle: load.angle }
  : load.type === 'moment' ? { id: load.id, type: load.type, magnitude: load.magnitude, position: load.position, rotation: load.rotation }
  : { id: load.id, type: load.type, magnitude: load.magnitude, endMagnitude: load.endMagnitude, start: load.start, end: load.end, angle: load.angle };
const describeLoad = (load: LearningBeamLoad) => load.type === 'moment'
  ? `集中弯矩 ${number(load.magnitude)} kN·m，x=${number(load.position)} m，${load.rotation === 'ccw' ? '逆时针' : '顺时针'}`
  : load.type === 'point' ? `集中力 ${number(load.magnitude)} kN，x=${number(load.position)} m，θ=${number(load.angle)}°`
  : `${kindLabels[load.type]} ${number(load.magnitude)}${load.type === 'linear' ? `→${number(load.endMagnitude!)}` : ''} kN/m，区间 ${number(load.start)}–${number(load.end)} m，θ=${number(load.angle)}°`;

export default function StaticBeam() {
  const [geometry, setGeometry] = useState({ beamType: 'simple' as LearningBeamType, L: 8, overhang: 2 });
  const length = beamLength(geometry), { beamType, L, overhang } = geometry;
  const [loads, setLoads] = useState<EditableLoad[]>([createLoad('beam-load-1', 'point', 8)]);
  const serial = useRef(2);
  const [activeId, setActiveId] = useState<string | null>('beam-load-1');
  const [newKind, setNewKind] = useState<LoadKind>('point');
  const { bubble, sync, milestone, dismissMilestone } = useAIEngine({ module: 'static', subModule: 'beam' });
  const normalizedLoads = useMemo(() => loads.map(toLoad), [loads]);
  const playback = useQuasiStatic(JSON.stringify({ geometry, normalizedLoads }));
  const targetResult = useMemo(() => { try { return solveLearningBeam({ ...geometry, loads: normalizedLoads }); } catch { return null; } }, [geometry, normalizedLoads]);
  const appliedLoads = useMemo(() => scaleLoads(normalizedLoads, playback.factor), [normalizedLoads, playback.factor]);
  const input = useMemo(() => ({ ...geometry, loads: appliedLoads }), [geometry, appliedLoads]);
  const calculation = useMemo<{ result: LearningBeamResult | null; error: string }>(() => {
    try { return { result: solveLearningBeam(input), error: '' }; }
    catch (error) { return { result: null, error: error instanceof Error ? error.message : '请检查参数' }; }
  }, [input]);
  const { result, error } = calculation;
  const patchLoad = (id: string, patch: Partial<EditableLoad>) => setLoads(prev => prev.map(load => load.id === id ? { ...load, ...patch } : load));
  const resize = (patch: Partial<typeof geometry>) => {
    const next = { ...geometry, ...patch }, nextLength = beamLength(next);
    setGeometry(next);
    setLoads(prev => prev.map(load => {
      const end = Math.min(nextLength, load.end);
      return { ...load, position: Math.min(nextLength, load.position), end, start: Math.min(load.start, end - Math.min(.001, nextLength / 100)) };
    }));
  };
  const addLoad = (kind = newKind, position?: number) => {
    const id = `beam-load-${serial.current++}`;
    setLoads(prev => [...prev.map(load => ({ ...load, expanded: false })), createLoad(id, kind, length, position)]);
    setActiveId(id);
  };
  const removeLoad = (id: string) => {
    setLoads(prev => prev.filter(load => load.id !== id));
    if (activeId === id) setActiveId(loads.find(load => load.id !== id)?.id ?? null);
  };
  const selectLoad = (id: string) => {
    setActiveId(id); setLoads(prev => prev.map(load => ({ ...load, expanded: load.id === id })));
  };
  const moveLoad = (id: string, position: number) => {
    const load = loads.find(load => load.id === id);
    if (!load) return;
    const x = Math.round(Math.max(0, Math.min(length, position)) * 1000) / 1000;
    if (load.type === 'point' || load.type === 'moment') patchLoad(id, { position: Math.min(length, x) });
    else {
      const width = load.end - load.start, start = Math.min(length - width, x);
      patchLoad(id, { start, end: start + width });
    }
  };
  const loadSummary = appliedLoads.map((load, i) => `荷载 ${i + 1}：${describeLoad(load)}`).join('\n') || '当前无荷载';
  useEffect(() => {
    sync({ ...geometry, loadType: 'multi', loadCount: loads.length, loads: loadSummary }, result ? {
      RA: result.RA, RB: result.RB, Ax: result.Ax, fixedMoment: result.fixedMoment, Mmax: result.Mmax, Vmax: result.Vmax, Nmax: result.Nmax,
    } : { status: error });
  }, [geometry, loads.length, loadSummary, result, error, sync]);
  const context = `${beamLabels[beamType]}，A 位于 x=0，${beamType === 'cantilever' ? 'A 为固定端' : `B 滚动支座位于 x=${number(L)} m`}，总长 ${number(length)} m。\n0°向右，90°向上；弯矩逆时针为正。\n${loadSummary}\n` + (result
    ? `当前结果：Ay=${number(result.RA, true)}，By=${number(result.RB, true)}，Ax=${number(result.Ax, true)} kN，固定端反力矩=${number(result.fixedMoment, true)} kN·m。|M|max=${number(result.Mmax)} kN·m，|V|max=${number(result.Vmax)} kN，|N|max=${number(result.Nmax)} kN。`
    : `当前未得到有效结果：${error}`);
  const steps = result ? [
    { title: '分解与叠加荷载', equation: 'Px = P cosθ；Py = P sinθ\n分布力 = ∫q(x) dx', result: `ΣPx = ${number(result.resultant.x, true)} kN\nΣPy = ${number(result.resultant.y, true)} kN`, explanation: `${loads.length} 项共同加载；三角形、梯形荷载按实际分布积分`, aiWhy: '每一项荷载独立保留位置、方向和作用范围。先求分量与对 A 点的外荷载矩，再列整体平衡；集中弯矩也必须计入力矩平衡。' },
    { title: '求支座反力', equation: beamType === 'cantilever' ? `MA + (${number(result.resultant.moment)}) = 0\nAy = −ΣPy；Ax = −ΣPx` : `By × ${number(L)} + (${number(result.resultant.moment)}) = 0\nAy = −ΣPy − By；Ax = −ΣPx`, result: beamType === 'cantilever' ? `Ay = ${number(result.RA, true)} kN\nMA = ${number(result.fixedMoment, true)} kN·m` : `Ay = ${number(result.RA, true)} kN\nBy = ${number(result.RB, true)} kN`, explanation: '水平与竖向反力向右、向上为正；反力矩逆时针为正' },
    { title: '叠加剪力分布', equation: 'V(x) = Ay + By·H(x−L)\n+ ΣPy·H(x−xi) + ∫q_y(s) ds', result: `|V|max = ${number(result.Vmax)} kN`, explanation: '悬臂梁没有 By；集中力与支座处保留左右极限', aiWhy: '集中力使剪力跳变，分布荷载决定剪力图斜率。同位置的多个力和支座反力必须一起相加，避免画出不存在的中间跳变。' },
    { title: '叠加弯矩分布', equation: 'M(x) = −MA + ΣFy·(x−xi)₊\n− ΣCi·H(x−xi) + ∫q_y(s)(x−s) ds', result: `|M|max = ${number(result.Mmax)} kN·m\nx = ${number(result.momentPeak.x)} m`, explanation: '检查分段剪力零点、区间端点及弯矩跳变的两侧', aiWhy: '逆时针集中弯矩使弯矩图向下跳变，却不直接造成剪力跳变。弯矩极值需检查剪力零点和所有不连续位置，不能直接相加各荷载的最大值。' },
    { title: '求轴力分布', equation: 'N(x) = −ΣFx（截面左侧）', result: `|N|max = ${number(result.Nmax)} kN\nAx = ${number(result.Ax, true)} kN`, explanation: '水平、斜向力及分布荷载的水平分量参与计算；正拉负压' },
  ] : [];

  return <ForceFlowScope showControls={false} playback={playback} peaks={{ N: targetResult?.Nmax ?? 0, V: targetResult?.Vmax ?? 0, M: targetResult?.Mmax ?? 0 }} invalid={!result}><div className="learning-page" style={learningChartStyle as React.CSSProperties}>

    <CollapsiblePanel title="参数" icon="🔧" side="left" storageKey="param-panel-beam"><div className="beam-parameter-panel beam-multi-load-panel">
      <header className="parameter-panel-heading"><h4><SlidersHorizontal size={14} aria-hidden="true" />参数设置</h4><p>100% 目标荷载 · 修改后恢复满载</p></header>
      <fieldset className="parameter-section"><legend><GitBranch size={12} />结构类型</legend><div className="parameter-segmented parameter-beam-types">
        {(['simple', 'cantilever', 'overhanging'] as const).map(type => <button type="button" key={type} aria-pressed={beamType === type} onClick={() => resize({ beamType: type })}>{beamLabels[type]}</button>)}
      </div><p className="parameter-section-hint">{beamType === 'cantilever' ? 'A 端固定 · B 端自由' : beamType === 'simple' ? 'A 端铰支座 · B 端滚动支座' : 'A、B 支承 · B 右侧外伸至 C'}</p></fieldset>
      <details className="truss-geometry beam-geometry"><summary><Ruler size={12} />几何尺寸<span>{number(length)} m 总长</span></summary><div className="truss-geometry-controls">
        <Slider label="跨度 L" value={L} min={4} max={15} step={.1} unit="m" onChange={n => resize({ L: Math.max(.1, n) })} />
        {beamType === 'overhanging' && <Slider label="外伸长度" value={overhang} min={.5} max={8} step={.1} unit="m" onChange={n => resize({ overhang: Math.max(.1, n) })} />}
      </div></details>
      <section className="truss-load-editor" aria-label="梁荷载编辑器">
        <div className="truss-load-heading"><span>荷载组合 <small>{loads.length} 项</small></span><button type="button" aria-label="新增荷载" onClick={() => addLoad()}><Plus size={12} />新增</button></div>
        <select className="beam-new-load-kind" aria-label="新增荷载类型" value={newKind} onChange={e => setNewKind(e.target.value as LoadKind)}>{Object.entries(kindLabels).map(([type, label]) => <option value={type} key={type}>{label}</option>)}</select>
        <p className="truss-load-guide">选中荷载，点击梁或拖动箭头调整位置。</p>
        {loads.map((load, i) => <details key={load.id} className={`truss-load-card beam-load-card ${activeId === load.id ? 'is-active' : ''}`} open={load.expanded}>
          <summary aria-label={`荷载 ${i + 1} 设置`} onClick={e => {
            e.preventDefault(); setActiveId(load.id); setLoads(prev => prev.map(item => ({ ...item, expanded: item.id === load.id ? !item.expanded : false })));
          }}><span className="beam-load-identity"><i />荷载 {i + 1}<small>{kindLabels[load.type]}</small></span>
            <button type="button" className="truss-load-remove" aria-label={`删除荷载 ${i + 1}`} onClick={e => { e.preventDefault(); e.stopPropagation(); removeLoad(load.id); }}><Trash2 size={12} /></button>
            <span className="beam-load-brief">{describeLoad(toLoad(load))}</span></summary>
          <div className="truss-load-fields" onFocus={() => setActiveId(load.id)}>
            <label className="beam-load-wide"><span>荷载类型</span><select aria-label={`荷载 ${i + 1} 类型`} value={load.type} onChange={e => {
              const type = e.target.value as LoadKind;
              patchLoad(load.id, { type, magnitude: type === 'point' ? 20 : type === 'linear' ? 0 : 10 });
            }}>{Object.entries(kindLabels).map(([type, label]) => <option value={type} key={type}>{label}</option>)}</select></label>
            {(load.type === 'point' || load.type === 'moment') ? <>
              <label><span>{load.type === 'moment' ? '弯矩大小' : '大小'}</span><NumericLoadInput label={`荷载 ${i + 1} 大小`} value={load.magnitude} unit={load.type === 'moment' ? 'kN·m' : 'kN'} onChange={magnitude => patchLoad(load.id, { magnitude })} /></label>
              <label><span>距 A 端 x</span><NumericLoadInput label={`荷载 ${i + 1} 位置`} value={load.position} unit="m" max={length} onChange={position => patchLoad(load.id, { position })} /></label>
            </> : <>
              <label><span>起点 x₁</span><NumericLoadInput label={`荷载 ${i + 1} 起点`} value={load.start} unit="m" max={Math.max(0, load.end - .001)} onChange={start => patchLoad(load.id, { start })} /></label>
              <label><span>终点 x₂</span><NumericLoadInput label={`荷载 ${i + 1} 终点`} value={load.end} unit="m" min={load.start + .001} max={length} onChange={end => patchLoad(load.id, { end })} /></label>
              <label className={load.type === 'uniform' ? 'beam-load-wide' : undefined}><span>{load.type === 'uniform' ? '荷载强度 q' : '起点强度 q₁'}</span><NumericLoadInput label={`荷载 ${i + 1} 强度`} value={load.magnitude} unit="kN/m" onChange={magnitude => patchLoad(load.id, { magnitude })} /></label>
              {load.type === 'linear' && <label><span>终点强度 q₂</span><NumericLoadInput label={`荷载 ${i + 1} 终点强度`} value={load.endMagnitude} unit="kN/m" onChange={endMagnitude => patchLoad(load.id, { endMagnitude })} /></label>}
            </>}
            <label className="truss-load-direction"><span>方向</span>{load.type === 'moment'
              ? <select aria-label={`荷载 ${i + 1} 方向`} value={load.rotation} onChange={e => patchLoad(load.id, { rotation: e.target.value as 'ccw' | 'cw' })}><option value="ccw">↶ 逆时针</option><option value="cw">↷ 顺时针</option></select>
              : <LoadDirectionSelect label={`荷载 ${i + 1} 方向`} value={load.direction} onChange={direction => patchLoad(load.id, { direction, angle: direction === 'custom' ? 45 : LOAD_ANGLES[direction] })} />}</label>
            {load.type !== 'moment' && load.direction === 'custom' && <label className="truss-load-angle"><span>角度</span><NumericLoadInput label={`荷载 ${i + 1} 角度`} value={load.angle} unit="°" signed onChange={angle => patchLoad(load.id, { angle })} /></label>}
          </div>
          {load.type !== 'moment' && load.direction === 'custom' && <p className="truss-load-angle-guide">0° 向右 · 90° 向上 · 逆时针为正</p>}
        </details>)}
        {!loads.length && <p className="truss-load-empty">当前无荷载。点击“新增”或梁上任意位置添加。</p>}
      </section>
      <ForceFlowControls compact />
      <footer className="parameter-panel-footer">位置以米计，分布荷载可在局部区间重叠加载。</footer>
    </div></CollapsiblePanel>
    <div className="learning-analysis-area flex-1 flex flex-col gap-3 min-w-0">
      {milestone && <LearningMilestone milestone={milestone} onDismiss={dismissMilestone} />}
      {result ? <>
        <BeamEngineeringCharts input={input} diagram={result} beamLabel={beamLabels[beamType]} activeId={activeId} onSelectLoad={selectLoad} onAngleChange={(id, angle) => patchLoad(id, { angle, direction: directionForAngle(angle) })} onReverseLoad={id => { const l = loads.find(l => l.id === id); if (l) patchLoad(id, l.type === 'moment' ? { rotation: l.rotation === 'cw' ? 'ccw' : 'cw' } : { angle: normalizeLoadAngle(l.angle + 180), direction: directionForAngle(l.angle + 180) }); }} onMoveLoad={moveLoad}
          onPlaceLoad={x => activeId ? moveLoad(activeId, x) : addLoad('point', x)} />
        <div className="learning-metrics-grid learning-metrics-4">
          <ResultCard label="A 竖向反力" value={number(result.RA, true)} unit="kN" color="blue" aiHint={`Ax = ${number(result.Ax, true)} kN`} />
          <ResultCard label={beamType === 'cantilever' ? '固定端反力矩' : 'B 竖向反力'} value={number(beamType === 'cantilever' ? result.fixedMoment : result.RB, true)} unit={beamType === 'cantilever' ? 'kN·m' : 'kN'} color="purple" />
          <ResultCard label="最大绝对弯矩" value={number(result.Mmax)} unit="kN·m" color="red" aiHint={`x = ${number(result.momentPeak.x)} m，M = ${number(result.momentPeak.value, true)} kN·m`} />
          <ResultCard label="最大绝对剪力" value={number(result.Vmax)} unit="kN" color="green" />
        </div>
        <GlobalEquilibrium external={{x:result.resultant.x,y:result.resultant.y,m:result.resultant.moment}} reaction={{x:result.Ax,y:result.RA+result.RB,m:result.fixedMoment+result.RB*L}} forceScale={Math.abs(result.Ax)+Math.abs(result.RA)+Math.abs(result.RB)+Math.abs(result.resultant.x)+Math.abs(result.resultant.y)} length={length} /><SectionEquilibrium members={[{ id: 'beam', label: beamLabels[beamType], length, at: t => ({ N: result.axialAt(t*length), V: result.shearAt(t*length), M: result.momentAt(t*length) }) }]} />
        <AIBubble message={bubble?.triggerId === 'beam-midload' ? null : bubble} /><SolutionSteps title="求解过程" steps={steps} />
      </> : <div className="truss-calculation-error" role="alert">{error}</div>}
    </div>
    <CollapsiblePanel title="AI助手" icon="🤖" side="right" defaultOpen={false} storageKey="ai-panel-beam"><AITutor context={context} moduleTitle="静定梁" suggestedQuestions={['多个荷载怎么共同计算？', '集中弯矩为什么使弯矩图跳变？', '斜向荷载如何分解？']} /></CollapsiblePanel>
  </div></ForceFlowScope>;
}
