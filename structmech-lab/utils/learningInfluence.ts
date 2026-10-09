import { beamForceDirection, type LearningBeamLoad } from './learningBeam';
import type { PlanarLoad } from './learningPlanar';
export type InfluenceTarget = 'RA' | 'RB' | 'Mc' | 'Qc' | 'Nc';
export function memberLoadsToBeam(loads: PlanarLoad[], length: number): LearningBeamLoad[] {
  return loads.map(l => l.type === 'point' ? { id: l.id, type: l.type, magnitude: l.magnitude, position: l.position * length, angle: l.angle }
    : l.type === 'moment' ? { id: l.id, type: l.type, magnitude: l.magnitude, position: l.position * length, rotation: l.rotation }
    : { id: l.id, type: l.type, magnitude: l.magnitude, endMagnitude: l.endMagnitude, start: l.start * length, end: l.end * length, angle: l.angle });
}
/** Shift a load group; clip line loads while preserving their original intensity slope. */
export function translateBeamLoads(loads: LearningBeamLoad[], shift: number, L: number): LearningBeamLoad[] {
  return loads.flatMap<LearningBeamLoad>(l => {
    if (l.type === 'point' || l.type === 'moment') { const position = l.position + shift; return position >= 0 && position <= L ? [{ ...l, position }] : []; }
    const rawStart = l.start + shift, rawEnd = l.end + shift, start = Math.max(0, rawStart), end = Math.min(L, rawEnd);
    if (end <= start) return [];
    const slope = l.type === 'linear' ? (l.endMagnitude! - l.magnitude) / (rawEnd - rawStart) : 0;
    return [{ ...l, start, end, magnitude: l.magnitude + slope * (start - rawStart), endMagnitude: l.magnitude + slope * (end - rawStart) }];
  });
}
/** Exact section equilibrium without building all diagram stations (moving-load sweeps). */
export function influenceResponse(L: number, loads: LearningBeamLoad[], c: number, target: InfluenceTarget) {
  let fx = 0, fy = 0, moment = 0, cutFx = 0, cutFy = 0, cutMoment = 0;
  for (const l of loads) {
    if (l.type === 'moment') { const C = l.magnitude * (l.rotation === 'ccw' ? 1 : -1); moment += C; if (l.position <= c) cutMoment -= C; continue; }
    const d = beamForceDirection(l.angle);
    if (l.type === 'point') {
      fx += l.magnitude * d.x; fy += l.magnitude * d.y; moment += l.magnitude * d.y * l.position;
      if (l.position <= c) { cutFx += l.magnitude * d.x; cutFy += l.magnitude * d.y; cutMoment += l.magnitude * d.y * (c - l.position); }
    } else {
      const width = l.end - l.start, slope = l.type === 'linear' ? (l.endMagnitude! - l.magnitude) / width : 0;
      const total = l.magnitude * width + slope * width * width / 2;
      fx += d.x * total; fy += d.y * total; moment += d.y * (l.start * total + l.magnitude * width * width / 2 + slope * width ** 3 / 3);
      const t = Math.max(0, Math.min(width, c - l.start)), part = l.magnitude * t + slope * t * t / 2;
      cutFx += d.x * part; cutFy += d.y * part; cutMoment += d.y * (part * (c - l.start) - l.magnitude * t * t / 2 - slope * t ** 3 / 3);
    }
  }
  const RB = -moment / L, RA = -fy - RB;
  const value = target === 'RA' ? RA : target === 'RB' ? RB : target === 'Mc' ? RA * c + cutMoment : target === 'Qc' ? RA + cutFy + (c === L ? RB : 0) : fx - cutFx;
  return Math.abs(value) < 1e-9 ? 0 : value;
}
export function movingEnvelope(L: number, loads: LearningBeamLoad[], target: InfluenceTarget = 'Mc') {
  const edges = loads.flatMap(l => 'position' in l ? [l.position] : [l.start, l.end]);
  const extent = Math.max(0, ...edges);
  return Array.from({ length: 101 }, (_, i) => {
    const x = L * i / 100;
    // Include all crossings of supports and section, plus a dense scan for distributed extrema.
    const shifts = [...new Set([...Array.from({ length: 241 }, (_, j) => -extent + (L + extent) * j / 240), ...edges.flatMap(e => [-e, x - e, L - e])])].sort((a, b) => a - b);
    let max = 0, min = 0, maxShift = -extent, minShift = -extent;
    for (const shift of shifts) {
      const value = influenceResponse(L, translateBeamLoads(loads, shift, L), x, target);
      if (value > max) { max = value; maxShift = shift; } if (value < min) { min = value; minShift = shift; }
      // Both one-sided limits for section shear / applied moment coincidences.
      if (target === 'Qc' || loads.some(l => l.type === 'moment')) {
        for (const delta of [-1e-7, 1e-7]) {
          const v = influenceResponse(L, translateBeamLoads(loads, shift + delta, L), x, target);
          if (v > max) { max = v; maxShift = shift + delta; } if (v < min) { min = v; minShift = shift + delta; }
        }
      }
    }
    return { x, max, min, maxShift, minShift };
  });
}
