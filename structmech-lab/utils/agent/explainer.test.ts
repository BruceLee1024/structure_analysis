import { expect, test, vi, beforeEach } from 'vitest';
vi.mock('@/utils/aiClient', () => ({ sendChatCompletion: vi.fn() }));

import { sendChatCompletion } from '@/utils/aiClient';
import { explainResultsLocally, explainResultsWithLLM, summarizeResultFacts } from './explainer';
import { StructureType, type AnalysisResult, type SolverParams } from '@/types';

beforeEach(() => {
  vi.mocked(sendChatCompletion).mockReset();
});

test('extracts max displacement and reaction facts without calling AI', () => {
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

  const results: AnalysisResult = {
    elements: [{ elementId: 1, stations: [], maxMoment: 32, maxShear: 16, maxAxial: 0, u_local: [], startForces: { fx: 0, fy: 8, m: 0 } }],
    maxDeflection: 0.012,
    reactions: [{ nodeId: 1, fx: 0, fy: 12, m: 0 }],
    displacements: [{ nodeId: 2, dx: 0, dy: -0.012, rotation: 0.004 }],
  };

  const facts = summarizeResultFacts(params, results);

  expect(facts[0]).toContain('最大位移');
  expect(facts.join(' ')).toContain('12.00');
});

test('builds a local causal explanation for why max moment appears at a location', () => {
  const params: SolverParams = {
    structureType: StructureType.MultiSpanBeam,
    stiffnessType: 'Elastic',
    width: 18,
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
      { id: 1, x: 0, y: 0, restraints: [true, true, false] },
      { id: 2, x: 6, y: 0, restraints: [false, false, false] },
      { id: 3, x: 12, y: 0, restraints: [false, false, false] },
      { id: 4, x: 18, y: 0, restraints: [true, true, false] },
    ],
    elements: [
      { id: 1, startNode: 1, endNode: 2, E: 200, A: 50, I: 200 },
      { id: 2, startNode: 2, endNode: 3, E: 200, A: 50, I: 200 },
      { id: 3, startNode: 3, endNode: 4, E: 200, A: 50, I: 200 },
    ],
    loads: [{ id: 'agent-2', type: 'point', magnitude: -20, direction: 'y', elementId: 2, location: 0.5 }],
  };

  const results: AnalysisResult = {
    elements: [
      { elementId: 1, stations: [], maxMoment: 12, maxShear: 8, maxAxial: 0, u_local: [], startForces: { fx: 0, fy: 8, m: 0 } },
      { elementId: 2, stations: [], maxMoment: 21, maxShear: 14, maxAxial: 0, u_local: [], startForces: { fx: 0, fy: 10, m: 0 } },
      { elementId: 3, stations: [], maxMoment: 11, maxShear: 7, maxAxial: 0, u_local: [], startForces: { fx: 0, fy: 7, m: 0 } },
    ],
    maxDeflection: 0.011,
    reactions: [{ nodeId: 1, fx: 0, fy: 12, m: 0 }, { nodeId: 4, fx: 0, fy: 8, m: 0 }],
    displacements: [{ nodeId: 2, dx: 0, dy: -0.009, rotation: 0.003 }],
  };

  const reply = explainResultsLocally({ params, results, loads: params.loads }, '为什么最大弯矩出现在这里？');

  expect(reply).toContain('第 2 跨对应单元 2');
  expect(reply).toContain('相关荷载包括');
  expect(reply).toContain('连续梁');
  expect(reply).toContain('共同控制');
});

test('falls back to local reasoning when llm returns a weak generic explanation', async () => {
  vi.mocked(sendChatCompletion).mockResolvedValue(
    '根据已知事实，最大弯矩出现在单元 2，但没有提供任何关于结构形式、荷载分布或边界条件的信息，因此无法解释其具体原因。',
  );

  const params: SolverParams = {
    structureType: StructureType.MultiSpanBeam,
    stiffnessType: 'Elastic',
    width: 18,
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
      { id: 1, x: 0, y: 0, restraints: [true, true, false] },
      { id: 2, x: 6, y: 0, restraints: [false, false, false] },
      { id: 3, x: 12, y: 0, restraints: [false, false, false] },
      { id: 4, x: 18, y: 0, restraints: [true, true, false] },
    ],
    elements: [
      { id: 1, startNode: 1, endNode: 2, E: 200, A: 50, I: 200 },
      { id: 2, startNode: 2, endNode: 3, E: 200, A: 50, I: 200 },
      { id: 3, startNode: 3, endNode: 4, E: 200, A: 50, I: 200 },
    ],
    loads: [{ id: 'agent-2', type: 'point', magnitude: -20, direction: 'y', elementId: 2, location: 0.5 }],
  };

  const results: AnalysisResult = {
    elements: [
      { elementId: 1, stations: [], maxMoment: 12, maxShear: 8, maxAxial: 0, u_local: [], startForces: { fx: 0, fy: 8, m: 0 } },
      { elementId: 2, stations: [], maxMoment: 21, maxShear: 14, maxAxial: 0, u_local: [], startForces: { fx: 0, fy: 10, m: 0 } },
      { elementId: 3, stations: [], maxMoment: 11, maxShear: 7, maxAxial: 0, u_local: [], startForces: { fx: 0, fy: 7, m: 0 } },
    ],
    maxDeflection: 0.011,
    reactions: [{ nodeId: 1, fx: 0, fy: 12, m: 0 }, { nodeId: 4, fx: 0, fy: 8, m: 0 }],
    displacements: [{ nodeId: 2, dx: 0, dy: -0.009, rotation: 0.003 }],
  };

  const reply = await explainResultsWithLLM(
    { params, results, loads: params.loads },
    '为什么最大弯矩出现在这里？',
  );

  expect(sendChatCompletion).toHaveBeenCalledTimes(1);
  expect(reply).not.toContain('没有提供任何');
  expect(reply).toContain('相关荷载包括');
  expect(reply).toContain('共同控制');
});
