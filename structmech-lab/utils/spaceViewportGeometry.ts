import { buildSpaceFrameTransformation, type SpaceElement, type SpaceElementResult, type SpaceNode } from './spaceSolver';
import { evaluateSpacePolynomial } from './spaceResponse';

export function getSpaceLocalDirection(start: SpaceNode, end: SpaceNode, roll: number | undefined, axis: 'x' | 'y' | 'z') {
  const T = buildSpaceFrameTransformation(start, end, roll);
  const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  return { x: T[index][0], y: T[index][1], z: T[index][2] };
}

/** Geometry only; changing the visual scale never changes the structural solution. */
export function getSpaceDeformedCurve(start: SpaceNode, end: SpaceNode, element: SpaceElement, result: SpaceElementResult, scale: number) {
  const curve = result.displacementCurve;
  if (!curve) return null;
  const T = buildSpaceFrameTransformation(start, end, element.roll);
  return Array.from({ length: scale === 0 ? 2 : 21 }, (_, index) => {
    const r = index / (scale === 0 ? 1 : 20);
    const local = [curve.x, curve.y, curve.z].map(p => evaluateSpacePolynomial(p, r));
    const displacement = [0, 1, 2].map(axis => local.reduce((sum, value, localAxis) => sum + T[localAxis][axis] * value, 0) * scale);
    return {
      x: start.x + r * (end.x - start.x) + displacement[0],
      y: start.y + r * (end.y - start.y) + displacement[1],
      z: start.z + r * (end.z - start.z) + displacement[2],
    };
  });
}
