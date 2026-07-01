import {
  analyzeCsrMatrix,
  cooToCsr,
  csrMatVec,
  csrToDense,
  extractCsrSubmatrix,
  pcgSolve,
  type CsrMatrixDiagnostics,
  type SparsePreconditioner,
  type SparseMatrixCSR,
} from './sparseMatrix';

export type SpaceDirection = 'x' | 'y' | 'z';

export type SpaceVector6 = [number, number, number, number, number, number];
export type SpaceRotationRelease = Partial<Record<'rx' | 'ry' | 'rz', boolean>>;
export type SpaceSolverBackend = 'auto' | 'dense-reference' | 'js-csr-pcg' | 'wasm-sparse';
export type SpacePreconditioner = SparsePreconditioner;
export type SpaceSolverFallback = 'auto' | 'none' | 'dense-reference-small';
export type SpaceSolverDiagnosticsMode = 'basic' | 'extended';
export type SpaceSolverActualBackend = 'dense-reference' | 'js-csr-pcg' | 'wasm-unavailable-fallback';
export type SpaceAnalysisStatus = 'ok' | 'warning' | 'failed';

export interface SpaceSolverOptions {
  backend?: SpaceSolverBackend;
  tolerance?: number;
  maxIterations?: number;
  preconditioner?: SpacePreconditioner;
  fallback?: SpaceSolverFallback;
  diagnostics?: SpaceSolverDiagnosticsMode;
}

export interface SolverStats {
  backend: Exclude<SpaceSolverBackend, 'auto' | 'wasm-sparse'>;
  totalDof: number;
  freeDof: number;
  nnz: number;
  assemblyMs: number;
  solveMs: number;
  postprocessMs: number;
  iterations?: number;
  relativeResidual?: number;
  warnings: string[];
  matrixDiagnostics?: CsrMatrixDiagnostics;
  solverDiagnostics?: {
    requestedBackend: SpaceSolverBackend;
    actualBackend: SpaceSolverActualBackend;
    preconditioner: SpacePreconditioner;
    fallbackUsed: boolean;
    residualHistory?: number[];
  };
}

export interface NumericalModel {
  totalDof: number;
  freeDof: Int32Array;
  restrainedDof: Int32Array;
  nodeCoords: Float64Array;
  elementNodes: Int32Array;
  elementDofMap: Int32Array;
  loads: Float64Array;
}

interface SpaceLinearSolveInput {
  matrix: SparseMatrixCSR;
  rhs: Float64Array;
  options: SpaceSolverOptions;
}

interface LinearSolveResult {
  x: Float64Array;
  iterations?: number;
  relativeResidual?: number;
  converged: boolean;
  warnings: string[];
  residualHistory?: number[];
}

interface SpaceLinearSolverAdapter {
  id: SpaceSolverActualBackend;
  canSolve(input: SpaceLinearSolveInput): boolean;
  solve(input: SpaceLinearSolveInput): LinearSolveResult;
}

export interface SpaceNode {
  id: number;
  x: number;
  y: number;
  z: number;
  restraints: [boolean, boolean, boolean, boolean, boolean, boolean];
  springStiffness?: SpaceVector6;
}

export interface SpaceElement {
  id: number;
  startNode: number;
  endNode: number;
  E: number;
  A: number;
  Iy: number;
  Iz: number;
  J: number;
  nu?: number;
  roll?: number;
  releaseStart?: SpaceRotationRelease;
  releaseEnd?: SpaceRotationRelease;
}

export interface SpaceNodalLoad {
  id: string;
  nodeId: number;
  loadCaseId?: string;
  type: 'point' | 'moment';
  direction: SpaceDirection;
  magnitude: number;
}

export interface SpaceElementLoad {
  id: string;
  elementId: number;
  loadCaseId?: string;
  type: 'distributed' | 'trapezoidal';
  direction: SpaceDirection;
  coordinateSystem?: 'global' | 'local';
  startMagnitude: number;
  endMagnitude: number;
}

export type SpaceLoad = SpaceNodalLoad | SpaceElementLoad;

export interface SpaceElementResult {
  elementId: number;
  length: number;
  localEndForces: number[];
  localDisplacements: number[];
  releaseForces?: {
    start: { rx: number; ry: number; rz: number };
    end: { rx: number; ry: number; rz: number };
  };
  stations: Array<{
    x: number;
    axial: number;
    shearY: number;
    shearZ: number;
    torsion: number;
    momentY: number;
    momentZ: number;
  }>;
  maxAbsAxial: number;
  maxAbsShearY: number;
  maxAbsShearZ: number;
  maxAbsTorsion: number;
  maxAbsMomentY: number;
  maxAbsMomentZ: number;
}

export interface SpaceAnalysisResult {
  status: SpaceAnalysisStatus;
  elements: SpaceElementResult[];
  displacements: Array<{
    nodeId: number;
    dx: number;
    dy: number;
    dz: number;
    rx: number;
    ry: number;
    rz: number;
  }>;
  reactions: Array<{
    nodeId: number;
    fx: number;
    fy: number;
    fz: number;
    mx: number;
    my: number;
    mz: number;
  }>;
  maxDisplacement: number;
  equilibrium?: {
    totalLoads: {
      fx: number;
      fy: number;
      fz: number;
      mx: number;
      my: number;
      mz: number;
    };
    totalReactions: {
      fx: number;
      fy: number;
      fz: number;
      mx: number;
      my: number;
      mz: number;
    };
    residual: {
      fx: number;
      fy: number;
      fz: number;
      mx: number;
      my: number;
      mz: number;
      maxAbs: number;
    };
    passed: boolean;
    reliability?: SpaceAnalysisStatus;
  };
  error?: string;
  stats?: SolverStats;
}

const DOF_PER_NODE = 6;
const RIGID_BODY_TOLERANCE = 1e-10;

const createMatrix = (rows: number, cols: number) => Array.from({ length: rows }, () => Array(cols).fill(0));
const createVector = (size: number) => Array(size).fill(0);

const cleanValue = (value: number) => {
  if (Math.abs(value) < 1e-9) return 0;
  return parseFloat(value.toFixed(6));
};

const dot = (a: number[], b: number[]) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const cross = (a: number[], b: number[]) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (v: number[]) => Math.hypot(v[0], v[1], v[2]);
const normalize = (v: number[]) => {
  const length = norm(v);
  if (length < 1e-12) return [0, 0, 0];
  return v.map(value => value / length);
};

const multiplyMatrixVector = (matrix: number[][], vector: number[]) => {
  const result = createVector(matrix.length);
  for (let row = 0; row < matrix.length; row++) {
    for (let col = 0; col < vector.length; col++) {
      result[row] += matrix[row][col] * vector[col];
    }
  }
  return result;
};

