import {
  solveSpaceFrame,
  type SpaceAnalysisResult,
  type SpaceElement,
  type SpaceLoad,
  type SpaceNode,
  type SpaceSolverOptions,
} from './spaceSolver';

export interface SpaceSolverWorkerRequest {
  id: number;
  nodes: SpaceNode[];
  elements: SpaceElement[];
  loads: SpaceLoad[];
  options?: SpaceSolverOptions;
}

export type SpaceSolverWorkerResponse =
  | { id: number; ok: true; result: SpaceAnalysisResult }
  | { id: number; ok: false; error: string };

self.onmessage = (event: MessageEvent<SpaceSolverWorkerRequest>) => {
  const { id, nodes, elements, loads, options } = event.data;
  try {
    const result = solveSpaceFrame(nodes, elements, loads, options);
    self.postMessage({ id, ok: true, result } satisfies SpaceSolverWorkerResponse);
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : '空间结构求解失败。',
    } satisfies SpaceSolverWorkerResponse);
  }
};
