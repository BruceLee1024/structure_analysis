import { AIContextData } from '../hooks/useAIContext';

// ========== Types ==========

export interface AITrigger {
  id: string;
  condition: (ctx: AIContextData) => boolean;
  message: string;
  priority: 'low' | 'medium' | 'high';
  /** Minimum seconds before this trigger can fire again */
  cooldown: number;
  /** Optional: only fire in these sub-modules */
  subModules?: string[];
}

export interface TriggeredMessage {
  triggerId: string;
  message: string;
  priority: 'low' | 'medium' | 'high';
  timestamp: number;
}

// ========== Trigger Definitions ==========

const geometryTriggers: AITrigger[] = [
  {
    id: 'geo-w0',
    condition: (ctx) => {
      const W = ctx.results.W;
      return W !== undefined && Number(W) === 0;
    },
    message: '✅ W=0 表示静定结构。但注意，W=0 是必要条件而非充分条件——还需要检查几何组成是否合理。',
    priority: 'medium',
    cooldown: 120,
    subModules: ['geometry'],
  },
  {
    id: 'geo-negative-w',
    condition: (ctx) => {
      const W = ctx.results.W;
      return W !== undefined && Number(W) < 0;
    },
    message: '🔒 W<0 说明结构有多余约束，是超静定结构。需要用力法或位移法求解，静力平衡方程不够用了。',
    priority: 'medium',
    cooldown: 120,
    subModules: ['geometry'],
  },
  {
    id: 'geo-positive-w',
    condition: (ctx) => {
      const W = ctx.results.W;
      return W !== undefined && Number(W) > 0;
    },
    message: '⚠️ W>0 表示体系缺少约束，是几何可变体系，不能承受荷载。试试增加杆件或约束！',
    priority: 'high',
    cooldown: 60,
    subModules: ['geometry'],
  },
];

const beamTriggers: AITrigger[] = [
  {
    id: 'beam-midload',
    condition: (ctx) => {
      const a = Number(ctx.params.a);
      const loadType = ctx.params.loadType;
      return loadType === 'point' && Math.abs(a - 50) < 3;
    },
    message: '💡 荷载在跨中时，简支梁弯矩最大 Mmax = PL/4。这是最不利荷载位置！',
    priority: 'medium',
    cooldown: 90,
    subModules: ['beam'],
  },
  {
    id: 'beam-cantilever-moment',
    condition: (ctx) => {
      const beamType = ctx.params.beamType;
      const Mmax = Number(ctx.results.Mmax);
      return beamType === 'cantilever' && Math.abs(Mmax) > 80;
    },
    message: '⚠️ 悬臂梁固定端弯矩较大。实际工程中，悬臂梁跨度通常较短，因为弯矩增长很快。',
    priority: 'medium',
    cooldown: 60,
    subModules: ['beam'],
  },
  {
    id: 'beam-distributed-vs-point',
    condition: (ctx) => {
      const lastActions = ctx.paramHistory.slice(-3);
      const switchedLoad = lastActions.some(a => a.key === 'loadType');
      return switchedLoad;
    },
    message: '🤔 对比一下：集中力的弯矩图是折线，均布荷载的弯矩图是抛物线。你能想到为什么吗？',
    priority: 'low',
    cooldown: 180,
    subModules: ['beam'],
  },
];

const frameTriggers: AITrigger[] = [
  {
    id: 'frame-large-moment',
    condition: (ctx) => {
      const ME = Number(ctx.results.ME || ctx.results.M_E);
      return !isNaN(ME) && Math.abs(ME) > 100;
    },
    message: '📐 柱脚弯矩较大，实际工程中需要加强基础以抵抗倾覆。',
    priority: 'medium',
    cooldown: 90,
    subModules: ['frame'],
  },
];

const trussTriggers: AITrigger[] = [
  {
    id: 'truss-tension-compression',
    condition: (ctx) => {
      const Nb = Number(ctx.results.N_bottom);
      const Nt = Number(ctx.results.N_top);
      return !isNaN(Nb) && !isNaN(Nt) && Nb > 0 && Nt < 0;
    },
    message: '💡 下弦杆受拉、上弦杆受压——这是桁架的典型特征。设计时上弦杆需要验算稳定性（压杆失稳）。',
    priority: 'medium',
    cooldown: 120,
    subModules: ['truss'],
  },
];