const multiplyTransposeMatrixVector = (matrix: number[][], vector: number[]) => {
  const result = createVector(matrix[0]?.length ?? 0);
  for (let row = 0; row < matrix.length; row++) {
    for (let col = 0; col < result.length; col++) {
      result[col] += matrix[row][col] * vector[row];
    }
  }
  return result;
};

const multiplyMatrixVector12 = (matrix: number[][], vector: ArrayLike<number>) => {
  const result = createVector(12);
  for (let row = 0; row < 12; row++) {
    const matrixRow = matrix[row];
    let sum = 0;
    for (let col = 0; col < 12; col++) sum += matrixRow[col] * vector[col];
    result[row] = sum;
  }
  return result;
};

const cleanVector = (vector: ArrayLike<number>) => Array.from(vector, cleanValue);

const solveLinearSystem = (A: number[][], b: number[]) => {
  const n = b.length;
  const M = A.map((row, index) => [...row, b[index]]);
  let singularCount = 0;

  for (let pivot = 0; pivot < n; pivot++) {
    let maxRow = pivot;
    for (let row = pivot + 1; row < n; row++) {
      if (Math.abs(M[row][pivot]) > Math.abs(M[maxRow][pivot])) maxRow = row;
    }

    [M[pivot], M[maxRow]] = [M[maxRow], M[pivot]];

    if (Math.abs(M[pivot][pivot]) < RIGID_BODY_TOLERANCE) {
      M[pivot][pivot] = 1;
      M[pivot][n] = 0;
      for (let col = pivot + 1; col < n; col++) M[pivot][col] = 0;
      singularCount++;
      continue;
    }

    for (let row = pivot + 1; row < n; row++) {
      const factor = -M[row][pivot] / M[pivot][pivot];
      for (let col = pivot; col <= n; col++) {
        if (col === pivot) M[row][col] = 0;
        else M[row][col] += factor * M[pivot][col];
      }
    }
  }

  const x = createVector(n);
  for (let row = n - 1; row >= 0; row--) {
    let sum = 0;
    for (let col = row + 1; col < n; col++) sum += M[row][col] * x[col];
    x[row] = (M[row][n] - sum) / M[row][row];
  }

  return { x, singularCount };
};

const getEffectiveProperties = (element: SpaceElement) => {
  const E = element.E * 1e6;
  const nu = element.nu ?? 0.3;
  const G = E / (2 * (1 + nu));
  return {
    E,
    G,
    A: element.A * 1e-4,
    Iy: element.Iy * 1e-6,
    Iz: element.Iz * 1e-6,
    J: element.J * 1e-6,
  };
};

export const buildSpaceFrameLocalStiffness = (element: SpaceElement, length: number) => {
  const { E, G, A, Iy, Iz, J } = getEffectiveProperties(element);
  const L = length;
  const k = createMatrix(12, 12);

  const axial = E * A / L;
  k[0][0] = axial;
  k[0][6] = -axial;
  k[6][0] = -axial;
  k[6][6] = axial;

  const torsion = G * J / L;
  k[3][3] = torsion;
  k[3][9] = -torsion;
  k[9][3] = -torsion;
  k[9][9] = torsion;

  const zBending = [
    [12 * E * Iz / L ** 3, 6 * E * Iz / L ** 2, -12 * E * Iz / L ** 3, 6 * E * Iz / L ** 2],
    [6 * E * Iz / L ** 2, 4 * E * Iz / L, -6 * E * Iz / L ** 2, 2 * E * Iz / L],
    [-12 * E * Iz / L ** 3, -6 * E * Iz / L ** 2, 12 * E * Iz / L ** 3, -6 * E * Iz / L ** 2],
    [6 * E * Iz / L ** 2, 2 * E * Iz / L, -6 * E * Iz / L ** 2, 4 * E * Iz / L],
  ];
  const zBendingMap = [1, 5, 7, 11];

  const yBending = [
    [12 * E * Iy / L ** 3, -6 * E * Iy / L ** 2, -12 * E * Iy / L ** 3, -6 * E * Iy / L ** 2],
    [-6 * E * Iy / L ** 2, 4 * E * Iy / L, 6 * E * Iy / L ** 2, 2 * E * Iy / L],
    [-12 * E * Iy / L ** 3, 6 * E * Iy / L ** 2, 12 * E * Iy / L ** 3, 6 * E * Iy / L ** 2],
    [-6 * E * Iy / L ** 2, 2 * E * Iy / L, 6 * E * Iy / L ** 2, 4 * E * Iy / L],
  ];
  const yBendingMap = [2, 4, 8, 10];

  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      k[zBendingMap[row]][zBendingMap[col]] = zBending[row][col];
      k[yBendingMap[row]][yBendingMap[col]] = yBending[row][col];
    }
  }

  return k;
};

export const buildSpaceFrameTransformation = (start: SpaceNode, end: SpaceNode, rollDegrees = 0) => {
  const memberAxis = normalize([end.x - start.x, end.y - start.y, end.z - start.z]);
  const globalZ = [0, 0, 1];
  const globalY = [0, 1, 0];
  const reference = Math.abs(dot(memberAxis, globalZ)) > 0.95 ? globalY : globalZ;
  let localZ = normalize(cross(memberAxis, reference));
  let localY = normalize(cross(localZ, memberAxis));

  if (Math.abs(rollDegrees) > 1e-9) {
    const roll = rollDegrees * Math.PI / 180;
    const cos = Math.cos(roll);
    const sin = Math.sin(roll);
    const rotatedY = localY.map((value, index) => value * cos + localZ[index] * sin);
    const rotatedZ = localZ.map((value, index) => -localY[index] * sin + value * cos);
    localY = rotatedY;
    localZ = rotatedZ;
  }

  const gamma = [memberAxis, localY, localZ];
  const T = createMatrix(12, 12);
  for (let block = 0; block < 4; block++) {
    const offset = block * 3;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        T[offset + row][offset + col] = gamma[row][col];
      }
    }
  }

  return T;
};

const transformElementStiffness = (kLocal: number[][], T: number[][]) => {
  const result = createMatrix(12, 12);
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 12; col++) {
      let value = 0;
      for (let a = 0; a < 12; a++) {
        for (let b = 0; b < 12; b++) {
          value += T[a][row] * kLocal[a][b] * T[b][col];
        }
      }
      result[row][col] = value;
    }
  }
  return result;
};

const emptyLocalElementVector = () => createVector(12);

const addToVector = (target: number[], source: number[]) => {
  for (let index = 0; index < target.length; index++) target[index] += source[index] ?? 0;
};

const getLinearLoadIntegral = (qStart: number, qEnd: number, length: number, x: number) => (
  qStart * x + (qEnd - qStart) * x ** 2 / (2 * length)
);

