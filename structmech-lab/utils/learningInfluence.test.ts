import { expect, it } from 'vitest';
import { solveLearningBeam, type LearningBeamLoad } from './learningBeam';
import { influenceResponse, translateBeamLoads, movingEnvelope } from './learningInfluence';
const loads: LearningBeamLoad[] = [{ id: 'p', type: 'point', position: 3, magnitude: 20, angle: 135 }, { id: 'q', type: 'linear', start: 1, end: 7, magnitude: 2, endMagnitude: 9, angle: -90 }, { id: 'm', type: 'moment', position: 5, magnitude: 12, rotation: 'cw' }];
it('实际荷载响应与梁的截面平衡一致，包括方向、区间与力偶', () => {
  const d = solveLearningBeam({ beamType: 'simple', L: 8, overhang: 0, loads });
  for (const c of [0, 1, 3, 4.4, 5, 7, 8]) {
    expect(influenceResponse(8, loads, c, 'Mc')).toBeCloseTo(d.momentAt(c), 8);
    expect(influenceResponse(8, loads, c, 'Qc')).toBeCloseTo(d.shearAt(c), 8);
    expect(influenceResponse(8, loads, c, 'Nc')).toBeCloseTo(d.axialAt(c), 8);
    expect(influenceResponse(8, loads, c, 'RA')).toBeCloseTo(d.RA, 8);
  }
});
it('移动线性荷载入跨、出跨时截取正确区间及原始强度，不缩放全荷载', () => {
  const q: LearningBeamLoad = { id: 'q', type: 'linear', start: 0, end: 4, magnitude: 0, endMagnitude: 12, angle: -90 };
  expect(translateBeamLoads([q], -2, 8)).toEqual([{ ...q, start: 0, end: 2, magnitude: 6, endMagnitude: 12 }]);
  expect(translateBeamLoads([q], 7, 8)).toEqual([{ ...q, start: 7, end: 8, magnitude: 0, endMagnitude: 3 }]);
});
it('单一移动集中力给出准确正负包络，反向荷载互换上下包络', () => {
  const p: LearningBeamLoad = { id: 'p', type: 'point', position: 0, magnitude: 20, angle: -90 };
  const down = movingEnvelope(8, [p]), up = movingEnvelope(8, [{ ...p, angle: 90 }]);
  expect(down[50].max).toBe(40); expect(down[50].min).toBe(0);
  expect(up[50].min).toBe(-40); expect(up[50].max).toBe(0);
  expect(down[0].max).toBe(0); expect(down[100].max).toBe(0);
});
it('不等轴重与可变间距影响包络，完全出跨和空荷载均为零', () => {
  const p: LearningBeamLoad = { id: 'a', type: 'point', position: 0, magnitude: 30, angle: -90 };
  const group = [p, { ...p, id: 'b', position: 2, magnitude: 60 }];
  expect(movingEnvelope(8, group)[50].max).toBe(150);
  expect(translateBeamLoads(group, 9, 8)).toEqual([]);
  expect(movingEnvelope(8, []).every(p => p.max === 0 && p.min === 0)).toBe(true);
});
