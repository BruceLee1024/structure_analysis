import { expect, it } from 'vitest';
import { StructureType, type SolverParams } from '../types';
const emptyModel = (): SolverParams => ({ structureType: StructureType.Custom, stiffnessType: 'Elastic', width: 10, height: 5, roofHeight: 2, numSpans: 1, numStories: 1, numBays: 1, overhangLeft: 0, overhangRight: 0, elasticModulus: 200, crossSectionArea: 100, momentOfInertia: 200, nodes: [], elements: [], loads: [] });
import { drawCanvasMember } from './canvasModel';
import { moveCanvasLoad } from './moveCanvasLoad';
const beam = () => ({ ...drawCanvasMember(emptyModel(), {x:0,y:0},{x:10,y:0}), loads: [{id:'q',type:'trapezoidal' as const,elementId:1,startLocation:0.2,endLocation:0.6,magnitude:-3,magnitudeEnd:-6,direction:'y' as const}] });
it('整体移动保持范围长度、荷载大小和方向，越界时停止在杆端', () => {
 const p=beam(); const n=moveCanvasLoad(p,'q',{x:4,y:1},{x:7,y:1},50);
 expect(n.loads[0]).toMatchObject({magnitude:-3,magnitudeEnd:-6}); expect(n.loads[0].startLocation).toBeCloseTo(.5); expect(n.loads[0].endLocation).toBeCloseTo(.9);
 const edge=moveCanvasLoad(p,'q',{x:4,y:1},{x:20,y:1},50);
 expect(edge.loads[0].endLocation).toBe(1); expect(edge.loads[0].startLocation).toBeCloseTo(.6);
});
it('调整端点不能越过另一端或杆端', () => {
 const p=beam(); const n=moveCanvasLoad(p,'q',{x:2,y:0},{x:8,y:0},50,'start');
 expect(n.loads[0].startLocation).toBeLessThan(.6); expect(n.loads[0].endLocation).toBe(.6);
});
it('节点集中力移入杆件后转为杆件荷载，再移到节点恢复节点荷载', () => {
 const p={...beam(),loads:[{id:'p',type:'point' as const,nodeId:1,magnitude:-5,direction:'y' as const}]};
 const moved=moveCanvasLoad(p,'p',{x:0,y:0},{x:4,y:0},50);
 expect(moved.loads[0]).toMatchObject({elementId:1,location:.4,magnitude:-5}); expect(moved.loads[0].nodeId).toBeUndefined();
 const end=moveCanvasLoad(moved,'p',{x:4,y:0},{x:10,y:0},50);
 expect(end.loads[0].nodeId).toBe(2); expect(end.loads[0].elementId).toBeUndefined();
 expect(moveCanvasLoad(p,'p',{x:0,y:0},{x:4,y:4},50)).toBe(p);
});
it('沿杆件长度吸附，整体长度不变，边界优先；倾斜杆件同样适用', () => {
 const p=beam();
 const n=moveCanvasLoad(p,'q',{x:4,y:1},{x:4.37,y:1},50,'move',.5);
 expect(n.loads[0].startLocation).toBeCloseTo(.25); expect(n.loads[0].endLocation).toBeCloseTo(.65);
 const edge=moveCanvasLoad(p,'q',{x:4,y:1},{x:20,y:1},50,'move',.5);
 expect(edge.loads[0].endLocation).toBe(1); expect(edge.loads[0].startLocation).toBeCloseTo(.6);
 const inclined={...p,nodes:p.nodes.map((n,i)=>({...n,x:i*6,y:i*8}))};
 const resized=moveCanvasLoad(inclined,'q',{x:0,y:0},{x:.222,y:.296},50,'end',.5);
 expect(resized.loads[0].endLocation).toBeCloseTo(.65);
});
it('垂直于杆件拖动不改变非网格范围', () => {
 const p={...beam(),loads:beam().loads.map(l=>({...l,startLocation:.237,endLocation:.637}))};
 const next=moveCanvasLoad(p,'q',{x:4,y:1},{x:4,y:2},50,'move',.5);
 expect(next.loads[0]).toEqual(p.loads[0]);
});
