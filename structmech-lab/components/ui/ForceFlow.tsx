import type { QuasiStaticPlayback } from '../../hooks/useQuasiStatic';
import React, { createContext, useContext, useMemo, useState } from 'react';
import { Waves, Pause, Play } from 'lucide-react';
import { prepareForceDistribution, sectionPhotonPaths, photonStations, type FlowField, type FlowModel, type FlowPoint } from '../../utils/forceFlow';
import { formatEngineeringValue as fmt } from './EngineeringFigure';
import './ForceFlow.css';

interface FlowContext { photons: boolean; setPhotons: (v: boolean) => void; photonPaused: boolean; setPhotonPaused: (v: boolean) => void; photonSpeed: number; setPhotonSpeed: (v: number) => void; enabled: boolean; setEnabled: (v: boolean) => void; field: FlowField; setField: (v: FlowField) => void; peaks: Record<FlowField, number>; fields: FlowField[]; invalid: boolean; playback?: QuasiStaticPlayback }
const Context = createContext<FlowContext | null>(null);
const names: Record<FlowField, string> = { N: '轴力', V: '剪力', M: '弯矩' };
export function ForceFlowScope({ children, peaks, initialField = 'V', fields = ['V', 'N', 'M'], showControls = true, invalid = false, playback }: { children: React.ReactNode; peaks: Record<FlowField, number>; initialField?: FlowField; fields?: FlowField[]; showControls?: boolean; invalid?: boolean; playback?: QuasiStaticPlayback }) {
  const [photons, setPhotons] = useState(true), [photonPaused, setPhotonPaused] = useState(false), [photonSpeed, setPhotonSpeed] = useState(1);
  const [enabled, setEnabled] = useState(true), [field, setField] = useState(initialField);
  return <Context.Provider value={{ photons, setPhotons, photonPaused, setPhotonPaused, photonSpeed, setPhotonSpeed, enabled, setEnabled, field, setField, peaks, fields, invalid, playback }}>{showControls && <ForceFlowControls />}{children}</Context.Provider>;
}
export function useForceReference() { return useContext(Context)?.peaks; }
export function ForceFlowControls({ compact = false }: { compact?: boolean }) {
  const c = useContext(Context); if (!c) return null;
  const { enabled, field, peaks, fields, invalid, playback: p } = c, peak = Math.abs(peaks[field]);
  return <section className={`force-flow-controls${compact ? ' force-flow-compact' : ''}`} aria-label="受力与平衡演示">
    <div className="force-flow-toolbar"><label className="force-flow-toggle"><Waves size={15} /><span>受力与平衡</span><input type="checkbox" role="switch" aria-label="显示内力色带" checked={enabled} onChange={e => c.setEnabled(e.target.checked)} /><i aria-hidden="true" /></label>
      <div className="force-flow-options"><label><span>内力</span><select aria-label="色带内力" value={field} onChange={e => c.setField(e.target.value as FlowField)}>{fields.map(k => <option key={k} value={k}>{names[k]} {k}</option>)}</select></label></div>
      <div className="photon-controls"><label className="force-flow-toggle"><span>光子特效</span><input type="checkbox" role="switch" aria-label="光子特效" checked={c.photons} onChange={e => c.setPhotons(e.target.checked)} /><i aria-hidden="true" /></label>
        {c.photons && <div className="photon-actions"><button type="button" aria-label={c.photonPaused ? '继续光子特效' : '暂停光子特效'} onClick={() => c.setPhotonPaused(!c.photonPaused)}>{c.photonPaused ? <Play size={12}/> : <Pause size={12}/>} {c.photonPaused ? '继续' : '暂停'}</button><select aria-label="光子速度" value={c.photonSpeed} onChange={e => c.setPhotonSpeed(Number(e.target.value))}><option value="0.5">舒缓</option><option value="1">流光</option><option value="2">疾速</option></select></div>}
        <small>{field === 'N' ? '拉力向外 · 压力向内（杆段受力）' : field === 'V' ? '沿截面剪力方向（保留起点侧）' : '沿截面力矩旋向（保留起点侧）'}</small>
      </div>
      {p && <div className="quasi-static-controls"><div><strong>准静态加载 · {Math.round(p.factor * 100)}%</strong><button type="button" disabled={invalid} aria-label={p.playing ? '暂停加载演示' : '播放加载演示'} onClick={p.toggle}>{p.playing ? <Pause size={12}/> : <Play size={12}/>}</button></div>
        <input type="range" aria-label="加载比例" min="0" max="100" step="1" value={p.factor * 100} disabled={invalid} onChange={e => p.setFactor(Number(e.target.value) / 100)} />
        <div><button type="button" onClick={() => p.setFactor(1)}>恢复 100%</button><select aria-label="演示速度" value={p.speed} onChange={e => p.setSpeed(Number(e.target.value))}><option value="0.5">慢速</option><option value="1">正常</option><option value="2">快速</option></select></div>
      </div>}
      <span className="force-flow-peak">100% 标尺：|{field}|max {fmt(peak)} {field === 'M' ? 'kN·m' : 'kN'}</span>
    </div>
    <div className="force-flow-legend"><span><i className={`flow-positive flow-${field}`} />{field === 'N' ? '受拉' : '正值'}</span><span><i className="flow-negative" />{field === 'N' ? '受压' : '负值'}</span>
      <span className="force-flow-status">{invalid ? '模型无有效解，暂停演示' : peak <= 1e-8 ? `当前${names[field]}为零；其他内力仍可能非零` : '内力采样色带 · 不表示传播方向'}</span>
      <details><summary>理论与读图</summary><p>每帧对应同比例荷载下的静力平衡。适用线弹性、小变形、固定约束；支座按理想双向约束。参数栏编辑 100% 目标荷载，图表显示当前加载比例。修改模型恢复 100%。色带宽度按固定终态标尺线性映射，零值无色带；光子按所选内力分量指示作用方向，速度仅用于演示，不表示流量或应力波。轴力以短杆段拉压示意；剪力和弯矩表示保留杆件起点侧截面的作用：正 V 沿局部 −y，正 M 逆时针。N 正拉负压，V/M 按截面约定。各位置同步加载，不模拟传播延迟。</p></details>
    </div>
  </section>;
}
const positive = { N: '#2680c4', V: '#0f9f97', M: '#8960cf' };
const pathFor = (points: FlowPoint[]) => points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
export function ForceFlowLayer({ model }: { model: FlowModel }) {
  const c = useContext(Context), field = c?.field ?? 'V', peak = c?.peaks[field] ?? 0;
  const segments = useMemo(() => prepareForceDistribution(model, field, peak), [model, field, peak]);
  if (!c?.enabled || c.invalid || !segments.length) return null;
  return <g className="force-flow-layer" data-flow-field={field} aria-hidden="true" pointerEvents="none">
    {segments.map(s => <path key={s.id} d={pathFor([s.a,s.b])} data-flow-segment={s.id} data-flow-value={s.value} data-flow-ratio={s.ratio} stroke={s.value > 0 ? positive[field] : '#c24f76'} strokeWidth={8*s.ratio} opacity=".6" />)}
    {c.photons && <g className="force-photons" data-photon-state={c.photonPaused ? 'paused' : 'playing'} style={{ '--photon-duration': `${1.8 / c.photonSpeed}s`, animationPlayState: c.photonPaused ? 'paused' : 'running' } as React.CSSProperties}>
      {photonStations(segments).map(s => <g key={s.id} data-photon-field={field} data-photon-value={s.value} style={{ '--photon-phase': 0, '--photon-next': -24 } as React.CSSProperties} opacity={Math.min(1, s.ratio*3)}>
        {sectionPhotonPaths(s,field).map((points,i)=>{
          const tip=points.at(-1)!,prev=points.at(-2)!,len=Math.hypot(tip.x-prev.x,tip.y-prev.y),ux=(tip.x-prev.x)/len,uy=(tip.y-prev.y)/len;
          const arrow=pathFor([{x:tip.x-ux*4-uy*2,y:tip.y-uy*4+ux*2},tip,{x:tip.x-ux*4+uy*2,y:tip.y-uy*4-ux*2}]);
          const color=s.value>0?positive[field]:'#ef74ad';
          return <g key={i}><path className="photon-guide" d={pathFor(points)} stroke={color} strokeWidth="1.2" opacity=".7"/><path className="photon-guide" d={arrow} stroke={color} strokeWidth="1.5"/>
            <path className="photon-halo" d={pathFor(points)} stroke={color} strokeWidth="4"/>
            <path className="photon-core" d={pathFor(points)} stroke="#e5ffff" strokeWidth="1.6"/>
          </g>;
        })}
      </g>)}
    </g>}
  </g>;
}
