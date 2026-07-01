import { describe, expect, it } from 'vitest';
import { analyzeCsrMatrix, cooToCsr, csrMatVec, pcgSolve } from './sparseMatrix';

describe('sparseMatrix', () => {
  it('combines duplicate COO entries and multiplies CSR by a vector', () => {
    const matrix = cooToCsr(3, [0, 0, 1, 1, 2], [0, 0, 0, 2, 2], [2, 3, -1, 4, 5]);

    expect(Array.from(matrix.rowPtr)).toEqual([0, 1, 3, 4]);
    expect(Array.from(matrix.colIdx)).toEqual([0, 0, 2, 2]);
    expect(Array.from(matrix.values)).toEqual([5, -1, 4, 5]);
    expect(Array.from(csrMatVec(matrix, new Float64Array([2, 3, 4])))).toEqual([10, 14, 20]);
  });

  it('solves a small symmetric positive definite system with PCG', () => {
    const matrix = cooToCsr(2, [0, 0, 1, 1], [0, 1, 0, 1], [4, 1, 1, 3]);
    const result = pcgSolve(matrix, new Float64Array([1, 2]), { tolerance: 1e-12, maxIterations: 20, trackResidualHistory: true });

    expect(result.converged).toBe(true);
    expect(result.iterations).toBeGreaterThan(0);
    expect(result.relativeResidual).toBeLessThan(1e-10);
    expect(result.residualHistory?.[0]).toBeCloseTo(1, 12);
    expect(result.residualHistory?.at(-1) ?? 1).toBeLessThan(1e-10);
    expect(result.x[0]).toBeCloseTo(1 / 11, 10);
    expect(result.x[1]).toBeCloseTo(7 / 11, 10);
  });

  it('diagnoses symmetry, diagonal and zero-row risks in CSR matrices', () => {
    const matrix = cooToCsr(
      4,
      [0, 0, 1, 1, 2, 2],
      [0, 1, 0, 1, 2, 3],
      [1e-12, 2, 1, -3, 10, 1],
    );

    const diagnostics = analyzeCsrMatrix(matrix);

    expect(diagnostics.symmetryResidual).toBeGreaterThan(0);
    expect(diagnostics.zeroDiagonalCount).toBe(1);
    expect(diagnostics.negativeDiagonalCount).toBe(1);
    expect(diagnostics.nearZeroRowCount).toBe(1);
    expect(diagnostics.diagonalRatio).toBeGreaterThan(1e10);
    expect(diagnostics.spdLikely).toBe(false);
  });

  it('supports symmetric diagonal scaling for ill-conditioned SPD systems', () => {
    const matrix = cooToCsr(2, [0, 0, 1, 1], [0, 1, 0, 1], [1e-6, 1e-6, 1e-6, 1]);
    const result = pcgSolve(matrix, new Float64Array([1, 1]), {
      tolerance: 1e-10,
      maxIterations: 20,
      preconditioner: 'symmetric-diagonal',
      trackResidualHistory: true,
    });

    expect(result.converged).toBe(true);
    expect(result.relativeResidual).toBeLessThan(1e-8);
    expect(result.residualHistory?.length).toBeGreaterThan(1);
    expect(result.x[0]).toBeCloseTo(1_000_000, 2);
    expect(result.x[1]).toBeCloseTo(0, 8);
  });

  it('reports non positive curvature as an indefinite matrix warning', () => {
    const matrix = cooToCsr(2, [0, 1], [0, 1], [1, -1]);
    const result = pcgSolve(matrix, new Float64Array([1, 1]), {
      tolerance: 1e-12,
      maxIterations: 20,
      preconditioner: 'none',
    });

    expect(result.converged).toBe(false);
    expect(result.warnings.some(warning => warning.includes('not positive definite'))).toBe(true);
  });
});
