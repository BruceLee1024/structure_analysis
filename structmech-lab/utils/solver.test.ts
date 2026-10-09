import { describe, expect, it } from 'vitest';
import type { Load, SolverElement, SolverNode } from '../types';
import { calculateExactValues, getDeflectionCorrectionRigidity, solveStructure } from './solver';
import { computeEquilibriumResidual } from './solverDiagnostics';
import { autoConnectNodes } from './geometryGenerator';

const E = 200;
const A = 100;
const I = 200;

const element = (overrides: Partial<SolverElement> = {}): SolverElement => ({
  id: 1,
  startNode: 1,
  endNode: 2,
  E,
  A,
  I,
  ...overrides,
});

const cantileverResult = (loads: Load[]) => {
  const nodes: SolverNode[] = [
    { id: 1, x: 0, y: 0, restraints: [true, true, true] },
    { id: 2, x: 4, y: 0, restraints: [false, false, false] },
  ];

  return solveStructure(nodes, [element()], loads);
};

const midspanStation = (loads: Load[]) => {
  const nodes: SolverNode[] = [
    { id: 1, x: 0, y: 0, restraints: [true, true, false] },
    { id: 2, x: 4, y: 0, restraints: [false, true, false] },
  ];

  const result = solveStructure(nodes, [element()], loads);
  return result.elements[0].stations.find(station => station.x === 2);
};

const simplySupportedResult = (loads: Load[]) => {
  const nodes: SolverNode[] = [
    { id: 1, x: 0, y: 0, restraints: [true, true, false] },
    { id: 2, x: 4, y: 0, restraints: [false, true, false] },
  ];

  return solveStructure(nodes, [element()], loads);
};

describe('solveStructure analytic beam benchmarks', () => {
  it('matches the pictured cantilever with a left-half UDL and a free-end point load', () => {
    const loads: Load[] = [
      { id: 'q', elementId: 1, type: 'distributed', magnitude: -3, direction: 'y', startLocation: 0, endLocation: 0.5 },
      { id: 'p', elementId: 1, type: 'point', magnitude: -2, direction: 'y', location: 1 },
    ];
    const result = cantileverResult(loads);
    expect(result.error).toBeUndefined();
    expect(result.reactions[0]).toMatchObject({ fx: 0, fy: 8, m: 14 });
    for (const [x, moment, shear, deflection] of [
      [0, -14, 8, 0], [2, -4, 2, -0.4833], [3, -2, 2, -0.9250], [4, 0, 2, -1.4167],
    ]) {
      const station = result.elements[0].stations.find(s => s.x === x)!;
      expect(station.moment).toBeCloseTo(moment, 4);
      expect(station.shear).toBeCloseTo(shear, 4);
      expect(station.deflectionY).toBeCloseTo(deflection, 4);
    }
    const nodes: SolverNode[] = [
      { id: 1, x: 0, y: 0, restraints: [true, true, true] },
      { id: 2, x: 4, y: 0, restraints: [false, false, false] },
    ];
    expect(computeEquilibriumResidual(result, nodes, loads, [element()]).allOk).toBe(true);
  });

  it('keeps partial-load results after splitting at a free intermediate node', () => {
    const nodes: SolverNode[] = [
      { id: 1, x: 0, y: 0, restraints: [true, true, true] },
      { id: 2, x: 4, y: 0, restraints: [false, false, false] },
      { id: 3, x: 2, y: 0, restraints: [false, false, false] },
    ];
    const loads: Load[] = [
      { id: 'q', type: 'distributed', elementId: 1, magnitude: -3, startLocation: 0.25, endLocation: 0.75 },
      { id: 'p', type: 'point', elementId: 1, magnitude: -2, location: 0.5 },
    ];
    const original = solveStructure(nodes.slice(0, 2), [element()], loads);
    const split = autoConnectNodes(nodes, [element()], loads);
    const result = solveStructure(split.nodes, split.elements, split.loads);
    expect(split.loads.filter(l => l.type === 'point')).toHaveLength(1);
    expect(result.reactions).toEqual(original.reactions);
    expect(result.maxDeflection).toBeCloseTo(original.maxDeflection, 4);
    expect(computeEquilibriumResidual(result, split.nodes, split.loads, split.elements).allOk).toBe(true);
  });

  it('uses the actual interval for a partial triangular line load', () => {
    const result = cantileverResult([{ id: 'q', elementId: 1, type: 'trapezoidal', magnitude: 0, magnitudeEnd: -6, startLocation: 0, endLocation: 0.5 }]);
    expect(result.reactions[0]).toMatchObject({ fy: 6, m: 8 });
    expect(result.elements[0].stations.find(s => s.x === 3)?.moment).toBe(0);
    expect(result.elements[0].stations.find(s => s.x === 3)?.shear).toBe(0);
  });

  it('balances partial loads on members with both bending ends released', () => {
    const nodes: SolverNode[] = [
      { id: 1, x: 0, y: 0, restraints: [true, true, false] },
      { id: 2, x: 4, y: 0, restraints: [false, true, false] },
    ];
    const result = solveStructure(nodes, [element({ releaseStart: true, releaseEnd: true })],
      [{ id: 'q', type: 'distributed', elementId: 1, magnitude: -3, startLocation: 0, endLocation: 0.5 }]);
    expect(result.reactions[0].fy).toBe(4.5);
    expect(result.reactions[1].fy).toBe(1.5);
    expect(result.elements[0].stations.at(-1)?.moment).toBe(0);
  });
  it('matches cantilever tip deflection for a nodal point load', () => {
    const result = cantileverResult([{ id: 'p1', nodeId: 2, type: 'point', magnitude: -10, direction: 'y' }]);
    const tip = result.elements[0].stations.find(station => station.x === 4);
    const fixedEnd = result.elements[0].stations.find(station => station.x === 0);

    expect(tip?.deflectionY).toBeCloseTo(-5.3333, 4);
    expect(fixedEnd?.moment).toBeCloseTo(-40, 4);
  });

  it('recovers exact midspan deflection for a simply supported beam with a center point load', () => {
    const station = midspanStation([{ id: 'p1', elementId: 1, type: 'point', magnitude: -10, direction: 'y', location: 0.5 }]);

    expect(station?.deflectionY).toBeCloseTo(-0.3333, 4);
    expect(station?.moment).toBeCloseTo(10, 4);
  });

  it('recovers exact midspan deflection for a simply supported beam with a uniform load', () => {
    const station = midspanStation([{ id: 'q1', elementId: 1, type: 'distributed', magnitude: -5, direction: 'y' }]);

    expect(station?.deflectionY).toBeCloseTo(-0.4167, 4);
    expect(station?.moment).toBeCloseTo(10, 4);
  });

  it('integrates trapezoidal element loads into exact shear and moment stations', () => {
    const station = midspanStation([{ id: 'trap1', elementId: 1, type: 'trapezoidal', magnitude: 0, magnitudeEnd: -10, direction: 'y' }]);

    expect(station?.shear).toBeCloseTo(1.6667, 4);
    expect(station?.moment).toBeCloseTo(10, 4);
  });

  it('supports nodal elastic springs and reports spring reactions', () => {
    const result = solveStructure(
      [{ id: 1, x: 0, y: 0, restraints: [false, false, false], springStiffness: [1000, 1000, 1000] }],
      [],
      [{ id: 'p1', nodeId: 1, type: 'point', magnitude: -10, direction: 'y' }],
    );

    expect(result.displacements[0]?.dy).toBeCloseTo(-0.01, 6);
    expect(result.reactions[0]?.fy).toBeCloseTo(10, 6);
  });
});

