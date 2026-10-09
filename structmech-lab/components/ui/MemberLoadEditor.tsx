import React, { useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { NumericLoadInput, LoadDirectionSelect, LOAD_ANGLES, type LoadDirection } from './LoadInput';
import { formatEngineeringValue as fmt } from './EngineeringFigure';
import type { PlanarLoad } from '../../utils/learningPlanar';
export const memberLoadNames = { point: '集中力', uniform: '均布荷载', linear: '线性分布荷载', moment: '集中弯矩' };
export function newMemberLoad(id: string, type: PlanarLoad['type'] = 'point', member = 0): PlanarLoad {
  return { id, member, type, magnitude: type === 'linear' ? 0 : 10, endMagnitude: 10, position: type === 'moment' ? .25 : .5, start: 0, end: 1, angle: -90, rotation: 'ccw' };
}
export function memberLoadSummary(l: PlanarLoad, members: { label: string; length: number }[]) {
  const m = members[l.member], len = m?.length ?? 1;
  return `${m?.label ?? '杆件'} · ${memberLoadNames[l.type]} ${fmt(l.magnitude)}${l.type === 'linear' ? `→${fmt(l.endMagnitude)}` : ''} ${l.type === 'moment' ? 'kN·m' : l.type === 'point' ? 'kN' : 'kN/m'} · ${l.type === 'uniform' || l.type === 'linear' ? `${fmt(l.start * len)}–${fmt(l.end * len)} m` : `x=${fmt(l.position * len)} m`} · ${l.type === 'moment' ? l.rotation === 'ccw' ? '逆时针' : '顺时针' : `θ=${fmt(l.angle)}°`}`;
}
export default function MemberLoadEditor({ loads, onChange, members, activeId, onSelect, allowMoments = true, note }: {
  loads: PlanarLoad[]; onChange: (loads: PlanarLoad[]) => void; members: { label: string; length: number }[];
  activeId: string | null; onSelect: (id: string | null) => void; allowMoments?: boolean; note?: string;
}) {
  const serial = useRef(0), [newType, setNewType] = useState<PlanarLoad['type']>('point');
  const patch = (id: string, change: Partial<PlanarLoad>) => onChange(loads.map(l => l.id === id ? { ...l, ...change } : l));
  const direction = (angle: number): LoadDirection => Object.entries(LOAD_ANGLES).find(([, n]) => n === angle)?.[0] as LoadDirection ?? 'custom';
  return <section className="truss-load-editor" aria-label="多荷载编辑器">
    <div className="truss-load-heading"><span>荷载组合 <small>{loads.length} 项</small></span><button type="button" aria-label="新增荷载" onClick={() => {
      let id = `member-load-${++serial.current}`; while (loads.some(l => l.id === id)) id = `member-load-${++serial.current}`;
      onChange([...loads, newMemberLoad(id, newType)]); onSelect(id);
    }}><Plus size={12} />新增</button></div>
    <select className="beam-new-load-kind" aria-label="新增荷载类型" value={newType} onChange={e => setNewType(e.target.value as PlanarLoad['type'])}>
      {Object.entries(memberLoadNames).filter(([k]) => allowMoments || k !== 'moment').map(([k, n]) => <option key={k} value={k}>{n}</option>)}
    </select>
    <p className="truss-load-guide">{note ?? '点击结构选择杆件与位置，拖动箭头移动当前荷载。'}</p>
    {loads.map((l, i) => {
      const len = members[l.member].length, d = direction(l.angle);
      return <details key={l.id} className={`truss-load-card beam-load-card ${activeId === l.id ? 'is-active' : ''}`} open={activeId === l.id}>
        <summary aria-label={`荷载 ${i + 1} 设置`} onClick={e => { e.preventDefault(); onSelect(activeId === l.id ? null : l.id); }}>
          <span className="beam-load-identity"><i />荷载 {i + 1}<small>{memberLoadNames[l.type]}</small></span>
          <button type="button" className="truss-load-remove" aria-label={`删除荷载 ${i + 1}`} onClick={e => { e.preventDefault(); e.stopPropagation(); onChange(loads.filter(x => x.id !== l.id)); if (activeId === l.id) onSelect(loads.find(x => x.id !== l.id)?.id ?? null); }}><Trash2 size={12} /></button>
          <span className="beam-load-brief">{memberLoadSummary(l, members)}</span>
        </summary>
        <div className="truss-load-fields">
          {members.length > 1 && <label className="beam-load-wide"><span>作用杆件</span><select aria-label={`荷载 ${i + 1} 杆件`} value={l.member} onChange={e => patch(l.id, { member: Number(e.target.value) })}>{members.map((m, j) => <option key={j} value={j}>{m.label}</option>)}</select></label>}
          <label className="beam-load-wide"><span>荷载类型</span><select aria-label={`荷载 ${i + 1} 类型`} value={l.type} onChange={e => patch(l.id, { type: e.target.value as PlanarLoad['type'] })}>{Object.entries(memberLoadNames).filter(([k]) => allowMoments || k !== 'moment').map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
          {l.type === 'point' || l.type === 'moment' ? <>
            <label><span>大小</span><NumericLoadInput label={`荷载 ${i + 1} 大小`} value={l.magnitude} unit={l.type === 'moment' ? 'kN·m' : 'kN'} onChange={magnitude => patch(l.id, { magnitude })} /></label>
            <label><span>距杆件起点 x</span><NumericLoadInput label={`荷载 ${i + 1} 位置`} value={l.position * len} max={len} unit="m" onChange={n => patch(l.id, { position: n / len })} /></label>
          </> : <>
            <label><span>起点 x₁</span><NumericLoadInput label={`荷载 ${i + 1} 起点`} value={l.start * len} max={(l.end - .0001) * len} unit="m" onChange={n => patch(l.id, { start: n / len })} /></label>
            <label><span>终点 x₂</span><NumericLoadInput label={`荷载 ${i + 1} 终点`} value={l.end * len} min={(l.start + .0001) * len} max={len} unit="m" onChange={n => patch(l.id, { end: n / len })} /></label>
            <label className={l.type === 'uniform' ? 'beam-load-wide' : undefined}><span>{l.type === 'uniform' ? '强度 q' : '起点强度 q₁'}</span><NumericLoadInput label={`荷载 ${i + 1} 强度`} value={l.magnitude} unit="kN/m" onChange={magnitude => patch(l.id, { magnitude })} /></label>
            {l.type === 'linear' && <label><span>终点强度 q₂</span><NumericLoadInput label={`荷载 ${i + 1} 终点强度`} value={l.endMagnitude} unit="kN/m" onChange={endMagnitude => patch(l.id, { endMagnitude })} /></label>}
          </>}
          <label className="truss-load-direction"><span>方向</span>{l.type === 'moment' ? <select aria-label={`荷载 ${i + 1} 方向`} value={l.rotation} onChange={e => patch(l.id, { rotation: e.target.value as 'ccw' | 'cw' })}><option value="ccw">↶ 逆时针</option><option value="cw">↷ 顺时针</option></select>
            : <LoadDirectionSelect label={`荷载 ${i + 1} 方向`} value={d} onChange={v => patch(l.id, { angle: v === 'custom' ? 45 : LOAD_ANGLES[v] })} />}</label>
          {l.type !== 'moment' && d === 'custom' && <label className="truss-load-angle"><span>角度</span><NumericLoadInput label={`荷载 ${i + 1} 角度`} value={l.angle} signed unit="°" onChange={angle => patch(l.id, { angle })} /></label>}
        </div>
      </details>;
    })}
    {!loads.length && <p className="truss-load-empty">当前无荷载，可以新增任意组合。</p>}
  </section>;
}
