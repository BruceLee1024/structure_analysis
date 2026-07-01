export interface SparseMatrixCSR {
  n: number;
  rowPtr: Int32Array;
  colIdx: Int32Array;
  values: Float64Array;
}

export type SparsePreconditioner = 'jacobi' | 'symmetric-diagonal' | 'none';

export interface PcgOptions {
  tolerance?: number;
  maxIterations?: number;
  preconditioner?: SparsePreconditioner;
  trackResidualHistory?: boolean;
}

export interface PcgResult {
  x: Float64Array;
  iterations: number;
  relativeResidual: number;
  converged: boolean;
  warnings: string[];
  residualHistory?: number[];
}

export interface CsrMatrixDiagnostics {
  symmetryResidual: number;
  zeroDiagonalCount: number;
  negativeDiagonalCount: number;
  nearZeroRowCount: number;
  diagonalRatio?: number;
  estimatedCondition?: number;
  spdLikely: boolean;
}

export function cooToCsr(n: number, rows: ArrayLike<number>, cols: ArrayLike<number>, vals: ArrayLike<number>): SparseMatrixCSR {
  const entries: Array<{ row: number; col: number; value: number }> = [];
  for (let index = 0; index < vals.length; index++) {
    const row = rows[index];
    const col = cols[index];
    const value = vals[index];
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= n || col < 0 || col >= n) continue;
    if (!Number.isFinite(value) || value === 0) continue;
    entries.push({ row, col, value });
  }

  entries.sort((a, b) => (a.row - b.row) || (a.col - b.col));

  const combinedRows: number[] = [];
  const combinedCols: number[] = [];
  const combinedVals: number[] = [];
  for (const entry of entries) {
    const last = combinedVals.length - 1;
    if (last >= 0 && combinedRows[last] === entry.row && combinedCols[last] === entry.col) {
      combinedVals[last] += entry.value;
    } else {
      combinedRows.push(entry.row);
      combinedCols.push(entry.col);
      combinedVals.push(entry.value);
    }
  }

  const keptRows: number[] = [];
  const keptCols: number[] = [];
  const keptVals: number[] = [];
  for (let index = 0; index < combinedVals.length; index++) {
    if (Math.abs(combinedVals[index]) < 1e-14) continue;
    keptRows.push(combinedRows[index]);
    keptCols.push(combinedCols[index]);
    keptVals.push(combinedVals[index]);
  }

  const rowPtr = new Int32Array(n + 1);
  for (const row of keptRows) rowPtr[row + 1]++;
  for (let row = 0; row < n; row++) rowPtr[row + 1] += rowPtr[row];

  return {
    n,
    rowPtr,
    colIdx: Int32Array.from(keptCols),
    values: Float64Array.from(keptVals),
  };
}

export function csrMatVec(matrix: SparseMatrixCSR, vector: ArrayLike<number>): Float64Array {
  const result = new Float64Array(matrix.n);
  for (let row = 0; row < matrix.n; row++) {
    let sum = 0;
    for (let index = matrix.rowPtr[row]; index < matrix.rowPtr[row + 1]; index++) {
      sum += matrix.values[index] * vector[matrix.colIdx[index]];
    }
    result[row] = sum;
  }
  return result;
}

export function csrToDense(matrix: SparseMatrixCSR): number[][] {
  const dense = Array.from({ length: matrix.n }, () => Array(matrix.n).fill(0));
  for (let row = 0; row < matrix.n; row++) {
    for (let index = matrix.rowPtr[row]; index < matrix.rowPtr[row + 1]; index++) {
      dense[row][matrix.colIdx[index]] = matrix.values[index];
    }
  }
  return dense;
}

