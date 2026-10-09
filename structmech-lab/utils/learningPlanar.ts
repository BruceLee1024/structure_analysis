import { beamForceDirection } from './learningBeam';
export type PlanarKind = 'frame' | 'arch' | 'composite';
export interface PlanarLoad {
  id: string; member: number; type: 'point' | 'uniform' | 'linear' | 'moment';
  magnitude: number; endMagnitude: number; position: number; start: number; end: number;
  angle: number; rotation: 'ccw' | 'cw';
}
export interface PlanarGeometry { kind: PlanarKind; L: number; H: number }
export interface XY { x: number; y: number }
export interface PlanarStation extends XY { t: number; M: number; V: number; N: number }
const clean = (n: number) => Math.abs(n) < 1e-8 ? 0 : n;
export function planarMembers(g: PlanarGeometry) {
  return g.kind === 'arch' ? [{ label: '拱轴 A–C–B', length: g.L }]
    : [{ label: '左柱 A–C（从底向顶）', length: g.H }, { label: '横梁 C–D（从左向右）', length: g.L }, { label: '右柱 D–B（从顶向底）', length: g.H }];
}
export function planarPoint(g: PlanarGeometry, member: number, t: number): XY {
  if (g.kind === 'arch') return { x: t * g.L, y: 4 * g.H * t * (1 - t) };
  return member === 0 ? { x: 0, y: t * g.H } : member === 1 ? { x: t * g.L, y: g.H } : { x: g.L, y: (1 - t) * g.H };
}
function tangent(g: PlanarGeometry, member: number, t: number) {
  if (g.kind !== 'arch') return member === 0 ? { x: 0, y: 1 } : member === 1 ? { x: 1, y: 0 } : { x: 0, y: -1 };
  const dy = 4 * g.H / g.L * (1 - 2 * t), len = Math.hypot(1, dy);
  return { x: 1 / len, y: dy / len };
}
interface Resultant { x: number; y: number; m: number }
const zero = (): Resultant => ({ x: 0, y: 0, m: 0 });
const add = (a: Resultant, b: Resultant, factor = 1) => { a.x += b.x * factor; a.y += b.y * factor; a.m += b.m * factor; };
const torque = (a: Resultant, p: XY) => a.m - p.x * a.y + p.y * a.x;
function linearSolve(matrix: number[][], rhs: number[]) {
  const a = matrix.map((row, i) => [...row, rhs[i]]), n = a.length;
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let j = i + 1; j < n; j++) if (Math.abs(a[j][i]) > Math.abs(a[pivot][i])) pivot = j;
    [a[pivot], a[i]] = [a[i], a[pivot]];
    if (Math.abs(a[i][i]) < 1e-12) throw new Error('结构约束不足，无法求解');
    const divisor = a[i][i];
    for (let k = i; k <= n; k++) a[i][k] /= divisor;
    for (let j = 0; j < n; j++) if (j !== i) {
      const factor = a[j][i];
      for (let k = i; k <= n; k++) a[j][k] -= factor * a[i][k];
    }
  }
  return a.map(row => clean(row[n]));
}
/** Rigid-body equilibrium and hinge conditions, independent of elastic stiffness.
 * Line-load densities on arches are per horizontal projected metre.
 * M uses the oriented path A→C→D→B; N is tensile-positive.
 */
