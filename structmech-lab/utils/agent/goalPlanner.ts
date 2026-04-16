import type { AnalysisResult, Load, SolverParams } from '@/types';
import type { AgentParseResult, AgentSessionState } from './types';

const chineseDigits: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
};

type GoalType = 'displacement' | 'moment' | 'load_position';

function readOrdinalLoad(text: string): number | null {
  const arabicMatch = text.match(/第(\d+)个?荷载/);
  if (arabicMatch) return Number(arabicMatch[1]);

  const chineseMatch = text.match(/第([一二三四五六])个?荷载/);
  if (chineseMatch) return chineseDigits[chineseMatch[1]] || null;

  return null;
}

function detectGoalType(text: string): GoalType | null {
  if (text.includes('位移') && /(控制|减小|更小|降低|优化|收敛)/.test(text)) return 'displacement';
  if (text.includes('弯矩') && /(控制|减小|更小|峰值|降低|优化)/.test(text)) return 'moment';
  if ((text.includes('荷载位置') || text.includes('位置')) && /(合理|优化|自动|调整)/.test(text)) return 'load_position';
  return null;
}

function pickTargetLoad(params: SolverParams, session: AgentSessionState | undefined, text: string): Load | null {
  const ordinal = readOrdinalLoad(text);
  if (ordinal !== null) return params.loads[ordinal - 1] ?? null;

  if (session?.lastLoadId) {
    const remembered = params.loads.find(load => load.id === session.lastLoadId);
    if (remembered) return remembered;
  }

  if (params.loads.length === 1) return params.loads[0];
  return params.loads[params.loads.length - 1] ?? null;
}

function suggestLocation(load: Load): number | null {
  if (load.elementId === undefined) return null;
  const current = load.location ?? 0.5;
  if (current < 0.5) return Math.max(0.1, current - 0.15);
  if (current > 0.5) return Math.min(0.9, current + 0.15);
  return 0.35;
}

function buildGoalSummary(goal: GoalType, results: AnalysisResult): string {
  if (goal === 'displacement') return `当前最大位移为 ${results.maxDeflection.toFixed(4)} m，识别为减小位移目标`;
  if (goal === 'moment') {
    const maxMoment = [...results.elements].sort((a, b) => Math.abs(b.maxMoment) - Math.abs(a.maxMoment))[0];
    return maxMoment
      ? `当前最大弯矩为 ${Math.abs(maxMoment.maxMoment).toFixed(2)} kN·m，识别为减小弯矩峰值目标`
      : '识别为减小弯矩峰值目标';
  }
  return '识别为自动优化荷载位置目标';
}

function buildExplainQuestion(goal: GoalType): string {
  if (goal === 'displacement') return '为什么这样调整有助于减小最大位移？';
  if (goal === 'moment') return '为什么这样调整有助于减小最大弯矩峰值？';
  return '为什么这个荷载位置更合理？';
}

export function planGoalDrivenAdjustment(
  text: string,
  context: {
    params: SolverParams;
    results: AnalysisResult;
    session?: AgentSessionState;
  },
): AgentParseResult | null {
  const goalType = detectGoalType(text);
  if (!goalType) return null;

  if (context.results.error) {
    return {
      userText: text,
      summary: '识别为结果驱动优化请求，但当前模型尚未稳定求解。',
      confidence: 0.8,
      actions: [],
      riskLevel: 'medium',
      requiresConfirmation: true,
      clarification: '请先修正求解错误，再进行目标驱动优化。',
    };
  }

  const targetLoad = pickTargetLoad(context.params, context.session, text);
  if (!targetLoad) {
    return {
      userText: text,
      summary: '识别为结果驱动优化请求，但当前没有可优化的荷载对象。',
      confidence: 0.84,
      actions: [],
      riskLevel: 'medium',
      requiresConfirmation: true,
      clarification: '请先添加荷载，或明确指出要优化第几个荷载。',
    };
  }

  const suggestedLocation = suggestLocation(targetLoad);
  const currentLocation = targetLoad.location ?? 0.5;
  const shouldMoveLocation =
    suggestedLocation !== null &&
    (goalType === 'load_position' || goalType === 'displacement' || goalType === 'moment') &&
    Math.abs(suggestedLocation - currentLocation) >= 0.05;

  const updateAction = shouldMoveLocation
    ? {
        kind: 'update_load' as const,
        payload: { loadId: targetLoad.id, location: suggestedLocation },
      }
    : {
        kind: 'update_load' as const,
        payload: { loadId: targetLoad.id, magnitudeScale: goalType === 'load_position' ? 1 : 0.9 },
      };

  const summaryPrefix = buildGoalSummary(goalType, context.results);
  const adjustmentText = shouldMoveLocation
    ? '将先把目标荷载向更靠近支座的位置微调'
    : '将先把目标荷载幅值小幅下调';

  return {
    userText: text,
    summary: `${summaryPrefix}，${adjustmentText}，再解释该调整的作用。`,
    confidence: 0.92,
    actions: [
      updateAction,
      { kind: 'explain_results', payload: { question: buildExplainQuestion(goalType) } },
    ],
    riskLevel: 'medium',
    requiresConfirmation: true,
    clarification: '这是基于当前计算结果生成的试探性优化方案，确认后我会先调整，再解释原因。',
  };
}
