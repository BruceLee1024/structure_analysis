import { expect, test } from 'vitest';
import { parseRuleInput } from './ruleParser';
import { StructureType } from '@/types';

test('parses a create-structure sentence for a continuous beam', () => {
  const result = parseRuleInput('建一个三跨连续梁，跨长都 6 米');

  expect(result?.actions[0]).toEqual({
    kind: 'create_structure',
    payload: { structureType: StructureType.MultiSpanBeam, numSpans: 3, width: 18 },
  });
});

test('parses a point load sentence on the second span midpoint', () => {
  const result = parseRuleInput('在第二跨跨中加 20kN 向下集中力');

  expect(result?.actions[0]).toEqual({
    kind: 'add_load',
    payload: { loadType: 'point', magnitude: -20, direction: 'y', targetSpan: 2, location: 0.5 },
  });
});

test('parses a single sentence that creates a beam model and adds a load', () => {
  const result = parseRuleInput('建一个三跨连续梁，跨长都 6 米，在第二跨跨中加 20kN 向下集中力');

  expect(result?.actions).toEqual([
    {
      kind: 'create_structure',
      payload: { structureType: StructureType.MultiSpanBeam, numSpans: 3, width: 18 },
    },
    {
      kind: 'add_load',
      payload: { loadType: 'point', magnitude: -20, direction: 'y', targetSpan: 2, location: 0.5 },
    },
  ]);
});

test('parses a portal frame sentence with natural dimension phrases', () => {
  const result = parseRuleInput('建一个门式刚架，跨度 18 米，柱高 6 米');

  expect(result?.actions[0]).toEqual({
    kind: 'create_structure',
    payload: { structureType: StructureType.PortalFrame, width: 18, height: 6 },
  });
});

test('parses a distributed load sentence with kN/m magnitude', () => {
  const result = parseRuleInput('在第一跨加 12kN/m 向下分布荷载');

  expect(result?.actions[0]).toEqual({
    kind: 'add_load',
    payload: { loadType: 'distributed', magnitude: -12, direction: 'y', targetSpan: 1 },
  });
});