const archTriggers: AITrigger[] = [
  {
    id: 'arch-ratio',
    condition: (ctx) => {
      const L = Number(ctx.params.L);
      const f = Number(ctx.params.f);
      const ratio = f / L;
      return !isNaN(ratio) && ratio >= 0.12 && ratio <= 0.14;
    },
    message: '🎯 矢跨比 f/L ≈ 1/8，接近工程中常用的最优比例！此时推力适中，拱的效率最高。',
    priority: 'high',
    cooldown: 120,
    subModules: ['arch'],
  },
  {
    id: 'arch-low-ratio',
    condition: (ctx) => {
      const L = Number(ctx.params.L);
      const f = Number(ctx.params.f);
      const ratio = f / L;
      return !isNaN(ratio) && ratio < 0.08;
    },
    message: '⚠️ 矢跨比很小，水平推力 H 会很大。太扁的拱对基础要求极高！',
    priority: 'medium',
    cooldown: 90,
    subModules: ['arch'],
  },
];

const influenceStaticTriggers: AITrigger[] = [
  {
    id: 'il-at-support',
    condition: (ctx) => {
      const loadPos = Number(ctx.params.loadPos);
      return loadPos <= 2 || loadPos >= 98;
    },
    message: '💡 荷载在支座处时，该支座反力影响线纵标为 1（或 0）。这是影响线的边界条件！',
    priority: 'medium',
    cooldown: 90,
    subModules: ['static'],
  },
];

const influenceEnvelopeTriggers: AITrigger[] = [
  {
    id: 'il-many-loads',
    condition: (ctx) => {
      const numLoads = Number(ctx.params.numLoads);
      return numLoads >= 5;
    },
    message: '🚂 多个集中力组成的荷载组类似于火车荷载。桥梁设计中经常需要分析这种移动荷载的包络效应。',
    priority: 'low',
    cooldown: 180,
    subModules: ['envelope'],
  },
];

const influenceKinematicTriggers: AITrigger[] = [
  {
    id: 'kin-principle',
    condition: (ctx) => {
      const targetType = ctx.params.targetType;
      return targetType === 'Mc' || targetType === 'Qc';
    },
    message: '💡 机动法的核心：去掉约束后的位移图就是影响线。对于弯矩，在截面处加铰；对于剪力，在截面处切开。',
    priority: 'medium',
    cooldown: 120,
    subModules: ['kinematic'],
  },
];

const influenceApplicationTriggers: AITrigger[] = [
  {
    id: 'app-distributed',
    condition: (ctx) => ctx.params.loadType === 'distributed',
    message: '📝 均布荷载作用时，内力 = q × 影响线下的面积。这是影响线最重要的应用之一！',
    priority: 'medium',
    cooldown: 120,
    subModules: ['application'],
  },
  {
    id: 'app-multi-load',
    condition: (ctx) => ctx.params.loadType === 'multi',
    message: '💡 多个集中力时，Mc = ΣPᵢ·yᵢ，其中 yᵢ 是各荷载位置处的影响线纵标。这就是影响线的叠加原理！',
    priority: 'medium',
    cooldown: 120,
    subModules: ['application'],
  },
];

// ========== Parameter Change Triggers (Phase 3) ==========
// These detect specific parameter changes via paramHistory

