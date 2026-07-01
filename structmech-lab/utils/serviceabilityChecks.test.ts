import { describe, expect, test } from 'vitest';
import type { AnalysisResult, SolverElement, SolverNode } from '../types';
import type { SpaceAnalysisResult, SpaceElement, SpaceNode } from './spaceSolver';
import {
  buildServiceabilityRows,
  buildSpaceServiceabilityRows,
  getWorstServiceabilityRow,
  getWorstSpaceServiceabilityRow,
  normalizeDeflectionLimitRatio,
} from './serviceabilityChecks';

const nodes: SolverNode[] = [
  { id: 1, x: 0, y: 0, restraints: [true, true, false] },
  { id: 2, x: 5, y: 0, restraints: [false, true, false] },
];

const elements: SolverElement[] = [
  { id: 1, startNode: 1, endNode: 2, E: 200, A: 50, I: 200 },
];

const result: AnalysisResult = {
  maxDeflection: 26,
  reactions: [],
  displacements: [],
  elements: [
    {
      elementId: 1,
      maxMoment: 0,
      maxShear: 0,
      maxAxial: 0,
      u_local: [],
      startForces: { fx: 0, fy: 0, m: 0 },
      stations: [
        { x: 0, globalX: 0, globalY: 0, deflectionY: 0, axial: 0, shear: 0, moment: 0 },
        { x: 2.5, globalX: 2.5, globalY: 0, deflectionY: -26, axial: 0, shear: 0, moment: 0 },
      ],
    },
  ],
};

const spaceNodes: SpaceNode[] = [
  { id: 1, x: 0, y: 0, z: 0, restraints: [true, true, true, true, true, true] },
  { id: 2, x: 3, y: 4, z: 0, restraints: [false, false, false, false, false, false] },
];

const spaceElements: SpaceElement[] = [
  { id: 1, startNode: 1, endNode: 2, E: 200, A: 50, Iy: 200, Iz: 200, J: 100 },
];

const spaceResult: SpaceAnalysisResult = {
  status: 'ok',
  maxDisplacement: 30,
  reactions: [],
  displacements: [
    { nodeId: 1, dx: 0, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0 },
    { nodeId: 2, dx: 18, dy: 24, dz: 0, rx: 0, ry: 0, rz: 0 },
  ],
  elements: [
    {
      elementId: 1,
      length: 5,
      localEndForces: [],
      localDisplacements: [],
      stations: [],
      maxAbsAxial: 0,
      maxAbsShearY: 0,
      maxAbsShearZ: 0,
      maxAbsTorsion: 0,
      maxAbsMomentY: 0,
      maxAbsMomentZ: 0,
    },
  ],
};

describe('serviceability checks', () => {
  test('normalizes invalid deflection limit ratios', () => {
    expect(normalizeDeflectionLimitRatio(undefined)).toBe(250);
    expect(normalizeDeflectionLimitRatio(-1)).toBe(250);
    expect(normalizeDeflectionLimitRatio(1200)).toBe(1000);
  });

  test('builds element deflection utilization rows', () => {
    const [row] = buildServiceabilityRows(result, elements, nodes, 250);

    expect(row.elementId).toBe(1);
    expect(row.limitMm).toBe(20);
    expect(row.deflectionMm).toBe(26);
    expect(row.utilization).toBeCloseTo(1.3);
    expect(row.locationM).toBe(2.5);
    expect(row.passed).toBe(false);
  });

  test('selects the worst utilization row', () => {
    const rows = buildServiceabilityRows(result, elements, nodes, 250);

    expect(getWorstServiceabilityRow(rows)?.elementId).toBe(1);
  });

  test('builds space member serviceability rows from endpoint resultant displacement', () => {
    const [row] = buildSpaceServiceabilityRows(spaceResult, spaceElements, spaceNodes, 250);

    expect(row.elementId).toBe(1);
    expect(row.lengthM).toBe(5);
    expect(row.limitMm).toBe(20);
    expect(row.displacementMm).toBe(30);
    expect(row.utilization).toBeCloseTo(1.5);
    expect(row.controllingNodeId).toBe(2);
    expect(row.passed).toBe(false);
  });

  test('selects the worst space serviceability utilization row', () => {
    const rows = buildSpaceServiceabilityRows(spaceResult, spaceElements, spaceNodes, 250);

    expect(getWorstSpaceServiceabilityRow(rows)?.elementId).toBe(1);
  });
});
