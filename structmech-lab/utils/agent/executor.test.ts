import { expect, test } from 'vitest';
import { StructureType, type SolverParams } from '@/types';
import { applyAgentActions } from './executor';

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
  loads: [],
};

test('creates a three-span beam and appends a midpoint load in the same atomic pass', () => {
  const result = applyAgentActions(baseParams, [
    { kind: 'create_structure', payload: { structureType: StructureType.MultiSpanBeam, numSpans: 3, width: 18 } },
    { kind: 'add_load', payload: { loadType: 'point', magnitude: -20, direction: 'y', targetSpan: 2, location: 0.5 } },
  ]);

  expect(result.params.structureType).toBe(StructureType.MultiSpanBeam);
  expect(result.params.loads).toHaveLength(1);
  expect(result.params.loads[0].elementId).toBe(2);
});

test('maps left-end support updates onto the regenerated nodes', () => {
  const result = applyAgentActions(baseParams, [
    { kind: 'create_structure', payload: { structureType: StructureType.Beam, width: 6 } },
    { kind: 'update_support', payload: { target: 'left_end', supportType: 'Fixed' } },
  ]);

  expect(result.params.nodes[0].restraints).toEqual([true, true, true]);
});

test('updates material, rewrites a load, and removes all loads when requested', () => {
  const result = applyAgentActions(
    {
      ...baseParams,
      loads: [{ id: 'load-1', type: 'point', magnitude: -10, direction: 'y', elementId: 1, location: 0.5 }],
    },
    [
      { kind: 'update_material', payload: { elasticModulus: 210, crossSectionArea: 60 } },
      { kind: 'update_load', payload: { loadId: 'load-1', magnitude: -30 } },
      { kind: 'remove_load', payload: { scope: 'all' } },
    ],
  );

  expect(result.params.elasticModulus).toBe(210);
  expect(result.params.crossSectionArea).toBe(60);
  expect(result.params.loads).toHaveLength(0);
});

test('returns a warning when a load update cannot find its target', () => {
  const result = applyAgentActions(baseParams, [
    { kind: 'update_load', payload: { loadId: 'missing-load', magnitude: -30 } },
  ]);

  expect(result.warning).toContain('未找到荷载 missing-load');
  expect(result.params.loads).toHaveLength(0);
});

test('supports relative magnitude updates for follow-up load edits', () => {
  const result = applyAgentActions(
    {
      ...baseParams,
      loads: [{ id: 'load-1', type: 'point', magnitude: -20, direction: 'y', elementId: 1, location: 0.5 }],
    },
    [{ kind: 'update_load', payload: { loadId: 'load-1', magnitudeDelta: -5 } }],
  );

  expect(result.params.loads[0].magnitude).toBe(-25);
});

test('supports ordinal load targeting for scaling and relative movement', () => {
  const result = applyAgentActions(
    {
      ...baseParams,
      loads: [
        { id: 'load-1', type: 'point', magnitude: -10, direction: 'y', elementId: 1, location: 0.3 },
        { id: 'load-2', type: 'point', magnitude: -20, direction: 'y', elementId: 1, location: 0.5 },
      ],
    },
    [{ kind: 'update_load', payload: { loadOrdinal: 2, magnitudeScale: 0.5, locationDelta: 0.1 } }],
  );

  expect(result.params.loads[1].magnitude).toBe(-10);
  expect(result.params.loads[1].location).toBe(0.6);
  expect(result.appliedActions[0].payload.loadId).toBe('load-2');
});

test('removes a specific load by ordinal reference', () => {
  const result = applyAgentActions(
    {
      ...baseParams,
      loads: [
        { id: 'load-1', type: 'point', magnitude: -10, direction: 'y', elementId: 1, location: 0.3 },
        { id: 'load-2', type: 'point', magnitude: -20, direction: 'y', elementId: 1, location: 0.5 },
      ],
    },
    [{ kind: 'remove_load', payload: { loadOrdinal: 2 } }],
  );

  expect(result.params.loads).toHaveLength(1);
  expect(result.params.loads[0].id).toBe('load-1');
});

test('returns a human-readable execution summary for model creation and load placement', () => {
  const result = applyAgentActions(baseParams, [
    { kind: 'create_structure', payload: { structureType: 'MultiSpanBeam', numSpans: 3, width: 18 } },
    { kind: 'add_load', payload: { loadType: 'point', magnitude: -20, direction: 'y', targetSpan: 2, location: 0.5 } },
  ]);

  expect(result.summary).toContain('已新建3 跨连续梁');
  expect(result.summary).toContain('已在第 2 跨跨中添加 20 kN 集中力');
});