const getLinearLoadMomentIntegral = (qStart: number, qEnd: number, length: number, x: number) => (
  qStart * x ** 2 / 2 + (qEnd - qStart) * x ** 3 / (6 * length)
);

const getLocalElementLoadComponents = (load: SpaceElementLoad, T: number[][]): ElementAppliedLoad => {
  const startMagnitude = load.startMagnitude;
  const endMagnitude = load.type === 'distributed' ? load.startMagnitude : load.endMagnitude;
  const axis = load.direction === 'x' ? 0 : load.direction === 'y' ? 1 : 2;

  if ((load.coordinateSystem ?? 'global') === 'local') {
    const qStart: [number, number, number] = [0, 0, 0];
    const qEnd: [number, number, number] = [0, 0, 0];
    qStart[axis] = startMagnitude;
    qEnd[axis] = endMagnitude;
    return { qStart, qEnd };
  }

  const globalStart = [0, 0, 0];
  const globalEnd = [0, 0, 0];
  globalStart[axis] = startMagnitude;
  globalEnd[axis] = endMagnitude;

  const qStart: [number, number, number] = [0, 0, 0];
  const qEnd: [number, number, number] = [0, 0, 0];
  for (let localAxis = 0; localAxis < 3; localAxis++) {
    for (let globalAxis = 0; globalAxis < 3; globalAxis++) {
      qStart[localAxis] += T[localAxis][globalAxis] * globalStart[globalAxis];
      qEnd[localAxis] += T[localAxis][globalAxis] * globalEnd[globalAxis];
    }
  }
  return { qStart, qEnd };
};

const buildLocalEquivalentLoadVector = (applied: ElementAppliedLoad, length: number) => {
  const f = emptyLocalElementVector();
  const L = length;
  const L2 = L ** 2;
  const [qx1, qy1, qz1] = applied.qStart;
  const [qx2, qy2, qz2] = applied.qEnd;

  f[0] += L * (2 * qx1 + qx2) / 6;
  f[6] += L * (qx1 + 2 * qx2) / 6;

  f[1] += L * (7 * qy1 + 3 * qy2) / 20;
  f[5] += L2 * (qy1 / 20 + qy2 / 30);
  f[7] += L * (3 * qy1 + 7 * qy2) / 20;
  f[11] -= L2 * (qy1 / 30 + qy2 / 20);

  f[2] += L * (7 * qz1 + 3 * qz2) / 20;
  f[4] -= L2 * (qz1 / 20 + qz2 / 30);
  f[8] += L * (3 * qz1 + 7 * qz2) / 20;
  f[10] += L2 * (qz1 / 30 + qz2 / 20);

  return f;
};

const getElementReleaseDofs = (element: SpaceElement) => {
  const dofs: number[] = [];
  const add = (release: SpaceRotationRelease | undefined, base: number) => {
    if (release?.rx) dofs.push(base + 3);
    if (release?.ry) dofs.push(base + 4);
    if (release?.rz) dofs.push(base + 5);
  };
  add(element.releaseStart, 0);
  add(element.releaseEnd, 6);
  return dofs;
};

const getRetainedDofs = (releaseDofs: number[]) => {
  const released = new Set(releaseDofs);
  return Array.from({ length: 12 }, (_, index) => index).filter(index => !released.has(index));
};

const condenseLocalStiffness = (kLocal: number[][], releaseDofs: number[]) => {
  if (releaseDofs.length === 0) return kLocal.map(row => [...row]);
  const retainedDofs = getRetainedDofs(releaseDofs);
  const condensed = createMatrix(12, 12);
  const releaseMatrix = releaseDofs.map(row => releaseDofs.map(col => kLocal[row][col]));
  const solvedByRetainedCol = new Map<number, number[]>();

  retainedDofs.forEach(colDof => {
    const rhs = releaseDofs.map(releaseColDof => kLocal[releaseColDof][colDof]);
    solvedByRetainedCol.set(colDof, solveLinearSystem(releaseMatrix, rhs).x);
  });

  retainedDofs.forEach(rowDof => {
    retainedDofs.forEach(colDof => {
      let value = kLocal[rowDof][colDof];
      const solved = solvedByRetainedCol.get(colDof) ?? [];
      releaseDofs.forEach((releaseRowDof, releaseIndex) => {
        value -= kLocal[rowDof][releaseRowDof] * solved[releaseIndex];
      });
      condensed[rowDof][colDof] = value;
    });
  });

  return condensed;
};

const condenseLocalLoadVector = (kLocal: number[][], loads: number[], releaseDofs: number[]) => {
  if (releaseDofs.length === 0) return [...loads];
  const retainedDofs = getRetainedDofs(releaseDofs);
  const condensed = createVector(12);
  const releaseMatrix = releaseDofs.map(row => releaseDofs.map(col => kLocal[row][col]));
  const releaseLoad = releaseDofs.map(dof => loads[dof]);
  const solvedReleaseLoad = solveLinearSystem(releaseMatrix, releaseLoad).x;

  retainedDofs.forEach(rowDof => {
    let value = loads[rowDof];
    releaseDofs.forEach((releaseDof, releaseIndex) => {
      value -= kLocal[rowDof][releaseDof] * solvedReleaseLoad[releaseIndex];
    });
    condensed[rowDof] = value;
  });

  return condensed;
};

const reconstructReleasedLocalDisplacements = (
  kLocal: number[][],
  localNodalDisplacements: number[],
  rawEquivalentLoads: number[],
  releaseDofs: number[],
) => {
  const localDisplacements = [...localNodalDisplacements];
  if (releaseDofs.length === 0) return localDisplacements;

  const retainedDofs = getRetainedDofs(releaseDofs);
  const releaseMatrix = releaseDofs.map(row => releaseDofs.map(col => kLocal[row][col]));
  const rhs = releaseDofs.map(rowDof => (
    rawEquivalentLoads[rowDof] - retainedDofs.reduce((sum, colDof) => sum + kLocal[rowDof][colDof] * localNodalDisplacements[colDof], 0)
  ));
  const solved = solveLinearSystem(releaseMatrix, rhs).x;
  releaseDofs.forEach((dof, index) => {
    localDisplacements[dof] = solved[index];
  });

  return localDisplacements;
};

const getLoadOffset = (load: SpaceNodalLoad) => {
  const directionIndex = load.direction === 'x' ? 0 : load.direction === 'y' ? 1 : 2;
  return load.type === 'point' ? directionIndex : directionIndex + 3;
};

export const isSpaceNodalLoad = (load: SpaceLoad): load is SpaceNodalLoad => (
  load.type === 'point' || load.type === 'moment'
);

