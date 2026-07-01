import { StructureType, type SolverParams } from '../types';
import {
  DEFAULT_LOAD_CASES,
  DEFAULT_LOAD_COMBINATIONS,
  getActiveLoadCaseId,
  getLoadCases,
  getLoadCombinations,
} from './loadCases';

export const SOLVER_MODEL_KIND = 'StructLabSolverModel';
export const SOLVER_MODEL_VERSION = 1;

export interface SolverModelExport {
  kind: typeof SOLVER_MODEL_KIND;
  version: typeof SOLVER_MODEL_VERSION;
  exportedAt: string;
  params: SolverParams;
}

export type ImportSolverModelResult =
  | { ok: true; params: SolverParams }
  | { ok: false; error: string };

function cloneParams(params: SolverParams): SolverParams {
  return JSON.parse(JSON.stringify(params)) as SolverParams;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidStructureType(value: unknown): value is StructureType {
  return typeof value === 'string' && Object.values(StructureType).includes(value as StructureType);
}

function hasRequiredModelShape(value: unknown): value is SolverParams {
  if (!isObject(value)) return false;
  return (
    isValidStructureType(value.structureType) &&
    typeof value.stiffnessType === 'string' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number' &&
    typeof value.roofHeight === 'number' &&
    typeof value.numSpans === 'number' &&
    typeof value.numStories === 'number' &&
    typeof value.numBays === 'number' &&
    typeof value.overhangLeft === 'number' &&
    typeof value.overhangRight === 'number' &&
    typeof value.elasticModulus === 'number' &&
    typeof value.crossSectionArea === 'number' &&
    typeof value.momentOfInertia === 'number' &&
    Array.isArray(value.nodes) &&
    Array.isArray(value.elements) &&
    Array.isArray(value.loads)
  );
}

function normalizeImportedParams(params: SolverParams): SolverParams {
  const cloned = cloneParams(params);
  const loadCases = getLoadCases({ loadCases: cloned.loadCases });
  const loadCombinations = getLoadCombinations({ loadCombinations: cloned.loadCombinations });
  const activeLoadCaseId = getActiveLoadCaseId({
    loadCases,
    activeLoadCaseId: cloned.activeLoadCaseId,
  });

  const activeAnalysisType = cloned.activeAnalysisType ?? 'loadCase';
  const activeAnalysisId = (() => {
    if (activeAnalysisType === 'combination') {
      return loadCombinations.some(combo => combo.id === cloned.activeAnalysisId)
        ? cloned.activeAnalysisId
        : loadCombinations[0]?.id ?? activeLoadCaseId;
    }
    return loadCases.some(loadCase => loadCase.id === cloned.activeAnalysisId)
      ? cloned.activeAnalysisId
      : activeLoadCaseId;
  })();

  return {
    ...cloned,
    unitSystem: cloned.unitSystem ?? 'metric-kN-m',
    deflectionLimitRatio: cloned.deflectionLimitRatio ?? 250,
    loadCases: loadCases.length ? loadCases : DEFAULT_LOAD_CASES,
    loadCombinations: loadCombinations.length ? loadCombinations : DEFAULT_LOAD_COMBINATIONS,
    activeLoadCaseId,
    activeAnalysisType,
    activeAnalysisId,
  };
}

export function createSolverModelExport(params: SolverParams, now = new Date()): SolverModelExport {
  return {
    kind: SOLVER_MODEL_KIND,
    version: SOLVER_MODEL_VERSION,
    exportedAt: now.toISOString(),
    params: cloneParams(params),
  };
}

export function stringifySolverModel(params: SolverParams, now = new Date()): string {
  return JSON.stringify(createSolverModelExport(params, now), null, 2);
}

export function createSolverModelFileName(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `structlab-model-${stamp}.json`;
}

export function importSolverModel(text: string): ImportSolverModelResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: '文件不是有效的 JSON。' };
  }

  if (!isObject(parsed) || parsed.kind !== SOLVER_MODEL_KIND || !hasRequiredModelShape(parsed.params)) {
    return { ok: false, error: '文件不是有效的 StructLab 求解器模型。' };
  }

  return { ok: true, params: normalizeImportedParams(parsed.params) };
}
