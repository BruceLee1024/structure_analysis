import { describe, expect, it } from 'vitest';
import type { Load, SolverElement, SolverNode } from '../types';
import { calculateExactValues, getDeflectionCorrectionRigidity, solveStructure } from './solver';

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
