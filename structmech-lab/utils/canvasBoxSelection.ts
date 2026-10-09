import type { SolverParams } from '../types';
import { getActiveLoadCaseId } from './loadCases';
import { solverLoadAngle } from './loadDirection';
import { getLineLoadRange } from './lineLoads';
import type { CanvasPoint, CanvasSelection } from './canvasModel';

/** CAD selection: left-to-right contains, right-to-left crosses. Coordinates remain in model space. */
export function canvasBoxSelection(params: SolverParams, from: CanvasPoint, to: CanvasPoint, scale: number): CanvasSelection[] {
  const left=Math.min(from.x,to.x), right=Math.max(from.x,to.x), bottom=Math.min(from.y,to.y), top=Math.max(from.y,to.y);
  const crossing=to.x<from.x;
  const inside=(p:CanvasPoint)=>p.x>=left&&p.x<=right&&p.y>=bottom&&p.y<=top;
  const segment=(a:CanvasPoint,b:CanvasPoint)=> {
    if (!crossing) return inside(a)&&inside(b);
    let lo=0,hi=1;
    for (const [p,q] of [[-(b.x-a.x),a.x-left],[b.x-a.x,right-a.x],[-(b.y-a.y),a.y-bottom],[b.y-a.y,top-a.y]]) {
      if (Math.abs(p)<1e-12) { if(q<0)return false; }
      else { const t=q/p; if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t); if(lo>hi)return false; }
    }
    return true;
  };
  const selected:CanvasSelection[]=[];
  for(const n of params.nodes) if(inside(n))selected.push({kind:'node',id:n.id});
  for(const e of params.elements) {
    const a=params.nodes.find(n=>n.id===e.startNode),b=params.nodes.find(n=>n.id===e.endNode);
    if(a&&b&&segment(a,b))selected.push({kind:'element',id:e.id});
  }
  const caseId=getActiveLoadCaseId(params);
  for(const l of params.loads.filter(l=>(l.loadCaseId??'dead')===caseId)) {
    const e=params.elements.find(e=>e.id===l.elementId);
    const a=params.nodes.find(n=>n.id===(l.nodeId??e?.startNode)),b=params.nodes.find(n=>n.id===e?.endNode);
    if(!a)continue;
    const at=(t:number)=>b?{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}:a;
    const angle=solverLoadAngle(l)*Math.PI/180;
    const tail=(p:CanvasPoint)=>({x:p.x-Math.cos(angle)*25/scale,y:p.y-Math.sin(angle)*25/scale});
    const line=l.type==='distributed'||l.type==='trapezoidal';
    if(line){const range=getLineLoadRange(l),p=at(range.start),q=at(range.end);
      if(crossing?segment(p,q)||segment(tail(p),tail(q))||segment(p,tail(p))||segment(q,tail(q)):inside(p)&&inside(q)&&inside(tail(p))&&inside(tail(q)))selected.push({kind:'load',id:l.id});
    } else {const p=at(l.location??.5);if(l.type==='moment'?inside(p):segment(p,tail(p)))selected.push({kind:'load',id:l.id});}
  }
  return selected;
}
