// ========== Result Hint Generator ==========
// Local rules engine that generates one-line smart interpretations for ResultCards.
// No API calls — all hints are computed from current parameters and results.

export interface ResultHint {
  label: string;
  hint: string;
}

// ========== Geometry Analysis ==========

export function getGeometryHints(params: {
  nodes: number; bars: number; constraints: number; W: number;
}): ResultHint[] {
  const { nodes, bars, constraints, W } = params;
  const hints: ResultHint[] = [];

  hints.push({
    label: 'W',
    hint: W > 0
      ? `缺少 ${W} 个约束，体系可自由运动`
      : W === 0
        ? '只满足几何不变必要条件，还需结合模型图验证约束是否有效'
        : `说明可能存在 ${Math.abs(W)} 个多余约束，但仍需先判断模型是否几何不变`,
  });

  const totalDOF = 3 * nodes;
  const totalConstraints = 2 * bars + constraints;
  hints.push({
    label: '自由度',
    hint: `${nodes}个节点共 ${totalDOF} 个自由度，被 ${totalConstraints} 个约束限制`,
  });

  return hints;
}

// ========== Static Beam ==========

export function getBeamHints(params: {
  beamType: string; loadType: string; L: number; P: number; q: number;
  RA: number; RB: number; Mmax: number; Vmax: number;
}): ResultHint[] {
  const { beamType, loadType, L, P, q, RA, RB, Mmax, Vmax } = params;
  const hints: ResultHint[] = [];

  if (beamType === 'simple') {
    const totalLoad = loadType === 'point' ? P : q * L;
    const raPercent = Math.round((RA / totalLoad) * 100);
    hints.push({ label: 'RA', hint: `左支座承担总荷载的 ${raPercent}%` });
    if (RB > 0) {
      hints.push({ label: 'RB', hint: `右支座承担总荷载的 ${100 - raPercent}%` });
    }
  }

  if (beamType === 'cantilever') {
    hints.push({ label: 'RA', hint: '固定端承受全部竖向荷载' });
    hints.push({ label: 'Mmax', hint: `固定端弯矩 = ${Mmax.toFixed(1)} kN·m，越靠近自由端荷载弯矩越大` });
  }

  if (loadType === 'point' && beamType === 'simple') {
    hints.push({ label: 'Mmax', hint: `弯矩图在荷载作用点处达到最大值` });
  } else if (loadType === 'distributed' && beamType === 'simple') {
    hints.push({ label: 'Mmax', hint: `均布荷载下弯矩图为抛物线，跨中最大` });
  }

  hints.push({ label: 'Vmax', hint: `剪力在支座处最大，为 ${Vmax.toFixed(1)} kN` });

  return hints;
}

// ========== Static Frame ==========

export function getFrameHints(params: {
  L: number; H: number; P: number; q: number;
  FyA: number; FyB: number; FxA: number; M_E: number;
}): ResultHint[] {
  const { L, H, P, q, FyA, FyB, FxA, M_E } = params;
  const hints: ResultHint[] = [];

  hints.push({ label: 'FxA', hint: `铰支座A的水平反力 = P = ${P} kN（水平平衡，滚动支座B无水平反力）` });

  const totalV = q * L;
  const aPercent = Math.round((FyA / totalV) * 100);
  hints.push({ label: 'FyA', hint: `竖向反力占总荷载的 ${aPercent}%（受水平力影响偏大）` });

  if (Math.abs(M_E) > 0) {
    hints.push({ label: 'ME', hint: `柱顶弯矩 = P×h，水平力位置越高弯矩越大` });
  }

  return hints;
}

// ========== Static Truss ==========

export function getTrussHints(params: {
  P: number; RA: number; N_bottom: number; N_top: number;
}): ResultHint[] {
  const { P, N_bottom, N_top } = params;
  const hints: ResultHint[] = [];

  hints.push({ label: '下弦杆', hint: `受拉 ${N_bottom.toFixed(1)} kN — 下弦杆通常受拉` });
  hints.push({ label: '上弦杆', hint: `受压 ${Math.abs(N_top).toFixed(1)} kN — 上弦杆需验算稳定性` });
  hints.push({ label: 'RA', hint: `对称结构对称荷载 → 反力 = P/2 = ${P/2} kN` });

  return hints;
}

