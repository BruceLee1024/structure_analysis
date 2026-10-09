import { solveLearningBeam, type LearningBeamLoad } from './learningBeam';
export interface BeamDiagramInput {
  beamType: 'simple' | 'cantilever' | 'overhanging';
  loadType: 'point' | 'distributed';
  L: number;
  P: number;
  q: number;
  a: number;
  overhang: number;
}
export interface DiagramStation { x: number; value: number }

/** Compatibility adapter for the original single-load learning examples. */
export function getBeamDiagram(input: BeamDiagramInput) {
  const length = input.L + (input.beamType === 'overhanging' ? input.overhang : 0);
  const loadX = input.a / 100 * length;
  const load: LearningBeamLoad = input.loadType === 'point'
    ? { id: 'legacy', type: 'point', position: loadX, magnitude: input.P, angle: -90 }
    : { id: 'legacy', type: 'uniform', start: 0, end: length, magnitude: input.q, angle: -90 };
  return { ...solveLearningBeam({ beamType: input.beamType, L: input.L, overhang: input.overhang, loads: [load] }), loadX };
}
