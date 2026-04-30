export interface GeometryCounts {
  rigidBodies: number;
  chainLinks: number;
  simpleHinges: number;
  rigidJoints: number;
  rollerSupports: number;
  pinSupports: number;
  guidedSupports: number;
  fixedSupports: number;
}

export type GeometryPresetId =
  | 'custom'
  | 'simple_beam'
  | 'cantilever'
  | 'portal_frame'
  | 'fixed_fixed_beam'
  | 'parallel_link_mechanism';

export type GeometryModelHint =
  | 'unknown'
  | 'stable_determinate'
  | 'stable_indeterminate'
  | 'mechanism';

export interface GeometryContribution {
  key: keyof GeometryCounts;
  label: string;
  count: number;
  weight: number;
  value: number;
  note: string;
}

export interface GeometryPreset {
  id: GeometryPresetId;
  name: string;
  summary: string;
  figureType: Exclude<GeometryPresetId, 'custom'> | 'custom';
  counts: GeometryCounts;
  modelHint: GeometryModelHint;
  modelConclusion: string;
}

export interface GeometryEvaluation {
  W: number;
  totalDOF: number;
  totalConstraints: number;
  contributions: GeometryContribution[];
  weightedFormula: string;
  quickTitle: string;
  quickSummary: string;
  quickBadgeTone: 'red' | 'green' | 'blue';
  modelTitle: string;
  modelSummary: string;
  modelBadgeTone: 'red' | 'green' | 'blue';
  caution: string;
}

const contributionMeta: Record<keyof GeometryCounts, { label: string; weight: number; note: string }> = {
  rigidBodies: { label: '刚片', weight: 0, note: '每个刚片在平面内有 3 个自由度：平移 x、平移 y、转动' },
  chainLinks: { label: '链杆', weight: 1, note: '一根链杆相当于 1 个约束' },
  simpleHinges: { label: '单铰', weight: 2, note: '一个单铰相当于 2 个约束' },
  rigidJoints: { label: '刚结点', weight: 3, note: '一个刚结点相当于 3 个约束' },
  rollerSupports: { label: '活动铰支座', weight: 1, note: '可等效为 1 根支座链杆，提供 1 个约束' },
  pinSupports: { label: '固定铰支座', weight: 2, note: '限制水平与竖向位移，共 2 个约束' },
  guidedSupports: { label: '定向支座', weight: 2, note: '限制一个线位移和转动，共 2 个约束' },
  fixedSupports: { label: '固定端', weight: 3, note: '限制水平、竖向和平面内转动，共 3 个约束' },
};

export const defaultGeometryCounts: GeometryCounts = {
  rigidBodies: 1,
  chainLinks: 0,
  simpleHinges: 0,
  rigidJoints: 0,
  rollerSupports: 1,
  pinSupports: 1,
  guidedSupports: 0,
  fixedSupports: 0,
};

export const geometryPresets: GeometryPreset[] = [
  {
    id: 'custom',
    name: '自定义计数',
    summary: '只做计算自由度预判；未给模型图时不能直接下静定或超静定结论。',
    figureType: 'custom',
    counts: defaultGeometryCounts,
    modelHint: 'unknown',
    modelConclusion: '当前没有给出具体模型图，只能先做 W 值预判；要判断静定性，还必须检查约束是否有效、是否存在共点/平行/共线等情况。',
  },
  {
    id: 'simple_beam',
    name: '简支梁',
    summary: '1 个刚片 + 1 个固定铰支座 + 1 个活动铰支座。',
    figureType: 'simple_beam',
    counts: {
      rigidBodies: 1,
      chainLinks: 0,
      simpleHinges: 0,
      rigidJoints: 0,
      rollerSupports: 1,
      pinSupports: 1,
      guidedSupports: 0,
      fixedSupports: 0,
    },
    modelHint: 'stable_determinate',
    modelConclusion: '该示意图是几何不变且无多余约束，因此可判为静定结构。',
  },
  {
    id: 'cantilever',
    name: '悬臂梁',
    summary: '1 个刚片 + 1 个固定端。',
    figureType: 'cantilever',
    counts: {
      rigidBodies: 1,
      chainLinks: 0,
      simpleHinges: 0,
      rigidJoints: 0,
      rollerSupports: 0,
      pinSupports: 0,
      guidedSupports: 0,
      fixedSupports: 1,
    },
    modelHint: 'stable_determinate',
    modelConclusion: '该示意图是几何不变且无多余约束，因此可判为静定结构。',
  },
  {
    id: 'portal_frame',
    name: '门式刚架',
    summary: '3 个刚片（两柱一梁）+ 2 个刚结点 + 左铰右滚支。',
    figureType: 'portal_frame',
    counts: {
      rigidBodies: 3,
      chainLinks: 0,
      simpleHinges: 0,
      rigidJoints: 2,
      rollerSupports: 1,
      pinSupports: 1,
      guidedSupports: 0,
      fixedSupports: 0,
    },
    modelHint: 'stable_determinate',
    modelConclusion: '该示意图中两处梁柱节点为刚结点，体系几何不变且无多余约束，因此可判为静定结构。',
  },
  {
    id: 'fixed_fixed_beam',
    name: '两端固支梁',
    summary: '1 个刚片 + 左右两个固定端，用来演示 W<0 且模型已知时可判超静定。',
    figureType: 'fixed_fixed_beam',
    counts: {
      rigidBodies: 1,
      chainLinks: 0,
      simpleHinges: 0,
      rigidJoints: 0,
      rollerSupports: 0,
      pinSupports: 0,
      guidedSupports: 0,
      fixedSupports: 2,
    },
    modelHint: 'stable_indeterminate',
    modelConclusion: '该示意图本身几何不变；W=-3 表明存在 3 个多余约束，因此这是 3 次超静定结构。',
  },
  {
    id: 'parallel_link_mechanism',
    name: '四平行链杆反例',
    summary: '1 个刚片 + 4 根彼此平行的链杆，演示 W<0 也未必能判超静定。',
    figureType: 'parallel_link_mechanism',
    counts: {
      rigidBodies: 1,
      chainLinks: 4,
      simpleHinges: 0,
      rigidJoints: 0,
      rollerSupports: 0,
      pinSupports: 0,
      guidedSupports: 0,
      fixedSupports: 0,
    },
    modelHint: 'mechanism',
    modelConclusion: '虽然 W=-1，说明约束总数多于自由度，但四根链杆方向完全重复，体系仍可整体水平移动，所以仍是几何可变体系。',
  },
];

