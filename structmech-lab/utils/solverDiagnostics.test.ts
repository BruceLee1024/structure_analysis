import { describe, expect, it } from 'vitest';
import type { AnalysisResult, ModelIssue, SolverElement, SolverNode } from '../types';
import { buildSolverDiagnosticSummary, computeEquilibriumResidual } from './solverDiagnostics';

const nodes: SolverNode[] = [
  { id: 1, x: 0, y: 0, restraints: [true, true, true] },
  { id: 2, x: 4, y: 0, restraints: [false, false, false] },
];

const elements: SolverElement[] = [
  { id: 1, startNode: 1, endNode: 2, E: 200, A: 50, I: 200 },
];

const emptyResults: AnalysisResult = {
  elements: [],
  maxDeflection: 0,
  reactions: [],
  displacements: [],
};

describe('computeEquilibriumResidual', () => {
  it('balances a nodal vertical load against a support reaction', () => {
    const check = computeEquilibriumResidual(
      { ...emptyResults, reactions: [{ nodeId: 1, fx: 0, fy: 10, m: -40 }] },
      nodes,
      [{ id: 'p1', nodeId: 2, type: 'point', magnitude: -10, direction: 'y' }],
      elements,
    );

    expect(check.sumFy).toBe(0);
    expect(check.sumM).toBe(0);
    expect(check.allOk).toBe(true);
  });

  it('uses the equivalent force at midspan for distributed element loads', () => {
    const check = computeEquilibriumResidual(
      { ...emptyResults, reactions: [{ nodeId: 1, fx: 0, fy: 8, m: -16 }] },
      nodes,
      [{ id: 'q1', elementId: 1, type: 'distributed', magnitude: -2, direction: 'y' }],
      elements,
    );

    expect(check.extFy).toBe(-8);
    expect(check.extM).toBe(16);
    expect(check.allOk).toBe(true);
  });
});

describe('buildSolverDiagnosticSummary', () => {
  it('summarizes model errors and result controls', () => {
    const issues: ModelIssue[] = [
      { id: 'bad', severity: 'error', title: '错误', detail: '需要修正' },
    ];

    const summary = buildSolverDiagnosticSummary({
      results: {
        ...emptyResults,
        maxDeflection: 2,
        reactions: [{ nodeId: 1, fx: 0, fy: 10, m: -40 }],
      },
      nodes,
      elements,
      loads: [{ id: 'p1', nodeId: 2, type: 'point', magnitude: -10, direction: 'y' }],
      issues,
      extrema: {
        moment: { elementId: 1, x: 2, value: 20, globalX: 2, globalY: 0 },
        shear: null,
        axial: null,
        deflection: { nodeId: 2, component: 'dy', value: -2 },
      },
    });

    expect(summary.modelStatus).toBe('error');
    expect(summary.demandText).toContain('E1');
    expect(summary.deflectionRatio).toBeCloseTo(0.125);
    expect(summary.equilibrium.allOk).toBe(true);
  });
});
