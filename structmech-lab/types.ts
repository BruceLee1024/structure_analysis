export enum ModuleType {
  SOLVER = 'solver',
  STATIC = 'static',
  INFLUENCE = 'influence',
}

export type StaticSubModule = 'geometry' | 'beam' | 'frame' | 'truss' | 'arch' | 'composite';
export type InfluenceSubModule = 'static' | 'kinematic' | 'envelope' | 'application';

// ========== Solver Module Types ==========

export enum SupportType {
  Fixed = 'Fixed',
  Pinned = 'Pinned',
  Roller = 'Roller',
  RollerX = 'RollerX',
  Free = 'Free',
}

export enum StructureType {
  Beam = 'Beam',
  MultiSpanBeam = 'MultiSpanBeam',
  PortalFrame = 'PortalFrame',
  MultiStoryFrame = 'MultiStoryFrame',
  GableFrame = 'GableFrame',
  Truss = 'Truss',
  Cantilever = 'Cantilever',
  Custom = 'Custom',
}

export type StiffnessType = 'Elastic' | 'AxiallyRigid' | 'Rigid';

export interface SolverNode {
  id: number;
  x: number;
  y: number;
  restraints: [boolean, boolean, boolean];
  springStiffness?: [number, number, number];
}

export interface SolverElement {
  id: number;
  startNode: number;
  endNode: number;
  E: number;
  A: number;
  I: number;
  releaseStart?: boolean;
  releaseEnd?: boolean;
}

export interface Load {
  id: string;
  elementId?: number;
  nodeId?: number;
  loadCaseId?: string;
  type: 'point' | 'distributed' | 'trapezoidal' | 'moment';
  magnitude: number;
  magnitudeEnd?: number;
  direction?: 'x' | 'y';
  location?: number;
}

export interface LoadCase {
  id: string;
  name: string;
  category: 'dead' | 'live' | 'wind' | 'quake' | 'custom';
}

export interface LoadCombination {
  id: string;
  name: string;
  factors: Record<string, number>;
}

export type AnalysisTargetType = 'loadCase' | 'combination';

export interface DiagramLayerSettings {
  grid: boolean;
  loads: boolean;
  reactions: boolean;
  moment: boolean;
  shear: boolean;
  axial: boolean;
  deflection: boolean;
  labels: boolean;
  diagramScale: number;
}

export type ResultSelectionKind = 'moment' | 'shear' | 'axial' | 'deflection';

export interface ResultSelection {
  kind: ResultSelectionKind;
  label: string;
  elementId?: number;
  nodeId?: number;
  x?: number;
  globalX?: number;
  globalY?: number;
  component?: 'dx' | 'dy' | 'localY';
}

export type ModelIssueSeverity = 'error' | 'warning' | 'info';

export interface ModelIssue {
  id: string;
  severity: ModelIssueSeverity;
  title: string;
  detail: string;
}

export interface SolverParams {
  unitSystem?: 'metric-kN-m';
  deflectionLimitRatio?: number;
  structureType: StructureType;
  stiffnessType: StiffnessType;
  width: number;
  height: number;
  roofHeight: number;
  numSpans: number;
  numStories: number;
  numBays: number;
  overhangLeft: number;
  overhangRight: number;
  elasticModulus: number;
  crossSectionArea: number;
  momentOfInertia: number;
  nodes: SolverNode[];
  elements: SolverElement[];
  loads: Load[];
  loadCases?: LoadCase[];
  loadCombinations?: LoadCombination[];
  activeLoadCaseId?: string;
  activeAnalysisType?: AnalysisTargetType;
  activeAnalysisId?: string;
}

export interface ElementResult {
  elementId: number;
  stations: {
    x: number;
    deflectionY: number;
    axial: number;
    shear: number;
    moment: number;
    globalX: number;
    globalY: number;
  }[];
  maxMoment: number;
  maxShear: number;
  maxAxial: number;
  u_local: number[];
  startForces: { fx: number; fy: number; m: number };
}

export interface AnalysisResult {
  elements: ElementResult[];
  maxDeflection: number;
  reactions: { nodeId: number; fx: number; fy: number; m: number }[];
  displacements: { nodeId: number; dx: number; dy: number; rotation: number }[];
  error?: string;
}
