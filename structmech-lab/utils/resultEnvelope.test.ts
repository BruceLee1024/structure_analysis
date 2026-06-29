import { describe, expect, test } from 'vitest';
import type { AnalysisResult } from '../types';
import { buildResultEnvelopeRows } from './resultEnvelope';

const deadResult: AnalysisResult = {
  maxDeflection: 2,
  reactions: [],
  displacements: [
    { nodeId: 1, dx: 0.2, dy: -1.2, rotation: 0 },
    { nodeId: 2, dx: 0.1, dy: -0.8, rotation: 0 },
  ],
  elements: [
    {
      elementId: 1,
      maxMoment: 12,
      maxShear: 4,
      maxAxial: 8,
      u_local: [],
      startForces: { fx: 0, fy: 0, m: 0 },
      stations: [
        { x: 0, globalX: 0, globalY: 0, moment: 12, shear: 4, axial: -8, deflectionY: 0 },
        { x: 3, globalX: 3, globalY: 0, moment: -5, shear: -2, axial: -6, deflectionY: -1.2 },
      ],
    },
  ],
};

const liveResult: AnalysisResult = {
  maxDeflection: 4,
  reactions: [],
  displacements: [
    { nodeId: 1, dx: 0.1, dy: -2.5, rotation: 0 },
    { nodeId: 2, dx: 0.3, dy: 3.6, rotation: 0 },
  ],
  elements: [
    {
      elementId: 1,
      maxMoment: 18,
      maxShear: 9,
      maxAxial: 5,
      u_local: [],
      startForces: { fx: 0, fy: 0, m: 0 },
      stations: [
        { x: 0, globalX: 0, globalY: 0, moment: 8, shear: 9, axial: 5, deflectionY: -2.5 },
        { x: 3, globalX: 3, globalY: 0, moment: -18, shear: -7, axial: 2, deflectionY: 3.6 },
      ],
    },
  ],
};

describe('result envelope', () => {
  test('builds signed force envelopes and absolute displacement envelope', () => {
    const rows = buildResultEnvelopeRows([
      { target: { type: 'loadCase', id: 'dead', label: '恒载 D' }, result: deadResult },
      { target: { type: 'loadCase', id: 'live', label: '活载 L' }, result: liveResult },
    ]);

    expect(rows.find(row => row.key === 'moment-max')).toMatchObject({
      value: 12,
      sourceLabel: '恒载 D',
      location: '单元 1 · x=0.00 m',
      selection: { kind: 'moment', elementId: 1, globalX: 0, globalY: 0 },
    });
    expect(rows.find(row => row.key === 'moment-min')).toMatchObject({
      value: -18,
      sourceLabel: '活载 L',
      location: '单元 1 · x=3.00 m',
    });
    expect(rows.find(row => row.key === 'shear-max')).toMatchObject({
      value: 9,
      sourceLabel: '活载 L',
    });
    expect(rows.find(row => row.key === 'axial-min')).toMatchObject({
      value: -8,
      sourceLabel: '恒载 D',
    });
    expect(rows.find(row => row.key === 'deflection-abs')).toMatchObject({
      value: 3.6,
      sourceLabel: '活载 L',
      location: '节点 2 · dy',
      selection: { kind: 'deflection', nodeId: 2, component: 'dy' },
    });
  });

  test('returns empty rows when no scenarios have result stations', () => {
    const rows = buildResultEnvelopeRows([
      { target: { type: 'loadCase', id: 'empty', label: '空工况' }, result: { elements: [], reactions: [], displacements: [], maxDeflection: 0 } },
    ]);

    expect(rows.every(row => row.value === null)).toBe(true);
    expect(rows.every(row => row.selection === null)).toBe(true);
  });
});