describe('arbitrary section result queries', () => {
  it('uses the same flexural rigidity correction as solveStructure for center point loads', () => {
    const loads: Load[] = [{ id: 'p1', elementId: 1, type: 'point', magnitude: -10, direction: 'y', location: 0.5 }];
    const result = simplySupportedResult(loads);
    const resultEl = result.elements[0];
    const station = resultEl.stations.find(item => item.x === 2);
    const flexuralRigidity = getDeflectionCorrectionRigidity(element(), 'Elastic');

    const exactValues = calculateExactValues(2, 4, 1, 0, resultEl.u_local, resultEl.startForces, loads, flexuralRigidity);

    expect(exactValues.deflectionY).toBeCloseTo(station?.deflectionY ?? NaN, 4);
  });

  it('uses the same flexural rigidity correction as solveStructure for uniform loads', () => {
    const loads: Load[] = [{ id: 'q1', elementId: 1, type: 'distributed', magnitude: -5, direction: 'y' }];
    const result = simplySupportedResult(loads);
    const resultEl = result.elements[0];
    const station = resultEl.stations.find(item => item.x === 2);
    const flexuralRigidity = getDeflectionCorrectionRigidity(element(), 'Elastic');

    const exactValues = calculateExactValues(2, 4, 1, 0, resultEl.u_local, resultEl.startForces, loads, flexuralRigidity);

    expect(exactValues.deflectionY).toBeCloseTo(station?.deflectionY ?? NaN, 4);
  });
});

describe('getDeflectionCorrectionRigidity', () => {
  it('returns the element EI for unreleased elastic elements', () => {
    expect(getDeflectionCorrectionRigidity(element(), 'Elastic')).toBeCloseTo(40000, 8);
  });

  it('keeps released elements on the conservative no-correction path', () => {
    expect(getDeflectionCorrectionRigidity(element({ releaseStart: true }), 'Elastic')).toBe(0);
    expect(getDeflectionCorrectionRigidity(element({ releaseEnd: true }), 'Elastic')).toBe(0);
  });
});
