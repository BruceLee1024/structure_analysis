import { expect, it } from 'vitest';
import { StructureType, type SolverParams } from '../types';
import { drawCanvasMember, insertCanvasNode, snapCanvasPoint, toCanvas, fromCanvas, fitCanvas } from './canvasModel';

export const emptyModel = (): SolverParams => ({ structureType: StructureType.Custom, stiffnessType: 'Elastic', width: 10, height: 5, roofHeight: 2, numSpans: 1, numStories: 1, numBays: 1, overhangLeft: 0, overhangRight: 0, elasticModulus: 200, crossSectionArea: 100, momentOfInertia: 200, nodes: [], elements: [], loads: [] });
it('两次绘制共用端点，不创建重合节点和重复杆件', () => {
  const first = drawCanvasMember(emptyModel(), { x: 0, y: 0 }, { x: 4, y: 0 });
  const next = drawCanvasMember(first, { x: 4, y: 0 }, { x: 4, y: 3 });
  expect(next.nodes).toHaveLength(3); expect(next.elements).toHaveLength(2);
  expect(() => drawCanvasMember(next, { x: 0, y: 0 }, { x: 2, y: 0 })).toThrow('重叠');
  expect(() => drawCanvasMember(next, { x: 4, y: 0 }, { x: 4, y: 0 })).toThrow('大于 0');
});
it('交叉杆件形成真实共用节点，并保持旧局部荷载及端部释放', () => {
  let model = drawCanvasMember(emptyModel(), { x: 0, y: 0 }, { x: 4, y: 0 });
  model.elements[0].releaseStart = true;
  model.loads = [{ id: 'q', type: 'distributed', elementId: 1, magnitude: -3, startLocation: 0, endLocation: 0.75, loadCaseId: 'live' }];
  const next = drawCanvasMember(model, { x: 2, y: -2 }, { x: 2, y: 2 });
  const joint = next.nodes.find(n => n.x === 2 && n.y === 0)!;
  expect(next.nodes).toHaveLength(5); expect(next.elements).toHaveLength(4);
  expect(next.elements.filter(e => e.startNode === joint.id || e.endNode === joint.id)).toHaveLength(4);
  expect(next.loads).toHaveLength(2);
  expect(next.loads.every(l => l.loadCaseId === 'live' && l.magnitude === -3)).toBe(true);
  expect(next.loads.map(l => [l.startLocation, l.endLocation])).toEqual([[0, 1], [0, 0.5]]);
  expect(next.elements.filter(e => e.releaseStart)).toHaveLength(1);
});
it('在杆件端部附近精确插入支座节点时也能正确打断', () => {
  const model = drawCanvasMember(emptyModel(), { x: 0, y: 0 }, { x: 4, y: 0 });
  const next = insertCanvasNode(model, { x: 0.01, y: 0 });
  expect(next.params.elements).toHaveLength(2);
  expect(next.params.elements.some(e => e.endNode === next.nodeId)).toBe(true);
});
it('视口转换可逆，吸附到节点、杆件和网格；移动时不吸附自身', () => {
  const v = fitCanvas([]); const p = { x: 3.25, y: -1.5 };
  expect(fromCanvas(toCanvas(p, v), v)).toEqual(p);
  const model = drawCanvasMember(emptyModel(), { x: 0, y: 0 }, { x: 4, y: 0 });
  expect(snapCanvasPoint({ x: 0.05, y: 0.03 }, model, 50, 0.5)).toEqual({ x: 0, y: 0 });
  expect(snapCanvasPoint({ x: 2.07, y: 0.08 }, model, 50, 0.5)).toEqual({ x: 2, y: 0 });
  expect(snapCanvasPoint({ x: 0.06, y: 1.14 }, model, 50, 0.5, 1)).toEqual({ x: 0, y: 1 });
});