export const isSpaceElementLoad = (load: SpaceLoad): load is SpaceElementLoad => (
  load.type === 'distributed' || load.type === 'trapezoidal'
);

type ElementAppliedLoad = {
  qStart: [number, number, number];
  qEnd: [number, number, number];
};

type ElementCache = Map<number, {
  dofMap: number[];
  kLocal: number[][];
  kLocalCondensed: number[][];
  T: number[][];
  length: number;
  releaseDofs: number[];
  rawEquivalentLoads: number[];
  localEquivalentLoads: number[];
  appliedLoads: ElementAppliedLoad[];
}>;

export interface SpaceFrameAnalysisContext {
  nodes: SpaceNode[];
  elements: SpaceElement[];
  nodeIndex: Map<number, number>;
  numericalModel: NumericalModel;
  globalK: SparseMatrixCSR;
  reducedK: SparseMatrixCSR;
  elementCache: ElementCache;
  stiffnessAssemblyMs: number;
}

const now = () => globalThis.performance?.now?.() ?? Date.now();

const createNodeIndex = (nodes: SpaceNode[]) => {
  const nodeIndex = new Map<number, number>();
  nodes.forEach((node, index) => nodeIndex.set(node.id, index));
  return nodeIndex;
};

export const buildSpaceNumericalModel = (nodes: SpaceNode[], elements: SpaceElement[], loads: SpaceLoad[]): NumericalModel => {
  const nodeIndex = createNodeIndex(nodes);
  const totalDof = nodes.length * DOF_PER_NODE;
  const freeDof: number[] = [];
  const restrainedDof: number[] = [];
  const nodeCoords = new Float64Array(nodes.length * 3);
  const elementNodes = new Int32Array(elements.length * 2).fill(-1);
  const elementDofMap = new Int32Array(elements.length * 12).fill(-1);
  const loadVector = new Float64Array(totalDof);

  nodes.forEach((node, nodeOffset) => {
    nodeCoords[nodeOffset * 3] = node.x;
    nodeCoords[nodeOffset * 3 + 1] = node.y;
    nodeCoords[nodeOffset * 3 + 2] = node.z;

    const baseDof = nodeOffset * DOF_PER_NODE;
    node.restraints.forEach((restrained, offset) => {
      const dof = baseDof + offset;
      if (restrained) restrainedDof.push(dof);
      else freeDof.push(dof);
    });
  });

  elements.forEach((element, elementOffset) => {
    const startIndex = nodeIndex.get(element.startNode) ?? -1;
    const endIndex = nodeIndex.get(element.endNode) ?? -1;
    elementNodes[elementOffset * 2] = startIndex;
    elementNodes[elementOffset * 2 + 1] = endIndex;
    if (startIndex < 0 || endIndex < 0) return;

    const startDof = startIndex * DOF_PER_NODE;
    const endDof = endIndex * DOF_PER_NODE;
    const base = elementOffset * 12;
    for (let offset = 0; offset < DOF_PER_NODE; offset++) {
      elementDofMap[base + offset] = startDof + offset;
      elementDofMap[base + DOF_PER_NODE + offset] = endDof + offset;
    }
  });

  loads.filter(isSpaceNodalLoad).forEach(load => {
    const index = nodeIndex.get(load.nodeId);
    if (index === undefined || !Number.isFinite(load.magnitude)) return;
    loadVector[index * DOF_PER_NODE + getLoadOffset(load)] += load.magnitude;
  });

  return {
    totalDof,
    freeDof: Int32Array.from(freeDof),
    restrainedDof: Int32Array.from(restrainedDof),
    nodeCoords,
    elementNodes,
    elementDofMap,
    loads: loadVector,
  };
};

const assembleSpaceFrameStiffness = (
  nodes: SpaceNode[],
  elements: SpaceElement[],
  numericalModel: NumericalModel,
  nodeIndex: Map<number, number>,
) => {
  const nodeMap = new Map<number, SpaceNode>();
  nodes.forEach(node => nodeMap.set(node.id, node));

  const rows: number[] = [];
  const cols: number[] = [];
  const values: number[] = [];
  const elementCache: ElementCache = new Map();

  elements.forEach((element, elementOffset) => {
    const start = nodeMap.get(element.startNode);
    const end = nodeMap.get(element.endNode);
    if (!start || !end) return;

    const length = Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
    if (length < 1e-9) return;

    const kLocal = buildSpaceFrameLocalStiffness(element, length);
    const releaseDofs = getElementReleaseDofs(element);
    const kLocalCondensed = condenseLocalStiffness(kLocal, releaseDofs);
    const T = buildSpaceFrameTransformation(start, end, element.roll);
    const kGlobal = transformElementStiffness(kLocalCondensed, T);
    const dofMap = Array.from(numericalModel.elementDofMap.slice(elementOffset * 12, elementOffset * 12 + 12));
    if (dofMap.some(dof => dof < 0)) return;

    for (let row = 0; row < dofMap.length; row++) {
      for (let col = 0; col < dofMap.length; col++) {
        const value = kGlobal[row][col];
        if (value === 0) continue;
        rows.push(dofMap[row]);
        cols.push(dofMap[col]);
        values.push(value);
      }
    }
    elementCache.set(element.id, {
      dofMap,
      kLocal,
      kLocalCondensed,
      T,
      length,
      releaseDofs,
      rawEquivalentLoads: emptyLocalElementVector(),
      localEquivalentLoads: emptyLocalElementVector(),
      appliedLoads: [],
    });
  });

  for (const node of nodes) {
    const nodeOffset = nodeIndex.get(node.id);
    if (nodeOffset === undefined || !node.springStiffness) continue;
    const baseDof = nodeOffset * DOF_PER_NODE;
    node.springStiffness.forEach((stiffness, offset) => {
      if (!Number.isFinite(stiffness) || stiffness <= 0) return;
      rows.push(baseDof + offset);
      cols.push(baseDof + offset);
      values.push(stiffness);
    });
  }

  return {
    globalK: cooToCsr(numericalModel.totalDof, rows, cols, values),
    elementCache,
  };
};

const cloneElementCacheForLoads = (source: ElementCache): ElementCache => {
  const clone: ElementCache = new Map();
  source.forEach((cache, id) => {
    clone.set(id, {
      dofMap: cache.dofMap,
      kLocal: cache.kLocal,
      kLocalCondensed: cache.kLocalCondensed,
      T: cache.T,
      length: cache.length,
      releaseDofs: cache.releaseDofs,
      rawEquivalentLoads: emptyLocalElementVector(),
      localEquivalentLoads: emptyLocalElementVector(),
      appliedLoads: [],
    });
  });
  return clone;
};

