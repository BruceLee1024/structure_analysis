import { expect,it } from 'vitest';
import { solveStructure } from './solver';
import { solverSectionRight } from './sectionEquilibrium';
import type { SolverNode,SolverElement,Load } from '../types';
const nodes:SolverNode[]=[{id:1,x:0,y:0,restraints:[true,true,true]},{id:2,x:4,y:0,restraints:[false,false,false]}];
const el:SolverElement={id:1,startNode:1,endNode:2,E:200,A:100,I:200};
it('截面取集中力右极限：自由段内力为零，加载点之前保留剪力',()=>{
 const loads:Load[]=[{id:'p',elementId:1,type:'point',magnitude:-20,direction:'y',location:.5}];
 const r=solveStructure(nodes,[el],loads),at=(t:number)=>solverSectionRight(el,nodes[0],nodes[1],r.elements[0],loads,t);
 expect(at(.25).V).toBeCloseTo(20);expect(at(.5).V).toBeCloseTo(0);expect(at(.5).M).toBeCloseTo(0);expect(at(.75).V).toBeCloseTo(0);
});
it('纯力偶在作用处产生弯矩跳变，右侧无剪力、无弯矩',()=>{
 const loads:Load[]=[{id:'c',elementId:1,type:'moment',magnitude:12,direction:'y',location:.5}];
 const r=solveStructure(nodes,[el],loads),at=(t:number)=>solverSectionRight(el,nodes[0],nodes[1],r.elements[0],loads,t);
 expect(at(.25).M).toBeCloseTo(12);expect(at(.25).V).toBeCloseTo(0);expect(at(.5).M).toBeCloseTo(0);expect(at(.75).M).toBeCloseTo(0);
});
