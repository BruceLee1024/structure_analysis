import type { SpaceElement, SpaceNode } from './spaceSolver';

/** Rank of restraints acting on the six rigid-body motions of each component.
 * This detects floating components, not every internal mechanism caused by releases.
 */
export function findUnrestrainedSpaceComponents(nodes: SpaceNode[], elements: SpaceElement[]) {
  const adjacency = new Map(nodes.map(node => [node.id, new Set<number>()]));
  const nodeMap = new Map(nodes.map(node => [node.id, node]));
  for (const element of elements) {
    adjacency.get(element.startNode)?.add(element.endNode);
    adjacency.get(element.endNode)?.add(element.startNode);
  }
  const visited = new Set<number>();
  const issues: Array<{ nodeIds: number[]; missingModes: number }> = [];
  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    const component: SpaceNode[] = [];
    const pending = [node.id];
    while (pending.length) {
      const id = pending.pop()!;
      if (visited.has(id) || !nodeMap.has(id)) continue;
      visited.add(id);
      component.push(nodeMap.get(id)!);
      pending.push(...(adjacency.get(id) ?? []));
    }
    const center = component.reduce((sum, item) => [sum[0] + item.x, sum[1] + item.y, sum[2] + item.z], [0, 0, 0])
      .map(value => value / component.length);
    const length = component.reduce((largest, item) => Math.max(largest, Math.hypot(item.x - center[0], item.y - center[1], item.z - center[2])), 1e-12);
    const rows: number[][] = [];
    for (const item of component) {
      const [x, y, z] = [item.x - center[0], item.y - center[1], item.z - center[2]].map(value => value / length);
      const motions = [
        [1, 0, 0, 0, z, -y], [0, 1, 0, -z, 0, x], [0, 0, 1, y, -x, 0],
        [0, 0, 0, 1, 0, 0], [0, 0, 0, 0, 1, 0], [0, 0, 0, 0, 0, 1],
      ];
      for (let dof = 0; dof < 6; dof++) {
        if (item.restraints[dof] || (item.springStiffness?.[dof] ?? 0) > 0) rows.push(motions[dof]);
      }
    }
    let rank = 0;
    for (let col = 0; col < 6 && rank < rows.length; col++) {
      let pivot = rank;
      for (let row = rank + 1; row < rows.length; row++) {
        if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
      }
      if (Math.abs(rows[pivot][col]) <= 1e-10) continue;
      [rows[rank], rows[pivot]] = [rows[pivot], rows[rank]];
      const value = rows[rank][col];
      for (let index = col; index < 6; index++) rows[rank][index] /= value;
      for (let row = rank + 1; row < rows.length; row++) {
        const factor = rows[row][col];
        for (let index = col; index < 6; index++) rows[row][index] -= factor * rows[rank][index];
      }
      rank++;
    }
    if (rank < 6) issues.push({ nodeIds: component.map(item => item.id), missingModes: 6 - rank });
  }
  return issues;
}