const cloneNumericalModelWithLoads = (
  template: NumericalModel,
  nodeIndex: Map<number, number>,
  loads: SpaceLoad[],
): NumericalModel => {
  const loadVector = new Float64Array(template.totalDof);
  loads.filter(isSpaceNodalLoad).forEach(load => {
    const index = nodeIndex.get(load.nodeId);
    if (index === undefined || !Number.isFinite(load.magnitude)) return;
    loadVector[index * DOF_PER_NODE + getLoadOffset(load)] += load.magnitude;
  });

  return {
    ...template,
    loads: loadVector,
  };
};

const applyElementLoadsToNumericalModel = (
  elements: SpaceElement[],
  loads: SpaceLoad[],
  numericalModel: NumericalModel,
  elementCache: ElementCache,
) => {
  const elementMap = new Map<number, SpaceElement>();
  elements.forEach(element => elementMap.set(element.id, element));

  loads.filter(isSpaceElementLoad).forEach(load => {
    if (!Number.isFinite(load.startMagnitude) || !Number.isFinite(load.endMagnitude)) return;
    const element = elementMap.get(load.elementId);
    const cache = elementCache.get(load.elementId);
    if (!element || !cache) return;

    const appliedLoad = getLocalElementLoadComponents(load, cache.T);
    const rawEquivalentLoads = buildLocalEquivalentLoadVector(appliedLoad, cache.length);
    const localEquivalentLoads = condenseLocalLoadVector(cache.kLocal, rawEquivalentLoads, cache.releaseDofs);
    const globalEquivalentLoads = multiplyTransposeMatrixVector(cache.T, localEquivalentLoads);

    addToVector(cache.rawEquivalentLoads, rawEquivalentLoads);
    addToVector(cache.localEquivalentLoads, localEquivalentLoads);
    cache.appliedLoads.push(appliedLoad);
    cache.dofMap.forEach((dof, index) => {
      if (dof >= 0) numericalModel.loads[dof] += globalEquivalentLoads[index] ?? 0;
    });
    void element;
  });
};

const resolveBackend = (backend: SpaceSolverOptions['backend'], totalDof: number): Exclude<SpaceSolverBackend, 'auto' | 'wasm-sparse'> => {
  if (backend === 'dense-reference' || backend === 'js-csr-pcg') return backend;
  return totalDof <= 600 ? 'dense-reference' : 'js-csr-pcg';
};

const buildReducedRhs = (numericalModel: NumericalModel) => {
  const rhs = new Float64Array(numericalModel.freeDof.length);
  for (let index = 0; index < numericalModel.freeDof.length; index++) {
    rhs[index] = numericalModel.loads[numericalModel.freeDof[index]];
  }
  return rhs;
};

const buildReducedSystem = (globalK: SparseMatrixCSR, numericalModel: NumericalModel) => {
  const matrix = extractCsrSubmatrix(globalK, numericalModel.freeDof);
  const rhs = buildReducedRhs(numericalModel);
  return { matrix, rhs };
};

export const prepareSpaceFrameAnalysis = (nodes: SpaceNode[], elements: SpaceElement[]): SpaceFrameAnalysisContext => {
  const startMs = now();
  const numericalModel = buildSpaceNumericalModel(nodes, elements, []);
  const nodeIndex = createNodeIndex(nodes);
  const { globalK, elementCache } = assembleSpaceFrameStiffness(nodes, elements, numericalModel, nodeIndex);
  const reducedK = extractCsrSubmatrix(globalK, numericalModel.freeDof);
  return {
    nodes,
    elements,
    nodeIndex,
    numericalModel,
    globalK,
    reducedK,
    elementCache,
    stiffnessAssemblyMs: now() - startMs,
  };
};

const solveDenseSpd = (A: number[][], b: number[]) => {
  const n = b.length;
  const L = createMatrix(n, n);

  for (let row = 0; row < n; row++) {
    for (let col = 0; col <= row; col++) {
      let sum = A[row][col];
      for (let k = 0; k < col; k++) sum -= L[row][k] * L[col][k];
      if (row === col) {
        if (sum <= 1e-12 || !Number.isFinite(sum)) return null;
        L[row][col] = Math.sqrt(sum);
      } else {
        L[row][col] = sum / L[col][col];
      }
    }
  }

  const y = createVector(n);
  for (let row = 0; row < n; row++) {
    let sum = b[row];
    for (let col = 0; col < row; col++) sum -= L[row][col] * y[col];
    y[row] = sum / L[row][row];
  }

  const x = createVector(n);
  for (let row = n - 1; row >= 0; row--) {
    let sum = y[row];
    for (let col = row + 1; col < n; col++) sum -= L[col][row] * x[col];
    x[row] = sum / L[row][row];
  }

  return x;
};

const expandReducedDisplacements = (x: Float64Array, numericalModel: NumericalModel) => {
  const displacementsRaw = new Float64Array(numericalModel.totalDof);
  for (let index = 0; index < numericalModel.freeDof.length; index++) {
    displacementsRaw[numericalModel.freeDof[index]] = x[index];
  }
  return displacementsRaw;
};

const solveDenseReference = (reducedK: SparseMatrixCSR, reducedF: Float64Array, numericalModel: NumericalModel) => {
  if (reducedK.n === 0) {
    return { displacementsRaw: new Float64Array(numericalModel.totalDof), singularCount: 0, spd: true };
  }

  const denseK = csrToDense(reducedK);
  const rhs = Array.from(reducedF);
  const cholesky = solveDenseSpd(denseK, rhs);
  if (cholesky) {
    return { displacementsRaw: expandReducedDisplacements(Float64Array.from(cholesky), numericalModel), singularCount: 0, spd: true };
  }

  const { x } = solveLinearSystem(denseK, rhs);
  let singularCount = 0;
  for (let row = 0; row < denseK.length; row++) {
    const rowAbs = denseK[row].reduce((sum, value) => sum + Math.abs(value), 0);
    if (rowAbs <= 1e-14 && Math.abs(rhs[row]) > 1e-12) singularCount++;
  }
  return { displacementsRaw: expandReducedDisplacements(Float64Array.from(x), numericalModel), singularCount, spd: false };
};

const jsPcgAdapter: SpaceLinearSolverAdapter = {
  id: 'js-csr-pcg',
  canSolve: () => true,
  solve: ({ matrix, rhs, options }) => pcgSolve(matrix, rhs, {
    tolerance: options.tolerance,
    maxIterations: options.maxIterations,
    preconditioner: options.preconditioner ?? 'symmetric-diagonal',
    trackResidualHistory: options.diagnostics === 'extended',
  }),
};

const wasmSparseAdapter: SpaceLinearSolverAdapter = {
  id: 'wasm-unavailable-fallback',
  canSolve: () => false,
  solve: () => ({
    x: new Float64Array(),
    converged: false,
    warnings: ['WASM sparse solver is not available in this build. Falling back to the JavaScript solver.'],
  }),
};

