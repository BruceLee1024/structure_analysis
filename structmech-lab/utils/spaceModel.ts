import {
  isSpaceElementLoad,
  isSpaceNodalLoad,
  prepareSpaceFrameAnalysis,
  solvePreparedSpaceFrame,
  solveSpaceFrame,
  type SpaceAnalysisStatus,
  type SpaceAnalysisResult,
  type SpaceElement,
  type SpaceElementLoad,
  type SpaceLoad,
  type SpaceNode,
  type SpaceRotationRelease,
  type SpaceSolverOptions,
} from './spaceSolver';

export interface SpaceMaterial {
  id: string;
  name: string;
  E: number;
  nu: number;
  density?: number;
}

export interface SpaceSection {
  id: string;
  name: string;
  A: number;
  Iy: number;
  Iz: number;
  J: number;
}

export interface SpaceMember {
  id: number;
  startNode: number;
  endNode: number;
  materialId: string;
  sectionId: string;
  roll?: number;
  releaseStart?: SpaceRotationRelease;
  releaseEnd?: SpaceRotationRelease;
  selfWeightFactor?: number;
}

export interface SpaceLoadCase {
  id: string;
  name: string;
  category: 'dead' | 'live' | 'wind' | 'quake' | 'custom';
}

export interface SpaceModel {
  coordinateSystem: 'Z-up';
  nodes: SpaceNode[];
  members: SpaceMember[];
  materials: SpaceMaterial[];
  sections: SpaceSection[];
  loads: SpaceLoad[];
  loadCases: SpaceLoadCase[];
  loadCombinations?: SpaceLoadCombination[];
  activeLoadCaseId: string;
  selfWeight?: {
    enabled: boolean;
    factor?: number;
    loadCaseId?: string;
  };
  generation?: {
    roofNodeIds?: number[];
  };
}

export interface SpaceLoadCombination {
  id: string;
  name: string;
  factors: Record<string, number>;
}

export interface SpaceAnalysisTarget {
  type: 'loadCase' | 'combination';
  id: string;
  label: string;
}

export interface SpaceEnvelopeInput {
  target: SpaceAnalysisTarget;
  result: SpaceAnalysisResult;
}

export interface SpaceScenarioBatchResult {
  results: SpaceEnvelopeInput[];
  envelopeRows: SpaceEnvelopeRow[];
  diagnostics: {
    targetsSolved: number;
    loadCasesSolved: number;
    combinationsSolved: number;
    stiffnessAssemblies: number;
    loadVectorsBuilt: number;
    warnings: string[];
  };
}

export type SpaceEnvelopeRowKey =
  | 'axial-max'
  | 'axial-min'
  | 'vy-max'
  | 'vy-min'
  | 'vz-max'
  | 'vz-min'
  | 'torsion-max'
  | 'torsion-min'
  | 'my-max'
  | 'my-min'
  | 'mz-max'
  | 'mz-min'
  | 'displacement-abs'
  | 'fx-abs'
  | 'fy-abs'
  | 'fz-abs';

export interface SpaceEnvelopeRow {
  key: SpaceEnvelopeRowKey;
  label: string;
  value: number | null;
  unit: string;
  sourceLabel: string;
  sourceType?: SpaceAnalysisTarget['type'];
  sourceId?: string;
  location: string;
}

export interface SpaceModelIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  detail: string;
}

export type SpaceBatchLoadPattern = 'roof' | 'all-free' | 'wind-x-positive' | 'wind-y-positive';
export type SpaceRoofProfile = 'flat' | 'gable-x' | 'shed-y';
export type SpaceVerticalBracingMode = 'none' | 'end-bays' | 'all-bays';

export interface SpaceBatchLoadInput {
  pattern: SpaceBatchLoadPattern;
  direction: SpaceLoad['direction'];
  magnitude: number;
  type?: 'point' | 'moment';
}

export const SPACE_LOAD_CASES: SpaceLoadCase[] = [
  { id: 'dead', name: '恒载 D', category: 'dead' },
  { id: 'live', name: '活载 L', category: 'live' },
  { id: 'wind-y', name: '风载 WY', category: 'wind' },
  { id: 'quake-x', name: '地震 EX', category: 'quake' },
];

export const SPACE_LOAD_COMBINATIONS: SpaceLoadCombination[] = [
  { id: 'sls', name: '标准组合 D+L', factors: { dead: 1, live: 1 } },
  { id: 'uls', name: '承载组合 1.2D+1.4L', factors: { dead: 1.2, live: 1.4 } },
  { id: 'wind-y', name: '风组合 D+0.6WY', factors: { dead: 1, 'wind-y': 0.6 } },
];

export const SPACE_SECTION_UNITS = {
  A: 'cm²',
  Iy: '10^6 mm^4',
  Iz: '10^6 mm^4',
  J: '10^6 mm^4',
} as const;

export const SPACE_MATERIAL_PRESETS: SpaceMaterial[] = [
  { id: 'steel-q355', name: 'Q355 钢', E: 206, nu: 0.3, density: 78.5 },
  { id: 'steel-q235', name: 'Q235 钢', E: 200, nu: 0.3, density: 78.5 },
  { id: 'concrete-c40', name: 'C40 混凝土', E: 32.5, nu: 0.2, density: 25 },
];

