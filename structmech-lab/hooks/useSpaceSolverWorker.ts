import { useEffect, useRef, useState } from 'react';
import {
  type SpaceAnalysisResult,
  type SpaceElement,
  type SpaceLoad,
  type SpaceNode,
  type SpaceSolverOptions,
} from '../utils/spaceSolver';
import { createSpaceAnalysisSession } from '../utils/spaceAnalysisSession';
import type { SpaceSolverBatchInput, SpaceSolverWorkerRequest, SpaceSolverWorkerResponse } from '../utils/spaceSolver.worker';
import { solveSpaceFrameScenarios, type SpaceScenarioBatchResult } from '../utils/spaceModel';

export type SpaceSolverSource = 'pending' | 'worker' | 'sync-fallback';

export interface SpaceSolverWorkerState {
  result: SpaceAnalysisResult;
  isSolving: boolean;
  source: SpaceSolverSource;
  error?: string;
  batch?: SpaceScenarioBatchResult;
}

const emptyResult: SpaceAnalysisResult = {
  status: 'warning',
  elements: [],
  displacements: [],
  reactions: [],
  maxDisplacement: 0,
};

const defaultOptions: SpaceSolverOptions = {};

export function useSpaceSolverWorker(
  nodes: SpaceNode[],
  elements: SpaceElement[],
  loads: SpaceLoad[],
  options: SpaceSolverOptions = defaultOptions,
  runKey = 0,
  enabled = true,
  batchInput?: SpaceSolverBatchInput,
): SpaceSolverWorkerState {
  const requestIdRef = useRef(0);
  const pendingRequestIdRef = useRef<number | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const syncSessionRef = useRef<ReturnType<typeof createSpaceAnalysisSession> | null>(null);
  const [state, setState] = useState<SpaceSolverWorkerState>({
    result: emptyResult,
    isSolving: true,
    source: 'pending',
  });

  useEffect(() => () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    syncSessionRef.current?.clear();
    syncSessionRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!enabled) {
      setState({ result: emptyResult, isSolving: false, source: 'pending' });
      return () => {
        cancelled = true;
      };
    }

    setState(prev => ({
      ...prev,
      isSolving: true,
      error: undefined,
      batch: undefined,
    }));

    const runSyncFallback = (fallbackError?: string) => {
      try {
        syncSessionRef.current ??= createSpaceAnalysisSession();
        const batch = batchInput ? solveSpaceFrameScenarios(batchInput.model, batchInput.targets, options, syncSessionRef.current) : undefined;
        const result = batch ? batch.results[0]?.result ?? emptyResult : syncSessionRef.current.solve(nodes, elements, loads, options);
        if (!cancelled && requestIdRef.current === requestId) {
          pendingRequestIdRef.current = null;
          setState({ result, batch, isSolving: false, source: 'sync-fallback', error: fallbackError });
        }
      } catch (error) {
        if (!cancelled && requestIdRef.current === requestId) {
          pendingRequestIdRef.current = null;
          setState(prev => ({
            ...prev,
            result: { ...emptyResult, status: 'failed', error: error instanceof Error ? error.message : '空间结构求解失败。' },
            batch: undefined,
            isSolving: false,
            source: 'sync-fallback',
            error: error instanceof Error ? error.message : '空间结构求解失败。',
          }));
        }
      }
    };

    if (typeof Worker === 'undefined') {
      runSyncFallback();
      return () => {
        cancelled = true;
      };
    }

    try {
      workerRef.current ??= new Worker(new URL('../utils/spaceSolver.worker.ts', import.meta.url), { type: 'module' });
    } catch (error) {
      runSyncFallback(error instanceof Error ? error.message : '无法创建空间求解 Worker。');
      return () => {
        cancelled = true;
      };
    }

    const worker = workerRef.current;
    if (!worker) {
      runSyncFallback('空间求解 Worker 不可用。');
      return () => {
        cancelled = true;
      };
    }

    worker.onmessage = (event: MessageEvent<SpaceSolverWorkerResponse>) => {
      const message = event.data;
      if (cancelled || message.id !== requestId || requestIdRef.current !== requestId) return;
      pendingRequestIdRef.current = null;
      if (message.ok === false) {
        runSyncFallback(message.error);
      } else {
        setState({ result: message.result, batch: message.batch, isSolving: false, source: 'worker' });
      }
    };

    worker.onerror = (event) => {
      if (cancelled || requestIdRef.current !== requestId) return;
      pendingRequestIdRef.current = null;
      worker.terminate();
      workerRef.current = null;
      runSyncFallback(event.message || '空间求解 Worker 执行失败。');
    };

    pendingRequestIdRef.current = requestId;
    worker.postMessage(batchInput ? { id: requestId, kind: 'batch', ...batchInput, options } satisfies SpaceSolverWorkerRequest : {
      id: requestId,
      nodes,
      elements,
      loads,
      options,
    } satisfies SpaceSolverWorkerRequest);

    return () => {
      cancelled = true;
      if (pendingRequestIdRef.current === requestId) {
        pendingRequestIdRef.current = null;
        if (workerRef.current === worker) {
          worker.terminate();
          workerRef.current = null;
        }
      }
    };
  }, [nodes, elements, loads, options.backend, options.tolerance, options.maxIterations, options.preconditioner, options.fallback, options.diagnostics, runKey, enabled, batchInput]);

  return state;
}
