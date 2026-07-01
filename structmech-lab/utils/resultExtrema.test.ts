import { describe, expect, test } from 'vitest';
import type { AnalysisResult } from '../types';
import { getResultExtrema, getSelectionForExtreme } from './resultExtrema';

const result: AnalysisResult = {
  maxDeflection: 4.2,
  reactions: [],
  displacements: [
    { nodeId: 1, dx: 0, dy: 0, rotation: 0 },
    { nodeId: 2, dx: 1.5, dy: -4.2, rotation: 0.01 },
  ],
  elements: [
    {
      elementId: 1,
      maxMoment: 9,
      maxShear: 3,
      maxAxial: 2,
      u_local: [],
      startForces: { fx: 0, fy: 0, m: 0 },
      stations: [
        { x: 0, globalX: 0, globalY: 0, moment: 2, shear: 3, axial: -2, deflectionY: 0 },
        { x: 2, globalX: 2, globalY: 0, moment: -9, shear: -1, axial: 1, deflectionY: -1.1 },
      ],
    },
    {
      elementId: 2,
      maxMoment: 5,
      maxShear: 8,
      maxAxial: 7,
      u_local: [],
      startForces: { fx: 0, fy: 0, m: 0 },
      stations: [
        { x: 0, globalX: 2, globalY: 0, moment: 1, shear: -8, axial: 7, deflectionY: -4.2 },
        { x: 3, globalX: 5, globalY: 0, moment: 5, shear: 2, axial: -3, deflectionY: -2 },
      ],
    },
  ],
};

describe('getResultExtrema', () => {
  test('finds controlling element stations and displacement node', () => {
    const extrema = getResultExtrema(result);

    expect(extrema.moment).toMatchObject({ elementId: 1, value: -9, x: 2 });
    expect(extrema.shear).toMatchObject({ elementId: 2, value: -8, x: 0 });
    expect(extrema.axial).toMatchObject({ elementId: 2, value: 7, x: 0 });
    expect(extrema.deflection).toMatchObject({ nodeId: 2, value: -4.2 });
  });

  test('returns null extrema for empty results', () => {
    expect(getResultExtrema({ elements: [], reactions: [], displacements: [], maxDeflection: 0 })).toEqual({
      moment: null,
      shear: null,
      axial: null,
      deflection: null,
    });
  });

  test('creates selection targets for control extrema', () => {
    const extrema = getResultExtrema(result);

    expect(getSelectionForExtreme(extrema, 'moment')).toMatchObject({
      kind: 'moment',
      label: '最大弯矩',
      elementId: 1,
      x: 2,
      globalX: 2,
      globalY: 0,
    });
    expect(getSelectionForExtreme(extrema, 'deflection')).toMatchObject({
      kind: 'deflection',
      label: '最大位移',
      nodeId: 2,
      component: 'dy',
    });
  });

  test('uses element station deflection when it exceeds nodal displacement', () => {
    const extrema = getResultExtrema({
      maxDeflection: 0.4167,
      reactions: [],
      displacements: [
        { nodeId: 1, dx: 0, dy: 0, rotation: 0 },
        { nodeId: 2, dx: 0, dy: 0, rotation: 0 },
      ],
      elements: [
        {
          elementId: 1,
          maxMoment: 10,
          maxShear: 5,
          maxAxial: 0,
          u_local: [],
          startForces: { fx: 0, fy: 5, m: 0 },
          stations: [
            { x: 0, globalX: 0, globalY: 0, moment: 0, shear: 5, axial: 0, deflectionY: 0 },
            { x: 2, globalX: 2, globalY: -0.0004167, moment: 10, shear: 0, axial: 0, deflectionY: -0.4167 },
            { x: 4, globalX: 4, globalY: 0, moment: 0, shear: -5, axial: 0, deflectionY: 0 },
          ],
        },
      ],
    });

    expect(extrema.deflection).toMatchObject({
      elementId: 1,
      x: 2,
      value: -0.4167,
      globalX: 2,
      globalY: -0.0004167,
    });
    expect(getSelectionForExtreme(extrema, 'deflection')).toMatchObject({
      kind: 'deflection',
      label: '最大位移',
      elementId: 1,
      x: 2,
      globalX: 2,
      globalY: -0.0004167,
    });
  });
});
