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

const getGeometryStatus = (w: number) => {
  if (w > 0) return { label: '几何可变体系', reason: '自由度还没被约束完，结构会发生机构运动。' };
  if (w === 0) return { label: '满足静定必要条件', reason: '数量条件刚好，但仍要继续检查布置是否瞬变。' };
  return { label: `${Math.abs(w)}次超静定`, reason: '约束数量超过独立平衡方程，需要引入变形协调条件。' };
};

export function getGeometryQuiz(input: GeometryQuizInput): QuizQuestion[] {
  const status = getGeometryStatus(input.w);
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
        { id: 'indeterminate', label: input.w < 0 ? status.label : '超静定体系' },
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
      explanation: 'W = 0 只说明数量刚好。若三链杆共点、平行，或桁架没有形成稳定三角形，仍可能是瞬变体系。',
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
  ];
}