// ========== Static Arch ==========

export function getArchHints(params: {
  L: number; f: number; q: number; RA: number; H_thrust: number;
}): ResultHint[] {
  const { L, f, q, H_thrust } = params;
  const hints: ResultHint[] = [];

  const ratio = f / L;
  hints.push({ label: 'f/L', hint: `矢跨比 = ${ratio.toFixed(3)}${ratio > 0.12 && ratio < 0.14 ? '（接近最优 1/8）' : ratio < 0.08 ? '（偏小，推力大）' : ''}` });

  const Mbeam = (q * L * L) / 8;
  hints.push({ label: 'H', hint: `水平推力 ${H_thrust.toFixed(1)} kN，将简支梁弯矩 ${Mbeam.toFixed(0)} kN·m 几乎消除` });

  return hints;
}

// ========== Composite Structure ==========

export function getCompositeHints(params: {
  P: number; q: number; R_beam: number; M_beam: number; M_col: number;
}): ResultHint[] {
  const { M_beam, M_col } = params;
  const hints: ResultHint[] = [];

  hints.push({ label: 'M_梁', hint: `梁为附属部分，独立受弯 — 铰接处弯矩为零` });
  hints.push({ label: 'M_柱', hint: `柱底弯矩 ${M_col.toFixed(1)} kN·m，${M_col > M_beam ? '柱控制设计' : '梁弯矩更大'}` });

  return hints;
}

// ========== Influence Line - Static Method ==========

export function getILStaticHints(params: {
  targetType: string; currentValue: number; maxValue: number; L: number;
}): ResultHint[] {
  const { targetType, currentValue, maxValue } = params;
  const hints: ResultHint[] = [];

  const ratio = maxValue > 0 ? Math.round((currentValue / maxValue) * 100) : 0;
  hints.push({ label: targetType, hint: `当前纵标为最大值的 ${ratio}%` });

  if (targetType === 'RA' || targetType === 'RB') {
    hints.push({ label: '最大纵标', hint: '反力影响线最大值恒为 1（单位荷载在该支座处）' });
  } else if (targetType === 'Mc') {
    hints.push({ label: '最大纵标', hint: '弯矩影响线在截面C处取得最大值（三角形顶点）' });
  } else if (targetType === 'Qc') {
    hints.push({ label: '最大纵标', hint: '剪力影响线在截面C处有突变（正负交替）' });
  }

  return hints;
}

// ========== Influence Line - Envelope ==========

export function getEnvelopeHints(params: {
  maxMoment: number; numLoads: number; loadMagnitude: number; L: number;
}): ResultHint[] {
  const { maxMoment, numLoads, loadMagnitude, L } = params;
  const hints: ResultHint[] = [];

  const singleMax = loadMagnitude * L / 4;
  hints.push({ label: '最大弯矩', hint: `${numLoads}个荷载的包络最大值 ≈ 单个荷载跨中值 ${singleMax.toFixed(0)} kN·m 的 ${(maxMoment / singleMax).toFixed(1)} 倍` });

  return hints;
}

// ========== Influence Line - Application ==========

export function getApplicationHints(params: {
  loadType: string; Mc: number; maxIL: number; P?: number; q?: number;
}): ResultHint[] {
  const { loadType, Mc, maxIL, P, q } = params;
  const hints: ResultHint[] = [];

  if (loadType === 'point' && P) {
    hints.push({ label: 'Mc', hint: `Mc = P × y = ${P} × 影响线纵标` });
  } else if (loadType === 'distributed' && q) {
    hints.push({ label: 'Mc', hint: `Mc = q × 影响线面积 — 均布荷载用面积法` });
  } else if (loadType === 'multi') {
    hints.push({ label: 'Mc', hint: `Mc = ΣPᵢ·yᵢ — 多个集中力用叠加法` });
  }

  hints.push({ label: '最大纵标', hint: `影响线最大纵标 = ${maxIL.toFixed(3)} m` });

  return hints;
}
