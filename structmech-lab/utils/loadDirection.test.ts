import { expect, it } from 'vitest';
import type { Load, SolverElement, SolverNode } from '../types';
import { directionForAngle, globalLoadComponents, normalizeLoadAngle, rotateSolverLoad, solverLoadAngle } from './loadDirection';
import { solveStructure } from './solver';
import { computeEquilibriumResidual } from './solverDiagnostics';

const member: SolverElement = { id: 1, startNode: 1, endNode: 2, E: 200, A: 100, I: 200 };
const cases: Load[] = [
  { id: 'node', nodeId: 2, type: 'point', magnitude: 20, direction: 'angle', angle: 37 },
  { id: 'member', elementId: 1, type: 'point', location: .35, magnitude: -12, direction: 'angle', angle: 135 },
  { id: 'uniform', elementId: 1, type: 'distributed', startLocation: .2, endLocation: .8, magnitude: 6, direction: 'angle', angle: -42 },
  { id: 'varying', elementId: 1, type: 'trapezoidal', startLocation: .1, endLocation: .9, magnitude: -4, magnitudeEnd: 7, direction: 'angle', angle: 68 },
];
for (const height of [0, 3]) for (const load of cases) {
  it(`${height ? '斜杆' : '水平杆'}的${load.id}斜向荷载等于独立 X/Y 荷载叠加，并满足整体平衡`, () => {
    const nodes: SolverNode[] = [{ id: 1, x: 0, y: 0, restraints: [true, true, true] }, { id: 2, x: 4, y: height, restraints: [false, false, false] }];
    const a = load.angle! * Math.PI / 180;
    const components: Load[] = [{ ...load, id: 'x', direction: 'x', magnitude: load.magnitude * Math.cos(a), magnitudeEnd: load.magnitudeEnd === undefined ? undefined : load.magnitudeEnd * Math.cos(a) }, { ...load, id: 'y', direction: 'y', magnitude: load.magnitude * Math.sin(a), magnitudeEnd: load.magnitudeEnd === undefined ? undefined : load.magnitudeEnd * Math.sin(a) }];
    const actual = solveStructure(nodes, [member], [load]), expected = solveStructure(nodes, [member], components);
    expect(actual.error).toBeUndefined(); expect(expected.error).toBeUndefined();
    actual.reactions.forEach((value, i) => { for (const key of ['fx', 'fy', 'm'] as const) expect(value[key]).toBeCloseTo(expected.reactions[i][key], 7); });
    actual.displacements.forEach((value, i) => { for (const key of ['dx', 'dy', 'rotation'] as const) expect(value[key]).toBeCloseTo(expected.displacements[i][key], 9); });
    actual.elements[0].stations.forEach((value, i) => { for (const key of ['axial', 'shear', 'moment', 'deflectionY'] as const) expect(value[key]).toBeCloseTo(expected.elements[0].stations[i][key], 7); });
    expect(computeEquilibriumResidual(actual, nodes, [load], [member]).allOk).toBe(true);
  });
}
it('旋转保持梯形载两端符号关系、作用区间和工况，反向两次恢复原来的向量', () => {
  const original: Load = { id: 'q', elementId: 3, type: 'trapezoidal', magnitude: -4, magnitudeEnd: 7, direction: 'y', startLocation: .2, endLocation: .7, loadCaseId: 'wind' };
  const rotated = rotateSolverLoad(original, 30);
  expect(rotated).toMatchObject({ direction: 'angle', angle: 30, magnitude: 4, magnitudeEnd: -7, startLocation: .2, endLocation: .7, loadCaseId: 'wind', elementId: 3 });
  const reverse = rotateSolverLoad(rotated, solverLoadAngle(rotated) + 180);
  expect(globalLoadComponents(reverse).x).toBeCloseTo(-globalLoadComponents(rotated).x);
  expect(globalLoadComponents({ ...reverse, magnitude: reverse.magnitudeEnd! }).y).toBeCloseTo(-globalLoadComponents({ ...rotated, magnitude: rotated.magnitudeEnd! }).y);
  expect(rotateSolverLoad(reverse, solverLoadAngle(reverse) + 180)).toEqual(rotated);
  expect(rotateSolverLoad(original, 90)).toMatchObject({ direction: 'y', magnitude: 4, magnitudeEnd: -7 });
});
it('四向与零起点三角形载正确映射，力矩反向只改变其符号', () => {
  expect(normalizeLoadAngle(540)).toBe(180); expect(directionForAngle(450)).toBe('up');
  const q: Load = { id: 'q', type: 'trapezoidal', magnitude: 0, magnitudeEnd: -8, direction: 'y' };
  expect(solverLoadAngle(q)).toBe(-90);
  expect(rotateSolverLoad(q, 180)).toMatchObject({ direction: 'x', magnitudeEnd: -8 });
  const m: Load = { id: 'm', type: 'moment', magnitude: 15, nodeId: 2 };
  expect(rotateSolverLoad(m, 0)).toEqual({ ...m, magnitude: -15 });
});
it('无效角度不能静默作为水平力求解', () => {
  expect(solveStructure([], [], [{ id: 'bad', type: 'point', direction: 'angle', magnitude: 5 }]).error).toContain('方向角度');
});
