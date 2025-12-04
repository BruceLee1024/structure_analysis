export enum ModuleType {
  SOLVER = 'solver',
  STATIC = 'static',
  INFLUENCE = 'influence',
}

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
  type: 'point' | 'distributed' | 'moment';
  magnitude: number;
  direction?: 'x' | 'y';
  location?: number;
}

export interface SolverParams {
  structureType: StructureType;
  stiffnessType: StiffnessType;
  width: number;
  height: number;
  roofHeight: number;
  numSpans: number;
  numStories: number;
  numBays: number;
  elasticModulus: number;
  crossSectionArea: number;
  momentOfInertia: number;
  nodes: SolverNode[];
  elements: SolverElement[];
  loads: Load[];
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
}
