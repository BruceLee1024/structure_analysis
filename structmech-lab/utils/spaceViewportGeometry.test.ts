import { expect, it } from 'vitest';
import { getSpaceDeformedCurve, getSpaceLocalDirection } from './spaceViewportGeometry';
import { solveSpaceFrame, type SpaceElement, type SpaceNode } from './spaceSolver';

const nodes: SpaceNode[] = [
  { id: 1, x: 0, y: 0, z: 0, restraints: [true, true, true, true, true, true] },
  { id: 2, x: 4, y: 0, z: 0, restraints: [false, false, false, false, false, false] },
];
const element: SpaceElement = { id: 1, startNode: 1, endNode: 2, E: 200, A: 50, Iy: 200, Iz: 100, J: 100, roll: 90 };

it('uses the solver roll for local load directions and curved geometry', () => {
  const direction = getSpaceLocalDirection(nodes[0], nodes[1], element.roll, 'y');
  expect(direction.y).toBeCloseTo(-1, 10);
  expect(direction.z).toBeCloseTo(0, 10);
  const result = solveSpaceFrame(nodes, [element], [{
    id: 'q', elementId: 1, direction: 'y', coordinateSystem: 'local', type: 'distributed', startMagnitude: -2, endMagnitude: -2,
  }]);
  const points = getSpaceDeformedCurve(nodes[0], nodes[1], element, result.elements[0], 1)!;
  expect(points[20].y).toBeCloseTo(result.displacements[1].dy / 1000, 10);
  expect(points[10].y).not.toBeCloseTo(points[20].y / 2, 6);
  expect(getSpaceDeformedCurve(nodes[0], nodes[1], element, result.elements[0], 0)).toEqual([{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }]);
});