export function cloneGeometryCounts(counts: GeometryCounts): GeometryCounts {
  return { ...counts };
}

export function evaluateGeometrySystem(
  counts: GeometryCounts,
  modelHint: GeometryModelHint = 'unknown',
): GeometryEvaluation {
  const contributions = (Object.keys(contributionMeta) as Array<keyof GeometryCounts>)
    .filter((key) => key !== 'rigidBodies')
    .map((key) => ({
      key,
      label: contributionMeta[key].label,
      count: counts[key],
      weight: contributionMeta[key].weight,
      value: counts[key] * contributionMeta[key].weight,
      note: contributionMeta[key].note,
    }));

  const totalDOF = 3 * counts.rigidBodies;
  const totalConstraints = contributions.reduce((sum, item) => sum + item.value, 0);
  const W = totalDOF - totalConstraints;

  let quickTitle = '';
  let quickSummary = '';
  let quickBadgeTone: GeometryEvaluation['quickBadgeTone'] = 'green';
  let caution = '';

  if (W > 0) {
    quickTitle = '几何可变体系';
    quickSummary = `W=${W} > 0，可直接判定缺少必要约束，体系一定几何可变。`;
    quickBadgeTone = 'red';
    caution = 'W>0 时可以直接判为几何可变；此时不需要再去讨论超静定。';
  } else if (W === 0) {
    quickTitle = '满足几何不变必要条件';
    quickSummary = 'W=0 只说明总约束数与自由度数相等，还必须结合模型图检查约束是否有效。';
    quickBadgeTone = 'green';
    caution = 'W=0 不是充分条件。若约束共点、平行或共线，体系仍可能是瞬变或常变。';
  } else {
    quickTitle = '存在多余约束的可能';
    quickSummary = `W=${W} < 0，只能说明总约束数多于自由度，存在 ${Math.abs(W)} 个多余约束的可能。`;
    quickBadgeTone = 'blue';
    caution = 'W<0 只能表明体系中可能有多余约束；若缺少有效约束，体系仍可能是几何可变，不能脱离模型图直接判为超静定。';
  }

  let modelTitle = '还需结合模型图判断';
  let modelSummary = '当前仅完成了 W 值预判；是否静定、是否超静定，还要继续做几何组成分析。';
  let modelBadgeTone: GeometryEvaluation['modelBadgeTone'] = quickBadgeTone;

  if (modelHint === 'stable_determinate') {
    modelTitle = '静定结构';
    modelSummary = '该示意图已知几何不变且无多余约束，因此可以进一步判为静定结构。';
    modelBadgeTone = 'green';
  } else if (modelHint === 'stable_indeterminate') {
    modelTitle = `${Math.abs(W)}次超静定`;
    modelSummary = `该示意图已知几何不变，且有 ${Math.abs(W)} 个多余约束，因此可判为 ${Math.abs(W)} 次超静定结构。`;
    modelBadgeTone = 'blue';
  } else if (modelHint === 'mechanism') {
    modelTitle = '几何可变体系';
    modelSummary = W < 0
      ? '虽然 W<0，但约束方向重复、缺少有效约束，体系仍可运动。'
      : '虽然 W=0，但约束布置不合理，体系仍可运动。';
    modelBadgeTone = 'red';
  }

  const weightedFormula = [
    counts.chainLinks > 0 ? `${counts.chainLinks}` : '',
    counts.simpleHinges > 0 ? `2×${counts.simpleHinges}` : '',
    counts.rigidJoints > 0 ? `3×${counts.rigidJoints}` : '',
    counts.rollerSupports > 0 ? `${counts.rollerSupports}` : '',
    counts.pinSupports > 0 ? `2×${counts.pinSupports}` : '',
    counts.guidedSupports > 0 ? `2×${counts.guidedSupports}` : '',
    counts.fixedSupports > 0 ? `3×${counts.fixedSupports}` : '',
  ].filter(Boolean).join(' + ') || '0';

  return {
    W,
    totalDOF,
    totalConstraints,
    contributions,
    weightedFormula,
    quickTitle,
    quickSummary,
    quickBadgeTone,
    modelTitle,
    modelSummary,
    modelBadgeTone,
    caution,
  };
}