function scaleCsrSymmetricDiagonal(matrix: SparseMatrixCSR, scale: Float64Array): SparseMatrixCSR {
  const values = new Float64Array(matrix.values.length);
  for (let row = 0; row < matrix.n; row++) {
    for (let index = matrix.rowPtr[row]; index < matrix.rowPtr[row + 1]; index++) {
      values[index] = matrix.values[index] * scale[row] * scale[matrix.colIdx[index]];
    }
  }
  return {
    n: matrix.n,
    rowPtr: new Int32Array(matrix.rowPtr),
    colIdx: new Int32Array(matrix.colIdx),
    values,
  };
}

export function extractCsrSubmatrix(matrix: SparseMatrixCSR, indices: Int32Array): SparseMatrixCSR {
  const compactIndex = new Int32Array(matrix.n).fill(-1);
  for (let index = 0; index < indices.length; index++) compactIndex[indices[index]] = index;

  const rows: number[] = [];
  const cols: number[] = [];
  const values: number[] = [];
  for (let compactRow = 0; compactRow < indices.length; compactRow++) {
    const sourceRow = indices[compactRow];
    for (let item = matrix.rowPtr[sourceRow]; item < matrix.rowPtr[sourceRow + 1]; item++) {
      const compactCol = compactIndex[matrix.colIdx[item]];
      if (compactCol >= 0) {
        rows.push(compactRow);
        cols.push(compactCol);
        values.push(matrix.values[item]);
      }
    }
  }
  return cooToCsr(indices.length, rows, cols, values);
}

export function pcgSolve(matrix: SparseMatrixCSR, b: Float64Array, options: PcgOptions = {}): PcgResult {
  if (options.preconditioner === 'symmetric-diagonal') {
    return pcgSolveSymmetricDiagonal(matrix, b, options);
  }
  return pcgSolveCore(matrix, b, options);
}

export function analyzeCsrMatrix(matrix: SparseMatrixCSR, options: { estimateCondition?: boolean } = {}): CsrMatrixDiagnostics {
  const tolerance = 1e-14;
  const entries = new Map<number, number>();
  const diagonal = new Float64Array(matrix.n);
  let maxAbs = 0;
  let nearZeroRowCount = 0;

  for (let row = 0; row < matrix.n; row++) {
    let rowAbs = 0;
    for (let index = matrix.rowPtr[row]; index < matrix.rowPtr[row + 1]; index++) {
      const col = matrix.colIdx[index];
      const value = matrix.values[index];
      entries.set(row * matrix.n + col, value);
      maxAbs = Math.max(maxAbs, Math.abs(value));
      rowAbs += Math.abs(value);
      if (col === row) diagonal[row] = value;
    }
    if (rowAbs <= tolerance) nearZeroRowCount++;
  }

  let symmetryMax = 0;
  for (let row = 0; row < matrix.n; row++) {
    for (let index = matrix.rowPtr[row]; index < matrix.rowPtr[row + 1]; index++) {
      const col = matrix.colIdx[index];
      const transposeValue = entries.get(col * matrix.n + row) ?? 0;
      symmetryMax = Math.max(symmetryMax, Math.abs(matrix.values[index] - transposeValue));
    }
  }

  let zeroDiagonalCount = 0;
  let negativeDiagonalCount = 0;
  let minPositiveDiagonal = Infinity;
  let maxPositiveDiagonal = 0;
  for (let row = 0; row < matrix.n; row++) {
    const value = diagonal[row];
    if (Math.abs(value) <= tolerance || !Number.isFinite(value)) {
      zeroDiagonalCount++;
    } else if (value < 0) {
      negativeDiagonalCount++;
    } else {
      minPositiveDiagonal = Math.min(minPositiveDiagonal, value);
      maxPositiveDiagonal = Math.max(maxPositiveDiagonal, value);
    }
  }

  const diagonalRatio = Number.isFinite(minPositiveDiagonal) && minPositiveDiagonal > 0
    ? maxPositiveDiagonal / minPositiveDiagonal
    : undefined;
  const symmetryResidual = maxAbs > 0 ? symmetryMax / maxAbs : 0;
  const estimatedCondition = options.estimateCondition ? estimateScaledCondition(matrix, diagonal) ?? diagonalRatio : undefined;

  return {
    symmetryResidual,
    zeroDiagonalCount,
    negativeDiagonalCount,
    nearZeroRowCount,
    diagonalRatio,
    estimatedCondition,
    spdLikely: symmetryResidual < 1e-8 && zeroDiagonalCount === 0 && negativeDiagonalCount === 0 && nearZeroRowCount === 0,
  };
}

