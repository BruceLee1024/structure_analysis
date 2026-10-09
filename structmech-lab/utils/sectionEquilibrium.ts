import { calculateExactValues } from './solver';
import { globalLoadComponents } from './loadDirection';
import type { AnalysisResult, Load, SolverElement, SolverNode } from '../types';
/** Solver legacy sampling uses the left limit within 1e-6 m of a point action.
 * A cut retaining the start side needs the right limit, including that action.
 */
export function solverSectionRight(el: SolverElement, a: SolverNode, b: SolverNode, solved: AnalysisResult['elements'][number], loads: Load[], t: number) {
  const L=Math.hypot(b.x-a.x,b.y-a.y),c=(b.x-a.x)/L,s=(b.y-a.y)/L;
  const applied=loads.filter(l=>l.elementId===el.id&&l.nodeId==null);
  const q=calculateExactValues(t*L,L,c,s,solved.u_local,solved.startForces,applied);
  for(const l of applied){
    if(l.type==='distributed'||l.type==='trapezoidal'||Math.abs((l.location??.5)-t)*L>1e-6)continue;
    if(l.type==='moment')q.moment-=l.magnitude;
    else {const f=globalLoadComponents(l);q.axial-=f.x*c+f.y*s;q.shear+=-f.x*s+f.y*c;}
  }
  return {N:q.axial,V:q.shear,M:q.moment};
}
