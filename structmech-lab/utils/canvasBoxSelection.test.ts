import { expect, it } from 'vitest';
import { StructureType, type SolverParams } from '../types';
import { canvasBoxSelection } from './canvasBoxSelection';
const model = ():SolverParams => ({structureType:StructureType.Custom,stiffnessType:'Elastic',width:10,height:5,roofHeight:2,numSpans:1,numStories:1,numBays:1,overhangLeft:0,overhangRight:0,elasticModulus:200,crossSectionArea:100,momentOfInertia:200,nodes:[{id:1,x:0,y:0,restraints:[true,true,true]},{id:2,x:4,y:0,restraints:[false,false,false]}],elements:[{id:1,startNode:1,endNode:2,E:200,A:100,I:200}],loads:[{id:'q',type:'distributed',elementId:1,magnitude:-3,direction:'y',startLocation:.25,endLocation:.75},{id:'other',type:'point',nodeId:1,magnitude:-5,loadCaseId:'live'}]});
it('包含框选选择节点、杆件和当前工况的荷载，与拖动纵向方向无关',()=>{
 const m=model(); const items=canvasBoxSelection(m,{x:-1,y:-1},{x:5,y:1},50);
 expect(items).toEqual([{kind:'node',id:1},{kind:'node',id:2},{kind:'element',id:1},{kind:'load',id:'q'}]);
 expect(canvasBoxSelection(m,{x:-1,y:1},{x:5,y:-1},50)).toEqual(items);
});
it('交叉框选命中穿过选框的杆件，包含框选不命中未完全包含的对象',()=>{
 const m=model();
 expect(canvasBoxSelection(m,{x:2.5,y:-.1},{x:1.5,y:.1},50)).toContainEqual({kind:'element',id:1});
 expect(canvasBoxSelection(m,{x:1.5,y:-.1},{x:2.5,y:.1},50)).toEqual([]);
});