const buildElementStations = (cache: NonNullable<ReturnType<ElementCache['get']>>, localEndForces: number[]) => {
  const stationCount = 11;
  return Array.from({ length: stationCount }, (_, index) => {
    const x = cache.length * index / (stationCount - 1);
    const ratio = cache.length > 0 ? x / cache.length : 0;
    if (cache.appliedLoads.length === 0) {
      return {
        x: cleanValue(x),
        axial: cleanValue((1 - ratio) * localEndForces[0] + ratio * -localEndForces[6]),
        shearY: cleanValue((1 - ratio) * localEndForces[1] + ratio * -localEndForces[7]),
        shearZ: cleanValue((1 - ratio) * localEndForces[2] + ratio * -localEndForces[8]),
        torsion: cleanValue((1 - ratio) * localEndForces[3] + ratio * -localEndForces[9]),
        momentY: cleanValue((1 - ratio) * localEndForces[4] + ratio * -localEndForces[10]),
        momentZ: cleanValue((1 - ratio) * localEndForces[5] + ratio * -localEndForces[11]),
      };
    }

    let axialLoad = 0;
    let shearYLoad = 0;
    let shearZLoad = 0;
    let momentZLoad = 0;
    let momentYLoad = 0;

    cache.appliedLoads.forEach(load => {
      axialLoad += getLinearLoadIntegral(load.qStart[0], load.qEnd[0], cache.length, x);
      shearYLoad += getLinearLoadIntegral(load.qStart[1], load.qEnd[1], cache.length, x);
      shearZLoad += getLinearLoadIntegral(load.qStart[2], load.qEnd[2], cache.length, x);
      momentZLoad += getLinearLoadMomentIntegral(load.qStart[1], load.qEnd[1], cache.length, x);
      momentYLoad += getLinearLoadMomentIntegral(load.qStart[2], load.qEnd[2], cache.length, x);
    });

    return {
      x: cleanValue(x),
      axial: cleanValue(localEndForces[0] + axialLoad),
      shearY: cleanValue(localEndForces[1] + shearYLoad),
      shearZ: cleanValue(localEndForces[2] + shearZLoad),
      torsion: cleanValue(localEndForces[3]),
      momentY: cleanValue(localEndForces[4] - localEndForces[2] * x - momentYLoad),
      momentZ: cleanValue(localEndForces[5] - localEndForces[1] * x - momentZLoad),
    };
  });
};

const dofLabels = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];

const describeGlobalDof = (nodes: SpaceNode[], dof: number) => {
  const nodeIndex = Math.floor(dof / DOF_PER_NODE);
  const node = nodes[nodeIndex];
  return node ? `节点 ${node.id} ${dofLabels[dof % DOF_PER_NODE]}` : `自由度 ${dof}`;
};

const findNearZeroReducedDofs = (matrix: SparseMatrixCSR, freeDof: Int32Array, rhs?: Float64Array) => {
  const dofs: number[] = [];
  for (let row = 0; row < matrix.n; row++) {
    let rowAbs = 0;
    for (let index = matrix.rowPtr[row]; index < matrix.rowPtr[row + 1]; index++) {
      rowAbs += Math.abs(matrix.values[index]);
    }
    if (rowAbs <= 1e-14 && (!rhs || Math.abs(rhs[row]) > 1e-12)) dofs.push(freeDof[row]);
  }
  return dofs;
};

const nearZeroDofLabels = (nodes: SpaceNode[], dofs: number[]) => dofs.map(dof => describeGlobalDof(nodes, dof));

const shouldReportUnloadedMechanismDof = (nodes: SpaceNode[], elements: SpaceElement[], dof: number) => {
  const node = nodes[Math.floor(dof / DOF_PER_NODE)];
  if (!node) return true;
  const isConnected = elements.some(element => element.startNode === node.id || element.endNode === node.id);
  if (!isConnected) return true;
  return dof % DOF_PER_NODE < 3;
};

const buildMatrixWarnings = (
  diagnostics: CsrMatrixDiagnostics,
  reducedK: SparseMatrixCSR,
  reducedF: Float64Array,
  freeDof: Int32Array,
  nodes: SpaceNode[],
  elements: SpaceElement[],
) => {
  const warnings: string[] = [];
  if (diagnostics.symmetryResidual > 1e-8) {
    warnings.push(`空间刚度矩阵对称性残差 ${diagnostics.symmetryResidual.toExponential(2)}，请检查释放、单元刚度或装配。`);
  }
  if (diagnostics.negativeDiagonalCount > 0) {
    warnings.push(`空间刚度矩阵存在 ${diagnostics.negativeDiagonalCount} 个负对角项，PCG 可能不适用。`);
  }
  if (diagnostics.zeroDiagonalCount > 0 || diagnostics.nearZeroRowCount > 0) {
    const loadedLabels = nearZeroDofLabels(nodes, findNearZeroReducedDofs(reducedK, freeDof, reducedF)).slice(0, 6);
    const mechanismDofs = findNearZeroReducedDofs(reducedK, freeDof)
      .filter(dof => shouldReportUnloadedMechanismDof(nodes, elements, dof));
    const mechanismLabels = nearZeroDofLabels(nodes, mechanismDofs).slice(0, 6);
    if (loadedLabels.length > 0) {
      warnings.push(`空间刚度矩阵存在受荷载作用的近零自由度行：${loadedLabels.join('、')}。`);
    } else if (mechanismLabels.length > 0) {
      const suffix = mechanismDofs.length > mechanismLabels.length
        ? ` 等 ${mechanismDofs.length} 个自由度`
        : '';
      warnings.push(`空间刚度矩阵存在近零刚度自由度行：${mechanismLabels.join('、')}${suffix}。`);
    }
  }
  if ((diagnostics.diagonalRatio ?? 0) > 1e12) {
    warnings.push(`空间刚度矩阵对角量级比 ${diagnostics.diagonalRatio?.toExponential(2)}，模型可能病态或单位差异过大。`);
  }
  return warnings;
};