function pcgSolveCore(matrix: SparseMatrixCSR, b: Float64Array, options: PcgOptions = {}): PcgResult {
  const tolerance = options.tolerance ?? 1e-8;
  const maxIterations = options.maxIterations ?? Math.max(1000, matrix.n * 4);
  const preconditioner = options.preconditioner ?? 'jacobi';
  const warnings: string[] = [];
  const residualHistory = options.trackResidualHistory ? [] as number[] : undefined;
  const x = new Float64Array(matrix.n);
  const r = new Float64Array(b);
  const z = new Float64Array(matrix.n);
  const p = new Float64Array(matrix.n);
  const diagonal = new Float64Array(matrix.n);

  for (let row = 0; row < matrix.n; row++) {
    for (let index = matrix.rowPtr[row]; index < matrix.rowPtr[row + 1]; index++) {
      if (matrix.colIdx[index] === row) diagonal[row] = matrix.values[index];
    }
  }

  const bNorm = vectorNorm(b);
  if (bNorm === 0) {
    if (residualHistory) residualHistory.push(0);
    return { x, iterations: 0, relativeResidual: 0, converged: true, warnings, residualHistory };
  }

  for (let index = 0; index < matrix.n; index++) {
    if (preconditioner === 'none' || Math.abs(diagonal[index]) < 1e-20 || !Number.isFinite(diagonal[index])) {
      z[index] = r[index];
    } else {
      z[index] = r[index] / diagonal[index];
    }
    p[index] = z[index];
  }

  let rzOld = dot(r, z);
  if (!Number.isFinite(rzOld)) {
    warnings.push('PCG stopped because the initial residual is not finite.');
    return { x, iterations: 0, relativeResidual: Infinity, converged: false, warnings, residualHistory };
  }

  let relativeResidual = vectorNorm(r) / bNorm;
  if (residualHistory) residualHistory.push(relativeResidual);
  if (relativeResidual <= tolerance) {
    return { x, iterations: 0, relativeResidual, converged: true, warnings, residualHistory };
  }

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const Ap = csrMatVec(matrix, p);
    const pAp = dot(p, Ap);
    if (pAp <= 1e-30 || !Number.isFinite(pAp)) {
      warnings.push('PCG stopped because the matrix is singular or not positive definite.');
      return { x, iterations: iteration - 1, relativeResidual, converged: false, warnings, residualHistory };
    }

    const alpha = rzOld / pAp;
    for (let index = 0; index < matrix.n; index++) {
      x[index] += alpha * p[index];
      r[index] -= alpha * Ap[index];
    }

    relativeResidual = vectorNorm(r) / bNorm;
    if (residualHistory) residualHistory.push(relativeResidual);
    if (!Number.isFinite(relativeResidual)) {
      warnings.push('PCG stopped because the residual is not finite.');
      return { x, iterations: iteration, relativeResidual, converged: false, warnings, residualHistory };
    }
    if (relativeResidual <= tolerance) {
      return { x, iterations: iteration, relativeResidual, converged: true, warnings, residualHistory };
    }
    if (residualHistory && residualHistory.length > 8) {
      const recent = residualHistory.slice(-6);
      const previous = residualHistory[residualHistory.length - 7];
      if (recent.every(value => value > previous * 0.999)) {
        warnings.push('PCG residual is stagnating; matrix may be ill-conditioned.');
        return { x, iterations: iteration, relativeResidual, converged: false, warnings, residualHistory };
      }
    }

    for (let index = 0; index < matrix.n; index++) {
      z[index] = preconditioner === 'none' || Math.abs(diagonal[index]) < 1e-20 ? r[index] : r[index] / diagonal[index];
    }

    const rzNew = dot(r, z);
    if (!Number.isFinite(rzNew)) {
      warnings.push('PCG stopped because the preconditioned residual is not finite.');
      return { x, iterations: iteration, relativeResidual, converged: false, warnings, residualHistory };
    }

    const beta = rzNew / rzOld;
    for (let index = 0; index < matrix.n; index++) p[index] = z[index] + beta * p[index];
    rzOld = rzNew;
  }

  warnings.push(`PCG did not converge within ${maxIterations} iterations.`);
  return { x, iterations: maxIterations, relativeResidual, converged: false, warnings, residualHistory };
}

