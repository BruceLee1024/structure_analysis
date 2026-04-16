import type { AnalysisResult, Load, SolverParams, StructureType } from '@/types';

export type AgentRiskLevel = 'low' | 'medium' | 'high';

export interface AgentSessionState {
  lastLoadId?: string;
  lastSpanIndex?: number;
  lastSummary?: string;
  lastStructureType?: StructureType;
  lastResultFocus?: 'displacement' | 'reaction' | 'moment';
}

export interface AgentModelSummary {
  structureType: StructureType;
  structureLabel: string;
  geometrySummary: string;
  supportSummary: string;
  loadCount: number;
  loadDescriptions: string[];
  resultSummary: string[];
}

export type AgentActionKind =
  | 'create_structure'
  | 'create_custom_structure'
  | 'update_geometry'
  | 'update_material'
  | 'add_load'
  | 'update_load'
  | 'remove_load'
  | 'update_support'
  | 'explain_results'
  | 'summarize_model'
  | 'undo_last_agent_action';

type PrimitiveValue = number | string | boolean | null | undefined;

export interface AgentAction {
  kind: AgentActionKind;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, PrimitiveValue | Record<string, PrimitiveValue>[] | any> & {
    magnitudeDelta?: number;
    magnitudeScale?: number;
    locationDelta?: number;
    loadOrdinal?: number;
    nodes?: { id: number; x: number; y: number; restraints: [boolean, boolean, boolean] }[];
    elements?: { id: number; startNode: number; endNode: number; releaseStart?: boolean; releaseEnd?: boolean }[];
    loads?: { type: string; magnitude: number; direction?: string; elementId?: number; nodeId?: number; location?: number }[];
  };
}

export interface AgentParseResult {
  userText: string;
  summary: string;
  confidence: number;
  actions: AgentAction[];
  riskLevel: AgentRiskLevel;
  requiresConfirmation: boolean;
  reasons?: string[];
  clarification?: string;
}

export interface AgentSnapshot {
  params: SolverParams;
  session?: AgentSessionState;
  summary: string;
  createdAt: number;
}

export interface AgentExecutionResult {
  params: SolverParams;
  summary: string;
  appliedActions: AgentAction[];
  warning?: string;
}

export interface AgentExplainerContext {
  params: SolverParams;
  results: AnalysisResult;
  loads: Load[];
}
