import { createContext, useContext, useCallback, useRef } from 'react';

// ========== Types ==========

export interface ParamChange {
  key: string;
  oldValue: number;
  newValue: number;
  timestamp: number;
}

export type UserActionType =
  | 'param_change'
  | 'preset_select'
  | 'tab_switch'
  | 'module_enter'
  | 'toggle_option'
  | 'diagram_interact';

export interface UserAction {
  type: UserActionType;
  detail: string;
  timestamp: number;
}

export interface AIContextData {
  module: string;
  subModule: string;
  params: Record<string, number | string | boolean>;
  paramHistory: ParamChange[];
  results: Record<string, number | string>;
  userActions: UserAction[];
  enterTime: number;
  conceptsExplored: string[];
}

export interface AIContextAPI {
  /** Current structured context snapshot */
  data: AIContextData;
  /** Record a parameter change */
  recordParamChange: (key: string, oldValue: number, newValue: number) => void;
  /** Record a generic user action */
  recordAction: (type: UserActionType, detail: string) => void;
  /** Bulk-set current params (call on every render / param change) */
  setParams: (params: Record<string, number | string | boolean>) => void;
  /** Bulk-set current results */
  setResults: (results: Record<string, number | string>) => void;
  /** Mark a concept as explored */
  markConceptExplored: (concept: string) => void;
  /** Reset context (when switching sub-module) */
  reset: (module: string, subModule: string) => void;
  /** Serialize context for AI prompt (backward compat with AITutor) */
  toPromptString: () => string;
}

// ========== Default / empty context ==========

const emptyData: AIContextData = {
  module: '',
  subModule: '',
  params: {},
  paramHistory: [],
  results: {},
  userActions: [],
  enterTime: Date.now(),
  conceptsExplored: [],
};

const noop = () => {};

export const AIContext = createContext<AIContextAPI>({
  data: emptyData,
  recordParamChange: noop,
  recordAction: noop,
  setParams: noop,
  setResults: noop,
  markConceptExplored: noop,
  reset: noop,
  toPromptString: () => '',
});

export const useAIContext = () => useContext(AIContext);

// ========== Hook that creates the mutable store ==========

const MAX_HISTORY = 50;

export function useAIContextStore(module: string, subModule: string): AIContextAPI {
  const dataRef = useRef<AIContextData>({
    ...emptyData,
    module,
    subModule,
    enterTime: Date.now(),
  });

  // Keep module/subModule in sync without resetting everything
  if (dataRef.current.module !== module || dataRef.current.subModule !== subModule) {
    dataRef.current = {
      ...emptyData,
      module,
      subModule,
      enterTime: Date.now(),
    };
  }

  const recordParamChange = useCallback((key: string, oldValue: number, newValue: number) => {
    const d = dataRef.current;
    d.paramHistory = [
      ...d.paramHistory.slice(-(MAX_HISTORY - 1)),
      { key, oldValue, newValue, timestamp: Date.now() },
    ];
    d.userActions = [
      ...d.userActions.slice(-(MAX_HISTORY - 1)),
      { type: 'param_change', detail: `${key}: ${oldValue} → ${newValue}`, timestamp: Date.now() },
    ];
  }, []);

  const recordAction = useCallback((type: UserActionType, detail: string) => {
    const d = dataRef.current;
    d.userActions = [
      ...d.userActions.slice(-(MAX_HISTORY - 1)),
      { type, detail, timestamp: Date.now() },
    ];
  }, []);

  const setParams = useCallback((params: Record<string, number | string | boolean>) => {
    dataRef.current.params = params;
  }, []);

  const setResults = useCallback((results: Record<string, number | string>) => {
    dataRef.current.results = results;
  }, []);

  const markConceptExplored = useCallback((concept: string) => {
    const d = dataRef.current;
    if (!d.conceptsExplored.includes(concept)) {
      d.conceptsExplored = [...d.conceptsExplored, concept];
    }
  }, []);

  const reset = useCallback((mod: string, sub: string) => {
    dataRef.current = {
      ...emptyData,
      module: mod,
      subModule: sub,
      enterTime: Date.now(),
    };
  }, []);

  const toPromptString = useCallback(() => {
    const d = dataRef.current;
    const paramStr = Object.entries(d.params)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    const resultStr = Object.entries(d.results)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    const recentActions = d.userActions.slice(-5).map(a => a.detail).join('; ');
    const dwellSec = Math.round((Date.now() - d.enterTime) / 1000);
    return [
      `模块: ${d.module} / ${d.subModule}`,
      `参数: ${paramStr}`,
      `结果: ${resultStr}`,
      `停留时间: ${dwellSec}秒`,
      recentActions ? `最近操作: ${recentActions}` : '',
      d.conceptsExplored.length ? `已探索: ${d.conceptsExplored.join(', ')}` : '',
    ].filter(Boolean).join('\n');
  }, []);

  return {
    data: dataRef.current,
    recordParamChange,
    recordAction,
    setParams,
    setResults,
    markConceptExplored,
    reset,
    toPromptString,
  };
}
