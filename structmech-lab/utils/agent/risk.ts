import type { SolverParams } from '@/types';
import type { AgentAction, AgentRiskLevel } from './types';

export interface AgentRiskAssessment {
  level: AgentRiskLevel;
  requiresConfirmation: boolean;
  reasons: string[];
}

export function assessAgentRisk(params: SolverParams, actions: AgentAction[]): AgentRiskAssessment {
  const reasons: string[] = [];
  const hasCreate = actions.some(action => action.kind === 'create_structure');
  const hasBulkDelete = actions.some(action => action.kind === 'remove_load' && action.payload.scope === 'all');
  const hasExplanationOnly = actions.every(
    action => action.kind === 'explain_results' || action.kind === 'summarize_model',
  );

  if (hasExplanationOnly) {
    return { level: 'low', requiresConfirmation: false, reasons: [] };
  }

  if (hasBulkDelete) {
    reasons.push('该操作会清空全部荷载');
    return { level: 'high', requiresConfirmation: true, reasons };
  }

  if (hasCreate && (params.loads.length > 0 || params.elements.length > 0)) {
    reasons.push('将替换当前模型与已有荷载，但可通过撤销恢复');
  }

  if (actions.length > 1) {
    reasons.push('将连续执行多个动作');
    return {
      level: 'medium',
      requiresConfirmation: false,
      reasons,
    };
  }

  if (reasons.length > 0) {
    return { level: 'medium', requiresConfirmation: false, reasons };
  }

  return { level: 'low', requiresConfirmation: false, reasons: [] };
}
