import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSpaceSolverWorker } from './useSpaceSolverWorker';
import type { SpaceElement, SpaceLoad, SpaceNode } from '../utils/spaceSolver';

const nodes: SpaceNode[] = [
  { id: 1, x: 0, y: 0, z: 0, restraints: [true, true, true, true, true, true] },
  { id: 2, x: 4, y: 0, z: 0, restraints: [false, false, false, false, false, false] },
];

const element: SpaceElement = {
  id: 1,
  startNode: 1,
  endNode: 2,
  E: 200,
  A: 100,
  Iy: 200,
  Iz: 200,
  J: 100,
};

const elements = [element];
const loads: SpaceLoad[] = [
  { id: 'p-z', nodeId: 2, type: 'point' as const, direction: 'z' as const, magnitude: -10 },
];
const lateralLoads: SpaceLoad[] = [
  { id: 'p-y', nodeId: 2, type: 'point' as const, direction: 'y' as const, magnitude: 10 },
];

describe('useSpaceSolverWorker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to the synchronous solver when Worker is unavailable', async () => {
    vi.stubGlobal('Worker', undefined);

    const { result } = renderHook(() => useSpaceSolverWorker(nodes, elements, loads));

    await waitFor(() => expect(result.current.isSolving).toBe(false));

    expect(result.current.source).toBe('sync-fallback');
    expect(result.current.result.displacements.find(item => item.nodeId === 2)?.dz).toBeCloseTo(-5.333333, 5);
    expect(result.current.result.stats?.backend).toBe('dense-reference');
    expect(result.current.error).toBeUndefined();
  });

  it('cancels an in-flight worker solve when a newer request replaces it', () => {
    const workers: Array<{ postMessage: ReturnType<typeof vi.fn>; terminate: ReturnType<typeof vi.fn> }> = [];

    class FakeWorker {
      postMessage = vi.fn();
      terminate = vi.fn();

      constructor() {
        workers.push(this);
      }
    }

    vi.stubGlobal('Worker', FakeWorker);

    const { rerender, unmount } = renderHook(
      ({ activeLoads }) => useSpaceSolverWorker(nodes, elements, activeLoads),
      { initialProps: { activeLoads: loads } },
    );

    rerender({ activeLoads: lateralLoads });

    expect(workers).toHaveLength(2);
    expect(workers[0].postMessage).toHaveBeenCalledTimes(1);
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    expect(workers[1].postMessage).toHaveBeenCalledTimes(1);

    unmount();
    expect(workers[1].terminate).toHaveBeenCalledTimes(1);
  });

  it('reuses a completed Worker across solve requests in the same hook lifecycle', async () => {
    type WorkerMessageHandler = ((event: MessageEvent) => void) | null;
    const workers: Array<{
      onmessage: WorkerMessageHandler;
      postMessage: ReturnType<typeof vi.fn>;
      terminate: ReturnType<typeof vi.fn>;
    }> = [];

    class FakeWorker {
      onmessage: WorkerMessageHandler = null;
      postMessage = vi.fn();
      terminate = vi.fn();

      constructor() {
        workers.push(this);
      }
    }

    vi.stubGlobal('Worker', FakeWorker);

    const { rerender, result, unmount } = renderHook(
      ({ activeLoads }) => useSpaceSolverWorker(nodes, elements, activeLoads),
      { initialProps: { activeLoads: loads } },
    );

    act(() => {
      workers[0].onmessage?.({
        data: {
          id: 1,
          ok: true,
          result: { status: 'ok', elements: [], displacements: [], reactions: [], maxDisplacement: 0 },
        },
      } as MessageEvent);
    });

    await waitFor(() => expect(result.current.isSolving).toBe(false));

    rerender({ activeLoads: lateralLoads });

    expect(workers).toHaveLength(1);
    expect(workers[0].postMessage).toHaveBeenCalledTimes(2);
    expect(workers[0].terminate).not.toHaveBeenCalled();

    unmount();
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
  });

  it('does not start a worker solve when solving is disabled by model validation', async () => {
    const workers: Array<{ postMessage: ReturnType<typeof vi.fn>; terminate: ReturnType<typeof vi.fn> }> = [];

    class FakeWorker {
      postMessage = vi.fn();
      terminate = vi.fn();

      constructor() {
        workers.push(this);
      }
    }

    vi.stubGlobal('Worker', FakeWorker);

    const { result } = renderHook(() => useSpaceSolverWorker(nodes, elements, loads, undefined, 0, false));

    await waitFor(() => expect(result.current.isSolving).toBe(false));

    expect(workers).toHaveLength(0);
    expect(result.current.source).toBe('pending');
    expect(result.current.result.elements).toHaveLength(0);
  });
});
