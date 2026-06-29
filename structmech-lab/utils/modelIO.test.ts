import { describe, expect, test } from 'vitest';
import { StructureType, type SolverParams } from '../types';
import { DEFAULT_LOAD_CASES } from './loadCases';
import { createSolverModelExport, importSolverModel } from './modelIO';

const sampleParams: SolverParams = {
  structureType: StructureType.PortalFrame,
  stiffnessType: 'Elastic',
  width: 10,
  height: 5,
  roofHeight: 2,
  numSpans: 3,
  numStories: 2,
  numBays: 2,
  overhangLeft: 0,
  overhangRight: 0,
  elasticModulus: 200,
  crossSectionArea: 50,
  momentOfInertia: 200,
  nodes: [
    { id: 1, x: 0, y: 0, restraints: [true, true, true] },
    { id: 2, x: 10, y: 0, restraints: [true, true, true] },
  ],
  elements: [
    { id: 1, startNode: 1, endNode: 2, E: 200, A: 50, I: 200 },
  ],
  loads: [
    { id: 'q1', type: 'distributed', elementId: 1, magnitude: -5, direction: 'y', loadCaseId: 'dead' },
  ],
  loadCases: DEFAULT_LOAD_CASES,
  loadCombinations: [{ id: 'combo', name: 'Combo', factors: { dead: 1.2 } }],
  activeLoadCaseId: 'dead',
  activeAnalysisType: 'loadCase',
  activeAnalysisId: 'dead',
};

describe('modelIO', () => {
  test('creates a versioned export payload without mutating params', () => {
    const exported = createSolverModelExport(sampleParams, new Date('2026-06-29T00:00:00.000Z'));

    expect(exported.kind).toBe('StructLabSolverModel');
    expect(exported.version).toBe(1);
    expect(exported.exportedAt).toBe('2026-06-29T00:00:00.000Z');
    expect(exported.params).toEqual(sampleParams);
    expect(exported.params).not.toBe(sampleParams);
  });

  test('imports valid JSON and fills missing load-case fields', () => {
    const legacyJson = JSON.stringify({
      kind: 'StructLabSolverModel',
      version: 1,
      params: {
        ...sampleParams,
        loadCases: undefined,
        loadCombinations: undefined,
        activeLoadCaseId: undefined,
        activeAnalysisType: undefined,
        activeAnalysisId: undefined,
      },
    });

    const result = importSolverModel(legacyJson);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.params.loadCases?.[0].id).toBe('dead');
    expect(result.params.loadCombinations?.length).toBeGreaterThan(0);
    expect(result.params.activeLoadCaseId).toBe('dead');
    expect(result.params.activeAnalysisType).toBe('loadCase');
    expect(result.params.activeAnalysisId).toBe('dead');
  });

  test('rejects invalid JSON or model shape', () => {
    expect(importSolverModel('{bad json').ok).toBe(false);
    expect(importSolverModel(JSON.stringify({ kind: 'Other', params: sampleParams })).ok).toBe(false);
    expect(importSolverModel(JSON.stringify({ kind: 'StructLabSolverModel', params: { nodes: [] } })).ok).toBe(false);
  });
});
