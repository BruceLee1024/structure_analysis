export type LearningBeamType = 'simple' | 'cantilever' | 'overhanging';
interface LoadBase { id: string; magnitude: number }
export interface BeamPointLoad extends LoadBase { type: 'point'; position: number; angle: number }
export interface BeamDistributedLoad extends LoadBase { type: 'uniform' | 'linear'; start: number; end: number; endMagnitude?: number; angle: number }
export interface BeamMomentLoad extends LoadBase { type: 'moment'; position: number; rotation: 'cw' | 'ccw' }
export type LearningBeamLoad = BeamPointLoad | BeamDistributedLoad | BeamMomentLoad;
export interface LearningBeamInput { beamType: LearningBeamType; L: number; overhang: number; loads: LearningBeamLoad[] }
export interface BeamStation { x: number; value: number; side?: 'left' | 'right' }
type Side = 'left' | 'right';
const clean = (n: number) => Math.abs(n) < 1e-10 ? 0 : n;
export const beamForceDirection = (angle: number) => ({ x: clean(Math.cos(angle % 360 * Math.PI / 180)), y: clean(Math.sin(angle % 360 * Math.PI / 180)) });
export const beamLength = (input: Pick<LearningBeamInput, 'beamType' | 'L' | 'overhang'>) => input.L + (input.beamType === 'overhanging' ? input.overhang : 0);

/** Exact piecewise equilibrium for a straight statically determinate beam.
 * x is in metres; Fx rightward, Fy upward and external couples CCW are positive.
 * Internal M is sagging-positive, V upward on the left cut, N tensile-positive.
 */
