import { expect,it } from 'vitest';
import { prepareForceDistribution } from './forceFlow';
import { beamFlowModel,trussFlowModel,planarFlowModel,solverFlowModel } from './forceFlowModels';
import { solveLearningBeam,type LearningBeamInput } from './learningBeam';
import { solveLearningTruss } from './learningTruss';
import { solveLearningPlanar,type PlanarLoad } from './learningPlanar';
import { solveStructure } from './solver';
import { scaleLoads } from '../hooks/useQuasiStatic';
import type { SolverNode,SolverElement,Load } from '../types';
const xy=(x:number,y=0)=>({x,y});
it('反向多荷载的恒剪力区间不产生几何分流，比例按固定终态标尺',()=>{
 const input:LearningBeamInput={beamType:'simple',L:8,overhang:0,loads:[{id:'a',type:'point',position:2,magnitude:20,angle:-90},{id:'b',type:'point',position:6,magnitude:10,angle:90}]};
 const full=solveLearningBeam(input);expect(full.RA).toBeCloseTo(12.5);expect(full.RB).toBeCloseTo(-2.5);
 for(const factor of [0,.25,.5,1]){
  const current={...input,loads:scaleLoads(input.loads,factor)},r=solveLearningBeam(current),model=beamFlowModel(current,r,xy);
  expect(r.shearAt(3)).toBeCloseTo(-7.5*factor);expect(r.shearAt(5)).toBeCloseTo(-7.5*factor);
  const data=prepareForceDistribution(model,'V',full.Vmax);
  for(const s of data){expect(s).not.toHaveProperty('direction');expect(s.ratio).toBeLessThanOrEqual(factor+1e-10);}
  const relocated={...model,sources:[{id:'fake',x:1000,y:300,magnitude:1}],supports:[]};
  expect(prepareForceDistribution(relocated,'V',full.Vmax)).toEqual(data);
 }
});
it('纯力偶没有剪力但保留弯矩，色带不把零剪力解释为无受力',()=>{
 const input:LearningBeamInput={beamType:'cantilever',L:4,overhang:0,loads:[{id:'c',type:'moment',position:4,magnitude:12,rotation:'ccw'}]};
 for(const factor of [0,.5,1]){const q={...input,loads:scaleLoads(input.loads,factor)},r=solveLearningBeam(q),m=beamFlowModel(q,r,xy);expect(r.Vmax).toBe(0);expect(r.Mmax).toBeCloseTo(12*factor);expect(prepareForceDistribution(m,'V',1)).toEqual([]);}
});
it('桁架每帧保持节点平衡，合理拱轴仍为纯轴压',()=>{
 for(const factor of [0,.25,.5,1]){
  const t=solveLearningTruss(12,4,[{id:'p',node:'F',magnitude:50*factor,angle:-90}]);expect(t.jointResidual).toBeLessThan(1e-8);expect(t.reactions.ay).toBeCloseTo(25*factor);expect(t.forces.CD).toBeCloseTo(-37.5*factor);
  expect(trussFlowModel(t,xy).segments.find(s=>s.id==='CE')?.values.N).toBe(0);
  const g={kind:'arch' as const,L:20,H:5},loads:PlanarLoad[]=[{id:'q',member:0,type:'uniform',magnitude:10*factor,endMagnitude:10*factor,position:.5,start:0,end:1,angle:-90,rotation:'ccw'}];
  const r=solveLearningPlanar(g,loads),m=planarFlowModel(g,loads,r,xy);expect(r.reactions.Ay).toBeCloseTo(100*factor);expect(prepareForceDistribution(m,'M',100)).toEqual([]);expect(prepareForceDistribution(m,'V',100)).toEqual([]);
 }
});
it('二维求解器斜向与变号分布荷载在每个比例下保持反力、内力与位移线性',()=>{
 const nodes:SolverNode[]=[{id:1,x:0,y:0,restraints:[true,true,true]},{id:2,x:4,y:3,restraints:[false,false,false]}];
 const elements:SolverElement[]=[{id:1,startNode:1,endNode:2,E:200,A:100,I:200}];
 const loads:Load[]=[{id:'p',nodeId:2,type:'point',magnitude:20,direction:'angle',angle:32},{id:'q',elementId:1,type:'trapezoidal',magnitude:4,magnitudeEnd:-2,direction:'y',startLocation:.2,endLocation:.8}];
 const full=solveStructure(nodes,elements,loads);
 for(const factor of [0,.25,.5,1]){
  const applied=scaleLoads(loads,factor),r=solveStructure(nodes,elements,applied);expect(r.error).toBeUndefined();
  expect(r.maxDeflection).toBeCloseTo(full.maxDeflection*factor,3);
  r.reactions.forEach((q,i)=>{expect(q.fx).toBeCloseTo(full.reactions[i].fx*factor,3);expect(q.fy).toBeCloseTo(full.reactions[i].fy*factor,3);expect(q.m).toBeCloseTo(full.reactions[i].m*factor,3);});
  const a=solverFlowModel(nodes,elements,applied,r,xy),b=solverFlowModel(nodes,elements,loads,full,xy);
  a.segments.forEach((q,i)=>{for(const k of ['N','V','M'] as const)expect(q.values[k]).toBeCloseTo(b.segments[i].values[k]*factor,3);});
 }
 expect(loads[1].magnitudeEnd).toBe(-2);
});
