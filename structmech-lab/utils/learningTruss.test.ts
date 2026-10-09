import { expect, it } from 'vitest';
import { solveLearningTruss, TRUSS_MEMBERS, type TrussNodeLoad } from './learningTruss';
const force = (node: TrussNodeLoad['node'], magnitude: number, angle = -90): TrussNodeLoad => ({ id: `${node}-${angle}`, node, magnitude, angle });
it('跨中竖向荷载满足各节点平衡，并正确区分弦杆和斜杆的拉压', () => {
  const result = solveLearningTruss(12, 4, [force('F', 50)]);
  expect(result.reactions.ax).toBe(0);
  expect(result.reactions.ay).toBeCloseTo(25);
  expect(result.reactions.by).toBeCloseTo(25);
  for (const id of ['AE', 'EF', 'FG', 'GB']) expect(result.forces[id]).toBeCloseTo(18.75);
  expect(result.forces.CD).toBeCloseTo(-37.5);
  expect(result.forces.AC).toBeCloseTo(-31.25); expect(result.forces.DB).toBeCloseTo(-31.25);
  expect(result.forces.CF).toBeCloseTo(31.25); expect(result.forces.FD).toBeCloseTo(31.25);
  expect(result.forces.CE).toBe(0); expect(result.forces.DG).toBe(0); expect(result.jointResidual).toBeLessThan(1e-10);
});
it('非对称荷载使左右反力与杆力分别变化，加载下弦节点使竖杆受力', () => {
  const top = solveLearningTruss(12, 4, [force('C', 40)]);
  expect(top.reactions.ay).toBeCloseTo(30); expect(top.reactions.by).toBeCloseTo(10);
  expect(top.forces.AE).toBeCloseTo(22.5); expect(top.forces.GB).toBeCloseTo(7.5);
  expect(top.forces.CF).toBeCloseTo(-12.5); expect(top.forces.FD).toBeCloseTo(12.5);
  const lower = solveLearningTruss(12, 4, [force('E', 40)]);
  expect(lower.forces.CE).toBeCloseTo(40); expect(lower.jointResidual).toBeLessThan(1e-10);
});
it('高处水平荷载的力矩、任意角度与多荷载叠加均满足整体与节点平衡', () => {
  const horizontal = solveLearningTruss(12, 4, [force('C', 20, 0)]);
  expect(horizontal.reactions.ax).toBeCloseTo(-20); expect(horizontal.reactions.ay).toBeCloseTo(-80 / 12); expect(horizontal.reactions.by).toBeCloseTo(80 / 12);
  const loads = [force('E', 30), force('D', 15, 135), force('F', 12, 20), force('G', 17, 90)];
  const combined = solveLearningTruss(17, 4, loads), singles = loads.map(load => solveLearningTruss(17, 4, [load]));
  for (const member of TRUSS_MEMBERS) expect(combined.forces[member.id]).toBeCloseTo(singles.reduce((sum, r) => sum + r.forces[member.id], 0), 9);
  expect(combined.reactions.ax + combined.resultant.x).toBeCloseTo(0, 10);
  expect(combined.reactions.ay + combined.reactions.by + combined.resultant.y).toBeCloseTo(0, 10);
  expect(combined.reactions.by * 17 + combined.resultant.moment).toBeCloseTo(0, 9);
  expect(combined.jointResidual).toBeLessThan(1e-10);
});
it('同节点反向荷载抵消、无荷载全部为零，支座处荷载由支座直接抵消', () => {
  const cancelled = solveLearningTruss(12, 4, [force('F', 50), force('F', 50, 90)]);
  const empty = solveLearningTruss(12, 4, []);
  expect(cancelled.forces).toEqual(empty.forces); expect(Object.values(empty.forces).every(v => v === 0)).toBe(true);
  const atSupport = solveLearningTruss(12, 4, [force('A', 10, 135)]);
  expect(Object.values(atSupport.forces).every(v => v === 0)).toBe(true); expect(atSupport.reactions.by).toBe(0);
});
it('拒绝无效尺寸、未知节点和非法荷载', () => {
  expect(() => solveLearningTruss(0, 4, [])).toThrow('跨度');
  expect(() => solveLearningTruss(12, 4, [force('Z' as never, 20)])).toThrow('节点');
  expect(() => solveLearningTruss(12, 4, [force('F', -20)])).toThrow('荷载');
  expect(() => solveLearningTruss(12, 4, [force('F', 20, NaN)])).toThrow('角度');
});