export function solveLearningBeam(input: LearningBeamInput) {
  const { beamType, L, loads } = input, length = beamLength(input);
  if (!['simple', 'cantilever', 'overhanging'].includes(beamType) || !Number.isFinite(L) || L <= 0 || !Number.isFinite(length) || length < L) throw new Error('梁长必须是有效正数，外伸长度不能为负');
  const checkPosition = (x: number) => { if (!Number.isFinite(x) || x < 0 || x > length) throw new Error('荷载位置必须在梁长范围内'); };
  for (const load of loads) {
    if (!Number.isFinite(load.magnitude) || load.magnitude < 0) throw new Error('荷载大小必须为有效非负数');
    if (load.type === 'point' || load.type === 'moment') checkPosition(load.position);
    else {
      checkPosition(load.start); checkPosition(load.end);
      if (load.end <= load.start) throw new Error('分布荷载终点必须大于起点');
      if (load.type === 'linear' && (!Number.isFinite(load.endMagnitude) || load.endMagnitude! < 0)) throw new Error('终点荷载强度必须为有效非负数');
    }
    if (load.type === 'moment') { if (load.rotation !== 'cw' && load.rotation !== 'ccw') throw new Error('弯矩方向无效'); }
    else if (!Number.isFinite(load.angle)) throw new Error('荷载角度必须为有效数值');
  }
  const points = loads.filter((l): l is BeamPointLoad => l.type === 'point').map(l => {
    const direction = beamForceDirection(l.angle);
    return { ...l, fx: l.magnitude * direction.x, fy: l.magnitude * direction.y };
  });
  const couples = loads.filter((l): l is BeamMomentLoad => l.type === 'moment').map(l => ({ ...l, value: l.magnitude * (l.rotation === 'ccw' ? 1 : -1) }));
  const distributed = loads.filter((l): l is BeamDistributedLoad => l.type === 'uniform' || l.type === 'linear').map(l => ({
    ...l, direction: beamForceDirection(l.angle), width: l.end - l.start,
    slope: ((l.type === 'linear' ? l.endMagnitude! : l.magnitude) - l.magnitude) / (l.end - l.start),
  }));
  const resultant = { x: 0, y: 0, moment: 0 };
  points.forEach(p => { resultant.x += p.fx; resultant.y += p.fy; resultant.moment += p.position * p.fy; });
  couples.forEach(c => { resultant.moment += c.value; });
  distributed.forEach(d => {
    const force = d.magnitude * d.width + d.slope * d.width ** 2 / 2;
    resultant.x += d.direction.x * force; resultant.y += d.direction.y * force;
    resultant.moment += d.direction.y * (d.start * force + d.magnitude * d.width ** 2 / 2 + d.slope * d.width ** 3 / 3);
  });
  const RB = beamType === 'cantilever' ? 0 : clean(-resultant.moment / L);
  const RA = clean(-resultant.y - RB), Ax = clean(-resultant.x);
  const fixedMoment = beamType === 'cantilever' ? clean(-resultant.moment) : 0;
  const reached = (x: number, position: number, side: Side) => side === 'left' ? x > position : x >= position;
  const partial = (d: typeof distributed[number], x: number) => {
    const t = Math.max(0, Math.min(d.width, x - d.start));
    const force = d.magnitude * t + d.slope * t ** 2 / 2;
    const firstMoment = d.magnitude * t ** 2 / 2 + d.slope * t ** 3 / 3;
    return { force, moment: force * (x - d.start) - firstMoment };
  };
  const shearAt = (x: number, side: Side = 'right') => clean(
    (reached(x, 0, side) ? RA : 0) + (beamType !== 'cantilever' && reached(x, L, side) ? RB : 0)
    + points.reduce((sum, p) => sum + (reached(x, p.position, side) ? p.fy : 0), 0)
    + distributed.reduce((sum, d) => sum + d.direction.y * partial(d, x).force, 0));
  const axialAt = (x: number, side: Side = 'right') => clean(-(
    (reached(x, 0, side) ? Ax : 0) + points.reduce((sum, p) => sum + (reached(x, p.position, side) ? p.fx : 0), 0)
    + distributed.reduce((sum, d) => sum + d.direction.x * partial(d, x).force, 0)));
  const momentAt = (x: number, side: Side = 'right') => clean(
    RA * x + RB * Math.max(x - L, 0) - (reached(x, 0, side) ? fixedMoment : 0)
    + points.reduce((sum, p) => sum + p.fy * Math.max(x - p.position, 0), 0)
    - couples.reduce((sum, c) => sum + (reached(x, c.position, side) ? c.value : 0), 0)
    + distributed.reduce((sum, d) => sum + d.direction.y * partial(d, x).moment, 0));
  const boundaries = [...new Set([0, L, length, ...points.map(p => p.position), ...couples.map(c => c.position), ...distributed.flatMap(d => [d.start, d.end])])].sort((a, b) => a - b);
  const critical = [...boundaries];
  // Inside each interval V is quadratic at most. Include its roots (M extrema)
  // and derivatives' roots (V/N extrema), rather than trusting sampled peaks.
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i], width = boundaries[i + 1] - start;
    const active = distributed.filter(d => d.start <= start && d.end > start);
    const v0 = shearAt(start), v1 = active.reduce((sum, d) => sum + d.direction.y * (d.magnitude + d.slope * (start - d.start)), 0);
    const v2 = active.reduce((sum, d) => sum + d.direction.y * d.slope / 2, 0);
    const add = (t: number) => { if (Number.isFinite(t) && t > 0 && t < width) critical.push(start + t); };
    if (Math.abs(v2) < 1e-14) { if (Math.abs(v1) > 1e-14) add(-v0 / v1); }
    else {
      const disc = v1 ** 2 - 4 * v2 * v0;
      if (disc >= 0) {
        const q = -.5 * (v1 + (v1 >= 0 ? 1 : -1) * Math.sqrt(disc));
        add(q / v2); if (q !== 0) add(v0 / q);
      }
      add(-v1 / (2 * v2));
    }
    const n1 = active.reduce((sum, d) => sum + d.direction.x * (d.magnitude + d.slope * (start - d.start)), 0);
    const n2 = active.reduce((sum, d) => sum + d.direction.x * d.slope / 2, 0);
    if (Math.abs(n2) > 1e-14) add(-n1 / (2 * n2));
  }
  const positions = [...new Set([...critical, ...Array.from({ length: 121 }, (_, i) => length * i / 120)])].sort((a, b) => a - b);
  const stations = (at: (x: number, side?: Side) => number): BeamStation[] => positions.flatMap(x => {
    const left = at(x, 'left'), right = at(x);
    return Math.abs(left - right) > 1e-9 ? [{ x, value: left, side: 'left' as const }, { x, value: right, side: 'right' as const }] : [{ x, value: right }];
  });
  const moment = stations(momentAt), shear = stations(shearAt), axial = stations(axialAt);
  const absolutePeak = (data: BeamStation[]) => data.reduce((peak, p) => Math.abs(p.value) > Math.abs(peak.value) ? p : peak, data[0]);
  const momentPeak = absolutePeak(moment), axialPeak = absolutePeak(axial);
  const shearMax = shear.reduce((peak, p) => p.value > peak.value ? p : peak, shear[0]);
  const shearMin = shear.reduce((peak, p) => p.value < peak.value ? p : peak, shear[0]);
  if (![RA, RB, Ax, fixedMoment, ...moment.map(p => p.value), ...shear.map(p => p.value), ...axial.map(p => p.value)].every(Number.isFinite)) throw new Error('参数数值过大，请调整后重新计算');
  return { length, RA, RB, Ax, fixedMoment, resultant, moment, shear, axial, momentAt, shearAt, axialAt, momentPeak, shearMax, shearMin, axialPeak,
    Mmax: Math.abs(momentPeak.value), Vmax: Math.max(Math.abs(shearMax.value), Math.abs(shearMin.value)), Nmax: Math.abs(axialPeak.value) };
}
export type LearningBeamResult = ReturnType<typeof solveLearningBeam>;