const paramChangeTriggers: AITrigger[] = [
  {
    id: 'change-beam-type',
    condition: (ctx) => {
      const recent = ctx.paramHistory.slice(-2);
      return recent.some(a => a.key === 'beamType');
    },
    message: '🔄 切换了梁的类型！对比不同类型的弯矩图形状：简支梁是三角形/抛物线，悬臂梁从零到最大，外伸梁可能出现反弯点。',
    priority: 'medium',
    cooldown: 120,
    subModules: ['beam'],
  },
  {
    id: 'change-load-increase',
    condition: (ctx) => {
      const history = ctx.paramHistory.slice(-3);
      const pChanges = history.filter(a => a.key === 'P' || a.key === 'q');
      return pChanges.length >= 2 && pChanges.every(a => a.newValue > (a.oldValue || 0));
    },
    message: '📈 你在持续增大荷载！注意观察：弯矩和剪力与荷载成正比（线性关系），荷载翻倍则内力翻倍。',
    priority: 'low',
    cooldown: 180,
    subModules: ['beam', 'frame', 'arch', 'composite'],
  },
  {
    id: 'change-span-increase',
    condition: (ctx) => {
      const history = ctx.paramHistory.slice(-3);
      const lChanges = history.filter(a => a.key === 'L');
      return lChanges.length >= 2 && lChanges.every(a => a.newValue > (a.oldValue || 0));
    },
    message: '📐 跨度增大时，弯矩按 L² 增长（均布荷载）或 L 增长（集中力）。这就是大跨度结构设计困难的根本原因！',
    priority: 'medium',
    cooldown: 180,
    subModules: ['beam', 'frame', 'arch'],
  },
  {
    id: 'change-arch-f',
    condition: (ctx) => {
      const recent = ctx.paramHistory.slice(-2);
      return recent.some(a => a.key === 'f');
    },
    message: '⬆️ 改变矢高 f 会直接影响水平推力 H = qL²/(8f)。f 越大推力越小，但拱越高施工越难。这就是矢跨比优化的本质。',
    priority: 'medium',
    cooldown: 120,
    subModules: ['arch'],
  },
  {
    id: 'change-il-target',
    condition: (ctx) => {
      const recent = ctx.paramHistory.slice(-2);
      return recent.some(a => a.key === 'targetType');
    },
    message: '🔄 切换了目标量！对比不同量的影响线形状：反力是三角形，弯矩是折线（顶点在截面处），剪力有突变。',
    priority: 'medium',
    cooldown: 120,
    subModules: ['static', 'kinematic'],
  },
  {
    id: 'change-section-pos',
    condition: (ctx) => {
      const recent = ctx.paramHistory.slice(-3);
      return recent.filter(a => a.key === 'sectionPos').length >= 2;
    },
    message: '📍 移动截面位置时观察：弯矩影响线的最大纵标 = c(L-c)/L，在跨中时最大。截面位置决定了最不利荷载位置！',
    priority: 'low',
    cooldown: 180,
    subModules: ['static', 'application'],
  },
];

// ========== Error Detection Triggers (Phase 3) ==========
// Detect common misconceptions and confusion patterns

