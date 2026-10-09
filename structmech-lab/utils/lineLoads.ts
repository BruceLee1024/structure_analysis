import type { Load } from '../types';

export function getLineLoadRange(load: Pick<Load, 'startLocation' | 'endLocation'>) {
  return { start: load.startLocation ?? 0, end: load.endLocation ?? 1 };
}

export function isValidLineLoadRange(load: Pick<Load, 'startLocation' | 'endLocation'>) {
  const { start, end } = getLineLoadRange(load);
  return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end <= 1 && start < end;
}

// Four-point Gauss integration is exact for the polynomial load/shape-function
// products used by the beam solver (degree at most seven).
export function integrateInterval(start: number, end: number, fn: (x: number) => number): number {
  if (end <= start) return 0;
  const points = [-0.8611363115940526, -0.3399810435848563, 0.3399810435848563, 0.8611363115940526];
  const weights = [0.3478548451374538, 0.6521451548625461, 0.6521451548625461, 0.3478548451374538];
  const half = (end - start) / 2;
  const mid = (end + start) / 2;
  return half * points.reduce((sum, point, i) => sum + weights[i] * fn(mid + half * point), 0);
}

// Intersect a coordinate-based line load with each collinear member. This also
// handles reversed member direction and loads that cover more than one member.
export function projectLineLoadRange(
  startNode: { x: number; y: number }, endNode: { x: number; y: number },
  loadStart: { x: number; y: number }, loadEnd: { x: number; y: number },
): { startLocation: number; endLocation: number } | null {
  const dx = endNode.x - startNode.x;
  const dy = endNode.y - startNode.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-8) return null;
  const project = (p: { x: number; y: number }) => ((p.x - startNode.x) * dx + (p.y - startNode.y) * dy) / (length * length);
  const distance = (p: { x: number; y: number }) => Math.abs((p.x - startNode.x) * dy - (p.y - startNode.y) * dx) / length;
  const tolerance = 1e-5 * Math.max(1, length);
  if (distance(loadStart) > tolerance || distance(loadEnd) > tolerance) return null;
  const t1 = project(loadStart);
  const t2 = project(loadEnd);
  const startLocation = Math.max(0, Math.min(t1, t2));
  const endLocation = Math.min(1, Math.max(t1, t2));
  return endLocation - startLocation > 1e-8 ? { startLocation, endLocation } : null;
}