const postprocessSpaceResult = (
  nodes: SpaceNode[],
  elements: SpaceElement[],
  numericalModel: NumericalModel,
  globalK: SparseMatrixCSR,
  elementCache: ElementCache,
  displacementsRaw: Float64Array,
  error: string | undefined,
  stats: SolverStats,
): SpaceAnalysisResult => {
  const nodeIndex = createNodeIndex(nodes);
  const reactionsRaw = Array.from(csrMatVec(globalK, displacementsRaw), (value, index) => value - numericalModel.loads[index]);

  const vectorToComponents = (vector: SpaceVector6) => ({
    fx: cleanValue(vector[0]),
    fy: cleanValue(vector[1]),
    fz: cleanValue(vector[2]),
    mx: cleanValue(vector[3]),
    my: cleanValue(vector[4]),
    mz: cleanValue(vector[5]),
  });

  const getBaseDof = (nodeId: number) => {
    const index = nodeIndex.get(nodeId);
    return index === undefined ? -1 : index * DOF_PER_NODE;
  };

  const displacements = nodes.map(node => {
    const base = getBaseDof(node.id);
    return {
      nodeId: node.id,
      dx: cleanValue(displacementsRaw[base] * 1000),
      dy: cleanValue(displacementsRaw[base + 1] * 1000),
      dz: cleanValue(displacementsRaw[base + 2] * 1000),
      rx: cleanValue(displacementsRaw[base + 3]),
      ry: cleanValue(displacementsRaw[base + 4]),
      rz: cleanValue(displacementsRaw[base + 5]),
    };
  });

  const reactions = nodes.flatMap(node => {
    const base = getBaseDof(node.id);
    const springStiffness = node.springStiffness ?? [0, 0, 0, 0, 0, 0];
    const hasReaction = node.restraints.some(Boolean) || springStiffness.some(stiffness => Number.isFinite(stiffness) && stiffness > 0);
    if (!hasReaction) return [];

    const springReaction = springStiffness.map((stiffness, offset) => (
      Number.isFinite(stiffness) && stiffness > 0 ? -stiffness * displacementsRaw[base + offset] : 0
    ));

    return [{
      nodeId: node.id,
      fx: cleanValue(reactionsRaw[base] + springReaction[0]),
      fy: cleanValue(reactionsRaw[base + 1] + springReaction[1]),
      fz: cleanValue(reactionsRaw[base + 2] + springReaction[2]),
      mx: cleanValue(reactionsRaw[base + 3] + springReaction[3]),
      my: cleanValue(reactionsRaw[base + 4] + springReaction[4]),
      mz: cleanValue(reactionsRaw[base + 5] + springReaction[5]),
    }];
  });

  const sumGlobalNodeVector = (source: (node: SpaceNode, base: number) => SpaceVector6) => (
    nodes.reduce((total, node) => {
      const base = getBaseDof(node.id);
      const values = source(node, base);
      const momentFromForce = [
        node.y * values[2] - node.z * values[1],
        node.z * values[0] - node.x * values[2],
        node.x * values[1] - node.y * values[0],
      ];
      total[0] += values[0];
      total[1] += values[1];
      total[2] += values[2];
      total[3] += values[3] + momentFromForce[0];
      total[4] += values[4] + momentFromForce[1];
      total[5] += values[5] + momentFromForce[2];
      return total;
    }, [0, 0, 0, 0, 0, 0] as SpaceVector6)
  );

  const reactionMap = new Map(reactions.map(reaction => [reaction.nodeId, reaction]));
  const totalLoads = sumGlobalNodeVector((_node, base) => [
    numericalModel.loads[base],
    numericalModel.loads[base + 1],
    numericalModel.loads[base + 2],
    numericalModel.loads[base + 3],
    numericalModel.loads[base + 4],
    numericalModel.loads[base + 5],
  ]);
  const totalReactions = sumGlobalNodeVector((node) => {
    const reaction = reactionMap.get(node.id);
    return [
      reaction?.fx ?? 0,
      reaction?.fy ?? 0,
      reaction?.fz ?? 0,
      reaction?.mx ?? 0,
      reaction?.my ?? 0,
      reaction?.mz ?? 0,
    ];
  });
  const residualVector = totalLoads.map((value, index) => value + totalReactions[index]) as SpaceVector6;
  const residualMaxAbs = Math.max(...residualVector.map(value => Math.abs(value)));
  const solverFailed = stats.warnings.some(warning => (
    warning.includes('did not converge') ||
    warning.includes('stopped because') ||
    warning.includes('奇异自由度') ||
    warning.includes('近零自由度') ||
    warning.includes('近零刚度自由度')
  ));
  const reliability: SpaceAnalysisStatus = residualMaxAbs >= 1e-5 || solverFailed
    ? 'failed'
    : stats.solverDiagnostics?.fallbackUsed || stats.warnings.length > 0
      ? 'warning'
      : 'ok';
  const equilibrium = {
    totalLoads: vectorToComponents(totalLoads),
    totalReactions: vectorToComponents(totalReactions),
    residual: {
      fx: cleanValue(residualVector[0]),
      fy: cleanValue(residualVector[1]),
      fz: cleanValue(residualVector[2]),
      mx: cleanValue(residualVector[3]),
      my: cleanValue(residualVector[4]),
      mz: cleanValue(residualVector[5]),
      maxAbs: cleanValue(residualMaxAbs),
    },
    passed: residualMaxAbs < 1e-5,
    reliability,
  };

  const resultElements = elements.flatMap(element => {
    const cache = elementCache.get(element.id);
    if (!cache) return [];
    const globalDisplacements = new Float64Array(12);
    for (let index = 0; index < 12; index++) globalDisplacements[index] = displacementsRaw[cache.dofMap[index]];
    const localNodalDisplacements = multiplyMatrixVector12(cache.T, globalDisplacements);
    const localDisplacements = reconstructReleasedLocalDisplacements(
      cache.kLocal,
      localNodalDisplacements,
      cache.rawEquivalentLoads,
      cache.releaseDofs,
    );
    const localEndForces = multiplyMatrixVector12(cache.kLocal, localDisplacements);
    for (let index = 0; index < 12; index++) localEndForces[index] -= cache.rawEquivalentLoads[index];
    const stations = buildElementStations(cache, localEndForces);
    let maxAbsAxial = Math.max(Math.abs(localEndForces[0]), Math.abs(localEndForces[6]));
    let maxAbsShearY = Math.max(Math.abs(localEndForces[1]), Math.abs(localEndForces[7]));
    let maxAbsShearZ = Math.max(Math.abs(localEndForces[2]), Math.abs(localEndForces[8]));
    let maxAbsMomentY = Math.max(Math.abs(localEndForces[4]), Math.abs(localEndForces[10]));
    let maxAbsMomentZ = Math.max(Math.abs(localEndForces[5]), Math.abs(localEndForces[11]));
    for (const station of stations) {
      maxAbsAxial = Math.max(maxAbsAxial, Math.abs(station.axial));
      maxAbsShearY = Math.max(maxAbsShearY, Math.abs(station.shearY));
      maxAbsShearZ = Math.max(maxAbsShearZ, Math.abs(station.shearZ));
      maxAbsMomentY = Math.max(maxAbsMomentY, Math.abs(station.momentY));
      maxAbsMomentZ = Math.max(maxAbsMomentZ, Math.abs(station.momentZ));
    }
    const releaseForces = cache.releaseDofs.length > 0 ? {
      start: {
        rx: cleanValue(cache.releaseDofs.includes(3) ? localEndForces[3] : 0),
        ry: cleanValue(cache.releaseDofs.includes(4) ? localEndForces[4] : 0),
        rz: cleanValue(cache.releaseDofs.includes(5) ? localEndForces[5] : 0),
      },
      end: {
        rx: cleanValue(cache.releaseDofs.includes(9) ? localEndForces[9] : 0),
        ry: cleanValue(cache.releaseDofs.includes(10) ? localEndForces[10] : 0),
        rz: cleanValue(cache.releaseDofs.includes(11) ? localEndForces[11] : 0),
      },
    } : undefined;
    return [{
      elementId: element.id,
      length: cleanValue(cache.length),
      localDisplacements: cleanVector(localDisplacements),
      localEndForces: cleanVector(localEndForces),
      releaseForces,
      stations,
      maxAbsAxial: cleanValue(maxAbsAxial),
      maxAbsShearY: cleanValue(maxAbsShearY),
      maxAbsShearZ: cleanValue(maxAbsShearZ),
      maxAbsTorsion: cleanValue(Math.max(Math.abs(localEndForces[3]), Math.abs(localEndForces[9]))),
      maxAbsMomentY: cleanValue(maxAbsMomentY),
      maxAbsMomentZ: cleanValue(maxAbsMomentZ),
    }];
  });

  const maxDisplacement = displacements.reduce((max, displacement) => {
    return Math.max(max, Math.hypot(displacement.dx, displacement.dy, displacement.dz));
  }, 0);

  return {
    status: reliability,
    elements: resultElements,
    displacements,
    reactions,
    maxDisplacement: cleanValue(maxDisplacement),
    equilibrium,
    error,
    stats,
  };
};

