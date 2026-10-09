import React, { useEffect, useState } from 'react';
import { Trash2, X, MousePointer2 } from 'lucide-react';
import type { Load, SolverParams } from '../../types';
import { CANVAS_SUPPORTS, moveCanvasNode, type CanvasSelection } from '../../utils/canvasModel';
import { getLineLoadRange } from '../../utils/lineLoads';

const fieldClass = 'mt-1 w-full min-w-0 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-cyan-400';
const supportNames: Record<string, string> = { free: '无支座', fixed: '固定支座', pinned: '铰支座', rollerY: '竖向滚动支座', rollerX: '水平滚动支座', guided: '导向支座', custom: '自定义约束' };
const supportOf = (r: boolean[]) => Object.keys(CANVAS_SUPPORTS).find(k => CANVAS_SUPPORTS[k].every((value, i) => value === r[i])) ?? 'custom';
const display = (value: number) => String(Number(value.toFixed(8)));

interface Props {
  params: SolverParams;
  selection: CanvasSelection | null;
  onApply: (next: SolverParams) => void;
  onDelete: () => void;
  onDeselect: () => void;
}

export default function CanvasSelectionEditor({ params, selection, onApply, onDelete, onDeselect }: Props) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const node = selection?.kind === 'node' ? params.nodes.find(n => n.id === selection.id) : undefined;
  const element = selection?.kind === 'element' ? params.elements.find(e => e.id === selection.id) : undefined;
  const load = selection?.kind === 'load' ? params.loads.find(l => l.id === selection.id) : undefined;
  const member = element ?? params.elements.find(e => e.id === load?.elementId);
  const a = params.nodes.find(n => n.id === member?.startNode), b = params.nodes.find(n => n.id === member?.endNode);
  const length = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
  const lineLoad = load?.type === 'distributed' || load?.type === 'trapezoidal';

  useEffect(() => {
    setError('');
    if (node) setDraft({ x: display(node.x), y: display(node.y), support: supportOf(node.restraints) });
    else if (element) setDraft({ length: display(length), E: display(element.E), A: display(element.A), I: display(element.I), releaseStart: String(!!element.releaseStart), releaseEnd: String(!!element.releaseEnd) });
    else if (load) {
      const range = getLineLoadRange(load);
      setDraft({ magnitude: display(load.magnitude), magnitudeEnd: display(load.magnitudeEnd ?? load.magnitude), direction: load.direction ?? 'y', angle: display(load.angle ?? 45), location: display((load.location ?? 0.5) * length), start: display(range.start * length), end: display(range.end * length) });
    } else setDraft({});
  }, [params, selection?.kind, selection?.id]);

  const setField = (name: string, value: string) => { setDraft(prev => ({ ...prev, [name]: value })); setError(''); };
  const number = (name: string) => {
    if (!draft[name]?.trim() || !Number.isFinite(Number(draft[name]))) throw new Error('请填写有效的数值');
    return Number(draft[name]);
  };
  const input = (name: string, label: string, unit?: string) => <label className="min-w-0 text-[11px] text-slate-400">{label}{unit ? ` (${unit})` : ''}<input aria-label={`选中对象${label}${unit ? ` (${unit})` : ''}`} type="number" step="any" value={draft[name] ?? ''} onChange={e => setField(name, e.target.value)} className={fieldClass} /></label>;

  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (node) {
        let next = moveCanvasNode(params, node.id, { x: number('x'), y: number('y') });
        if (draft.support !== supportOf(node.restraints) && CANVAS_SUPPORTS[draft.support]) next = { ...next, nodes: next.nodes.map(n => n.id === node.id ? { ...n, restraints: [...CANVAS_SUPPORTS[draft.support]] as typeof n.restraints, springStiffness: [0, 0, 0] } : n) };
        onApply(next);
      } else if (element && a && b) {
        const newLength = number('length'), E = number('E'), A = number('A'), I = number('I');
        if ([newLength, E, A, I].some(v => v <= 0)) throw new Error('长度及 E、A、I 必须大于 0');
        let next = { ...params, elements: params.elements.map(e => e.id === element.id ? { ...e, E, A, I, releaseStart: draft.releaseStart === 'true', releaseEnd: draft.releaseEnd === 'true' } : e) };
        if (Math.abs(newLength - length) > 1e-6) next = moveCanvasNode(next, b.id, { x: a.x + (b.x - a.x) * newLength / length, y: a.y + (b.y - a.y) * newLength / length });
        onApply(next);
      } else if (load) {
        const patch = { ...load, magnitude: number('magnitude'), direction: draft.direction as Load['direction'], angle: draft.direction === 'angle' ? number('angle') : undefined };
        if (load.type === 'trapezoidal') patch.magnitudeEnd = number('magnitudeEnd');
        if (lineLoad) {
          const start = number('start'), end = number('end');
          if (start < 0 || end > length + 1e-8 || end <= start) throw new Error(`作用范围应满足 0 ≤ 起点 < 终点 ≤ ${display(length)} m`);
          patch.startLocation = start / length; patch.endLocation = Math.min(1, end / length);
        } else if (load.elementId !== undefined) {
          const location = number('location');
          if (location < 0 || location > length) throw new Error(`作用位置应在 0 到 ${display(length)} m 之间`);
          patch.location = location / length;
        }
        onApply({ ...params, loads: params.loads.map(l => l.id === load.id ? patch : l) });
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : '修改失败'); }
  };

  return <aside aria-label="画布对象属性" className="canvas-inspector bg-slate-900/95 p-4">
    <div className="mb-3 flex items-center justify-between gap-2">
      <h4 className="text-xs font-semibold text-slate-200">{node ? `节点 N${node.id}` : element ? `杆件 E${element.id}` : load ? ({ point: '集中力', moment: '力矩', distributed: '均布荷载', trapezoidal: '梯形荷载' }[load.type]) : '对象属性'}</h4>
      {selection && <button type="button" aria-label="取消选中" onClick={onDeselect} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-white"><X size={14} /></button>}
    </div>
    {!node && !element && !load ? <div className="space-y-3 text-xs leading-relaxed text-slate-500"><MousePointer2 className="text-cyan-400" size={22} /><p>选中节点、杆件或荷载，即可修改属性。</p><p>拖动节点调整结构；点击荷载箭头编辑大小和作用范围。</p><p>长度 m · 力 kN · 力矩 kN·m</p><p className="text-[11px]">Esc 结束绘制 · Delete 删除选中 · Ctrl / ⌘ Z 撤销</p></div> : <form onSubmit={apply} className="space-y-3">
      {node && <>
        <div className="grid grid-cols-2 gap-2">{input('x', 'X', 'm')}{input('y', 'Y', 'm')}</div>
        <label className="block text-[11px] text-slate-400">支座类型<select aria-label="选中节点支座类型" value={draft.support ?? 'free'} onChange={e => {
          const support = e.target.value;
          setField('support', support);
          const restraints = CANVAS_SUPPORTS[support];
          if (restraints) onApply({ ...params, nodes: params.nodes.map(n => n.id === node.id ? { ...n, restraints: [...restraints] as typeof n.restraints, springStiffness: [0, 0, 0] } : n) });
        }} className={fieldClass}>{Object.entries(supportNames).map(([value, label]) => <option key={value} value={value} disabled={value === 'custom'}>{label}</option>)}</select></label>
        {node.springStiffness?.some(v => v > 0) && <p className="text-[10px] text-slate-500">当前含弹簧约束，可在几何建模面板调整；更换支座类型将清除弹簧。</p>}
      </>}
      {element && <>
        <p className="text-[11px] text-slate-500">N{element.startNode} → N{element.endNode}</p>
        {input('length', '长度', 'm')}
        <p className="text-[10px] text-slate-500">修改长度将沿原方向移动终点及相连杆件。</p>
        <div className="grid grid-cols-2 gap-2">{input('E', 'E', 'GPa')}{input('A', 'A', 'cm²')}{input('I', 'I', '10⁻⁶ m⁴')}</div>
        <div className="flex gap-3 text-[11px] text-slate-400">{[['releaseStart', '起端铰接'], ['releaseEnd', '末端铰接']].map(([name, label]) => <label key={name} className="flex items-center gap-1"><input type="checkbox" checked={draft[name] === 'true'} onChange={e => setField(name, String(e.target.checked))} className="accent-cyan-400" />{label}</label>)}</div>
      </>}
      {load && <>
        <p className="text-[11px] text-slate-500">{load.nodeId !== undefined ? `作用于 N${load.nodeId}` : `作用于 E${load.elementId}`}</p>
        {input('magnitude', load.type === 'trapezoidal' ? '起点大小' : '大小', lineLoad ? 'kN/m' : load.type === 'moment' ? 'kN·m' : 'kN')}
        {load.type === 'trapezoidal' && input('magnitudeEnd', '终点大小', 'kN/m')}
        {load.type !== 'moment' && <label className="block text-[11px] text-slate-400">方向<select aria-label="选中荷载方向" value={draft.direction ?? 'y'} onChange={e => setField('direction', e.target.value)} className={fieldClass}><option value="y">竖向 Y</option><option value="x">水平 X</option><option value="angle">自定义角度</option></select></label>}
        {load.type !== 'moment' && draft.direction === 'angle' && <>{input('angle', '角度', '°')}<p className="text-[10px] text-slate-500">0° 向右，90° 向上；负值沿相反方向。</p></>}
        {lineLoad && <div className="grid grid-cols-2 gap-2">{input('start', '起点', 'm')}{input('end', '终点', 'm')}</div>}
        {!lineLoad && load.elementId !== undefined && input('location', '位置', 'm')}
        <p className="text-[10px] text-slate-500">{load.type === 'moment' ? '正值逆时针，负值顺时针。' : '正值向上 / 向右，负值向下 / 向左。'}{load.elementId !== undefined ? '距离从杆件起点量起。' : ''}</p>
      </>}
      {error && <p role="alert" className="text-xs text-amber-300">{error}</p>}
      <button type="submit" className="w-full rounded-md bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25">应用修改</button>
      <button type="button" onClick={onDelete} className="flex w-full items-center justify-center gap-2 rounded-md border border-rose-500/20 px-2 py-2 text-[11px] text-rose-300 hover:bg-rose-500/10"><Trash2 size={13} />{node ? '删除节点及相连杆件' : element ? '删除杆件及其荷载' : '删除荷载'}</button>
    </form>}
  </aside>;
}
