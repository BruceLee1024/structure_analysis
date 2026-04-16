import { expect, test, vi } from 'vitest';
import { parseAgentInput } from './parser';
import { StructureType, type SolverParams } from '@/types';

const params: SolverParams = {
  structureType: StructureType.Beam,
  stiffnessType: 'Elastic',
  width: 6,
  height: 0,
  roofHeight: 0,
  numSpans: 1,
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

const emptyResults = { elements: [], maxDeflection: 0, reactions: [], displacements: [] };

test('returns fallback result when llm returns nothing', async () => {
  const llm = vi.fn().mockResolvedValue(null);
  const result = await parseAgentInput('建一个三跨连续梁', { params, results: emptyResults }, llm);

  expect(llm).toHaveBeenCalledTimes(1);
  expect(result.actions).toEqual([]);
  expect(result.requiresConfirmation).toBe(true);
});

test('passes llm result through normalization and risk assessment', async () => {
  const llm = vi.fn().mockResolvedValue({
    userText: '建一个三跨连续梁，在第二跨跨中加 20kN 向下集中力',
    summary: '创建三跨连续梁，在第2跨跨中添加 20kN 向下集中力',
    confidence: 0.96,
    actions: [
      { kind: 'create_structure', payload: { structureType: StructureType.MultiSpanBeam, numSpans: 3, width: 18 } },
      { kind: 'add_load', payload: { loadType: 'point', magnitude: -20, direction: 'y', targetSpan: 2, location: 0.5 } },
    ],
    riskLevel: 'medium',
    requiresConfirmation: false,
  });

  const result = await parseAgentInput(
    '建一个三跨连续梁，在第二跨跨中加 20kN 向下集中力',
    { params, results: emptyResults },
    llm,
  );

  expect(llm).toHaveBeenCalledTimes(1);
  expect(result.actions).toEqual([
    { kind: 'create_structure', payload: { structureType: StructureType.MultiSpanBeam, numSpans: 3, width: 18 } },
    { kind: 'add_load', payload: { loadType: 'point', magnitude: -20, direction: 'y', targetSpan: 2, location: 0.5 } },
  ]);
});

test('handles multi-action commands including explain_results', async () => {
  const llm = vi.fn().mockResolvedValue({
    userText: '建一个三跨连续梁并解释弯矩',
    summary: '创建三跨连续梁并解释弯矩分布',
    confidence: 0.95,
    actions: [
      { kind: 'create_structure', payload: { structureType: StructureType.MultiSpanBeam, numSpans: 3, width: 18 } },
      { kind: 'add_load', payload: { loadType: 'point', magnitude: -20, direction: 'y', targetSpan: 2, location: 0.5 } },
      { kind: 'explain_results', payload: { question: '为什么这里弯矩最大' } },
    ],
    riskLevel: 'medium',
    requiresConfirmation: false,
  });

  const result = await parseAgentInput(
    '建一个三跨连续梁并解释弯矩',
    { params, results: emptyResults },
    llm,
  );

  expect(llm).toHaveBeenCalledTimes(1);
  expect(result.actions).toHaveLength(3);
  expect(result.actions[2]).toEqual({
    kind: 'explain_results',
    payload: { question: '为什么这里弯矩最大' },
  });
});

test('uses session memory to resolve follow-up load updates from llm', async () => {
  const llm = vi.fn().mockResolvedValue({
    userText: '把它再大一点',
    summary: '将荷载增大到 30kN',
    confidence: 0.85,
    actions: [{ kind: 'update_load', payload: { magnitude: -30 } }],
    riskLevel: 'medium',
    requiresConfirmation: false,
  });

  const result = await parseAgentInput(
    '把它再大一点',
    {
      params,
      results: emptyResults,
      session: { lastLoadId: 'load-1', lastSpanIndex: 2, lastSummary: '已在第二跨添加集中力' },
    },
    llm,
  );

  expect(result.actions[0]).toEqual({
    kind: 'update_load',
    payload: { loadId: 'load-1', magnitude: -30, targetSpan: 2 },
  });
  expect(llm).toHaveBeenCalledTimes(1);
});

test('replaces an invalid llm loadId with the real session loadId for follow-up load edits', async () => {
  const llm = vi.fn().mockResolvedValue({
    userText: '把跨中荷载调整为 10kN',
    summary: '将跨中荷载调整到 10kN',
    confidence: 0.95,
    actions: [{ kind: 'update_load', payload: { loadId: 'load-2', magnitude: -10 } }],
    riskLevel: 'medium',
    requiresConfirmation: false,
  });

  const result = await parseAgentInput(
    '把跨中荷载调整为 10kN',
    {
      params: {
        ...params,
        loads: [
          { id: 'agent-1', type: 'point', magnitude: -4, direction: 'y', elementId: 1, location: 0.5 },
          { id: 'agent-2', type: 'point', magnitude: -4, direction: 'y', elementId: 2, location: 0.5 },
        ],
      },
      results: emptyResults,
      session: { lastLoadId: 'agent-2', lastSpanIndex: 2, lastSummary: '已在第 2 跨跨中添加 4kN 集中力' },
    },
    llm,
  );

  expect(result.actions[0]).toEqual({
    kind: 'update_load',
    payload: { loadId: 'agent-2', magnitude: -10, targetSpan: 2 },
  });
  expect(result.requiresConfirmation).toBe(false);
});

test('requests clarification when a load update cannot be resolved from context', async () => {
  const llm = vi.fn().mockResolvedValue({
    userText: '把它再大一点',
    summary: '修改荷载',
    confidence: 0.5,
    actions: [{ kind: 'update_load', payload: { magnitude: -30 } }],
    riskLevel: 'medium',
    requiresConfirmation: true,
  });

  const result = await parseAgentInput('把它再大一点', { params, results: emptyResults }, llm);

  expect(result.clarification).toContain('请说明要修改哪一个荷载');
  expect(result.requiresConfirmation).toBe(true);
  expect(llm).toHaveBeenCalledTimes(1);
});

test('normalizes ordinal scaling and relative shifts from llm result', async () => {
  const llm = vi.fn().mockResolvedValue({
    userText: '把第二个荷载减半并右移10%',
    summary: '将第2个荷载减半并右移10%',
    confidence: 0.90,
    actions: [{ kind: 'update_load', payload: { loadOrdinal: 2, magnitudeScale: 0.5, locationDelta: 0.1 } }],
    riskLevel: 'medium',
    requiresConfirmation: false,
  });

  const result = await parseAgentInput(
    '把第二个荷载减半并右移10%',
    {
      params: {
        ...params,
        loads: [
          { id: 'load-1', type: 'point', magnitude: -10, direction: 'y', elementId: 1, location: 0.3 },
          { id: 'load-2', type: 'point', magnitude: -20, direction: 'y', elementId: 1, location: 0.5 },
        ],
      },
      results: emptyResults,
    },
    llm,
  );

  expect(result.actions[0]).toEqual({
    kind: 'update_load',
    payload: { loadOrdinal: 2, magnitudeScale: 0.5, locationDelta: 0.1 },
  });
  expect(result.requiresConfirmation).toBe(false);
  expect(llm).toHaveBeenCalledTimes(1);
});