import { setCanvasSupport, addCanvasLoad, deleteCanvasSelection, moveCanvasNode, hitCanvasObject } from './canvasModel';
import { solveStructure } from './solver';
import { computeEquilibriumResidual } from './solverDiagnostics';
import { stringifySolverModel, importSolverModel } from './modelIO';
it('直接绘制截图悬臂梁，反力 8 kN、弯矩 14 kN·m，保存加载后仍可计算', () => {
  let model = drawCanvasMember(emptyModel(), { x: 0, y: 0 }, { x: 4, y: 0 });
  model = setCanvasSupport(model, { x: 0, y: 0 }, 'fixed').params;
  model = addCanvasLoad(model, { type: 'distributed', elementId: 1, magnitude: -3, direction: 'y', startLocation: 0, endLocation: 0.5 }).params;
  model = addCanvasLoad(model, { type: 'point', nodeId: 2, magnitude: -2, direction: 'y' }).params;
  const loaded = importSolverModel(stringifySolverModel(model));
  expect(loaded.ok).toBe(true);
  if (!loaded.ok) return;
  const result = solveStructure(loaded.params.nodes, loaded.params.elements, loaded.params.loads);
  expect(result.error).toBeUndefined();
  expect(result.reactions[0].fy).toBeCloseTo(8, 5); expect(result.reactions[0].m).toBeCloseTo(14, 5);
  expect(computeEquilibriumResidual(result, model.nodes, model.loads, model.elements).allOk).toBe(true);
});
it('支座放在梁内自动连接；删除节点清理所有工况的关联荷载', () => {
  const model = drawCanvasMember(emptyModel(), { x: 0, y: 0 }, { x: 4, y: 0 });
  let next = setCanvasSupport(model, { x: 2, y: 0 }, 'pinned');
  expect(next.params.nodes.find(n => n.id === next.nodeId)?.restraints).toEqual([true, true, false]);
  next.params.loads = [{ id: 'p', type: 'point', nodeId: next.nodeId, magnitude: -2, loadCaseId: 'live' }, { id: 'q', type: 'distributed', elementId: next.params.elements[0].id, magnitude: -3 }];
  const deleted = deleteCanvasSelection(next.params, { kind: 'node', id: next.nodeId });
  expect(deleted.elements).toHaveLength(0); expect(deleted.loads).toHaveLength(0);
});
it('移动节点保持关联荷载，拒绝占用位置，吸附检测可选中荷载箭头', () => {
  const model = drawCanvasMember(emptyModel(), { x: 0, y: 0 }, { x: 4, y: 0 });
  model.loads = [{ id: 'q', type: 'distributed', elementId: 1, magnitude: -3, direction: 'y' }];
  const moved = moveCanvasNode(model, 2, { x: 5, y: 0 });
  expect(moved.nodes[1].x).toBe(5); expect(moved.loads).toEqual(model.loads);
  expect(() => moveCanvasNode(model, 2, { x: 0, y: 0 })).toThrow('已占用');
  expect(hitCanvasObject({ x: 2, y: 0.4 }, model, 50)).toEqual({ kind: 'load', id: 'q' });
  expect(hitCanvasObject({ x: 0, y: 0 }, model, 50)).toEqual({ kind: 'node', id: 1 });
});
it('移动共用节点越过相邻杆件时拒绝重叠', () => {
  let model = drawCanvasMember(emptyModel(), { x: 0, y: 0 }, { x: 4, y: 0 });
  model = drawCanvasMember(model, { x: 4, y: 0 }, { x: 8, y: 0 });
  expect(() => moveCanvasNode(model, 2, { x: 10, y: 0 })).toThrow('重叠');
  expect(model.nodes[1].x).toBe(4);
});

it('应用未改变的节点坐标不重新排列荷载或生成新历史', () => {
  const model = drawCanvasMember(emptyModel(), { x: 0, y: 0 }, { x: 4, y: 0 });
  model.loads = [{ id: 'q', type: 'distributed', elementId: 1, magnitude: -3 }, { id: 'p', type: 'point', nodeId: 2, magnitude: -2 }];
  expect(moveCanvasNode(model, 2, { x: 4, y: 0 })).toBe(model);
});