export const solveSpaceFrame = (
  nodes: SpaceNode[],
  elements: SpaceElement[],
  loads: SpaceLoad[],
  options: SpaceSolverOptions = {},
): SpaceAnalysisResult => {
  const context = prepareSpaceFrameAnalysis(nodes, elements);
  return solvePreparedSpaceFrame(context, loads, options);
};

export const solvePreparedSpaceFrame = (
  context: SpaceFrameAnalysisContext,
  loads: SpaceLoad[],
  options: SpaceSolverOptions = {},
): SpaceAnalysisResult => {
  const loadStartMs = now();
  const numericalModel = cloneNumericalModelWithLoads(context.numericalModel, context.nodeIndex, loads);
  const elementCache = cloneElementCacheForLoads(context.elementCache);
  applyElementLoadsToNumericalModel(context.elements, loads, numericalModel, elementCache);
  const requestedBackend = options.backend ?? 'auto';
  const backend = resolveBackend(options.backend, numericalModel.totalDof);
  const preconditioner = options.preconditioner ?? 'symmetric-diagonal';
  const reducedSystem = {
    matrix: context.reducedK,
    rhs: buildReducedRhs(numericalModel),
  };
  const matrixDiagnostics = analyzeCsrMatrix(reducedSystem.matrix, { estimateCondition: options.diagnostics === 'extended' });
  const assemblyMs = context.stiffnessAssemblyMs + (now() - loadStartMs);

  const solveStartMs = now();
  const warnings: string[] = [
    ...buildMatrixWarnings(matrixDiagnostics, reducedSystem.matrix, reducedSystem.rhs, numericalModel.freeDof, context.nodes, context.elements),
  ];
  let displacementsRaw: Float64Array;
  let singularCount = 0;
  let iterations: number | undefined;
  let relativeResidual: number | undefined;
  let residualHistory: number[] | undefined;
  let fallbackUsed = false;
  let actualBackend: SpaceSolverActualBackend = backend;

  if (requestedBackend === 'wasm-sparse') {
    actualBackend = wasmSparseAdapter.id;
    warnings.push(...wasmSparseAdapter.solve({ matrix: reducedSystem.matrix, rhs: reducedSystem.rhs, options }).warnings);
  }

  if (backend === 'dense-reference') {
    const dense = solveDenseReference(reducedSystem.matrix, reducedSystem.rhs, numericalModel);
    displacementsRaw = dense.displacementsRaw;
    singularCount = dense.singularCount;
    if (!dense.spd && dense.singularCount > 0) warnings.push('Dense reference solver detected a non-SPD or singular reduced matrix and used guarded Gaussian fallback.');
  } else {
    const sparse = jsPcgAdapter.solve({ matrix: reducedSystem.matrix, rhs: reducedSystem.rhs, options: { ...options, preconditioner } });
    displacementsRaw = expandReducedDisplacements(sparse.x, numericalModel);
    iterations = sparse.iterations;
    relativeResidual = sparse.relativeResidual;
    residualHistory = sparse.residualHistory;
    warnings.push(...sparse.warnings);

    const shouldFallback = !sparse.converged
      && numericalModel.freeDof.length <= 1200
      && (options.fallback ?? 'auto') !== 'none';
    if (shouldFallback) {
      const dense = solveDenseReference(reducedSystem.matrix, reducedSystem.rhs, numericalModel);
      displacementsRaw = dense.displacementsRaw;
      singularCount = dense.singularCount;
      fallbackUsed = true;
      warnings.push('PCG 未收敛，已对小型自由度系统自动降级到 dense reference 求解结果。');
      if (!dense.spd && dense.singularCount > 0) warnings.push('Dense fallback detected a non-SPD or singular reduced matrix and used guarded Gaussian fallback.');
    }
  }
  const solveMs = now() - solveStartMs;

  if (singularCount > 0) {
    warnings.push(`空间刚度矩阵存在 ${singularCount} 个近似奇异自由度，结果可能包含未约束机构。`);
  }

  const error = warnings.length > 0 ? warnings.join(' ') : undefined;
  const postprocessStartMs = now();
  const stats: SolverStats = {
    backend,
    totalDof: numericalModel.totalDof,
    freeDof: numericalModel.freeDof.length,
    nnz: context.globalK.values.length,
    assemblyMs,
    solveMs,
    postprocessMs: 0,
    iterations,
    relativeResidual,
    warnings,
    matrixDiagnostics,
    solverDiagnostics: {
      requestedBackend,
      actualBackend,
      preconditioner,
      fallbackUsed,
      residualHistory,
    },
  };
  const result = postprocessSpaceResult(context.nodes, context.elements, numericalModel, context.globalK, elementCache, displacementsRaw, error, stats);
  result.stats = {
    ...result.stats!,
    postprocessMs: now() - postprocessStartMs,
  };
  return result;
};
