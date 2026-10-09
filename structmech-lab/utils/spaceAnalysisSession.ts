import { prepareSpaceFrameAnalysis, solvePreparedSpaceFrame, type SpaceFrameAnalysisContext, type SpaceNode, type SpaceElement, type SpaceLoad, type SpaceSolverOptions } from './spaceSolver';

/** Only fields that determine stiffness and DOF order; loads and solver settings are separate. */
export function getSpaceStructureKey(nodes: SpaceNode[], elements: SpaceElement[]) {
  return JSON.stringify([
    nodes.map(node => [node.id, node.x, node.y, node.z, ...node.restraints, ...(node.springStiffness ?? [0, 0, 0, 0, 0, 0])]),
    elements.map(element => [element.id, element.startNode, element.endNode, element.E, element.A, element.Iy, element.Iz, element.J, element.nu ?? 0.3, element.roll ?? 0,
      ...(['rx', 'ry', 'rz'] as const).map(axis => Boolean(element.releaseStart?.[axis])),
      ...(['rx', 'ry', 'rz'] as const).map(axis => Boolean(element.releaseEnd?.[axis])),
    ]),
  ]);
}

/** One structural context per session keeps memory bounded; replacement invalidates all prepared data. */
export function createSpaceAnalysisSession() {
  let cached: { key: string; context: SpaceFrameAnalysisContext } | undefined;
  return {
    solve(nodes: SpaceNode[], elements: SpaceElement[], loads: SpaceLoad[], options: SpaceSolverOptions = {}) {
      const key = getSpaceStructureKey(nodes, elements);
      if (cached?.key !== key) cached = { key, context: prepareSpaceFrameAnalysis(nodes, elements) };
      return solvePreparedSpaceFrame(cached.context, loads, options);
    },
    clear() { cached = undefined; },
  };
}
