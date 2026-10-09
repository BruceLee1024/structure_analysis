import { describe, expect, test } from 'vitest';
import { StructureType, type SolverParams } from '../types';
import { validateModel } from './modelValidation';

const baseParams: SolverParams = {
  structureType: StructureType.Custom,
  stiffnessType: 'Elastic',
  width: 1,
  height: 1,
  roofHeight: 0,
  numSpans: 1,
  numStories: 1,
  numBays: 1,
  overhangLeft: 0,
  overhangRight: 0,
  elasticModulus: 200,
  crossSectionArea: 50,
  momentOfInertia: 200,
  nodes: [
    { id: 1, x: 0, y: 0, restraints: [false, false, false] },
    { id: 2, x: 0, y: 0, restraints: [false, false, false] },
  ],
  elements: [{ id: 1, startNode: 1, endNode: 2, E: 200, A: 50, I: 200 }],
  loads: [{ id: 'load-1', type: 'point', magnitude: -10, direction: 'y', nodeId: 99 }],
};

describe('model validation', () => {
  test('reports fundamental modeling errors', () => {
    const issues = validateModel(baseParams, []);
    const ids = issues.map(issue => issue.id);

    expect(ids).toContain('element-zero-1');
    expect(ids).toContain('no-restraints');
    expect(ids).toContain('load-node-load-1');
  });

  test('warns about unreasonable deflection limit ratios', () => {
    const issues = validateModel({ ...baseParams, deflectionLimitRatio: 2000 }, []);

    expect(issues.map(issue => issue.id)).toContain('deflection-limit-ratio');
  });
});

test.each([
  { startLocation: 0.5, endLocation: 0.5 },
  { startLocation: 0.6, endLocation: 0.2 },
  { startLocation: -0.1, endLocation: 0.5 },
  { startLocation: 0, endLocation: 1.1 },
  { startLocation: NaN, endLocation: 1 },
])('rejects invalid partial line-load bounds: %j', range => {
  const loads: SolverParams['loads'] = [{ id: 'q', type: 'distributed', elementId: 1, magnitude: -3, ...range }];
  expect(validateModel({ ...baseParams, loads }, loads)).toContainEqual(expect.objectContaining({ id: 'load-range-q', severity: 'error' }));
});
