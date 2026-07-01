import { useEffect, useRef, useState } from 'react';
import {
  solveSpaceFrame,
  type SpaceAnalysisResult,
  type SpaceElement,
  type SpaceLoad,
  type SpaceNode,
  type SpaceSolverOptions,
} from '../utils/spaceSolver';
import type { SpaceSolverWorkerRequest, SpaceSolverWorkerResponse } from '../utils/spaceSolver.worker';

export type SpaceSolverSource = 'pending' | 'worker' | 'sync-fallback';

export interface SpaceSolverWorkerState {
  result: SpaceAnalysisResult;
  isSolving: boolean;
  source: SpaceSolverSource;
  error?: string;
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
): SpaceSolverWorkerState {
  const requestIdRef = useRef(0);
  const pendingRequestIdRef = useRef<number | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<SpaceSolverWorkerState>({
    result: emptyResult,
    isSolving: true,
    source: 'pending',
  });

  useEffect(() => () => {
    workerRef.current?.terminate();
    workerRef.current = null;
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
    }));

    const runSyncFallback = (fallbackError?: string) => {
      try {
        const result = solveSpaceFrame(nodes, elements, loads, options);
        if (!cancelled && requestIdRef.current === requestId) {
          pendingRequestIdRef.current = null;
          setState({ result, isSolving: false, source: 'sync-fallback', error: fallbackError });
        }
      } catch (error) {
        if (!cancelled && requestIdRef.current === requestId) {
          pendingRequestIdRef.current = null;
          setState(prev => ({
            ...prev,
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
        setState({ result: message.result, isSolving: false, source: 'worker' });
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
    worker.postMessage({
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
  }, [nodes, elements, loads, options.backend, options.tolerance, options.maxIterations, options.preconditioner, options.fallback, options.diagnostics, runKey, enabled]);

  return state;
}
