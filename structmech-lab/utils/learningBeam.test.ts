import { expect, it } from 'vitest';
import { solveLearningBeam, type LearningBeamLoad, type LearningBeamInput } from './learningBeam';
const beam = (loads: LearningBeamLoad[], change: Partial<LearningBeamInput> = {}) => solveLearningBeam({ beamType: 'simple', L: 8, overhang: 2, loads, ...change });
const point = (position: number, magnitude: number, angle = -90): LearningBeamLoad => ({ id: `p-${position}`, type: 'point', position, magnitude, angle });
const uniform = (start: number, end: number, magnitude: number, angle = -90): LearningBeamLoad => ({ id: 'q', type: 'uniform', start, end, magnitude, angle });
const moment = (position: number, magnitude: number, rotation: 'cw' | 'ccw' = 'ccw'): LearningBeamLoad => ({ id: 'm', type: 'moment', position, magnitude, rotation });

it('局部均布与端部集中力叠加，复现 4 m 悬臂梁示例', () => {
  const d = beam([uniform(0, 2, 3), point(4, 2)], { beamType: 'cantilever', L: 4 });
  expect(d.RA).toBe(8); expect(d.fixedMoment).toBe(14);
  expect(d.momentAt(0)).toBe(-14); expect(d.momentAt(2)).toBe(-4); expect(d.momentAt(4)).toBe(0);
  expect(d.shearAt(2)).toBe(2); expect(d.shearAt(4, 'left')).toBe(2); expect(d.shearAt(4)).toBe(0);
});
it('不同方向的多集中力可作用在任意米制位置，同位置反向荷载正确抵消', () => {
  const d = beam([point(1.25, 10), point(6.75, 6, 90), point(4, 12, 0)]);
  expect(d.RB).toBe(-3.5); expect(d.RA).toBe(7.5); expect(d.Ax).toBe(-12);
  expect(d.shearAt(1.25, 'right') - d.shearAt(1.25, 'left')).toBe(-10);
  expect(d.axialAt(2)).toBe(12); expect(d.axialAt(4)).toBe(0);
  const cancelled = beam([point(4, 20), point(4, 20, 90)]);
  expect(cancelled.Mmax).toBe(0); expect(cancelled.Vmax).toBe(0);
});
it('集中弯矩按方向形成真实弯矩跳变，不造成剪力跳变', () => {
  for (const rotation of ['ccw', 'cw'] as const) {
    const sign = rotation === 'ccw' ? 1 : -1, d = beam([moment(3, 24, rotation)]);
    expect(d.RA).toBe(3 * sign); expect(d.RB).toBe(-3 * sign);
    expect(d.momentAt(3, 'left')).toBe(9 * sign); expect(d.momentAt(3)).toBe(-15 * sign);
    expect(d.shearAt(3, 'left')).toBe(d.shearAt(3));
    expect(d.moment.filter(p => p.x === 3).map(p => p.value)).toEqual([9 * sign, -15 * sign]);
  }
});
it('三角形荷载使用正确形心，并包含解析剪力零点作为弯矩极值', () => {
  const d = beam([{ id: 'triangle', type: 'linear', start: 0, end: 8, magnitude: 0, endMagnitude: 12, angle: -90 }]);
  expect(d.RA).toBeCloseTo(16); expect(d.RB).toBeCloseTo(32);
  const peakX = Math.sqrt(64 / 3);
  expect(d.momentPeak.x).toBeCloseTo(peakX, 10);
  expect(d.Mmax).toBeCloseTo(16 * peakX - .25 * peakX ** 3, 10);
  expect(d.momentAt(8)).toBe(0);
});
it('重叠梯形荷载、斜向荷载与力偶符合叠加及整体平衡', () => {
  const loads: LearningBeamLoad[] = [uniform(1, 6, 3, 135), { id: 'linear', type: 'linear', start: 3, end: 8, magnitude: 2, endMagnitude: 7, angle: -90 }, point(7, 18, 30), moment(4.25, 11)];
  const d = beam(loads), singles = loads.map(load => beam([load]));
  for (const x of [0, 1, 3, 4.25, 5.77, 7, 8]) {
    for (const side of ['left', 'right'] as const) {
      for (const key of ['momentAt', 'shearAt', 'axialAt'] as const) expect(d[key](x, side)).toBeCloseTo(singles.reduce((sum, single) => sum + single[key](x, side), 0), 9);
    }
  }
  expect(d.Ax + d.resultant.x).toBeCloseTo(0); expect(d.RA + d.RB + d.resultant.y).toBeCloseTo(0);
  expect(d.RB * 8 + d.resultant.moment).toBeCloseTo(0); expect(d.momentAt(8)).toBe(0);
});
it('水平分布荷载形成轴力梯度，改变方向切换拉压', () => {
  const right = beam([uniform(2, 6, 5, 0)]), left = beam([uniform(2, 6, 5, 180)]);
  expect(right.Ax).toBe(-20); expect(right.axialAt(3)).toBe(15); expect(right.axialAt(6)).toBe(0);
  expect(left.axialAt(3)).toBe(-15); expect(right.Mmax).toBe(0); expect(right.Vmax).toBe(0);
});
it('外伸段荷载与支座集中力合并正确，端部力偶的左右极限被保留', () => {
  const d = beam([point(10, 20), point(8, 5), moment(10, 12)], { beamType: 'overhanging' });
  expect(d.RB).toBe(28.5); expect(d.RA).toBe(-3.5);
  expect(d.momentAt(10, 'left')).toBe(12); expect(d.momentAt(10)).toBe(0);
  expect(d.shearAt(10)).toBe(0); expect(d.momentAt(8)).toBe(-28);
  expect(d.shearAt(8) - d.shearAt(8, 'left')).toBe(23.5);
});
it('删除所有荷载清零，固定端上的力及力偶直接由支座平衡', () => {
  const empty = beam([]); expect(empty.RA).toBe(0); expect(empty.Mmax).toBe(0); expect(empty.Nmax).toBe(0);
  const atSupport = beam([point(0, 30, 45), moment(0, 22)], { beamType: 'cantilever' });
  expect(atSupport.Mmax).toBe(0); expect(atSupport.Vmax).toBe(0); expect(atSupport.Nmax).toBe(0);
});
it('拒绝越界位置、无效区间、负强度与非法尺寸', () => {
  expect(() => beam([point(8.01, 10)])).toThrow('位置');
  expect(() => beam([uniform(4, 4, 10)])).toThrow('终点');
  expect(() => beam([point(3, -2)])).toThrow('非负');
  expect(() => beam([], { L: 0 })).toThrow('梁长');
});
