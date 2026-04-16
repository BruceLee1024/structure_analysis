import type { AnalysisResult, SolverParams } from '@/types';
import { describeModelSummary, buildModelSummary } from './modelSummary';
import { assessAgentRisk } from './risk';
import { parseWithLLM } from './llmParser';
import type { AgentAction, AgentParseResult, AgentSessionState } from './types';

interface ParserContext {
  params: SolverParams;
  results: AnalysisResult;
  session?: AgentSessionState;
  modelSummary?: string;
}

type LlmParser = (text: string, context: ParserContext) => Promise<AgentParseResult | null>;

const referencePronouns = ['它', '这个', '刚才', '上一个', '那个', '再'];
const allowedActionKinds = new Set<AgentAction['kind']>([
  'create_structure',
  'update_geometry',
  'update_material',
  'add_load',
  'update_load',
  'remove_load',
  'update_support',
  'explain_results',
  'summarize_model',
  'undo_last_agent_action',
]);

function isSessionReference(text: string): boolean {
  return referencePronouns.some(token => text.includes(token));
}

function hasNumericValue(value: unknown): value is number | string {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.trim() !== '' && Number.isFinite(Number(value));
  return false;
}

function hasExistingLoadId(params: SolverParams, loadId?: string): boolean {
  return typeof loadId === 'string' && params.loads.some(load => load.id === loadId);
}

function getSessionLoadId(params: SolverParams, session?: AgentSessionState): string | undefined {
  if (typeof session?.lastLoadId !== 'string') return undefined;
  if (params.loads.length === 0) return session.lastLoadId;
  return hasExistingLoadId(params, session.lastLoadId) ? session.lastLoadId : undefined;
}

function normalizeActions(text: string, actions: AgentAction[], params: SolverParams, session?: AgentSessionState): AgentAction[] {
  return actions
    .filter(action => allowedActionKinds.has(action.kind))
    .map(action => {
      const payload = { ...action.payload };

      if (action.kind === 'update_load') {
        const hasOrdinalTarget = typeof payload.loadOrdinal === 'number';
        const sessionLoadId = getSessionLoadId(params, session);

        if (typeof payload.loadId === 'string' && !hasExistingLoadId(params, payload.loadId)) {
          if (!hasOrdinalTarget && sessionLoadId) payload.loadId = sessionLoadId;
          else delete payload.loadId;
        }

        if (typeof payload.loadId !== 'string' && !hasOrdinalTarget && sessionLoadId) {
          payload.loadId = sessionLoadId;
        }

        if (!hasNumericValue(payload.targetSpan) && session?.lastSpanIndex) payload.targetSpan = session.lastSpanIndex;
      }

      if (action.kind === 'remove_load') {
        const hasOrdinalTarget = typeof payload.loadOrdinal === 'number';
        const sessionLoadId = getSessionLoadId(params, session);

        if (payload.scope !== 'all' && typeof payload.loadId === 'string' && !hasExistingLoadId(params, payload.loadId)) {
          if (!hasOrdinalTarget && sessionLoadId) payload.loadId = sessionLoadId;
          else delete payload.loadId;
        }

        if (payload.scope !== 'all' && typeof payload.loadId !== 'string' && !hasOrdinalTarget && sessionLoadId) {
          payload.loadId = sessionLoadId;
        }
      }

      if (action.kind === 'add_load') {
        if (!hasNumericValue(payload.targetSpan) && session?.lastSpanIndex && isSessionReference(text)) {
          payload.targetSpan = session.lastSpanIndex;
        }
      }

      if (action.kind === 'create_structure') {
        if (typeof payload.structureType !== 'string' && session?.lastStructureType && isSessionReference(text)) {
          payload.structureType = session.lastStructureType;
        }
      }

      if (action.kind === 'explain_results' && typeof payload.question !== 'string') {
        payload.question = text;
      }

      return { ...action, payload };
    });
}

function findClarification(text: string, actions: AgentAction[], session?: AgentSessionState): string | undefined {
  const unresolvedLoadUpdate = actions.some(
    action =>
      action.kind === 'update_load' &&
      typeof action.payload.loadId !== 'string' &&
      typeof action.payload.loadOrdinal !== 'number',
  );

  if (unresolvedLoadUpdate) {
    return session?.lastLoadId
      ? '已尝试关联上一条荷载，但仍建议你明确指出要修改哪一个荷载。'
      : '请说明要修改哪一个荷载，例如“把第二跨那个集中力改成 30kN”。';
  }

  const unresolvedLoadRemove = actions.some(
    action =>
      action.kind === 'remove_load' &&
      action.payload.scope !== 'all' &&
      typeof action.payload.loadId !== 'string' &&
      typeof action.payload.loadOrdinal !== 'number',
  );

  if (unresolvedLoadRemove) {
    return session?.lastLoadId
      ? '已尝试关联上一条荷载，但仍建议你明确指出要删除哪一个荷载。'
      : '请说明要删除哪一个荷载，例如“删掉第二个荷载”。';
  }

  const unresolvedAddLoad = actions.some(
    action => action.kind === 'add_load' && !hasNumericValue(action.payload.targetSpan) && text.includes('跨'),
  );

  if (unresolvedAddLoad) {
    return '请补充荷载所在跨号或位置，例如“第二跨跨中”或“第一跨右 1/3 处”。';
  }

  return undefined;
}

function finalizeParseResult(
  text: string,
  context: ParserContext,
  parsed: AgentParseResult,
): AgentParseResult {
  const normalizedActions = normalizeActions(text, parsed.actions, context.params, context.session);
  const risk = assessAgentRisk(context.params, normalizedActions);
  const clarification = parsed.clarification ?? findClarification(text, normalizedActions, context.session);
  const isDeterministicSingleLoadUpdate =
    normalizedActions.length === 1 &&
    normalizedActions[0]?.kind === 'update_load' &&
    !clarification &&
    !risk.requiresConfirmation;

  return {
    ...parsed,
    actions: normalizedActions,
    riskLevel: risk.level,
    requiresConfirmation:
      (!isDeterministicSingleLoadUpdate && parsed.requiresConfirmation) ||
      risk.requiresConfirmation ||
      Boolean(clarification) ||
      normalizedActions.length === 0,
    reasons: risk.reasons,
    clarification,
  };
}

export async function parseAgentInput(
  text: string,
  context: ParserContext,
  llmParser?: LlmParser,
  onChunk?: (delta: string) => void,
): Promise<AgentParseResult> {
  const modelSummary = describeModelSummary(buildModelSummary(context.params, context.results));
  const llmContext = { ...context, modelSummary };
  const llmResult = llmParser
    ? await llmParser(text, llmContext)
    : await parseWithLLM(text, llmContext, onChunk).catch(() => null);

  if (llmResult) return finalizeParseResult(text, context, llmResult);

  return {
    userText: text,
    summary: `解析失败，请重试。`,
    confidence: 0.3,
    actions: [],
    riskLevel: 'medium',
    requiresConfirmation: true,
    reasons: ['LLM 未能返回有效解析结果'],
    clarification: '请补充结构位置、荷载类型或目标对象。',
  };
}