export const SPACE_SECTION_PRESETS: SpaceSection[] = [
  { id: 'box-300x300x12', name: '箱形 300x300x12', A: 137.76, Iy: 1914, Iz: 1914, J: 3030 },
  { id: 'h-400x200', name: 'H400x200 近似', A: 84.1, Iy: 2240, Iz: 6660, J: 92 },
  { id: 'pipe-273x10', name: '圆管 273x10', A: 82.6, Iy: 707, Iz: 707, J: 1414 },
];

const issue = (id: string, severity: SpaceModelIssue['severity'], title: string, detail: string): SpaceModelIssue => ({
  id,
  severity,
  title,
  detail,
});

export function createSpaceFramePrototypeModel(input: {
  width: number;
  depth: number;
  height: number;
  xBayCount?: number;
  yBayCount?: number;
  storyCount?: number;
  loadMagnitude: number;
  loadDirection: 'x' | 'y' | 'z';
  materialId: string;
  sectionId: string;
  includeRoofBracing: boolean;
  includeFloorBracing?: boolean;
  roofProfile?: SpaceRoofProfile;
  roofRise?: number;
  includeSecondaryBeams?: boolean;
  secondaryBeamCount?: number;
  verticalBracingMode?: SpaceVerticalBracingMode;
  includeCoreBracing?: boolean;
}): SpaceModel {
  const fixed: SpaceNode['restraints'] = [true, true, true, true, true, true];
  const free: SpaceNode['restraints'] = [false, false, false, false, false, false];
  const xBayCount = clampInteger(input.xBayCount ?? 1, 1, 8);
  const yBayCount = clampInteger(input.yBayCount ?? 1, 1, 8);
  const storyCount = clampInteger(input.storyCount ?? 1, 1, 8);
  const secondaryBeamCount = clampInteger(input.secondaryBeamCount ?? 1, 1, 4);
  const roofProfile = input.roofProfile ?? 'flat';
  const roofRise = Math.max(0, Number.isFinite(input.roofRise ?? 0) ? input.roofRise ?? 0 : 0);
  const verticalBracingMode = input.verticalBracingMode ?? 'none';
  const nodes: SpaceNode[] = [];
  const members: SpaceMember[] = [];
  const memberKeys = new Set<string>();
  const roofNodeIds = new Set<number>();
  let nextNodeId = 1;
  let nextMemberId = 1;

  const nodeIds = new Map<string, number>();
  const gridKey = (i: number, j: number, k: number) => `grid:${i}:${j}:${k}`;
  const secondaryKey = (i: number, j: number, division: number) => `roof-secondary:${i}:${j}:${division}`;
  const getNodeId = (key: string) => {
    const id = nodeIds.get(key);
    if (id === undefined) throw new Error(`Missing generated node ${key}`);
    return id;
  };
  const getGridNodeId = (i: number, j: number, k: number) => getNodeId(gridKey(i, j, k));
  const getSecondaryNodeId = (i: number, j: number, division: number) => getNodeId(secondaryKey(i, j, division));
  const roofZAt = (x: number, y: number) => {
    if (roofProfile === 'gable-x') {
      const halfWidth = Math.max(input.width / 2, 1e-6);
      const normalized = Math.max(0, 1 - Math.abs(x - input.width / 2) / halfWidth);
      return input.height + roofRise * normalized;
    }
    if (roofProfile === 'shed-y') {
      return input.height + roofRise * (y / Math.max(input.depth, 1e-6));
    }
    return input.height;
  };
  const addNode = (key: string, x: number, y: number, z: number, restraints: SpaceNode['restraints'], isRoof = false) => {
    const existing = nodeIds.get(key);
    if (existing !== undefined) {
      if (isRoof) roofNodeIds.add(existing);
      return existing;
    }
    const id = nextNodeId++;
    nodeIds.set(key, id);
    nodes.push({ id, x, y, z, restraints });
    if (isRoof) roofNodeIds.add(id);
    return id;
  };
  const addMember = (startNode: number, endNode: number) => {
    if (startNode === endNode) return;
    const key = startNode < endNode ? `${startNode}:${endNode}` : `${endNode}:${startNode}`;
    if (memberKeys.has(key)) return;
    memberKeys.add(key);
    members.push({
      id: nextMemberId++,
      startNode,
      endNode,
      materialId: input.materialId,
      sectionId: input.sectionId,
    });
  };

  for (let k = 0; k <= storyCount; k++) {
    for (let j = 0; j <= yBayCount; j++) {
      for (let i = 0; i <= xBayCount; i++) {
        const x = (input.width * i) / xBayCount;
        const y = (input.depth * j) / yBayCount;
        addNode(
          gridKey(i, j, k),
          x,
          y,
          k === storyCount ? roofZAt(x, y) : (input.height * k) / storyCount,
          k === 0 ? fixed : free,
          k === storyCount,
        );
      }
    }
  }

  for (let k = 0; k < storyCount; k++) {
    for (let j = 0; j <= yBayCount; j++) {
      for (let i = 0; i <= xBayCount; i++) {
        addMember(getGridNodeId(i, j, k), getGridNodeId(i, j, k + 1));
      }
    }
  }

  for (let k = 1; k <= storyCount; k++) {
    for (let j = 0; j <= yBayCount; j++) {
      for (let i = 0; i < xBayCount; i++) {
        addMember(getGridNodeId(i, j, k), getGridNodeId(i + 1, j, k));
      }
    }
    for (let i = 0; i <= xBayCount; i++) {
      for (let j = 0; j < yBayCount; j++) {
        addMember(getGridNodeId(i, j, k), getGridNodeId(i, j + 1, k));
      }
    }
  }

  const bracedLevels = input.includeFloorBracing
    ? Array.from({ length: storyCount }, (_, index) => index + 1)
    : input.includeRoofBracing ? [storyCount] : [];
  bracedLevels.forEach(k => {
    for (let j = 0; j < yBayCount; j++) {
      for (let i = 0; i < xBayCount; i++) {
        addMember(getGridNodeId(i, j, k), getGridNodeId(i + 1, j + 1, k));
        addMember(getGridNodeId(i + 1, j, k), getGridNodeId(i, j + 1, k));
      }
    }
  });

  if (input.includeSecondaryBeams) {
    for (let i = 0; i < xBayCount; i++) {
      for (let j = 0; j <= yBayCount; j++) {
        let previousNodeId = getGridNodeId(i, j, storyCount);
        for (let division = 1; division <= secondaryBeamCount; division++) {
          const ratio = division / (secondaryBeamCount + 1);
          const x = input.width * (i + ratio) / xBayCount;
          const y = (input.depth * j) / yBayCount;
          const nodeId = addNode(secondaryKey(i, j, division), x, y, roofZAt(x, y), free, true);
          addMember(previousNodeId, nodeId);
          previousNodeId = nodeId;
        }
        addMember(previousNodeId, getGridNodeId(i + 1, j, storyCount));
      }

      for (let division = 1; division <= secondaryBeamCount; division++) {
        for (let j = 0; j < yBayCount; j++) {
          addMember(getSecondaryNodeId(i, j, division), getSecondaryNodeId(i, j + 1, division));
        }
      }
    }
  }

  const addVerticalBracing = () => {
    if (verticalBracingMode === 'none') return;
    const xBays = verticalBracingMode === 'all-bays'
      ? Array.from({ length: xBayCount }, (_, index) => index)
      : Array.from(new Set([0, xBayCount - 1]));
    const yBays = verticalBracingMode === 'all-bays'
      ? Array.from({ length: yBayCount }, (_, index) => index)
      : Array.from(new Set([0, yBayCount - 1]));

    for (let k = 1; k <= storyCount; k++) {
      [0, yBayCount].forEach(j => {
        xBays.forEach(i => {
          addMember(getGridNodeId(i, j, k - 1), getGridNodeId(i + 1, j, k));
          addMember(getGridNodeId(i + 1, j, k - 1), getGridNodeId(i, j, k));
        });
      });
      [0, xBayCount].forEach(i => {
        yBays.forEach(j => {
          addMember(getGridNodeId(i, j, k - 1), getGridNodeId(i, j + 1, k));
          addMember(getGridNodeId(i, j + 1, k - 1), getGridNodeId(i, j, k));
        });
      });
    }
  };

  addVerticalBracing();

  if (input.includeCoreBracing && xBayCount > 1 && yBayCount > 1) {
    const coreI = Math.floor((xBayCount - 1) / 2);
    const coreJ = Math.floor((yBayCount - 1) / 2);
    for (let k = 1; k <= storyCount; k++) {
      [coreJ, coreJ + 1].forEach(j => {
        addMember(getGridNodeId(coreI, j, k - 1), getGridNodeId(coreI + 1, j, k));
        addMember(getGridNodeId(coreI + 1, j, k - 1), getGridNodeId(coreI, j, k));
      });
      [coreI, coreI + 1].forEach(i => {
        addMember(getGridNodeId(i, coreJ, k - 1), getGridNodeId(i, coreJ + 1, k));
        addMember(getGridNodeId(i, coreJ + 1, k - 1), getGridNodeId(i, coreJ, k));
      });
    }
  }

  const modelWithoutLoads: SpaceModel = {
    coordinateSystem: 'Z-up',
    nodes,
    members,
    materials: SPACE_MATERIAL_PRESETS,
    sections: SPACE_SECTION_PRESETS,
    loads: [],
    loadCases: SPACE_LOAD_CASES,
    loadCombinations: SPACE_LOAD_COMBINATIONS,
    activeLoadCaseId: 'dead',
    selfWeight: { enabled: false, factor: 1, loadCaseId: 'dead' },
    generation: {
      roofNodeIds: Array.from(roofNodeIds).sort((a, b) => a - b),
    },
  };
  const loads = createSpaceBatchNodeLoads(modelWithoutLoads, {
    pattern: 'roof',
    direction: input.loadDirection,
    magnitude: input.loadMagnitude,
  });

  return {
    ...modelWithoutLoads,
    loads,
  };
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function isSpaceBatchLoad(load: SpaceLoad) {
  return load.id.startsWith('batch-') || load.id.startsWith('roof-');
}

export function batchLoadPrefix(pattern: SpaceBatchLoadPattern) {
  return `batch-${pattern}-`;
}

export function createSpaceBatchNodeLoads(model: SpaceModel, input: SpaceBatchLoadInput): SpaceLoad[] {
  const nodes = selectBatchLoadNodes(model, input.pattern);
  return nodes.map(node => ({
    id: `${batchLoadPrefix(input.pattern)}${node.id}`,
    nodeId: node.id,
    loadCaseId: model.activeLoadCaseId,
    type: input.type ?? 'point',
    direction: input.direction,
    magnitude: input.magnitude,
  }));
}

export function selectBatchLoadNodes(model: SpaceModel, pattern: SpaceBatchLoadPattern): SpaceNode[] {
  const tolerance = 1e-9;
  const roofNodeIds = new Set(model.generation?.roofNodeIds ?? []);
  const maxZ = Math.max(...model.nodes.map(node => node.z), 0);
  const maxX = Math.max(...model.nodes.map(node => node.x), 0);
  const maxY = Math.max(...model.nodes.map(node => node.y), 0);

  const selected = model.nodes.filter(node => {
    if (pattern === 'roof') return roofNodeIds.size > 0 ? roofNodeIds.has(node.id) : Math.abs(node.z - maxZ) < tolerance;
    if (pattern === 'all-free') return node.z > tolerance && !node.restraints.every(Boolean);
    if (pattern === 'wind-x-positive') return node.z > tolerance && Math.abs(node.x - maxX) < tolerance;
    if (pattern === 'wind-y-positive') return node.z > tolerance && Math.abs(node.y - maxY) < tolerance;
    return false;
  });

  return selected.sort((a, b) => a.id - b.id);
}

export function resolveSpaceElements(model: SpaceModel): SpaceElement[] {
  return model.members.flatMap(member => {
    const material = model.materials.find(item => item.id === member.materialId);
    const section = model.sections.find(item => item.id === member.sectionId);
    if (!material || !section) return [];
    return [{
      id: member.id,
      startNode: member.startNode,
      endNode: member.endNode,
      E: material.E,
      A: section.A,
      Iy: section.Iy,
      Iz: section.Iz,
      J: section.J,
      nu: material.nu,
      roll: member.roll,
      releaseStart: member.releaseStart,
      releaseEnd: member.releaseEnd,
    }];
  });
}

export function getActiveSpaceLoads(model: SpaceModel): SpaceLoad[] {
  return model.loads.filter(load => (load.loadCaseId ?? model.activeLoadCaseId) === model.activeLoadCaseId);
}

const scaleSpaceLoad = (load: SpaceLoad, factor: number, idPrefix: string): SpaceLoad | null => {
  if (Math.abs(factor) < 1e-12) return null;
  if (isSpaceNodalLoad(load)) {
    return {
      ...load,
      id: `${idPrefix}-${load.id}`,
      magnitude: load.magnitude * factor,
    };
  }
  return {
    ...load,
    id: `${idPrefix}-${load.id}`,
    startMagnitude: load.startMagnitude * factor,
    endMagnitude: load.endMagnitude * factor,
  };
};

export function getSpaceLoadCombinations(model: Pick<SpaceModel, 'loadCombinations'>): SpaceLoadCombination[] {
  return model.loadCombinations?.length ? model.loadCombinations : SPACE_LOAD_COMBINATIONS;
}

export function getSpaceAnalysisLoads(
  model: SpaceModel,
  target: SpaceAnalysisTarget,
  combinations = getSpaceLoadCombinations(model),
): SpaceLoad[] {
  if (target.type === 'loadCase') {
    return model.loads.filter(load => (load.loadCaseId ?? model.activeLoadCaseId) === target.id);
  }

  const combination = combinations.find(item => item.id === target.id);
  if (!combination) return [];

  return model.loads.flatMap(load => {
    const loadCaseId = load.loadCaseId ?? model.activeLoadCaseId;
    const factor = combination.factors[loadCaseId] ?? 0;
    const scaled = scaleSpaceLoad(load, factor, combination.id);
    return scaled ? [scaled] : [];
  });
}

function getSpaceSelfWeightLoads(model: SpaceModel, target: SpaceAnalysisTarget, combinations = getSpaceLoadCombinations(model)): SpaceElementLoad[] {
  const defaultLoadCaseId = model.selfWeight?.loadCaseId ?? 'dead';
  const targetFactor = target.type === 'loadCase'
    ? target.id === defaultLoadCaseId ? 1 : 0
    : combinations.find(combo => combo.id === target.id)?.factors[defaultLoadCaseId] ?? 0;
  if (Math.abs(targetFactor) < 1e-12) return [];

  return model.members.flatMap(member => {
    const material = model.materials.find(item => item.id === member.materialId);
    const section = model.sections.find(item => item.id === member.sectionId);
    const factor = member.selfWeightFactor ?? (model.selfWeight?.enabled ? model.selfWeight.factor ?? 1 : 0);
    if (!material || !section || !Number.isFinite(material.density) || !Number.isFinite(section.A) || Math.abs(factor) < 1e-12) return [];
    const q = -(material.density ?? 0) * section.A * 1e-4 * factor * targetFactor;
    if (!Number.isFinite(q) || Math.abs(q) < 1e-12) return [];
    return [{
      id: `${target.id}-self-weight-${member.id}`,
      elementId: member.id,
      loadCaseId: defaultLoadCaseId,
      type: 'distributed' as const,
      direction: 'z' as const,
      coordinateSystem: 'global' as const,
      startMagnitude: q,
      endMagnitude: q,
    }];
  });
}

export function getSpaceScenarioLoads(
  model: SpaceModel,
  target: SpaceAnalysisTarget,
  combinations = getSpaceLoadCombinations(model),
): SpaceLoad[] {
  return [
    ...getSpaceAnalysisLoads(model, target, combinations),
    ...getSpaceSelfWeightLoads(model, target, combinations),
  ];
}

export function solveSpaceFrameScenario(
  model: SpaceModel,
  target: SpaceAnalysisTarget,
  combinations = getSpaceLoadCombinations(model),
  options?: SpaceSolverOptions,
): SpaceAnalysisResult {
  const loads = getSpaceScenarioLoads(model, target, combinations);
  const result = solveSpaceFrame(model.nodes, resolveSpaceElements(model), loads, options);
  return applyScenarioWarnings(model, target, loads, result);
}

function applyScenarioWarnings(
  model: SpaceModel,
  target: SpaceAnalysisTarget,
  loads: SpaceLoad[],
  result: SpaceAnalysisResult,
): SpaceAnalysisResult {
  const warnings = [...(result.stats?.warnings ?? [])];
  if (loads.length === 0) warnings.push(`分析目标 ${target.label} 没有有效荷载。`);
  if (model.selfWeight?.enabled) {
    const missingDensityMembers = model.members.filter(member => {
      const material = model.materials.find(item => item.id === member.materialId);
      const factor = member.selfWeightFactor ?? model.selfWeight?.factor ?? 1;
      return Math.abs(factor) > 1e-12 && (!material || !Number.isFinite(material.density));
    });
    if (missingDensityMembers.length > 0) warnings.push(`自重已开启，但 ${missingDensityMembers.length} 根成员缺少材料密度。`);
  }
  if (result.equilibrium && !result.equilibrium.passed) warnings.push('整体平衡残差偏大，请检查约束、释放或求解收敛状态。');
  if (result.stats) {
    result.stats = { ...result.stats, warnings };
    result.error = warnings.length > 0 ? warnings.join(' ') : result.error;
  }
  const scenarioStatus: SpaceAnalysisStatus = result.status === 'failed'
    ? 'failed'
    : warnings.length > 0
      ? 'warning'
      : result.status;
  result.status = scenarioStatus;
  if (result.equilibrium && result.equilibrium.reliability !== 'failed') {
    result.equilibrium = { ...result.equilibrium, reliability: scenarioStatus };
  }
  return result;
}

export function solveSpaceFrameScenarios(
  model: SpaceModel,
  targets: SpaceAnalysisTarget[],
  options?: SpaceSolverOptions,
): SpaceScenarioBatchResult {
  const combinations = getSpaceLoadCombinations(model);
  const elements = resolveSpaceElements(model);
  const context = prepareSpaceFrameAnalysis(model.nodes, elements);
  const results = targets.map(target => ({
    target,
    result: solveSpaceFrameScenarioWithContext(model, context, target, combinations, options),
  }));
  const warnings = results.flatMap(({ target, result }) => (
    result.stats?.warnings.map(warning => `${target.label}: ${warning}`) ?? []
  ));

  return {
    results,
    envelopeRows: buildSpaceResultEnvelopeRows(results),
    diagnostics: {
      targetsSolved: results.length,
      loadCasesSolved: targets.filter(target => target.type === 'loadCase').length,
      combinationsSolved: targets.filter(target => target.type === 'combination').length,
      stiffnessAssemblies: targets.length > 0 ? 1 : 0,
      loadVectorsBuilt: targets.length,
      warnings,
    },
  };
}

function solveSpaceFrameScenarioWithContext(
  model: SpaceModel,
  context: ReturnType<typeof prepareSpaceFrameAnalysis>,
  target: SpaceAnalysisTarget,
  combinations = getSpaceLoadCombinations(model),
  options?: SpaceSolverOptions,
): SpaceAnalysisResult {
  const loads = getSpaceScenarioLoads(model, target, combinations);
  const result = solvePreparedSpaceFrame(context, loads, options);
  return applyScenarioWarnings(model, target, loads, result);
}

const envelopeMeta: Record<SpaceEnvelopeRowKey, { label: string; unit: string }> = {
  'axial-max': { label: '轴力最大拉力', unit: 'kN' },
  'axial-min': { label: '轴力最大压力', unit: 'kN' },
  'vy-max': { label: 'Vy 最大正值', unit: 'kN' },
  'vy-min': { label: 'Vy 最大负值', unit: 'kN' },
  'vz-max': { label: 'Vz 最大正值', unit: 'kN' },
  'vz-min': { label: 'Vz 最大负值', unit: 'kN' },
  'torsion-max': { label: '扭矩最大正值', unit: 'kN·m' },
  'torsion-min': { label: '扭矩最大负值', unit: 'kN·m' },
  'my-max': { label: 'My 最大正值', unit: 'kN·m' },
  'my-min': { label: 'My 最大负值', unit: 'kN·m' },
  'mz-max': { label: 'Mz 最大正值', unit: 'kN·m' },
  'mz-min': { label: 'Mz 最大负值', unit: 'kN·m' },
  'displacement-abs': { label: '位移最大绝对值', unit: 'mm' },
  'fx-abs': { label: '支座 Fx 最大绝对值', unit: 'kN' },
  'fy-abs': { label: '支座 Fy 最大绝对值', unit: 'kN' },
  'fz-abs': { label: '支座 Fz 最大绝对值', unit: 'kN' },
};

function emptyEnvelopeRow(key: SpaceEnvelopeRowKey): SpaceEnvelopeRow {
  const meta = envelopeMeta[key];
  return { key, label: meta.label, value: null, unit: meta.unit, sourceLabel: '无', location: '无' };
}

function buildEnvelopeRow(key: SpaceEnvelopeRowKey, candidate: SpaceEnvelopeRow | null): SpaceEnvelopeRow {
  return candidate ?? emptyEnvelopeRow(key);
}

function betterSigned(current: SpaceEnvelopeRow | null, candidate: SpaceEnvelopeRow, sense: 'max' | 'min') {
  if (candidate.value === null) return current;
  if (!current || current.value === null) return candidate;
  return sense === 'max'
    ? candidate.value > current.value ? candidate : current
    : candidate.value < current.value ? candidate : current;
}

function betterAbs(current: SpaceEnvelopeRow | null, candidate: SpaceEnvelopeRow) {
  if (candidate.value === null) return current;
  if (!current || current.value === null) return candidate;
  return Math.abs(candidate.value) > Math.abs(current.value) ? candidate : current;
}

export function buildSpaceResultEnvelopeRows(items: SpaceEnvelopeInput[]): SpaceEnvelopeRow[] {
  const rows: Record<SpaceEnvelopeRowKey, SpaceEnvelopeRow | null> = {
    'axial-max': null,
    'axial-min': null,
    'vy-max': null,
    'vy-min': null,
    'vz-max': null,
    'vz-min': null,
    'torsion-max': null,
    'torsion-min': null,
    'my-max': null,
    'my-min': null,
    'mz-max': null,
    'mz-min': null,
    'displacement-abs': null,
    'fx-abs': null,
    'fy-abs': null,
    'fz-abs': null,
  };

  const candidate = (target: SpaceAnalysisTarget, key: SpaceEnvelopeRowKey, value: number, location: string): SpaceEnvelopeRow => ({
    key,
    label: envelopeMeta[key].label,
    unit: envelopeMeta[key].unit,
    value,
    sourceLabel: target.label,
    sourceType: target.type,
    sourceId: target.id,
    location,
  });

  items.forEach(({ target, result }) => {
    result.elements.forEach(element => {
      element.stations.forEach(station => {
        const location = `单元 ${element.elementId} · x=${station.x.toFixed(2)} m`;
        rows['axial-max'] = betterSigned(rows['axial-max'], candidate(target, 'axial-max', station.axial, location), 'max');
        rows['axial-min'] = betterSigned(rows['axial-min'], candidate(target, 'axial-min', station.axial, location), 'min');
        rows['vy-max'] = betterSigned(rows['vy-max'], candidate(target, 'vy-max', station.shearY, location), 'max');
        rows['vy-min'] = betterSigned(rows['vy-min'], candidate(target, 'vy-min', station.shearY, location), 'min');
        rows['vz-max'] = betterSigned(rows['vz-max'], candidate(target, 'vz-max', station.shearZ, location), 'max');
        rows['vz-min'] = betterSigned(rows['vz-min'], candidate(target, 'vz-min', station.shearZ, location), 'min');
        rows['torsion-max'] = betterSigned(rows['torsion-max'], candidate(target, 'torsion-max', station.torsion, location), 'max');
        rows['torsion-min'] = betterSigned(rows['torsion-min'], candidate(target, 'torsion-min', station.torsion, location), 'min');
        rows['my-max'] = betterSigned(rows['my-max'], candidate(target, 'my-max', station.momentY, location), 'max');
        rows['my-min'] = betterSigned(rows['my-min'], candidate(target, 'my-min', station.momentY, location), 'min');
        rows['mz-max'] = betterSigned(rows['mz-max'], candidate(target, 'mz-max', station.momentZ, location), 'max');
        rows['mz-min'] = betterSigned(rows['mz-min'], candidate(target, 'mz-min', station.momentZ, location), 'min');
      });
    });

    result.displacements.forEach(displacement => {
      const value = Math.hypot(displacement.dx, displacement.dy, displacement.dz);
      rows['displacement-abs'] = betterAbs(rows['displacement-abs'], candidate(target, 'displacement-abs', value, `节点 ${displacement.nodeId}`));
    });

    result.reactions.forEach(reaction => {
      rows['fx-abs'] = betterAbs(rows['fx-abs'], candidate(target, 'fx-abs', reaction.fx, `节点 ${reaction.nodeId}`));
      rows['fy-abs'] = betterAbs(rows['fy-abs'], candidate(target, 'fy-abs', reaction.fy, `节点 ${reaction.nodeId}`));
      rows['fz-abs'] = betterAbs(rows['fz-abs'], candidate(target, 'fz-abs', reaction.fz, `节点 ${reaction.nodeId}`));
    });
  });

  return (Object.keys(rows) as SpaceEnvelopeRowKey[]).map(key => buildEnvelopeRow(key, rows[key]));
}

export function validateSpaceModel(model: SpaceModel): SpaceModelIssue[] {
  const issues: SpaceModelIssue[] = [];
  const nodeIds = new Set<number>();
  const memberIds = new Set<number>();

  if (model.coordinateSystem !== 'Z-up') {
    issues.push(issue('coordinate-system', 'error', '坐标约定不一致', '空间求解器当前只接受 Z-up 坐标约定。'));
  }

  model.nodes.forEach(node => {
    if (nodeIds.has(node.id)) {
      issues.push(issue(`node-${node.id}`, 'error', '节点编号重复', `节点 ${node.id} 出现了多次。`));
    }
    nodeIds.add(node.id);
    node.springStiffness?.forEach((stiffness, index) => {
      if (!Number.isFinite(stiffness) || stiffness < 0) {
        const labels = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
        issues.push(issue(`spring-${node.id}-${index}`, 'error', '弹性支座刚度异常', `节点 ${node.id} 的 ${labels[index]} 弹簧刚度必须为非负有限值。`));
      }
    });
  });

  model.materials.forEach(material => {
    if (!Number.isFinite(material.E) || material.E <= 0) {
      issues.push(issue(`material-E-${material.id}`, 'error', '材料弹性模量异常', `材料 ${material.name} 的 E 必须为正有限值，单位为 GPa。`));
    }
    if (!Number.isFinite(material.nu) || material.nu <= -0.99 || material.nu >= 0.5) {
      issues.push(issue(`material-nu-${material.id}`, 'error', '材料泊松比异常', `材料 ${material.name} 的 ν 建议大于 -0.99 且小于 0.5。`));
    }
    if (material.density !== undefined && (!Number.isFinite(material.density) || material.density < 0)) {
      issues.push(issue(`material-density-${material.id}`, 'error', '材料密度异常', `材料 ${material.name} 的密度必须为非负有限值。`));
    }
  });

  model.sections.forEach(section => {
    ([
      ['A', section.A, SPACE_SECTION_UNITS.A],
      ['Iy', section.Iy, SPACE_SECTION_UNITS.Iy],
      ['Iz', section.Iz, SPACE_SECTION_UNITS.Iz],
      ['J', section.J, SPACE_SECTION_UNITS.J],
    ] as const).forEach(([key, value, unit]) => {
      if (!Number.isFinite(value) || value <= 0) {
        issues.push(issue(`section-${key}-${section.id}`, 'error', '截面参数异常', `截面 ${section.name} 的 ${key} 必须为正有限值，单位为 ${unit}。`));
      }
    });
  });

  model.members.forEach(member => {
    if (memberIds.has(member.id)) {
      issues.push(issue(`member-${member.id}`, 'error', '成员编号重复', `成员 ${member.id} 出现了多次。`));
    }
    memberIds.add(member.id);

    const start = model.nodes.find(node => node.id === member.startNode);
    const end = model.nodes.find(node => node.id === member.endNode);
    if (!start || !end) {
      issues.push(issue(`member-ref-${member.id}`, 'error', '成员引用无效节点', `成员 ${member.id} 的端点节点不存在。`));
      return;
    }

    if (!model.materials.some(material => material.id === member.materialId)) {
      issues.push(issue(`member-material-${member.id}`, 'error', '材料引用无效', `成员 ${member.id} 引用了不存在的材料 ${member.materialId}。`));
    }
    if (!model.sections.some(section => section.id === member.sectionId)) {
      issues.push(issue(`member-section-${member.id}`, 'error', '截面引用无效', `成员 ${member.id} 引用了不存在的截面 ${member.sectionId}。`));
    }

    if (Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z) < 1e-6) {
      issues.push(issue(`member-zero-${member.id}`, 'error', '零长度成员', `成员 ${member.id} 两端距离接近 0。`));
    }

    const releaseStartKeys = Object.entries(member.releaseStart ?? {}).filter(([, enabled]) => enabled).map(([key]) => key);
    const releaseEndKeys = Object.entries(member.releaseEnd ?? {}).filter(([, enabled]) => enabled).map(([key]) => key);
    const bothEndReleases = releaseStartKeys.filter(key => releaseEndKeys.includes(key));
    if (releaseStartKeys.length + releaseEndKeys.length > 0) {
      issues.push(issue(
        `member-release-${member.id}`,
        bothEndReleases.length > 0 ? 'error' : 'info',
        '成员端部释放',
        bothEndReleases.length > 0
          ? `成员 ${member.id} 在两端释放了 ${bothEndReleases.join('/')}，可能形成局部机构。`
          : `成员 ${member.id} 设置了局部转角释放，请复核连接假定。`,
      ));
    }

    const selfWeightFactor = member.selfWeightFactor ?? (model.selfWeight?.enabled ? model.selfWeight.factor ?? 1 : 0);
    const material = model.materials.find(item => item.id === member.materialId);
    if (Math.abs(selfWeightFactor) > 1e-12 && (!material || !Number.isFinite(material.density))) {
      issues.push(issue(`self-weight-density-${member.id}`, 'warning', '自重缺少密度', `成员 ${member.id} 参与自重，但材料 ${member.materialId} 缺少有效密度。`));
    }
  });

  const connectedNodes = new Set<number>();
  model.members.forEach(member => {
    connectedNodes.add(member.startNode);
    connectedNodes.add(member.endNode);
  });
  model.nodes.forEach(node => {
    if (!connectedNodes.has(node.id)) {
      issues.push(issue(`isolated-${node.id}`, 'warning', '孤立节点', `节点 ${node.id} 没有连接任何空间成员。`));
    }
  });

  const constrainedDofs = model.nodes.reduce((sum, node) => sum + node.restraints.filter(Boolean).length, 0);
  if (constrainedDofs < 6) {
    issues.push(issue('few-restraints', 'warning', '空间约束偏少', `当前仅约束 ${constrainedDofs} 个自由度，空间结构通常至少需要 6 个独立约束。`));
  }

  const loadNodeIds = new Set(model.nodes.map(node => node.id));
  const loadMemberIds = new Set(model.members.map(member => member.id));
  model.loads.forEach(load => {
    if (isSpaceNodalLoad(load) && !loadNodeIds.has(load.nodeId)) {
      issues.push(issue(`load-node-${load.id}`, 'error', '荷载节点不存在', `荷载 ${load.id} 指向了不存在的节点 ${load.nodeId}。`));
    }
    if (isSpaceElementLoad(load) && !loadMemberIds.has(load.elementId)) {
      issues.push(issue(`load-member-${load.id}`, 'error', '荷载杆件不存在', `荷载 ${load.id} 指向了不存在的杆件 ${load.elementId}。`));
    }
    const hasInvalidValue = isSpaceNodalLoad(load)
      ? !Number.isFinite(load.magnitude)
      : !Number.isFinite(load.startMagnitude) || !Number.isFinite(load.endMagnitude);
    if (hasInvalidValue) {
      issues.push(issue(`load-value-${load.id}`, 'error', '荷载数值异常', `荷载 ${load.id} 的大小不是有效数字。`));
    }
  });

  if (getActiveSpaceLoads(model).length === 0) {
    issues.push(issue('empty-active-loads', 'info', '当前空间工况无荷载', '当前空间模型没有参与计算的节点或杆件荷载。'));
  }

  getSpaceLoadCombinations(model).forEach(combo => {
    const hasLoads = model.loads.some(load => {
      const loadCaseId = load.loadCaseId ?? model.activeLoadCaseId;
      return Math.abs(combo.factors[loadCaseId] ?? 0) > 1e-12;
    });
    const hasSelfWeight = model.selfWeight?.enabled && Math.abs(combo.factors[model.selfWeight.loadCaseId ?? 'dead'] ?? 0) > 1e-12;
    if (!hasLoads && !hasSelfWeight) {
      issues.push(issue(`empty-combination-${combo.id}`, 'info', '空间组合无有效荷载', `组合 ${combo.name} 当前没有可参与计算的荷载。`));
    }
  });

  return issues;
}

export function buildSpaceResultSummary(result: SpaceAnalysisResult) {
  const maxMomentY = Math.max(...result.elements.map(element => element.maxAbsMomentY), 0);
  const maxMomentZ = Math.max(...result.elements.map(element => element.maxAbsMomentZ), 0);
  return {
    maxDisplacement: result.maxDisplacement,
    maxAxial: Math.max(...result.elements.map(element => element.maxAbsAxial), 0),
    maxShear: Math.max(...result.elements.map(element => Math.max(element.maxAbsShearY, element.maxAbsShearZ)), 0),
    maxTorsion: Math.max(...result.elements.map(element => element.maxAbsTorsion), 0),
    maxBending: Math.max(maxMomentY, maxMomentZ),
    controllingBendingAxis: maxMomentY >= maxMomentZ ? 'My' : 'Mz',
  };
}
