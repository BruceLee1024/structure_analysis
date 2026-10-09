import type { AnalysisResult, Load, SolverElement, SolverNode } from '../types';
import type { LearningBeamInput, LearningBeamResult } from './learningBeam';
import { planarMembers, planarPoint, type PlanarGeometry, type PlanarLoad, type PlanarResult } from './learningPlanar';
import { TRUSS_MEMBERS, type LearningTrussResult } from './learningTruss';
import type { FlowMarker, FlowModel, FlowPoint, FlowSegment } from './forceFlow';
import { getLineLoadRange } from './lineLoads';
import { calculateExactValues } from './solver';
const nonzero = (v: number) => Number.isFinite(v) && Math.abs(v) > 1e-8;
const sorted = (xs: number[]) => [...new Set(xs.filter(Number.isFinite))].sort((a, b) => a - b);
export function beamFlowModel(input: LearningBeamInput, result: LearningBeamResult, project: (x: number) => FlowPoint): FlowModel {
  const breaks = sorted([0, input.L, result.length, ...Array.from({ length: 33 }, (_, i) => result.length * i / 32), ...input.loads.flatMap(l => 'position' in l ? [l.position] : Array.from({ length: 9 }, (_, i) => l.start + (l.end - l.start) * i / 8))]);
  const segments = breaks.slice(1).map((x, i) => { const start = breaks[i], mid = (start + x) / 2; return { id: `beam-${start}-${x}`, memberId: 'beam', a: project(start), b: project(x), values: { N: result.axialAt(mid), V: result.shearAt(mid), M: result.momentAt(mid) } }; });
  const sources = input.loads.flatMap<FlowMarker>(l => 'position' in l ? [{ ...project(l.position), id: l.id, magnitude: l.magnitude, kind: l.type === 'moment' ? 'moment' : 'point' }] : Array.from({ length: 9 }, (_, i) => ({ ...project(l.start + (l.end - l.start) * i / 8), id: `${l.id}-${i}`, kind: 'distributed' as const, magnitude: l.magnitude + (l.type === 'linear' ? (l.endMagnitude ?? l.magnitude) - l.magnitude : 0) * i / 8 })));
  return { segments, sources, supports: [{ ...project(0), id: 'A', magnitude: result.RA || result.Ax || result.fixedMoment }, ...(input.beamType === 'cantilever' ? [] : [{ ...project(input.L), id: 'B', magnitude: result.RB }])] };
}
export function trussFlowModel(result: LearningTrussResult, project: (x: number, y: number) => FlowPoint): FlowModel {
  const nodes = Object.fromEntries(result.joints.map(j => [j.name, project(j.x, j.y)]));
  return { segments: TRUSS_MEMBERS.map(m => ({ id: m.id, memberId: m.id, a: nodes[m.start], b: nodes[m.end], label: m.id, values: { N: result.forces[m.id], V: 0, M: 0 } })),
    sources: result.joints.map(j => ({ ...nodes[j.name], id: j.name, magnitude: Math.hypot(result.nodalLoads[j.name].x, result.nodalLoads[j.name].y) })),
    supports: [{ ...nodes.A, id: 'A', magnitude: Math.hypot(result.reactions.ax, result.reactions.ay) }, { ...nodes.B, id: 'B', magnitude: result.reactions.by }] };
}
export function planarFlowModel(g: PlanarGeometry, loads: PlanarLoad[], result: PlanarResult, project: (x: number, y: number) => FlowPoint): FlowModel {
  const p = (member: number, t: number) => { const q = planarPoint(g, member, t); return project(q.x, q.y); };
  const segments: FlowSegment[] = planarMembers(g).flatMap((m, member) => {
    const breaks = sorted([0, 1, ...Array.from({ length: 33 }, (_, i) => i / 32), ...loads.filter(l => l.member === member).flatMap(l => l.type === 'point' || l.type === 'moment' ? [l.position] : Array.from({ length: 9 }, (_, i) => l.start + (l.end - l.start) * i / 8))]);
    return breaks.slice(1).map((t, i) => { const q = result.at(member, (breaks[i] + t) / 2); return { id: `member-${member}-${i}`, memberId: `member-${member}`, a: p(member, breaks[i]), b: p(member, t), label: m.label, values: { N: q.N, V: q.V, M: q.M } }; });
  });
  const sources = loads.flatMap<FlowMarker>(l => l.type === 'point' || l.type === 'moment' ? [{ ...p(l.member, l.position), id: l.id, magnitude: l.magnitude, kind: l.type }] : Array.from({ length: 9 }, (_, i) => ({ ...p(l.member, l.start + (l.end - l.start) * i / 8), id: `${l.id}-${i}`, kind: 'distributed' as const, magnitude: l.magnitude + (l.type === 'linear' ? l.endMagnitude - l.magnitude : 0) * i / 8 })));
  return { segments, sources, supports: [{ ...project(0, 0), id: 'A', magnitude: result.reactions.Ax || result.reactions.Ay || result.reactions.MA }, { ...project(g.L, 0), id: 'B', magnitude: result.reactions.Bx || result.reactions.By }] };
}
/** Exact section forces at segment midpoints avoid interpolating across jumps. */
export function solverFlowModel(nodes: SolverNode[], elements: SolverElement[], loads: Load[], result: AnalysisResult, project: (x: number, y: number) => FlowPoint): FlowModel {
  if (result.error) return { segments: [], sources: [], supports: [] };
  const index = new Map(nodes.map(n => [n.id, n])), resultIndex = new Map(result.elements.map(e => [e.elementId, e]));
  const segments: FlowSegment[] = [], sources: FlowMarker[] = [];
  for (const el of elements) {
    const a = index.get(el.startNode), b = index.get(el.endNode), solved = resultIndex.get(el.id); if (!a || !b || !solved) continue;
    const length = Math.hypot(b.x - a.x, b.y - a.y); if (length < 1e-9) continue;
    const point = (t: number) => project(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    const applied = loads.filter(l => l.elementId === el.id && l.nodeId == null);
    const valuesAt = (t: number) => {
      const q = calculateExactValues(t * length, length, (b.x - a.x) / length, (b.y - a.y) / length, solved.u_local, solved.startForces, applied);
      return { N: q.axial, V: q.shear, M: q.moment };
    };
    const breaks = sorted([0, 1, ...Array.from({ length: 33 }, (_, i) => i / 32), ...applied.flatMap(l => { if (l.type !== 'distributed' && l.type !== 'trapezoidal') return [l.location ?? .5]; const { start, end } = getLineLoadRange(l); return Array.from({ length: 9 }, (_, i) => start + (end - start) * i / 8); })]);
    breaks.slice(1).forEach((t, i) => segments.push({ id: `E${el.id}-${i}`, memberId: `E${el.id}`, a: point(breaks[i]), b: point(t), label: `E${el.id}`, values: valuesAt((t + breaks[i]) / 2) }));
    applied.forEach(l => { if (l.type === 'distributed' || l.type === 'trapezoidal') { const { start, end } = getLineLoadRange(l); for (let i = 0; i <= 8; i++) sources.push({ ...point(start + (end - start) * i / 8), id: `${l.id}-${i}`, kind: 'distributed', magnitude: l.magnitude + ((l.type === 'trapezoidal' ? l.magnitudeEnd ?? l.magnitude : l.magnitude) - l.magnitude) * i / 8 }); } else sources.push({ ...point(l.location ?? .5), id: l.id, magnitude: l.magnitude, kind: l.type === 'moment' ? 'moment' : 'point' }); });
  }
  loads.filter(l => l.nodeId != null).forEach(l => { const n = index.get(l.nodeId!); if (n) sources.push({ ...project(n.x, n.y), id: l.id, magnitude: l.magnitude, kind: l.type === 'moment' ? 'moment' : 'point' }); });
  const supports = result.reactions.filter(r => nonzero(r.fx) || nonzero(r.fy) || nonzero(r.m)).flatMap(r => { const n = index.get(r.nodeId); return n ? [{ ...project(n.x, n.y), id: `support-${n.id}`, magnitude: r.fx || r.fy || r.m }] : []; });
  return { segments, sources, supports };
}
