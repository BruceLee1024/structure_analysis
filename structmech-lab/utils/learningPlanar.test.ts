import { expect, it } from 'vitest';
import { solveLearningPlanar, type PlanarLoad, type PlanarKind } from './learningPlanar';
const load = (patch: Partial<PlanarLoad>): PlanarLoad => ({ id: 'l', member: 1, type: 'point', magnitude: 10, endMagnitude: 10, position: .5, start: 0, end: 1, angle: -90, rotation: 'ccw', ...patch });
const solve = (kind: PlanarKind, loads: PlanarLoad[], L = 6, H = 6) => solveLearningPlanar({ kind, L, H }, loads);
it('门式刚架满足整体平衡、端部条件和梁柱连续弯矩，纠正旧反力方向', () => {
  const d = solve('frame', [load({ member: 0, angle: 0 }), load({ type: 'uniform', magnitude: 20 })]);
  expect(d.reactions.Ax).toBeCloseTo(-10); expect(d.reactions.Ay).toBeCloseTo(55); expect(d.reactions.By).toBeCloseTo(65);
  expect(d.at(0, 0).M).toBe(0); expect(d.at(2, 1, 'left').M).toBe(0);
  expect(d.at(0, 1).M).toBe(30); expect(d.at(1, 0).M).toBe(30);
  expect(d.at(1, .5).M).toBeCloseTo(105); expect(d.at(1, 1).M).toBe(0);
  expect(d.at(1, .5).N).toBe(0);
});
it('同向、反向、斜向、不同杆件荷载的内力和反力严格叠加', () => {
  const loads = [load({ member: 2, angle: 135 }), load({ member: 1, type: 'moment', magnitude: 24 }), load({ type: 'linear', start: .2, end: .9, magnitude: 3, endMagnitude: 12, angle: 30 })];
  const all = solve('frame', loads), singles = loads.map(l => solve('frame', [l]));
  for (const key of ['Ax', 'Ay', 'By'] as const) expect(all.reactions[key]).toBeCloseTo(singles.reduce((s, d) => s + d.reactions[key], 0), 9);
  for (const member of [0, 1, 2]) for (const t of [.1, .5, .8]) for (const key of ['M', 'V', 'N'] as const) expect(all.at(member, t)[key]).toBeCloseTo(singles.reduce((s, d) => s + d.at(member, t)[key], 0), 9);
  const cancelled = solve('frame', [load({}), load({ angle: 90 })]);
  expect(cancelled.peaks).toEqual({ M: 0, V: 0, N: 0 });
});
it('抛物线三铰拱全跨竖向均布荷载产生合理拱轴线：弯矩和剪力为零', () => {
  const d = solve('arch', [load({ member: 0, type: 'uniform', magnitude: 10 })], 20, 5);
  expect(d.reactions).toMatchObject({ Ax: 100, Ay: 100, Bx: -100, By: 100 });
  expect(d.peaks.M).toBe(0); expect(d.peaks.V).toBe(0);
  expect(d.at(0, .5).N).toBe(-100);
  expect(d.at(0, 0).N).toBeCloseTo(-Math.sqrt(20000));
});
it('非对称拱荷载仍满足拱顶铰零弯矩及两端平衡，力偶有真实跳变', () => {
  const d = solve('arch', [load({ member: 0, position: .25, angle: 0, magnitude: 30 }), load({ member: 0, type: 'moment', position: .7, magnitude: 12 })], 20, 5);
  expect(d.at(0, .5).M).toBe(0); expect(d.at(0, 1, 'left').M).toBe(0);
  expect(d.reactions.Ax + d.reactions.Bx + 30).toBeCloseTo(0);
  expect(d.at(0, .7).M - d.at(0, .7, 'left').M).toBeCloseTo(-12);
});
it('组合结构采用固定左柱、铰支右柱和梁端铰：两铰零弯矩，柱底平衡', () => {
  const d = solve('composite', [load({ type: 'uniform', magnitude: 15 }), load({ member: 0, angle: 0, magnitude: 40, position: 1 })], 12, 6);
  for (const [key, value] of Object.entries({ Ax: -40, Ay: 90, Bx: 0, By: 90, MA: 240 })) expect(d.reactions[key as keyof typeof d.reactions]).toBeCloseTo(value);
  expect(d.at(0, 1).M).toBe(0); expect(d.at(1, 1).M).toBe(0);
  expect(d.at(1, .5).M).toBeCloseTo(270); expect(d.at(0, 0).M).toBe(-240);
});
it('组合结构右柱任意横向荷载传递至梁和左柱，非对称反力正确', () => {
  const d = solve('composite', [load({ member: 2, magnitude: 20, angle: 0 })], 12, 6);
  expect(d.reactions).toMatchObject({ Ax: -10, Bx: -10, Ay: 0, By: 0, MA: 60 });
  expect(d.at(1, .5).N).toBe(10);
  expect(d.at(0, 1).M).toBe(0); expect(d.at(1, 1).M).toBe(0);
});
it('局部梯形荷载按实际杆长与形心积分，无荷载清零且拒绝铰上力偶', () => {
  const d = solve('frame', [load({ type: 'linear', start: .25, end: .75, magnitude: 0, endMagnitude: 12 })]);
  expect(d.external.y).toBe(-18); expect(d.external.m).toBeCloseTo(-63);
  expect(solve('composite', []).peaks).toEqual({ M: 0, V: 0, N: 0 });
  expect(() => solve('arch', [load({ member: 0, type: 'moment', position: .5 })])).toThrow('理想铰');
});