export function solveLearningPlanar(g: PlanarGeometry, loads: PlanarLoad[]) {
  if (![g.L, g.H].every(n => Number.isFinite(n) && n > 0)) throw new Error('跨度与高度必须为有效正数');
  const members = planarMembers(g), count = members.length;
  const hinges = g.kind === 'arch' ? [.5] : g.kind === 'composite' ? [1, 2] : [];
  for (const l of loads) {
    if (!Number.isInteger(l.member) || !members[l.member]) throw new Error('作用杆件无效');
    if (![l.magnitude, l.endMagnitude].every(n => Number.isFinite(n) && n >= 0)) throw new Error('荷载强度必须为有效非负数');
    if (!Number.isFinite(l.angle) || !['ccw', 'cw'].includes(l.rotation)) throw new Error('荷载方向无效');
    const coords = l.type === 'point' || l.type === 'moment' ? [l.position] : [l.start, l.end];
    if (!coords.every(n => Number.isFinite(n) && n >= 0 && n <= 1)) throw new Error('荷载位置必须在杆件范围内');
    if ((l.type === 'uniform' || l.type === 'linear') && l.end <= l.start) throw new Error('分布荷载终点必须大于起点');
    if (l.type === 'moment' && l.magnitude > 0 && hinges.some(s => Math.abs(s - (l.member + l.position)) < 1e-9)) throw new Error('集中弯矩不能直接作用于理想铰，请移动到相邻杆件内部');
  }
  const prefix = (s: number, side: 'left' | 'right' = 'right') => {
    const r = zero();
    for (const l of loads) {
      if (l.type === 'point' || l.type === 'moment') {
        const at = l.member + l.position;
        if (at > s || (side === 'left' && at === s)) continue;
        if (l.type === 'moment') r.m += l.magnitude * (l.rotation === 'ccw' ? 1 : -1);
        else {
          const p = planarPoint(g, l.member, l.position), d = beamForceDirection(l.angle);
          add(r, { x: l.magnitude * d.x, y: l.magnitude * d.y, m: l.magnitude * (p.x * d.y - p.y * d.x) });
        }
      } else {
        const end = Math.min(l.end, s - l.member);
        if (end <= l.start) continue;
        // Two-point Gauss quadrature is exact for q(t)*x(t), q(t)*y(t): degree ≤3.
        const half = (end - l.start) / 2, middle = (end + l.start) / 2, d = beamForceDirection(l.angle);
        for (const u of [-1 / Math.sqrt(3), 1 / Math.sqrt(3)]) {
          const t = middle + half * u, q = l.magnitude + (l.type === 'linear' ? (l.endMagnitude - l.magnitude) * (t - l.start) / (l.end - l.start) : 0);
          const p = planarPoint(g, l.member, t), weight = half * members[l.member].length;
          add(r, { x: q * d.x, y: q * d.y, m: q * (p.x * d.y - p.y * d.x) }, weight);
        }
      }
    }
    return r;
  };
  const external = prefix(count);
  const supports = [
    { name: 'Ax', s: 0, r: { x: 1, y: 0, m: 0 } },
    { name: 'Ay', s: 0, r: { x: 0, y: 1, m: 0 } },
    ...(g.kind === 'composite' ? [{ name: 'MA', s: 0, r: { x: 0, y: 0, m: 1 } }] : []),
    ...(g.kind !== 'frame' ? [{ name: 'Bx', s: count, r: { x: 1, y: 0, m: 0 } }] : []),
    { name: 'By', s: count, r: { x: 0, y: 1, m: g.L } },
  ];
  const matrix = ['x', 'y', 'm'].map(key => supports.map(v => v.r[key as keyof Resultant]));
  const rhs = [-external.x, -external.y, -external.m];
  hinges.forEach(s => {
    const member = Math.min(count - 1, Math.floor(s)), p = planarPoint(g, member, s - member);
    matrix.push(supports.map(v => v.s < s ? torque(v.r, p) : 0));
    rhs.push(-torque(prefix(s, 'left'), p));
  });
  const forces = linearSolve(matrix, rhs);
  const reactions = { Ax: 0, Ay: 0, Bx: 0, By: 0, MA: 0 };
  supports.forEach((v, i) => { reactions[v.name as keyof typeof reactions] = forces[i]; });
  const at = (member: number, t: number, side: 'left' | 'right' = 'right'): PlanarStation => {
    const s = member + t, p = planarPoint(g, member, t), d = tangent(g, member, t), r = prefix(s, side);
    supports.forEach((v, i) => { if (v.s < s || (v.s === s && side === 'right')) add(r, v.r, forces[i]); });
    return { ...p, t, M: clean(-torque(r, p)), V: clean(-r.x * d.y + r.y * d.x), N: clean(-r.x * d.x - r.y * d.y) };
  };
  const diagrams = members.map((m, member) => {
    const boundaries = [...new Set([0, 1, ...loads.filter(l => l.member === member).flatMap(l => l.type === 'point' || l.type === 'moment' ? [l.position] : [l.start, l.end])])].sort((a, b) => a - b);
    const critical: number[] = [];
    if (g.kind !== 'arch') for (let i = 1; i < boundaries.length; i++) {
      const a = boundaries[i - 1], b = boundaries[i];
      const addRoot = (z: number) => { if (Number.isFinite(z) && z > 0 && z < 1) critical.push(a + (b - a) * z); };
      for (const key of ['V', 'N'] as const) {
        const v0 = at(member, a)[key], v1 = at(member, b, 'left')[key], vm = at(member, (a + b) / 2)[key];
        const A = 2 * (v0 + v1 - 2 * vm), B = v1 - v0 - A;
        if (Math.abs(A) > 1e-10) {
          addRoot(-B / (2 * A));
          if (key === 'V' && B * B - 4 * A * v0 >= 0) {
            const D = Math.sqrt(B * B - 4 * A * v0); addRoot((-B + D) / (2 * A)); addRoot((-B - D) / (2 * A));
          }
        } else if (key === 'V' && Math.abs(B) > 1e-10) addRoot(-v0 / B);
      }
    }
    const positions = [...new Set([...boundaries, ...critical, ...(g.kind === 'arch' ? [.5] : []), ...Array.from({ length: 201 }, (_, i) => i / 200)])].sort((a, b) => a - b);
    return { ...m, member, data: positions.flatMap(t => [at(member, t, 'left'), at(member, t, 'right')]) };
  });
  const peaks = { M: 0, V: 0, N: 0 };
  for (const diagram of diagrams) for (const p of diagram.data) for (const key of ['M', 'V', 'N'] as const) peaks[key] = Math.max(peaks[key], Math.abs(p[key]));
  if (![...Object.values(reactions), ...Object.values(peaks), external.x, external.y, external.m].every(Number.isFinite)) throw new Error('参数数值过大，请调整后重新计算');
  return { reactions, external, diagrams, peaks, at, hinges };
}
export type PlanarResult = ReturnType<typeof solveLearningPlanar>;
