import { beforeEach, expect, test, vi } from 'vitest';
vi.mock('@/utils/aiClient', () => ({
  sendChatCompletionStream: vi.fn(),
}));

import { sendChatCompletionStream } from '@/utils/aiClient';
import { StructureType, type AnalysisResult, type SolverParams } from '@/types';
import { parseWithLLM } from './llmParser';

beforeEach(() => {
  vi.mocked(sendChatCompletionStream).mockReset();
});

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
  nodes: [],
  elements: [],
  loads: [],
};

const results: AnalysisResult = {
  elements: [{ elementId: 2, stations: [], maxMoment: 21, maxShear: 12, maxAxial: 0, u_local: [], startForces: { fx: 0, fy: 8, m: 0 } }],
  maxDeflection: 0.0113,
  reactions: [{ nodeId: 1, fx: 0, fy: 13, m: 0 }],
  displacements: [{ nodeId: 2, dx: 0, dy: -0.0113, rotation: 0.004 }],
};

test('includes solver-computed result data in the llm prompt', async () => {
  const mockResponse = '{"userText":"为什么最大弯矩出现在这里？","summary":"识别为结果解释请求","confidence":0.9,"actions":[{"kind":"explain_results","payload":{"question":"为什么最大弯矩出现在这里？"}}],"riskLevel":"low","requiresConfirmation":false}';
  vi.mocked(sendChatCompletionStream).mockImplementation(async (_msgs, onChunk) => {
    onChunk(mockResponse);
    return mockResponse;
  });

  await parseWithLLM('为什么最大弯矩出现在这里？', {
    params,
    results,
    modelSummary: '三跨连续梁，总长 18m，当前无荷载，计算结果：最大位移 0.0113m',
  });

  expect(sendChatCompletionStream).toHaveBeenCalledTimes(1);
  const userMessage = vi.mocked(sendChatCompletionStream).mock.calls[0]?.[0]?.[1];
  expect(userMessage?.role).toBe('user');
  expect(String(userMessage?.content)).toContain('最新计算结果：');
  expect(String(userMessage?.content)).toContain('最大位移 0.0113m');
  expect(String(userMessage?.content)).toContain('最大弯矩 单元 2 21.00kN·m');
  expect(String(userMessage?.content)).toContain('最大竖向反力 节点 1 13.00kN');
});
