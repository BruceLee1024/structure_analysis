import {
  type SpaceAnalysisResult,
  type SpaceElement,
  type SpaceLoad,
  type SpaceNode,
  type SpaceSolverOptions,
} from './spaceSolver';
import { createSpaceAnalysisSession } from './spaceAnalysisSession';
import { solveSpaceFrameScenarios, type SpaceModel, type SpaceAnalysisTarget, type SpaceScenarioBatchResult } from './spaceModel';

export interface SpaceSolverBatchInput {
  model: SpaceModel;
  targets: SpaceAnalysisTarget[];
}

export type SpaceSolverWorkerRequest = {
  id: number;
  kind?: 'single';
  nodes: SpaceNode[];
  elements: SpaceElement[];
  loads: SpaceLoad[];
  options?: SpaceSolverOptions;
} | (SpaceSolverBatchInput & { id: number; kind: 'batch'; options?: SpaceSolverOptions });

export type SpaceSolverWorkerResponse =
  | { id: number; ok: true; result: SpaceAnalysisResult; batch?: SpaceScenarioBatchResult }
  | { id: number; ok: false; error: string };

const session = createSpaceAnalysisSession();

self.onmessage = (event: MessageEvent<SpaceSolverWorkerRequest>) => {
  const { id, options } = event.data;
  try {
    if (event.data.kind === 'batch') {
      const batch = solveSpaceFrameScenarios(event.data.model, event.data.targets, options, session);
      const result = batch.results[0]?.result ?? { status: 'warning', elements: [], displacements: [], reactions: [], maxDisplacement: 0 };
      self.postMessage({ id, ok: true, result, batch } satisfies SpaceSolverWorkerResponse);
    } else {
      const { nodes, elements, loads } = event.data;
      const result = session.solve(nodes, elements, loads, options);
      self.postMessage({ id, ok: true, result } satisfies SpaceSolverWorkerResponse);
    }
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : '空间结构求解失败。',
    } satisfies SpaceSolverWorkerResponse);
  }
};
