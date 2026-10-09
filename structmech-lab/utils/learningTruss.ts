export type TrussNodeName = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
export interface TrussJoint { name: TrussNodeName; x: number; y: number }
export interface TrussMember { id: string; start: TrussNodeName; end: TrussNodeName; group: 'chord' | 'web' }
export interface TrussNodeLoad { id: string; node: TrussNodeName; magnitude: number; angle: number }
export const TRUSS_NODE_NAMES: TrussNodeName[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
export const TRUSS_MEMBERS: TrussMember[] = [
  { id: 'AE', start: 'A', end: 'E', group: 'chord' }, { id: 'EF', start: 'E', end: 'F', group: 'chord' },
  { id: 'FG', start: 'F', end: 'G', group: 'chord' }, { id: 'GB', start: 'G', end: 'B', group: 'chord' },
  { id: 'CD', start: 'C', end: 'D', group: 'chord' },
  { id: 'AC', start: 'A', end: 'C', group: 'web' }, { id: 'CF', start: 'C', end: 'F', group: 'web' },
  { id: 'FD', start: 'F', end: 'D', group: 'web' }, { id: 'DB', start: 'D', end: 'B', group: 'web' },
  { id: 'CE', start: 'C', end: 'E', group: 'web' }, { id: 'DG', start: 'D', end: 'G', group: 'web' },
];
const clean = (value: number) => Math.abs(value) < 1e-10 ? 0 : value;
export function trussLoadComponents(load: TrussNodeLoad) {
  const angle = (load.angle % 360) * Math.PI / 180;
  return { x: clean(load.magnitude * Math.cos(angle)), y: clean(load.magnitude * Math.sin(angle)) };
}
export function createLearningTruss(L: number, H: number): TrussJoint[] {
  if (!Number.isFinite(L) || !Number.isFinite(H) || L <= 0 || H <= 0) throw new Error('跨度和高度必须为正数');
  return [{ name: 'A', x: 0, y: 0 }, { name: 'B', x: L, y: 0 }, { name: 'C', x: L / 4, y: H },
    { name: 'D', x: L * 3 / 4, y: H }, { name: 'E', x: L / 4, y: 0 }, { name: 'F', x: L / 2, y: 0 }, { name: 'G', x: L * 3 / 4, y: 0 }];
}
/** 7 joints: 14 force-equilibrium equations for 11 member forces and 3 reactions.
 * All bars are pin-ended two-force members; positive axial force means tension.
 * Support A restrains x/y, and support B restrains y. Loads act only at joints.
 */
export function solveLearningTruss(L: number, H: number, loads: TrussNodeLoad[]) {
  const joints = createLearningTruss(L, H);
  const index = Object.fromEntries(joints.map((joint, i) => [joint.name, i])) as Record<TrussNodeName, number>;
  const matrix = Array.from({ length: 14 }, () => Array(14).fill(0) as number[]);
  const external = Array(14).fill(0) as number[];
  const nodalLoads = Object.fromEntries(joints.map(j => [j.name, { x: 0, y: 0 }])) as Record<TrussNodeName, { x: number; y: number }>;
  for (const load of loads) {
    if (!Object.hasOwn(index, load.node)) throw new Error('荷载必须作用于已有节点');
    if (!Number.isFinite(load.magnitude) || load.magnitude < 0 || !Number.isFinite(load.angle)) throw new Error('荷载大小和角度必须是有效数值');
    const force = trussLoadComponents(load), row = index[load.node] * 2;
    external[row] += force.x; external[row + 1] += force.y;
    nodalLoads[load.node].x += force.x; nodalLoads[load.node].y += force.y;
  }
  TRUSS_MEMBERS.forEach((member, column) => {
    const a = joints[index[member.start]], b = joints[index[member.end]];
    const length = Math.hypot(b.x - a.x, b.y - a.y), c = (b.x - a.x) / length, s = (b.y - a.y) / length;
    matrix[index[a.name] * 2][column] = c; matrix[index[a.name] * 2 + 1][column] = s;
    matrix[index[b.name] * 2][column] = -c; matrix[index[b.name] * 2 + 1][column] = -s;
  });
  matrix[index.A * 2][11] = 1; matrix[index.A * 2 + 1][12] = 1; matrix[index.B * 2 + 1][13] = 1;
  const augmented = matrix.map((row, i) => [...row, -external[i]]);
  for (let column = 0; column < 14; column++) {
    let pivot = column;
    for (let row = column + 1; row < 14; row++) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    if (Math.abs(augmented[pivot][column]) < 1e-12) throw new Error('桁架几何无法满足独立的节点平衡条件');
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    for (let row = column + 1; row < 14; row++) {
      const ratio = augmented[row][column] / augmented[column][column];
      for (let j = column; j <= 14; j++) augmented[row][j] -= ratio * augmented[column][j];
    }
  }
  const values = Array(14).fill(0) as number[];
  for (let row = 13; row >= 0; row--) {
    let rhs = augmented[row][14];
    for (let column = row + 1; column < 14; column++) rhs -= augmented[row][column] * values[column];
    values[row] = clean(rhs / augmented[row][row]);
  }
  if (values.some(value => !Number.isFinite(value))) throw new Error('荷载数值过大，请调整后重新计算');
  const forces = Object.fromEntries(TRUSS_MEMBERS.map((member, i) => [member.id, values[i]])) as Record<string, number>;
  const resultant = joints.reduce((sum, joint) => ({ x: sum.x + nodalLoads[joint.name].x, y: sum.y + nodalLoads[joint.name].y,
    moment: sum.moment + joint.x * nodalLoads[joint.name].y - joint.y * nodalLoads[joint.name].x }), { x: 0, y: 0, moment: 0 });
  const jointResidual = Math.max(...matrix.map((row, i) => Math.abs(row.reduce((sum, coefficient, j) => sum + coefficient * values[j], external[i]))));
  return { joints, forces, nodalLoads, resultant, reactions: { ax: values[11], ay: values[12], by: values[13] }, jointResidual };
}
export type LearningTrussResult = ReturnType<typeof solveLearningTruss>;