const errorDetectionTriggers: AITrigger[] = [
  {
    id: 'err-geo-w0-not-stable',
    condition: (ctx) => {
      const W = Number(ctx.results.W);
      const nodes = Number(ctx.params.nodes);
      const bars = Number(ctx.params.bars);
      const dwell = (Date.now() - ctx.enterTime) / 1000;
      return W === 0 && nodes >= 4 && bars >= 5 && dwell > 30;
    },
    message: '⚠️ 注意：W=0 只是静定的必要条件，不是充分条件！例如三根平行杆连接的体系 W=0 但是瞬变体系。还需要检查几何组成。',
    priority: 'high',
    cooldown: 300,
    subModules: ['geometry'],
  },
  {
    id: 'err-beam-negative-reaction',
    condition: (ctx) => {
      const RA = Number(ctx.results.RA);
      const beamType = ctx.params.beamType;
      return beamType === 'overhanging' && RA < 0;
    },
    message: '🤔 反力 RA 为负值！这说明支座A实际受拉（向下）。外伸梁在特定荷载下支座反力可能反向，这是初学者常忽略的。',
    priority: 'high',
    cooldown: 120,
    subModules: ['beam'],
  },
  {
    id: 'err-frame-horizontal-ignored',
    condition: (ctx) => {
      const P = Number(ctx.params.P);
      const dwell = (Date.now() - ctx.enterTime) / 1000;
      return P === 0 && dwell > 20;
    },
    message: '💡 水平力 P=0 时，刚架退化为简支梁问题。试着增加水平力 P，观察它如何影响弯矩图——这才是刚架分析的关键！',
    priority: 'low',
    cooldown: 180,
    subModules: ['frame'],
  },
  {
    id: 'err-truss-long-dwell',
    condition: (ctx) => {
      const dwell = (Date.now() - ctx.enterTime) / 1000;
      return dwell > 60 && ctx.paramHistory.length < 2;
    },
    message: '🤔 看起来你在思考。桁架分析的关键：1️⃣ 先求支反力（整体平衡）→ 2️⃣ 截面法求弦杆（选矩心消未知）→ 3️⃣ 节点法求斜杆。试着调整荷载看效果！',
    priority: 'low',
    cooldown: 300,
    subModules: ['truss'],
  },
  {
    id: 'err-arch-flat',
    condition: (ctx) => {
      const L = Number(ctx.params.L);
      const f = Number(ctx.params.f);
      const dwell = (Date.now() - ctx.enterTime) / 1000;
      return f / L < 0.05 && dwell > 15;
    },
    message: '❌ 矢跨比 f/L < 1/20 太小了！这时水平推力极大，基础几乎无法承受。工程上一般 f/L ≥ 1/10。增大矢高试试。',
    priority: 'high',
    cooldown: 120,
    subModules: ['arch'],
  },
  {
    id: 'err-il-confused-value',
    condition: (ctx) => {
      const loadPos = Number(ctx.params.loadPos);
      const targetType = ctx.params.targetType;
      const currentValue = Number(ctx.results.currentValue);
      const dwell = (Date.now() - ctx.enterTime) / 1000;
      return targetType === 'RA' && loadPos > 90 && currentValue < 0.1 && dwell > 15;
    },
    message: '💡 荷载接近B支座时，RA的影响线纵标接近0——因为荷载几乎全由B承受。这正是影响线的物理意义：纵标反映荷载位置的影响程度。',
    priority: 'medium',
    cooldown: 120,
    subModules: ['static'],
  },
];

// ========== All triggers combined ==========

const ALL_TRIGGERS: AITrigger[] = [
  ...geometryTriggers,
  ...beamTriggers,
  ...frameTriggers,
  ...trussTriggers,
  ...archTriggers,
  ...influenceStaticTriggers,
  ...influenceEnvelopeTriggers,
  ...influenceKinematicTriggers,
  ...influenceApplicationTriggers,
  ...paramChangeTriggers,
  ...errorDetectionTriggers,
];

// ========== Engine ==========

/** Track last fire times by trigger ID */
const lastFired: Record<string, number> = {};

/**
 * Evaluate all triggers against current context.
 * Returns the highest-priority triggered message (if any) that isn't in cooldown.
 */
export function evaluateTriggers(ctx: AIContextData): TriggeredMessage | null {
  const now = Date.now();
  const priorityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };

  let best: TriggeredMessage | null = null;
  let bestScore = 0;

  for (const trigger of ALL_TRIGGERS) {
    // Filter by sub-module if specified
    if (trigger.subModules && !trigger.subModules.includes(ctx.subModule)) {
      continue;
    }

    // Check cooldown
    const lastTime = lastFired[trigger.id] || 0;
    if ((now - lastTime) / 1000 < trigger.cooldown) {
      continue;
    }

    // Evaluate condition
    try {
      if (trigger.condition(ctx)) {
        const score = priorityOrder[trigger.priority] || 0;
        if (score > bestScore) {
          best = {
            triggerId: trigger.id,
            message: trigger.message,
            priority: trigger.priority,
            timestamp: now,
          };
          bestScore = score;
        }
      }
    } catch {
      // Silently skip broken triggers
    }
  }

  // Mark as fired
  if (best) {
    lastFired[best.triggerId] = now;
  }

  return best;
}

/**
 * Reset cooldowns (e.g., when switching modules).
 */
export function resetTriggerCooldowns() {
  for (const key of Object.keys(lastFired)) {
    delete lastFired[key];
  }
}
