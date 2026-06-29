import type { AnalysisTargetType, Load, LoadCase, LoadCombination, SolverParams } from '../types';

export const DEFAULT_LOAD_CASE_ID = 'dead';

export const DEFAULT_LOAD_CASES: LoadCase[] = [
  { id: DEFAULT_LOAD_CASE_ID, name: '恒载 D', category: 'dead' },
  { id: 'live', name: '活载 L', category: 'live' },
  { id: 'wind-x', name: '风载 WX', category: 'wind' },
];

export const DEFAULT_LOAD_COMBINATIONS: LoadCombination[] = [
  { id: 'sls', name: '标准组合 D+L', factors: { dead: 1, live: 1 } },
  { id: 'uls', name: '承载组合 1.2D+1.4L', factors: { dead: 1.2, live: 1.4 } },
  { id: 'wind', name: '风组合 D+0.6WX', factors: { dead: 1, 'wind-x': 0.6 } },
];

export function getLoadCases(params: Pick<SolverParams, 'loadCases'>): LoadCase[] {
  const knownIds = new Set<string>();
  const cases = [...(params.loadCases?.length ? params.loadCases : DEFAULT_LOAD_CASES)]
    .filter(loadCase => {
      if (!loadCase.id || knownIds.has(loadCase.id)) return false;
      knownIds.add(loadCase.id);
      return true;
    });
  return cases.length > 0 ? cases : DEFAULT_LOAD_CASES;
}

export function getLoadCombinations(params: Pick<SolverParams, 'loadCombinations'>): LoadCombination[] {
  return params.loadCombinations?.length ? params.loadCombinations : DEFAULT_LOAD_COMBINATIONS;
}

export function getActiveLoadCaseId(params: Pick<SolverParams, 'activeLoadCaseId' | 'loadCases'>): string {
  const cases = getLoadCases(params);
  return params.activeLoadCaseId && cases.some(item => item.id === params.activeLoadCaseId)
    ? params.activeLoadCaseId
    : cases[0].id;
}

export function getActiveAnalysis(params: SolverParams): { type: AnalysisTargetType; id: string; label: string } {
  const cases = getLoadCases(params);
  const combinations = getLoadCombinations(params);
  const requestedType = params.activeAnalysisType ?? 'loadCase';

  if (requestedType === 'combination') {
    const combo = combinations.find(item => item.id === params.activeAnalysisId) ?? combinations[0];
    if (combo) return { type: 'combination', id: combo.id, label: combo.name };
  }

  const caseId = params.activeAnalysisId && cases.some(item => item.id === params.activeAnalysisId)
    ? params.activeAnalysisId
    : getActiveLoadCaseId(params);
  const loadCase = cases.find(item => item.id === caseId) ?? cases[0];
  return { type: 'loadCase', id: loadCase.id, label: loadCase.name };
}

export function loadCaseName(params: Pick<SolverParams, 'loadCases'>, id?: string): string {
  const loadCase = getLoadCases(params).find(item => item.id === (id ?? DEFAULT_LOAD_CASE_ID));
  return loadCase?.name ?? '未分类';
}

export function normalizeLoad(load: Load, activeLoadCaseId: string): Load {
  return { ...load, loadCaseId: load.loadCaseId ?? activeLoadCaseId };
}

export function getLoadsForCase(loads: Load[], loadCaseId: string): Load[] {
  return loads.filter(load => (load.loadCaseId ?? DEFAULT_LOAD_CASE_ID) === loadCaseId);
}

export function getAnalysisLoads(params: SolverParams): Load[] {
  const active = getActiveAnalysis(params);
  if (active.type === 'loadCase') {
    return getLoadsForCase(params.loads, active.id);
  }

  const combo = getLoadCombinations(params).find(item => item.id === active.id);
  if (!combo) return [];

  return params.loads.flatMap(load => {
    const caseId = load.loadCaseId ?? DEFAULT_LOAD_CASE_ID;
    const factor = combo.factors[caseId] ?? 0;
    if (Math.abs(factor) < 1e-9) return [];
    return [{
      ...load,
      id: `${combo.id}-${load.id}`,
      magnitude: load.magnitude * factor,
      loadCaseId: caseId,
    }];
  });
}

export function describeCombination(combo: LoadCombination, cases: LoadCase[]): string {
  const labels = Object.entries(combo.factors)
    .filter(([, factor]) => Math.abs(factor) > 1e-9)
    .map(([caseId, factor]) => {
      const loadCase = cases.find(item => item.id === caseId);
      const factorText = Number.isInteger(factor) ? String(factor) : factor.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
      return `${factorText}${loadCase?.name.replace(/\s.*$/, '') ?? caseId}`;
    });
  return labels.join(' + ') || '空组合';
}
