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

  it('does not claim convergence when only the scaled system meets tolerance', () => {
    const matrix = cooToCsr(2, [0, 0, 1, 1], [0, 1, 0, 1], [1e12, 0.1, 0.1, 1]);
    const result = pcgSolve(matrix, new Float64Array([1, 1]), {
      tolerance: 1e-6, maxIterations: 1, preconditioner: 'symmetric-diagonal',
    });
    expect(result.relativeResidual).toBeGreaterThan(1e-6);
    expect(result.converged).toBe(false);
  });

  it('labels the spectral estimate without presenting it as a condition number', () => {
    const matrix = cooToCsr(2, [0, 0, 1, 1], [0, 1, 0, 1], [1, -0.999999, -0.999999, 1]);
    const diagnostics = analyzeCsrMatrix(matrix, { estimateSpectralRadius: true });
    expect(diagnostics.estimatedScaledSpectralRadius).toBeCloseTo(1.999999, 6);
    expect(diagnostics).not.toHaveProperty('estimatedCondition');
  });

  it('continues after scaled convergence until the original system passes', () => {
    const matrix = cooToCsr(2, [0, 0, 1, 1], [0, 1, 0, 1], [1e12, 0.1, 0.1, 1]);
    const result = pcgSolve(matrix, new Float64Array([1, 1]), {
      tolerance: 1e-6, maxIterations: 20, preconditioner: 'symmetric-diagonal',
    });
    expect(result.converged).toBe(true);
    expect(result.iterations).toBeGreaterThan(1);
    expect(result.relativeResidual).toBeLessThanOrEqual(1e-6);
  });

  it('does not mistake small positive curvature for singularity at tiny load scale', () => {
    const matrix = cooToCsr(2, [0, 0, 1, 1], [0, 1, 0, 1], [4, 1, 1, 3]);
    const result = pcgSolve(matrix, new Float64Array([1e-18, 2e-18]), { tolerance: 1e-12 });
    expect(result.converged).toBe(true);
    expect(result.relativeResidual).toBeLessThanOrEqual(1e-12);
    expect(result.x[0] / 1e-18).toBeCloseTo(1 / 11, 12);
  });

  it('keeps diagnostics from changing the iteration outcome', () => {
    const size = 25;
    const rows: number[] = [];
    const cols: number[] = [];
    const values: number[] = [];
    for (let index = 0; index < size; index++) {
      rows.push(index); cols.push(index); values.push(10 ** (index / 3));
    }
    const matrix = cooToCsr(size, rows, cols, values);
    const rhs = new Float64Array(size).fill(1);
    const options = { preconditioner: 'none' as const, tolerance: 1e-10, maxIterations: 300 };
    const basic = pcgSolve(matrix, rhs, options);
    const extended = pcgSolve(matrix, rhs, { ...options, trackResidualHistory: true });
    expect(extended.converged).toBe(basic.converged);
    expect(extended.iterations).toBe(basic.iterations);
    expect(Array.from(extended.x)).toEqual(Array.from(basic.x));
  });
});
