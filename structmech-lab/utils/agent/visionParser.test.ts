import { beforeEach, expect, test, vi } from 'vitest';
import { parseImageToActions } from './visionParser';
import { sendVisionCompletion } from '../visionClient';
import { applyAgentActions } from './executor';
import { StructureType, type SolverParams } from '../../types';
import { solveStructure } from '../solver';

vi.mock('../visionClient', () => ({
  compressImageIfNeeded: vi.fn(async (url: string) => url),
  sendVisionCompletion: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

test('keeps the pictured partial UDL through image conversion and model application', async () => {
  vi.mocked(sendVisionCompletion).mockResolvedValue(JSON.stringify({
    nodes: [{ id: 'A', x: 0, y: 0, support: 'fixed' }, { id: 'C', x: 4, y: 0, support: 'none' }],
    elements: [{ start: 'A', end: 'C' }],
    loads: [
      { type: 'distributed', x1: 0, y1: 0, x2: 2, y2: 0, qy: -3 },
      { type: 'point', x: 4, y: 0, fy: -2 },
    ],
  }));
  const parsed = await parseImageToActions('data:image/png;base64,test');
  expect(parsed.requiresConfirmation).toBe(true);
  expect(parsed.actions[0].payload.loads?.[0]).toMatchObject({ elementId: 1, magnitude: -3, startLocation: 0, endLocation: 0.5 });
  const base: SolverParams = {
    structureType: StructureType.Custom, stiffnessType: 'Elastic', width: 4, height: 1, roofHeight: 0,
    numSpans: 1, numStories: 1, numBays: 1, overhangLeft: 0, overhangRight: 0,
    elasticModulus: 200, crossSectionArea: 100, momentOfInertia: 200, nodes: [], elements: [], loads: [],
  };
  const { params } = applyAgentActions(base, parsed.actions);
  expect(params.loads[0].endLocation).toBe(0.5);
  expect(params.nodes).toHaveLength(2);
  expect(params.nodes[1].restraints).toEqual([false, false, false]);
  expect(solveStructure(params.nodes, params.elements, params.loads).reactions[0]).toMatchObject({ fy: 8, m: 14 });
});

test('projects one image line load onto every overlapping member including reversed members', async () => {
  vi.mocked(sendVisionCompletion).mockResolvedValue(JSON.stringify({
    nodes: [
      { id: 'A', x: 0, y: 0, support: 'fixed' }, { id: 'B', x: 2, y: 0, support: 'none' },
      { id: 'C', x: 4, y: 0, support: 'none' }, { id: 'D', x: 2, y: 3, support: 'none' },
    ],
    elements: [{ start: 'A', end: 'B' }, { start: 'C', end: 'B' }, { start: 'B', end: 'D' }],
    loads: [{ type: 'distributed', x1: 1, y1: 0, x2: 3, y2: 0, qy: -3 }],
  }));
  const parsed = await parseImageToActions('data:image/png;base64,test');
  expect(parsed.actions[0].payload.loads).toEqual([
    { type: 'distributed', elementId: 1, magnitude: -3, direction: 'y', startLocation: 0.5, endLocation: 1 },
    { type: 'distributed', elementId: 2, magnitude: -3, direction: 'y', startLocation: 0.5, endLocation: 1 },
  ]);
});
