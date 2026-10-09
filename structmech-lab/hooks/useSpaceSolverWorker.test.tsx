import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSpaceSolverWorker } from './useSpaceSolverWorker';
import type { SpaceElement, SpaceLoad, SpaceNode } from '../utils/spaceSolver';
import { createSpaceFramePrototypeModel, SPACE_MATERIAL_PRESETS, SPACE_SECTION_PRESETS } from '../utils/spaceModel';

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

  it('returns the complete batch when Worker is unavailable', async () => {
    vi.stubGlobal('Worker', undefined);
    const model = createSpaceFramePrototypeModel({ width: 4, depth: 4, height: 3, loadMagnitude: -10, loadDirection: 'z', materialId: SPACE_MATERIAL_PRESETS[0].id, sectionId: SPACE_SECTION_PRESETS[0].id, includeRoofBracing: true });
    const batchInput = { model, targets: [{ type: 'loadCase' as const, id: 'dead', label: '恒载' }, { type: 'combination' as const, id: 'sls', label: '组合' }] };
    const { result } = renderHook(() => useSpaceSolverWorker(nodes, elements, loads, undefined, 0, true, batchInput));
    await waitFor(() => expect(result.current.isSolving).toBe(false));
    expect(result.current.source).toBe('sync-fallback');
    expect(result.current.batch?.results).toHaveLength(2);
    expect(result.current.batch?.results[1].result.stats?.preparation?.denseFactorReused).toBe(true);
  });

  it('ignores a cancelled batch response after a newer calculation starts', () => {
    class FakeWorker {
      static instances: FakeWorker[] = [];
      onmessage: ((event: MessageEvent) => void) | null = null;
      postMessage = vi.fn();
      terminate = vi.fn();
      constructor() { FakeWorker.instances.push(this); }
    }
    vi.stubGlobal('Worker', FakeWorker);
    const model = createSpaceFramePrototypeModel({ width: 4, depth: 4, height: 3, loadMagnitude: -10, loadDirection: 'z', materialId: SPACE_MATERIAL_PRESETS[0].id, sectionId: SPACE_SECTION_PRESETS[0].id, includeRoofBracing: true });
    const batchInput = { model, targets: [{ type: 'loadCase' as const, id: 'dead', label: '恒载' }] };
    const { result, rerender } = renderHook(({ run }) => useSpaceSolverWorker(nodes, elements, loads, undefined, run, true, batchInput), { initialProps: { run: 0 } });
    const oldHandler = FakeWorker.instances[0].onmessage;
    rerender({ run: 1 });
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    expect(FakeWorker.instances[1].postMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 2, kind: 'batch' }));
    act(() => oldHandler?.({ data: { id: 1, ok: true, result: { status: 'ok', elements: [], displacements: [], reactions: [], maxDisplacement: 999 } } } as MessageEvent));
    expect(result.current.isSolving).toBe(true);
    expect(result.current.result.maxDisplacement).not.toBe(999);
  });
});