function pcgSolveSymmetricDiagonal(matrix: SparseMatrixCSR, b: Float64Array, options: PcgOptions): PcgResult {
  const scale = new Float64Array(matrix.n);
  const scaledB = new Float64Array(matrix.n);

  for (let row = 0; row < matrix.n; row++) {
    let diagonal = 0;
    for (let index = matrix.rowPtr[row]; index < matrix.rowPtr[row + 1]; index++) {
      if (matrix.colIdx[index] === row) diagonal = matrix.values[index];
    }
    if (diagonal > 1e-20 && Number.isFinite(diagonal)) {
      scale[row] = 1 / Math.sqrt(diagonal);
    } else {
      scale[row] = 1;
    }
    scaledB[row] = b[row] * scale[row];
  }

  const scaledMatrix = scaleCsrSymmetricDiagonal(matrix, scale);
  const result = pcgSolveCore(scaledMatrix, scaledB, { ...options, preconditioner: 'none' });
  const x = new Float64Array(matrix.n);
  for (let index = 0; index < matrix.n; index++) x[index] = result.x[index] * scale[index];

  const residual = new Float64Array(b);
  const Ax = csrMatVec(matrix, x);
  for (let index = 0; index < residual.length; index++) residual[index] -= Ax[index];
  const bNorm = vectorNorm(b);
  const relativeResidual = bNorm === 0 ? 0 : vectorNorm(residual) / bNorm;

  return { ...result, x, relativeResidual };
}

function estimateScaledCondition(matrix: SparseMatrixCSR, diagonal: Float64Array) {
  if (matrix.n === 0) return undefined;
  const scale = new Float64Array(matrix.n);
  for (let row = 0; row < matrix.n; row++) {
    scale[row] = diagonal[row] > 1e-20 ? 1 / Math.sqrt(diagonal[row]) : 1;
  }
  const scaled = scaleCsrSymmetricDiagonal(matrix, scale);
  let vector = new Float64Array(matrix.n).fill(1 / Math.sqrt(matrix.n));
  let lambdaMax = 0;
  for (let iteration = 0; iteration < 12; iteration++) {
    const next = csrMatVec(scaled, vector);
    const nextNorm = vectorNorm(next);
    if (nextNorm === 0 || !Number.isFinite(nextNorm)) return undefined;
    vector = Float64Array.from(next, value => value / nextNorm);
    lambdaMax = dot(vector, csrMatVec(scaled, vector));
  }
  return lambdaMax > 0 && Number.isFinite(lambdaMax) ? lambdaMax : undefined;
}

function dot(a: ArrayLike<number>, b: ArrayLike<number>) {
  let sum = 0;
  for (let index = 0; index < a.length; index++) sum += a[index] * b[index];
  return sum;
}

function vectorNorm(vector: ArrayLike<number>) {
  let sum = 0;
  for (let index = 0; index < vector.length; index++) sum += vector[index] * vector[index];
  return Math.sqrt(sum);
}
