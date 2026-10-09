import React, { useState } from 'react';
import { TRUSS_MEMBERS, type LearningTrussResult, type TrussNodeName } from '../../utils/learningTruss';
import { formatEngineeringValue as fmt } from './EngineeringFigure';
import './EquilibriumInspector.css';
export interface SectionForces { N: number; V: number; M: number }
export interface SectionMember { id: string; label: string; length: number; at: (t: number) => SectionForces }
function Vector({ x, y, fx, fy, color = '#58c4cd', incoming = false }: { x:number; y:number; fx:number; fy:number; color?:string; incoming?:boolean }) {
  const length=Math.hypot(fx,fy); if(length<1e-8)return null;
  const dx=fx/length,dy=-fy/length, tx=x+dx*(incoming?0:32),ty=y+dy*(incoming?0:32), bx=x-dx*(incoming?32:0),by=y-dy*(incoming?32:0);
  return <g stroke={color} fill={color}><path d={`M${bx},${by} L${tx},${ty}`} fill="none"/><path d={`M${tx},${ty} L${tx-dx*7-dy*3},${ty-dy*7+dx*3} L${tx-dx*7+dy*3},${ty-dy*7-dx*3} Z`}/></g>;
}
function Couple({x,y,value}:{x:number;y:number;value:number}){
  if(Math.abs(value)<1e-8)return null;
  return <g transform={`translate(${x} ${y}) scale(${value>0?1:-1} 1)`} stroke="#b18beb" fill="none"><path d="M15,15 A21,21 0 1 0 -21,0"/><path d="M-25,-6 L-21,0 L-16,-5"/></g>;
}
export function SectionEquilibrium({ members, defaultOpen = true }: { members: SectionMember[]; defaultOpen?: boolean }) {
  const [id,setId]=useState(''),[position,setPosition]=useState(50);
  const member=members.find(m=>m.id===id)??members[0]; if(!member)return null;
  const q=member.at(position/100);
  return <details className="mechanics-inspector" open={defaultOpen}><summary>截面平衡 · 成对作用</summary><div className="mechanics-inspector-body">
    <div className="mechanics-inspector-inputs"><label>杆件<select aria-label="平衡截面杆件" value={member.id} onChange={e=>setId(e.target.value)}>{members.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</select></label><label>截面位置 {fmt(member.length*position/100)} m<input aria-label="平衡截面位置" type="range" min="1" max="99" step=".1" value={position} onChange={e=>setPosition(Number(e.target.value))}/></label></div>
    <svg viewBox="0 0 480 160" role="img" aria-label="截面两侧作用与反作用，局部坐标展示">
      <g fill="#12253b" stroke="#456078"><path d="M45,65 H180 V95 H45"/><path d="M300,65 H435 V95 H300"/></g>
      <path d="M240,32 V120" stroke="#5e7894" strokeDasharray="3 4"/>
      <Vector x={180} y={80} fx={q.N} fy={0}/><Vector x={180} y={80} fx={0} fy={-q.V}/><Couple x={180} y={80} value={q.M}/>
      <Vector x={300} y={80} fx={-q.N} fy={0}/><Vector x={300} y={80} fx={0} fy={q.V}/><Couple x={300} y={80} value={-q.M}/>
      <g fill="#b6c8db" fontSize="11" textAnchor="middle"><text x="112" y="25">保留起点侧</text><text x="368" y="25">保留终点侧</text><text x="112" y="136">(N, −V, M)</text><text x="368" y="136">(−N, V, −M)</text><text x="240" y="155">局部 x → · y ↑ · 逆时针力矩为正</text></g>
    </svg>
    <div className="mechanics-section-values"><span>N <b>{fmt(q.N,true)}</b> kN</span><span>V <b>{fmt(q.V,true)}</b> kN</span><span>M <b>{fmt(q.M,true)}</b> kN·m</span></div>
    <p>截面取沿杆件起点到终点方向的右极限；有集中作用时，该作用归入起点侧。箭头只表示分量方向，长度不代表大小。曲杆按当前截面的局部切线展开；位置按该模块的杆件参数计。</p>
    <p>N 正拉负压；正 V 在起点侧截面沿 −y；正 M 在起点侧逆时针。两侧是作用与反作用，不是力沿杆轴流动。</p>
  </div></details>;
}
export function TrussJointEquilibrium({ result }: { result: LearningTrussResult }) {
  const [selected,setSelected]=useState<TrussNodeName>('F');
  const joint=result.joints.find(j=>j.name===selected)!;
  const terms=TRUSS_MEMBERS.filter(m=>m.start===selected||m.end===selected).map(m=>{
    const other=result.joints.find(j=>j.name===(m.start===selected?m.end:m.start))!,L=Math.hypot(other.x-joint.x,other.y-joint.y),N=result.forces[m.id];
    return {incoming:N<0,label:m.id,x:N*(other.x-joint.x)/L,y:N*(other.y-joint.y)/L,color:N>=0?'#459ad1':'#ce6a8a'};
  });
  terms.push({incoming:false,label:'外荷载',...result.nodalLoads[selected],color:'#daa05d'});
  const r=result.reactions;
  if(selected==='A'||selected==='B')terms.push({incoming:false,label:'支座反力',x:selected==='A'?r.ax:0,y:selected==='A'?r.ay:r.by,color:'#66d3c3'});
  const residual=terms.reduce((a,t)=>({x:a.x+t.x,y:a.y+t.y}),{x:0,y:0});
  const scale=Math.max(1,...terms.map(t=>Math.hypot(t.x,t.y))),ok=Math.hypot(residual.x,residual.y)<=1e-7*scale;
  return <details className="mechanics-inspector" open><summary>节点平衡 · 拉压方向</summary><div className="mechanics-inspector-body"><label>选择节点 <select aria-label="平衡节点" value={selected} onChange={e=>setSelected(e.target.value as TrussNodeName)}>{result.joints.map(j=><option key={j.name}>{j.name}</option>)}</select></label>
    <svg viewBox="0 0 480 130" role="img" aria-label={`节点 ${selected} 的力矢量`}><circle cx="240" cy="65" r="4" fill="#dde9f3"/>{terms.map(t=><g key={t.label}><Vector x={240} y={65} fx={t.x} fy={t.y} color={t.color} incoming={t.incoming}/>{Math.hypot(t.x,t.y)>1e-8&&<text x={240+58*t.x/Math.hypot(t.x,t.y)*(t.incoming?-1:1)} y={65-58*t.y/Math.hypot(t.x,t.y)*(t.incoming?-1:1)} textAnchor="middle" fill={t.color} fontSize="11">{t.label}</text>}</g>)}</svg>
    <table aria-label="节点力分量"><thead><tr><th>作用</th><th>Fx (kN)</th><th>Fy (kN)</th></tr></thead><tbody>{terms.map(t=><tr key={t.label}><th>{t.label}</th><td>{fmt(t.x,true)}</td><td>{fmt(t.y,true)}</td></tr>)}</tbody></table>
    <p className={ok?'mechanics-pass':'mechanics-fail'}>ΣFx={residual.x.toExponential(2)} kN · ΣFy={residual.y.toExponential(2)} kN · {ok?'平衡通过':'需复核'}</p><p>杆件对节点的力：受拉沿杆轴离开节点，受压指向节点。表中是全局分量，箭头等长仅表示方向；重合箭头请对照分量表。表值经四舍五入，残差使用未显示舍入的计算值。</p>
  </div></details>;
}
export function GlobalEquilibrium({ external, reaction, forceScale, length }: { external:{x:number;y:number;m:number}; reaction:{x:number;y:number;m:number}; forceScale:number; length:number }) {
 const sums={x:external.x+reaction.x,y:external.y+reaction.y,m:external.m+reaction.m};
 const ft=1e-8+1e-7*Math.max(1,forceScale),mt=1e-8+1e-7*Math.max(1,forceScale*length);
 const ok=Math.abs(sums.x)<=ft&&Math.abs(sums.y)<=ft&&Math.abs(sums.m)<=mt;
 return <details className="mechanics-inspector"><summary>整体平衡校核 · {ok?'通过':'需复核'}</summary><div className="mechanics-inspector-body"><table aria-label="整体平衡分量"><thead><tr><th>作用</th><th>Fx (kN)</th><th>Fy (kN)</th><th>关于 A 的矩 (kN·m)</th></tr></thead><tbody>{[{name:'外荷载',...external},{name:'支座作用',...reaction},{name:'平衡残差',...sums}].map(r=><tr key={r.name}><th>{r.name}</th><td>{r.x.toExponential(3)}</td><td>{r.y.toExponential(3)}</td><td>{r.m.toExponential(3)}</td></tr>)}</tbody></table><p>力容差 {ft.toExponential(1)} kN；力矩容差 {mt.toExponential(1)} kN·m。整体平衡是必要条件，不替代逐节点、截面与变形协调校核。</p></div></details>;
}
