import { expect, test } from 'vitest';
import { StructureType, type AnalysisResult, type SolverParams } from '@/types';
import { buildModelSummary, describeModelSummary } from './modelSummary';

const results: AnalysisResult = {
  elements: [{ elementId: 2, stations: [], maxMoment: 21, maxShear: 12, maxAxial: 0, u_local: [], startForces: { fx: 0, fy: 8, m: 0 } }],
  maxDeflection: 0.0113,
  reactions: [{ nodeId: 1, fx: 0, fy: 13, m: 0 }],
  displacements: [{ nodeId: 2, dx: 0, dy: -0.0113, rotation: 0.004 }],
};

test('summarizes a continuous beam with one point load', () => {
  const params: SolverParams = {
    structureType: StructureType.MultiSpanBeam,
    stiffnessType: 'Elastic',
    width: 12,
    height: 0,
    roofHeight: 0,
    numSpans: 3,
    numStories: 1,
    numBays: 1,
    overhangLeft: 0,
    overhangRight: 0,
    elasticModulus: 200,
    crossSectionArea: 50,
    momentOfInertia: 200,
    nodes: [
      { id: 1, x: 0, y: 0, restraints: [false, true, false] },
      { id: 2, x: 4, y: 0, restraints: [false, true, false] },
      { id: 3, x: 8, y: 0, restraints: [false, true, false] },
      { id: 4, x: 12, y: 0, restraints: [false, true, false] },
    ],
    elements: [
      { id: 1, startNode: 1, endNode: 2, E: 200, A: 50, I: 200 },
      { id: 2, startNode: 2, endNode: 3, E: 200, A: 50, I: 200 },
      { id: 3, startNode: 3, endNode: 4, E: 200, A: 50, I: 200 },
    ],
    loads: [{ id: 'load-1', type: 'point', magnitude: -20, direction: 'y', elementId: 2, location: 0.5 }],
  };

  const summary = buildModelSummary(params, results);

  expect(summary.structureLabel).toBe('三跨连续梁');
  expect(summary.loadCount).toBe(1);
  expect(summary.supportSummary).toContain('4 个支承点');
  expect(describeModelSummary(summary)).toContain('第二跨跨中 20kN 向下集中力');
  expect(describeModelSummary(summary)).toContain('计算结果');
  expect(describeModelSummary(summary)).toContain('最大位移 0.0113m');
  expect(describeModelSummary(summary)).toContain('最大弯矩 单元 2 21.00kN·m');
});
