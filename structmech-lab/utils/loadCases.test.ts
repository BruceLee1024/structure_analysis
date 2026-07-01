import { describe, expect, test } from 'vitest';
import { StructureType, type SolverParams } from '../types';
import { DEFAULT_LOAD_CASES, getAnalysisLoads } from './loadCases';

const baseParams: SolverParams = {
  structureType: StructureType.Beam,
  stiffnessType: 'Elastic',
  width: 6,
  height: 0,
  roofHeight: 0,
  numSpans: 2,
  numStories: 1,
  numBays: 1,
  overhangLeft: 0,
  overhangRight: 0,
  elasticModulus: 200,
  crossSectionArea: 50,
  momentOfInertia: 200,
  nodes: [],
  elements: [],
  loads: [
    { id: 'd1', type: 'point', magnitude: -10, direction: 'y', nodeId: 1, loadCaseId: 'dead' },
    { id: 'l1', type: 'point', magnitude: -20, direction: 'y', nodeId: 2, loadCaseId: 'live' },
  ],
  loadCases: DEFAULT_LOAD_CASES,
  loadCombinations: [{ id: 'combo', name: 'Combo', factors: { dead: 1.2, live: 1.4 } }],
  activeLoadCaseId: 'dead',
  activeAnalysisType: 'loadCase',
  activeAnalysisId: 'dead',
};

describe('load case helpers', () => {
  test('returns only the selected load case for single-case analysis', () => {
    expect(getAnalysisLoads(baseParams).map(load => load.id)).toEqual(['d1']);
  });

  test('scales loads for a combination without mutating the originals', () => {
    const loads = getAnalysisLoads({ ...baseParams, activeAnalysisType: 'combination', activeAnalysisId: 'combo' });

    expect(loads.map(load => load.magnitude)).toEqual([-12, -28]);
    expect(baseParams.loads.map(load => load.magnitude)).toEqual([-10, -20]);
  });

  test('scales both ends of trapezoidal loads in combinations', () => {
    const params: SolverParams = {
      ...baseParams,
      loads: [
        {
          id: 'trap',
          type: 'trapezoidal',
          elementId: 1,
          magnitude: -4,
          magnitudeEnd: -10,
          direction: 'y',
          loadCaseId: 'dead',
        },
      ],
      loadCombinations: [{ id: 'combo', name: 'Combo', factors: { dead: 1.5 } }],
      activeAnalysisType: 'combination',
      activeAnalysisId: 'combo',
    };

    const [load] = getAnalysisLoads(params);

    expect(load.magnitude).toBe(-6);
    expect(load.magnitudeEnd).toBe(-15);
    expect(params.loads[0].magnitudeEnd).toBe(-10);
  });
});
