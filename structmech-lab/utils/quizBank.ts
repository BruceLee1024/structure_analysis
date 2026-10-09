import { geometryCountStatus } from './geometryTheory';
export interface QuizOption {
  id: string;
  label: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: QuizOption[];
  correctOptionId: string;
  explanation: string;
  concept?: string;
}

interface GeometryQuizInput {
  mode: 'rigid' | 'truss';
  w: number;
  rigidBodies?: number;
  hinges?: number;
  constraints?: number;
  joints?: number;
  members?: number;
  supportLinks?: number;
}

export function getGeometryQuiz(input: GeometryQuizInput): QuizQuestion[] {
  const status = geometryCountStatus(input.w);
  const isRigid = input.mode === 'rigid';
  const formula = isRigid ? 'W = 3m - 2h - r' : 'W = 2j - b - r';
  const substitution = isRigid
    ? `W = 3×${input.rigidBodies ?? 0} - 2×${input.hinges ?? 0} - ${input.constraints ?? 0} = ${input.w}`
    : `W = 2×${input.joints ?? 0} - ${input.members ?? 0} - ${input.supportLinks ?? 0} = ${input.w}`;

  return [
    {
      id: `geometry-status-${input.mode}-${input.w}`,
      prompt: `当前 ${substitution}，应如何判定？`,
      options: [
        { id: 'mechanism', label: '几何可变体系' },
        { id: 'determinate-condition', label: '满足静定必要条件' },
        { id: 'indeterminate', label: input.w < 0 ? status.label : '已确认超静定体系' },
      ],
      correctOptionId: input.w > 0 ? 'mechanism' : input.w === 0 ? 'determinate-condition' : 'indeterminate',
      explanation: `${formula} 的计算结果为 ${input.w}。${status.reason}`,
      concept: '自由度判定',
    },
    {
      id: 'geometry-w0-necessary',
      prompt: '如果 W = 0，下列哪句话最准确？',
      options: [
        { id: 'stable', label: '结构一定几何不变' },
        { id: 'necessary', label: '只是静定的必要条件' },
        { id: 'unstable', label: '结构一定几何可变' },
      ],
      correctOptionId: 'necessary',
      explanation: 'W = 0 只说明数量刚好。约束布置不当时，仍可能存在常变或瞬变机构。须检查约束的独立性，不能只数杆件。',
      concept: '必要条件',
    },
    isRigid
      ? {
          id: 'geometry-rigid-hinge',
          prompt: '刚片体系中，一个连接两个刚片的内部铰应扣除几个约束？',
          options: [
            { id: 'one', label: '1 个约束' },
            { id: 'two', label: '2 个约束' },
            { id: 'three', label: '3 个约束' },
          ],
          correctOptionId: 'two',
          explanation: '内部铰允许相对转动，但限制两个方向的相对平移，所以在公式中写作 2h。',
          concept: '约束计数',
        }
      : {
          id: 'geometry-truss-member',
          prompt: '铰接桁架公式中，每根二力杆通常提供几个约束？',
          options: [
            { id: 'one', label: '1 个约束' },
            { id: 'two', label: '2 个约束' },
            { id: 'three', label: '3 个约束' },
          ],
          correctOptionId: 'one',
          explanation: '二力杆只能沿杆轴方向限制一个相对位移，因此桁架公式中每根杆只扣除 1 个约束。',
          concept: '杆件口径',
        },
    {
      id: 'geometry-negative-not-stable', prompt: 'W = −1，未检查几何布置时，能否直接判为一次超静定？',
      options: [{ id: 'yes', label: '能，约束越多越稳定' }, { id: 'check', label: '不能，须先证明几何不变' }, { id: 'mechanism', label: '一定是常变体系' }],
      correctOptionId: 'check', explanation: '机构与多余约束可能同时存在。只有确认几何不变，才有多余约束数 s = −W = 1。', concept: '判定前提',
    },
    {
      id: 'geometry-compound-hinge', prompt: '同一复铰连接 3 个刚片，应折算为几个单铰？',
      options: [{ id: 'one', label: '1 个' }, { id: 'two', label: '2 个' }, { id: 'three', label: '3 个' }],
      correctOptionId: 'two', explanation: '连接 k 个刚片的复铰等效于 k−1 个单铰，因此提供 2(k−1) = 4 个标量约束。', concept: '复铰计数',
    },
  ];
}
