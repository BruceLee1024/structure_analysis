import { expect, test } from 'vitest';
import { StructureType, type SolverParams } from '@/types';
import { assessAgentRisk } from './risk';

const baseParams: SolverParams = {
  structureType: StructureType.PortalFrame,
  stiffnessType: 'Elastic',
  width: 10,
  height: 5,
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
  loads: [{ id: 'load-1', type: 'point', magnitude: -10, direction: 'y', nodeId: 1 }],
};

test('allows autonomous replacement when a new structure would overwrite the current loaded model', () => {
  const result = assessAgentRisk(baseParams, [
    { kind: 'create_structure', payload: { structureType: StructureType.MultiSpanBeam, numSpans: 3 } },
  ]);

  expect(result.level).toBe('medium');
  expect(result.requiresConfirmation).toBe(false);
  expect(result.reasons[0]).toContain('可通过撤销恢复');
});

test('still requires confirmation when all loads would be cleared', () => {
  const result = assessAgentRisk(baseParams, [{ kind: 'remove_load', payload: { scope: 'all' } }]);

  expect(result.level).toBe('high');
  expect(result.requiresConfirmation).toBe(true);
  expect(result.reasons[0]).toContain('清空全部荷载');
});
