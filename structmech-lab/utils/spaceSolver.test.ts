import { describe, expect, it } from 'vitest';
import type { SpaceElement, SpaceNode } from './spaceSolver';
import { buildSpaceFrameTransformation, buildSpaceNumericalModel, solveSpaceFrame } from './spaceSolver';

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

describe('solveSpaceFrame', () => {
  it('compiles free and restrained DOFs into a numerical model', () => {
    const numericalModel = buildSpaceNumericalModel(nodes, [element], [
      { id: 'p-z', nodeId: 2, type: 'point', direction: 'z', magnitude: -10 },
    ]);

    expect(numericalModel.totalDof).toBe(12);
    expect(Array.from(numericalModel.restrainedDof)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(Array.from(numericalModel.freeDof)).toEqual([6, 7, 8, 9, 10, 11]);
    expect(numericalModel.loads[8]).toBe(-10);
    expect(Array.from(numericalModel.elementDofMap)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('keeps dense and sparse backends aligned for cantilever load cases', () => {
    const loadCases = [
      { id: 'p-z', nodeId: 2, type: 'point' as const, direction: 'z' as const, magnitude: -10 },
      { id: 'p-y', nodeId: 2, type: 'point' as const, direction: 'y' as const, magnitude: 10 },
      { id: 'p-x', nodeId: 2, type: 'point' as const, direction: 'x' as const, magnitude: 10 },
    ];

    loadCases.forEach(load => {
      const dense = solveSpaceFrame(nodes, [element], [load], { backend: 'dense-reference' });
      const sparse = solveSpaceFrame(nodes, [element], [load], { backend: 'js-csr-pcg', tolerance: 1e-10 });

      expect(sparse.stats?.backend).toBe('js-csr-pcg');
      expect(sparse.stats?.totalDof).toBe(12);
      expect(sparse.stats?.freeDof).toBe(6);
      expect(sparse.stats?.nnz).toBeGreaterThan(0);
      expect(sparse.stats?.iterations).toBeGreaterThan(0);
      expect(sparse.stats?.relativeResidual ?? 1).toBeLessThan(1e-8);
      expect(sparse.error).toBeUndefined();

      const denseTip = dense.displacements.find(item => item.nodeId === 2);
      const sparseTip = sparse.displacements.find(item => item.nodeId === 2);
      expect(sparseTip?.dx).toBeCloseTo(denseTip?.dx ?? 0, 5);
      expect(sparseTip?.dy).toBeCloseTo(denseTip?.dy ?? 0, 5);
      expect(sparseTip?.dz).toBeCloseTo(denseTip?.dz ?? 0, 5);
    });
  });

  it('uses the dense reference backend automatically for small models', () => {
    const result = solveSpaceFrame(nodes, [element], [
      { id: 'p-x', nodeId: 2, type: 'point', direction: 'x', magnitude: 10 },
    ]);

    expect(result.stats?.backend).toBe('dense-reference');
    expect(result.stats?.totalDof).toBe(12);
    expect(result.stats?.freeDof).toBe(6);
  });

  it('matches cantilever tip deflection for a global vertical nodal load', () => {
    const result = solveSpaceFrame(nodes, [element], [
      { id: 'p-z', nodeId: 2, type: 'point', direction: 'z', magnitude: -10 },
    ]);

    const tip = result.displacements.find(item => item.nodeId === 2);
    const support = result.reactions.find(item => item.nodeId === 1);

    expect(tip?.dz).toBeCloseTo(-5.333333, 5);
    expect(support?.fz).toBeCloseTo(10, 5);
    expect(Math.abs(support?.my ?? 0)).toBeCloseTo(40, 5);
  });

  it('converts a global member distributed load into equivalent nodal loads and station forces', () => {
    const result = solveSpaceFrame(nodes, [element], [
      {
        id: 'q-z',
        elementId: 1,
        type: 'distributed',
        direction: 'z',
        coordinateSystem: 'global',
        startMagnitude: -2,
        endMagnitude: -2,
      },
    ], { backend: 'dense-reference' });

    const tip = result.displacements.find(item => item.nodeId === 2);
    const support = result.reactions.find(item => item.nodeId === 1);
    const member = result.elements[0];

    expect(tip?.dz).toBeCloseTo(-1.6, 5);
    expect(support?.fz).toBeCloseTo(8, 5);
    expect(Math.max(member.maxAbsMomentY, member.maxAbsMomentZ)).toBeCloseTo(16, 5);
    expect(member.stations).toHaveLength(11);
    expect(member.stations.some(station => Math.abs(station.momentZ) > 0)).toBe(true);
  });

  it('keeps dense and sparse backends aligned for trapezoidal member loads', () => {
    const load = {
      id: 'trap-y',
      elementId: 1,
      type: 'trapezoidal' as const,
      direction: 'y' as const,
      coordinateSystem: 'global' as const,
      startMagnitude: -1,
      endMagnitude: -3,
    };

    const dense = solveSpaceFrame(nodes, [element], [load], { backend: 'dense-reference' });
    const sparse = solveSpaceFrame(nodes, [element], [load], { backend: 'js-csr-pcg', tolerance: 1e-10 });
    const denseTip = dense.displacements.find(item => item.nodeId === 2);
    const sparseTip = sparse.displacements.find(item => item.nodeId === 2);

    expect(sparse.error).toBeUndefined();
    expect(sparse.stats?.relativeResidual ?? 1).toBeLessThan(1e-8);
    expect(sparseTip?.dy).toBeCloseTo(denseTip?.dy ?? 0, 5);
    expect(sparse.elements[0].maxAbsShearZ).toBeGreaterThan(0);
    expect(sparse.elements[0].stations).toHaveLength(11);
  });

  it('releases local end rotations without transferring released end moments', () => {
    const releasedElement: SpaceElement = {
      ...element,
      releaseEnd: { ry: true, rz: true },
    };
    const load = {
      id: 'q-z',
      elementId: 1,
      type: 'distributed' as const,
      direction: 'z' as const,
      coordinateSystem: 'global' as const,
      startMagnitude: -2,
      endMagnitude: -2,
    };

    const dense = solveSpaceFrame(nodes, [releasedElement], [load], { backend: 'dense-reference' });
    const sparse = solveSpaceFrame(nodes, [releasedElement], [load], { backend: 'js-csr-pcg', tolerance: 1e-10 });
    const denseMember = dense.elements[0];
    const sparseMember = sparse.elements[0];

    expect(dense.error).toBeUndefined();
    expect(sparse.error).toBeUndefined();
    expect(denseMember.localEndForces[10]).toBeCloseTo(0, 6);
    expect(denseMember.releaseForces?.end.ry).toBeCloseTo(0, 6);
    expect(sparseMember.localEndForces[10]).toBeCloseTo(denseMember.localEndForces[10], 6);
    expect(sparse.displacements.find(item => item.nodeId === 2)?.dz).toBeCloseTo(
      dense.displacements.find(item => item.nodeId === 2)?.dz ?? 0,
      5,
    );
  });

  it('reports equilibrium residuals for a stable space cantilever', () => {
    const result = solveSpaceFrame(nodes, [element], [
      { id: 'p-z', nodeId: 2, type: 'point', direction: 'z', magnitude: -10 },
    ]);

    expect(result.equilibrium?.passed).toBe(true);
    expect(result.status).toBe('ok');
    expect(result.equilibrium?.residual.fz).toBeCloseTo(0, 6);
    expect(result.equilibrium?.totalLoads.fz).toBeCloseTo(-10, 6);
    expect(result.equilibrium?.totalReactions.fz).toBeCloseTo(10, 6);
  });

  it('responds to a global y lateral nodal load with bending about local z', () => {
    const result = solveSpaceFrame(nodes, [element], [
      { id: 'p-y', nodeId: 2, type: 'point', direction: 'y', magnitude: 10 },
    ]);

    const tip = result.displacements.find(item => item.nodeId === 2);
    const support = result.reactions.find(item => item.nodeId === 1);
    const member = result.elements[0];

    expect(tip?.dy).toBeCloseTo(5.333333, 5);
    expect(support?.fy).toBeCloseTo(-10, 5);
    expect(Math.abs(support?.mz ?? 0)).toBeCloseTo(40, 5);
    expect(member.maxAbsMomentY).toBeCloseTo(40, 5);
  });

  it('matches cantilever axial extension for a global x nodal load', () => {
    const result = solveSpaceFrame(nodes, [element], [
      { id: 'p-x', nodeId: 2, type: 'point', direction: 'x', magnitude: 10 },
    ]);

    const tip = result.displacements.find(item => item.nodeId === 2);
    const support = result.reactions.find(item => item.nodeId === 1);

    expect(tip?.dx).toBeCloseTo(0.02, 5);
    expect(support?.fx).toBeCloseTo(-10, 5);
  });

  it('builds an orthonormal 12x12 transformation matrix', () => {
    const T = buildSpaceFrameTransformation(nodes[0], { ...nodes[1], x: 2, y: 3, z: 4 });
    const rowLengths = [0, 1, 2].map(row => Math.hypot(T[row][0], T[row][1], T[row][2]));
    const dot01 = T[0][0] * T[1][0] + T[0][1] * T[1][1] + T[0][2] * T[1][2];
    const dot02 = T[0][0] * T[2][0] + T[0][1] * T[2][1] + T[0][2] * T[2][2];
    const dot12 = T[1][0] * T[2][0] + T[1][1] * T[2][1] + T[1][2] * T[2][2];

    rowLengths.forEach(length => expect(length).toBeCloseTo(1, 8));
    expect(dot01).toBeCloseTo(0, 8);
    expect(dot02).toBeCloseTo(0, 8);
    expect(dot12).toBeCloseTo(0, 8);
  });

  it('reports non-convergence without crashing the result shape', () => {
    const result = solveSpaceFrame(nodes, [element], [
      { id: 'p-z', nodeId: 2, type: 'point', direction: 'z', magnitude: -10 },
    ], { backend: 'js-csr-pcg', maxIterations: 1, tolerance: 1e-16, fallback: 'none' });

    expect(result.displacements).toHaveLength(2);
    expect(result.stats?.backend).toBe('js-csr-pcg');
    expect(result.stats?.warnings.some(warning => warning.includes('PCG'))).toBe(true);
    expect(result.error).toContain('PCG');
  });

  it('falls back to dense reference for small PCG failures', () => {
    const dense = solveSpaceFrame(nodes, [element], [
      { id: 'p-z', nodeId: 2, type: 'point', direction: 'z', magnitude: -10 },
    ], { backend: 'dense-reference' });
    const fallback = solveSpaceFrame(nodes, [element], [
      { id: 'p-z', nodeId: 2, type: 'point', direction: 'z', magnitude: -10 },
    ], { backend: 'js-csr-pcg', maxIterations: 1, tolerance: 1e-16 });

    expect(fallback.stats?.solverDiagnostics?.fallbackUsed).toBe(true);
    expect(fallback.stats?.solverDiagnostics?.preconditioner).toBe('symmetric-diagonal');
    expect(fallback.stats?.warnings.some(warning => warning.includes('dense reference'))).toBe(true);
    expect(fallback.displacements.find(item => item.nodeId === 2)?.dz).toBeCloseTo(
      dense.displacements.find(item => item.nodeId === 2)?.dz ?? 0,
      6,
    );
  });

  it('keeps forced wasm sparse as a safe unavailable fallback', () => {
    const result = solveSpaceFrame(nodes, [element], [
      { id: 'p-z', nodeId: 2, type: 'point', direction: 'z', magnitude: -10 },
    ], { backend: 'wasm-sparse' });

    expect(result.displacements).toHaveLength(2);
    expect(result.stats?.solverDiagnostics?.requestedBackend).toBe('wasm-sparse');
    expect(result.stats?.solverDiagnostics?.actualBackend).toBe('wasm-unavailable-fallback');
    expect(result.stats?.warnings.some(warning => warning.includes('WASM sparse solver'))).toBe(true);
  });

  it('reports unconstrained free DOFs with node-level labels', () => {
    const freeFloating: SpaceNode[] = [
      { id: 10, x: 0, y: 0, z: 0, restraints: [false, false, false, false, false, false] },
    ];
    const result = solveSpaceFrame(freeFloating, [], [
      { id: 'p-x', nodeId: 10, type: 'point', direction: 'x', magnitude: 1 },
    ], { backend: 'dense-reference' });

    expect(result.displacements).toHaveLength(1);
    expect(result.stats?.matrixDiagnostics?.nearZeroRowCount).toBe(6);
    expect(result.stats?.warnings.some(warning => warning.includes('节点 10 ux'))).toBe(true);
    expect(result.status).toBe('failed');
    expect(result.equilibrium?.reliability).toBe('failed');
  });

  it('reports zero-stiffness mechanism DOFs even when they are not directly loaded', () => {
    const result = solveSpaceFrame([
      { id: 10, x: 0, y: 0, z: 0, restraints: [false, false, false, false, false, false] },
    ], [], [], { backend: 'dense-reference' });

    expect(result.stats?.matrixDiagnostics?.nearZeroRowCount).toBe(6);
    expect(result.stats?.warnings.some(warning => warning.includes('节点 10 ux'))).toBe(true);
    expect(result.status).toBe('failed');
    expect(result.equilibrium?.reliability).toBe('failed');
  });

  it('fails a partially stable model that still contains free mechanism DOFs', () => {
    const result = solveSpaceFrame([
      { id: 1, x: 0, y: 0, z: 0, restraints: [true, true, true, true, true, true] },
      { id: 2, x: 4, y: 0, z: 0, restraints: [false, false, false, false, false, false] },
      { id: 3, x: 10, y: 0, z: 0, restraints: [false, false, false, false, false, false] },
    ], [element], [
      { id: 'p-z', nodeId: 2, type: 'point', direction: 'z', magnitude: -10 },
    ], { backend: 'dense-reference' });

    expect(result.stats?.matrixDiagnostics?.nearZeroRowCount).toBe(6);
    expect(result.stats?.warnings.some(warning => warning.includes('节点 3 ux'))).toBe(true);
    expect(result.status).toBe('failed');
    expect(result.equilibrium?.reliability).toBe('failed');
  });

  it('uses sparse backend automatically for a model above the dense threshold', () => {
    const manyNodes: SpaceNode[] = [];
    const manyElements: SpaceElement[] = [];
    const manyLoads = [];
    for (let index = 0; index < 51; index++) {
      const baseId = index * 2 + 1;
      const tipId = baseId + 1;
      manyNodes.push(
        { id: baseId, x: index * 2, y: 0, z: 0, restraints: [true, true, true, true, true, true] },
        { id: tipId, x: index * 2, y: 0, z: 3, restraints: [false, false, false, false, false, false] },
      );
      manyElements.push({ ...element, id: index + 1, startNode: baseId, endNode: tipId });
      manyLoads.push({ id: `load-${index}`, nodeId: tipId, type: 'point' as const, direction: 'x' as const, magnitude: 1 });
    }

    const result = solveSpaceFrame(manyNodes, manyElements, manyLoads);

    expect(result.stats?.backend).toBe('js-csr-pcg');
    expect(result.stats?.totalDof).toBe(612);
    expect(result.stats?.freeDof).toBe(306);
    expect(result.stats?.relativeResidual ?? 1).toBeLessThan(1e-8);
    expect(result.error).toBeUndefined();
  });
});
