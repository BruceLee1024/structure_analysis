import { StructureType } from '@/types';
import type { AgentAction, AgentSessionState } from './types';

export function createAgentSession(): AgentSessionState {
  return {};
}

export function updateSessionFromActions(
  session: AgentSessionState,
  actions: AgentAction[],
  summary?: string,
): AgentSessionState {
  const next = { ...session };

  for (const action of actions) {
    if (action.kind === 'create_structure') {
      if (typeof action.payload.structureType === 'string') {
        next.lastStructureType = action.payload.structureType as StructureType;
      }
      if (typeof action.payload.numSpans === 'number') next.lastSpanIndex = action.payload.numSpans;
    }

    if (action.kind === 'add_load' || action.kind === 'update_load') {
      if (typeof action.payload.loadId === 'string') next.lastLoadId = action.payload.loadId;
      if (typeof action.payload.targetSpan === 'number') next.lastSpanIndex = action.payload.targetSpan;
    }

    if (action.kind === 'explain_results') {
      const question = String(action.payload.question ?? '');
      if (question.includes('位移')) next.lastResultFocus = 'displacement';
      if (question.includes('反力')) next.lastResultFocus = 'reaction';
      if (question.includes('弯矩')) next.lastResultFocus = 'moment';
    }
  }

  next.lastStructureType = next.lastStructureType ?? session.lastStructureType;
  if (summary) next.lastSummary = summary;

  return next;
}
