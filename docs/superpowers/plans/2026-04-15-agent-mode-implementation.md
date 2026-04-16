# Agent Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `SolverModule` 中落地一个可连续对话的 Agent 模式，让用户用自然语言创建参数化结构、修改荷载与支座、追问计算结果，并通过本地安全执行层把解析结果稳定映射到现有求解器状态。

**Architecture:** 保持 `SolverModule` 作为唯一真实状态源。新增 `utils/agent` 纯逻辑层负责摘要、解析、风险评估、执行与解释；新增 `AgentPanel` 负责 UI 与确认流程；抽取通用 AI 客户端给 `AITutor` 与 Agent 共享。所有结构状态改动都必须经过“动作列表 -> 草案 -> 校验 -> 原子提交 -> 快照撤销”的链路。

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS v4, Vitest, Testing Library

**Workspace note:** 当前桌面工作区不是 git checkout，因此每个任务的最后一步使用“本地检查点”代替提交；如果后续在 git 工作树中执行，可把这些检查点替换为常规 `git add` / `git commit`。

---

## File Structure

**Create**

- `structmech-lab/vitest.config.ts` - Vitest 配置，复用 Vite React 插件与 `@/` 别名
- `structmech-lab/tests/setup.ts` - Testing Library 与 `jest-dom` 初始化
- `structmech-lab/utils/agent/types.ts` - Agent 核心类型：动作、解析结果、风险等级、快照、消息
- `structmech-lab/utils/agent/modelSummary.ts` - 当前求解器状态摘要与可读化描述
- `structmech-lab/utils/agent/modelSummary.test.ts` - 模型摘要测试
- `structmech-lab/utils/agent/risk.ts` - 风险分级与确认规则
- `structmech-lab/utils/agent/risk.test.ts` - 风险规则测试
- `structmech-lab/utils/agent/session.ts` - 轻量会话上下文与指代记忆
- `structmech-lab/utils/agent/session.test.ts` - 会话状态测试
- `structmech-lab/utils/agent/ruleParser.ts` - 规则优先的自然语言解析器
- `structmech-lab/utils/agent/ruleParser.test.ts` - 规则解析测试
- `structmech-lab/utils/agent/parser.ts` - 解析编排层，决定规则解析、LLM 解析和确认卡输出
- `structmech-lab/utils/agent/parser.test.ts` - 解析编排测试
- `structmech-lab/utils/agent/llmParser.ts` - 受约束 JSON 的 LLM 解析层
- `structmech-lab/utils/agent/executor.ts` - 动作执行器、草案生成、校验与快照
- `structmech-lab/utils/agent/executor.test.ts` - 执行器测试
- `structmech-lab/utils/agent/explainer.ts` - 事实层摘要、解释提示词与工程语义解释入口
- `structmech-lab/utils/agent/explainer.test.ts` - 解释器测试
- `structmech-lab/utils/aiClient.ts` - 共享 AI 请求客户端，供 `AITutor` 与 Agent 复用
- `structmech-lab/components/solver/AgentActionCard.tsx` - 动作摘要与确认卡
- `structmech-lab/components/solver/AgentMessageList.tsx` - Agent 对话消息列表
- `structmech-lab/components/solver/AgentPanel.tsx` - Agent 主面板
- `structmech-lab/components/solver/AgentPanel.test.tsx` - Agent 面板交互测试

**Modify**

- `structmech-lab/package.json` - 增加测试依赖与脚本
- `structmech-lab/tsconfig.json` - 补充 Vitest 类型
- `structmech-lab/components/AITutor.tsx` - 改为复用 `aiClient`
- `structmech-lab/components/SolverModule.tsx` - 集成 AgentPanel、快照状态和执行入口

## Task 1: Test Harness And Shared Agent Contracts

**Files:**

- Create: `structmech-lab/vitest.config.ts`
- Create: `structmech-lab/tests/setup.ts`
- Create: `structmech-lab/utils/agent/types.ts`
- Create: `structmech-lab/utils/agent/modelSummary.ts`
- Create: `structmech-lab/utils/agent/modelSummary.test.ts`
- Modify: `structmech-lab/package.json`
- Modify: `structmech-lab/tsconfig.json`

- [ ] **Step 1: Add test scripts and dependencies before feature code**

Update `structmech-lab/package.json` so we can run red-green cycles locally:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/node": "^22.14.0",
    "@vitejs/plugin-react": "^5.0.0",
    "jsdom": "^25.0.1",
    "typescript": "~5.8.2",
    "vite": "^6.2.0",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Add Vitest config and setup file**

Create `structmech-lab/vitest.config.ts`:

```ts
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './tests/setup.ts',
    css: false,
  },
});
```

Create `structmech-lab/tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

Update `structmech-lab/tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["node", "vitest/globals"]
  }
}
```

- [ ] **Step 3: Write the failing summary test**

Create `structmech-lab/utils/agent/modelSummary.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { StructureType, type AnalysisResult, type SolverParams } from '@/types';
import { buildModelSummary, describeModelSummary } from './modelSummary';

const emptyResults: AnalysisResult = {
  elements: [],
  maxDeflection: 0,
  reactions: [],
  displacements: [],
};

test('summarizes a continuous beam with one point load', () => {
  const params: SolverParams = {
    structureType: StructureType.MultiSpanBeam,
    stiffnessType: 'Elastic',
    width: 12,
    height: 0,
    roofHeight: 0,
    numSpans: 3,
    numStories: 1,
    numBays: 1,
    elasticModulus: 200,
    crossSectionArea: 50,
    momentOfInertia: 200,
    nodes: [
      { id: 1, x: 0, y: 0, restraints: [false, true, false] },
      { id: 2, x: 4, y: 0, restraints: [false, true, false] },
      { id: 3, x: 8, y: 0, restraints: [false, true, false] },
      { id: 4, x: 12, y: 0, restraints: [false, true, false] },
    ],
    elements: [
      { id: 1, startNode: 1, endNode: 2, E: 200, A: 50, I: 200 },
      { id: 2, startNode: 2, endNode: 3, E: 200, A: 50, I: 200 },
      { id: 3, startNode: 3, endNode: 4, E: 200, A: 50, I: 200 },
    ],
    loads: [
      { id: 'load-1', type: 'point', magnitude: -20, direction: 'y', elementId: 2, location: 0.5 },
    ],
  };

  const summary = buildModelSummary(params, emptyResults);

  expect(summary.structureLabel).toBe('三跨连续梁');
  expect(summary.loadCount).toBe(1);
  expect(summary.supportSummary).toContain('4 个支承点');
  expect(describeModelSummary(summary)).toContain('第二跨跨中 20kN 向下集中力');
});
```

- [ ] **Step 4: Run the test to verify the missing module failure**

Run:

```bash
cd 'Structure Analysis/structmech-lab' && npm run test -- utils/agent/modelSummary.test.ts
```

Expected: FAIL with module-not-found errors for `./modelSummary`.

- [ ] **Step 5: Implement the shared types and summary builder**

Create `structmech-lab/utils/agent/types.ts`:

```ts
import type { AnalysisResult, Load, SolverParams, StructureType } from '@/types';

export type AgentRiskLevel = 'low' | 'medium' | 'high';

export interface AgentModelSummary {
  structureType: StructureType;
  structureLabel: string;
  geometrySummary: string;
  supportSummary: string;
  loadCount: number;
  loadDescriptions: string[];
  resultSummary: string[];
}

export interface AgentActionBase {
  kind:
    | 'create_structure'
    | 'update_geometry'
    | 'update_material'
    | 'add_load'
    | 'update_load'
    | 'remove_load'
    | 'update_support'
    | 'explain_results'
    | 'summarize_model'
    | 'undo_last_agent_action';
}

export interface AgentAction extends AgentActionBase {
  payload: Record<string, number | string | boolean | null>;
}

export interface AgentParseResult {
  userText: string;
  summary: string;
  confidence: number;
  actions: AgentAction[];
  riskLevel: AgentRiskLevel;
  requiresConfirmation: boolean;
  clarification?: string;
}

export interface AgentSnapshot {
  params: SolverParams;
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
```

Create `structmech-lab/utils/agent/modelSummary.ts`:

```ts
import { StructureType, type AnalysisResult, type Load, type SolverParams } from '@/types';
import type { AgentModelSummary } from './types';

const structureLabels: Record<StructureType, string> = {
  [StructureType.Beam]: '简支梁',
  [StructureType.MultiSpanBeam]: '三跨连续梁',
  [StructureType.PortalFrame]: '门式刚架',
  [StructureType.MultiStoryFrame]: '多层多跨框架',
  [StructureType.GableFrame]: '人字形刚架',
  [StructureType.Truss]: '桁架',
  [StructureType.Cantilever]: '悬臂刚架',
  [StructureType.Custom]: '自定义结构',
};

function formatBeamSpanLabel(load: Load, params: SolverParams): string {
  if (!load.elementId || params.structureType !== StructureType.MultiSpanBeam) {
    return load.elementId ? `单元 ${load.elementId}` : `节点 ${load.nodeId}`;
  }
  const spanIndex = params.elements.findIndex(element => element.id === load.elementId) + 1;
  return spanIndex > 0 ? `第 ${spanIndex} 跨` : `单元 ${load.elementId}`;
}

function describeLoad(load: Load, params: SolverParams): string {
  const targetLabel = formatBeamSpanLabel(load, params);

  if (load.type === 'point') {
    const locationLabel = load.location === 0.5 ? '跨中' : `${((load.location ?? 0.5) * 100).toFixed(0)}% 跨处`;
    const directionLabel = load.direction === 'x' ? '水平' : load.magnitude < 0 ? '向下' : '向上';
    return `${targetLabel}${load.elementId ? locationLabel : ''} ${Math.abs(load.magnitude)}kN ${directionLabel}集中力`;
  }
  if (load.type === 'distributed') {
    return `${targetLabel} 上 ${Math.abs(load.magnitude)}kN/m 分布荷载`;
  }
  if (load.type === 'moment') {
    return `${targetLabel} 处 ${Math.abs(load.magnitude)}kN·m 力矩`;
  }
  return `${targetLabel} 上荷载`;
}

export function buildModelSummary(params: SolverParams, results: AnalysisResult): AgentModelSummary {
  const supportCount = params.nodes.filter(node => node.restraints.some(Boolean)).length;
  const geometrySummary =
    params.structureType === StructureType.MultiSpanBeam
      ? `${params.numSpans} 跨，总长 ${params.width}m`
      : `宽 ${params.width}m，高 ${params.height}m`;

  return {
    structureType: params.structureType,
    structureLabel: structureLabels[params.structureType],
    geometrySummary,
    supportSummary: `${supportCount} 个支承点`,
    loadCount: params.loads.length,
    loadDescriptions: params.loads.map(load => describeLoad(load, params)),
    resultSummary: results.error ? [results.error] : [],
  };
}

export function describeModelSummary(summary: AgentModelSummary): string {
  const loads = summary.loadDescriptions.length > 0 ? summary.loadDescriptions.join('；') : '当前无荷载';
  return `${summary.structureLabel}，${summary.geometrySummary}，${summary.supportSummary}，${loads}`;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run:

```bash
cd 'Structure Analysis/structmech-lab' && npm run test -- utils/agent/modelSummary.test.ts
```

Expected: PASS

- [ ] **Step 7: Local checkpoint**

Run:

```bash
cd 'Structure Analysis/structmech-lab' && npm run typecheck
```

Expected: PASS

## Task 2: Risk Rules, Session Memory, And Fact Summaries

**Files:**

- Create: `structmech-lab/utils/agent/risk.ts`
- Create: `structmech-lab/utils/agent/risk.test.ts`
- Create: `structmech-lab/utils/agent/session.ts`
- Create: `structmech-lab/utils/agent/session.test.ts`
- Create: `structmech-lab/utils/agent/explainer.ts`
- Create: `structmech-lab/utils/agent/explainer.test.ts`

- [ ] **Step 1: Write the failing risk test**

Create `structmech-lab/utils/agent/risk.test.ts`:

```ts
import { expect, test } from 'vitest';
import { StructureType, type SolverParams } from '@/types';
import { assessAgentRisk } from './risk';

const baseParams: SolverParams = {
  structureType: StructureType.PortalFrame,
  stiffnessType: 'Elastic',
  width: 10,
  height: 5,
  roofHeight: 0,
  numSpans: 2,
  numStories: 1,
  numBays: 1,
  elasticModulus: 200,
  crossSectionArea: 50,
  momentOfInertia: 200,
  nodes: [],
  elements: [],
  loads: [{ id: 'load-1', type: 'point', magnitude: -10, direction: 'y', nodeId: 1 }],
};

test('requires confirmation when a new structure would replace an existing loaded model', () => {
  const result = assessAgentRisk(baseParams, [
    { kind: 'create_structure', payload: { structureType: StructureType.MultiSpanBeam, numSpans: 3 } },
  ]);

  expect(result.level).toBe('high');
  expect(result.requiresConfirmation).toBe(true);
  expect(result.reasons[0]).toContain('覆盖当前模型');
});
```

- [ ] **Step 2: Run the test to verify the failure**

Run:

```bash
cd 'Structure Analysis/structmech-lab' && npm run test -- utils/agent/risk.test.ts
```

Expected: FAIL with module-not-found for `./risk`.

- [ ] **Step 3: Implement risk assessment**

Create `structmech-lab/utils/agent/risk.ts`:

```ts
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
  const hasBulkDelete = actions.some(
    action => action.kind === 'remove_load' && action.payload.scope === 'all',
  );
  const multiAction = actions.length > 1;

  if (hasCreate && (params.loads.length > 0 || params.elements.length > 0)) {
    reasons.push('该操作会覆盖当前模型与已有荷载');
  }

  if (hasBulkDelete) {
    reasons.push('该操作会清空全部荷载');
  }

  if (reasons.length > 0) {
    return { level: 'high', requiresConfirmation: true, reasons };
  }

  if (multiAction) {
    return {
      level: 'medium',
      requiresConfirmation: true,
      reasons: ['该操作会同时修改多个关键参数'],
    };
  }

  return { level: 'low', requiresConfirmation: false, reasons: [] };
}
```

- [ ] **Step 4: Write the failing session and fact tests**

Create `structmech-lab/utils/agent/session.test.ts`:

```ts
import { expect, test } from 'vitest';
import { createAgentSession, updateSessionFromActions } from './session';

test('remembers the last referenced load for follow-up edits', () => {
  const session = createAgentSession();
  const next = updateSessionFromActions(session, [
    { kind: 'add_load', payload: { loadId: 'load-9', targetSpan: 2 } },
  ]);

  expect(next.lastLoadId).toBe('load-9');
  expect(next.lastSpanIndex).toBe(2);
});
```

Create `structmech-lab/utils/agent/explainer.test.ts`:

```ts
import { expect, test } from 'vitest';
import { summarizeResultFacts } from './explainer';
import { StructureType, type AnalysisResult, type SolverParams } from '@/types';

test('extracts max displacement and reaction facts without calling AI', () => {
  const params: SolverParams = {
    structureType: StructureType.Beam,
    stiffnessType: 'Elastic',
    width: 6,
    height: 0,
    roofHeight: 0,
    numSpans: 1,
    numStories: 1,
    numBays: 1,
    elasticModulus: 200,
    crossSectionArea: 50,
    momentOfInertia: 200,
    nodes: [],
    elements: [],
    loads: [],
  };
  const results: AnalysisResult = {
    elements: [{ elementId: 1, stations: [], maxMoment: 32, maxShear: 16, maxAxial: 0, u_local: [], startForces: { fx: 0, fy: 8, m: 0 } }],
    maxDeflection: 0.012,
    reactions: [{ nodeId: 1, fx: 0, fy: 12, m: 0 }],
    displacements: [{ nodeId: 2, dx: 0, dy: -0.012, rotation: 0.004 }],
  };

  const facts = summarizeResultFacts(params, results);

  expect(facts[0]).toContain('最大位移');
  expect(facts.join(' ')).toContain('12.00');
});
```

- [ ] **Step 5: Run the tests to verify the failures**

Run:

```bash
cd 'Structure Analysis/structmech-lab' && npm run test -- utils/agent/session.test.ts utils/agent/explainer.test.ts
```

Expected: FAIL with missing modules.

- [ ] **Step 6: Implement session memory and fact summarizer**

Create `structmech-lab/utils/agent/session.ts`:

```ts
import type { AgentAction } from './types';

export interface AgentSessionState {
  lastLoadId?: string;
  lastSpanIndex?: number;
  lastSummary?: string;
}

export function createAgentSession(): AgentSessionState {
  return {};
}

export function updateSessionFromActions(
  session: AgentSessionState,
  actions: AgentAction[],
): AgentSessionState {
  const next = { ...session };

  for (const action of actions) {
    if (action.kind === 'add_load' || action.kind === 'update_load') {
      const loadId = action.payload.loadId;
      const targetSpan = action.payload.targetSpan;

      if (typeof loadId === 'string') next.lastLoadId = loadId;
      if (typeof targetSpan === 'number') next.lastSpanIndex = targetSpan;
    }
  }

  return next;
}
```

Create `structmech-lab/utils/agent/explainer.ts`:

```ts
import type { AnalysisResult, SolverParams } from '@/types';
import type { AgentExplainerContext } from './types';

export function summarizeResultFacts(params: SolverParams, results: AnalysisResult): string[] {
  if (results.error) return [`求解失败：${results.error}`];

  const facts: string[] = [];
  facts.push(`最大位移为 ${results.maxDeflection.toFixed(4)} m`);

  if (results.reactions.length > 0) {
    const maxReaction = [...results.reactions].sort((a, b) => Math.abs(b.fy) - Math.abs(a.fy))[0];
    facts.push(`最大竖向反力出现在节点 ${maxReaction.nodeId}，数值为 ${maxReaction.fy.toFixed(2)} kN`);
  }

  if (results.elements.length > 0) {
    const maxMoment = [...results.elements].sort((a, b) => Math.abs(b.maxMoment) - Math.abs(a.maxMoment))[0];
    facts.push(`最大弯矩出现在单元 ${maxMoment.elementId}，数值为 ${maxMoment.maxMoment.toFixed(2)} kN·m`);
  }

  return facts;
}

export function buildExplainerPrompt({ params, results }: AgentExplainerContext, question: string): string {
  const facts = summarizeResultFacts(params, results).join('；');
  return `你是结构力学助教。只能使用这些已知事实：${facts}。用户问题：${question}`;
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run:

```bash
cd 'Structure Analysis/structmech-lab' && npm run test -- utils/agent/risk.test.ts utils/agent/session.test.ts utils/agent/explainer.test.ts
```

Expected: PASS

- [ ] **Step 8: Local checkpoint**

Run:

```bash
cd 'Structure Analysis/structmech-lab' && npm run typecheck
```

Expected: PASS

## Task 3: Deterministic Rule Parser And Parser Orchestration

**Files:**

- Create: `structmech-lab/utils/agent/ruleParser.ts`
- Create: `structmech-lab/utils/agent/ruleParser.test.ts`
- Create: `structmech-lab/utils/agent/parser.ts`
- Create: `structmech-lab/utils/agent/parser.test.ts`

- [ ] **Step 1: Write the failing rule parser tests**

Create `structmech-lab/utils/agent/ruleParser.test.ts`:

```ts
import { expect, test } from 'vitest';
import { parseRuleInput } from './ruleParser';
import { StructureType } from '@/types';

test('parses a create-structure sentence for a continuous beam', () => {
  const result = parseRuleInput('建一个三跨连续梁，跨长都 6 米');

  expect(result?.actions[0]).toEqual({
    kind: 'create_structure',
    payload: { structureType: StructureType.MultiSpanBeam, numSpans: 3, width: 18 },
  });
});

test('parses a point load sentence on the second span midpoint', () => {
  const result = parseRuleInput('在第二跨跨中加 20kN 向下集中力');

  expect(result?.actions[0]).toEqual({
    kind: 'add_load',
    payload: { loadType: 'point', magnitude: -20, direction: 'y', targetSpan: 2, location: 0.5 },
  });
});
```

Create `structmech-lab/utils/agent/parser.test.ts`:

```ts
import { expect, test, vi } from 'vitest';
import { parseAgentInput } from './parser';
import { StructureType, type SolverParams } from '@/types';

const params: SolverParams = {
  structureType: StructureType.Beam,
  stiffnessType: 'Elastic',
  width: 6,
  height: 0,
  roofHeight: 0,
  numSpans: 1,
  numStories: 1,
  numBays: 1,
  elasticModulus: 200,
  crossSectionArea: 50,
  momentOfInertia: 200,
  nodes: [],
  elements: [],
  loads: [],
};

test('returns rule-based result without calling llm when the parse is deterministic', async () => {
  const llm = vi.fn();
  const result = await parseAgentInput('建一个三跨连续梁，跨长都 6 米', { params, results: { elements: [], maxDeflection: 0, reactions: [], displacements: [] } }, llm);

  expect(result.actions[0].kind).toBe('create_structure');
  expect(llm).not.toHaveBeenCalled();
});

test('parses a geometry update sentence for beam span length', async () => {
  const llm = vi.fn();
  const result = await parseAgentInput('跨长改成 8 米', { params, results: { elements: [], maxDeflection: 0, reactions: [], displacements: [] } }, llm);

  expect(result.actions[0]).toEqual({
    kind: 'update_geometry',
    payload: { width: 8 },
  });
});
```

- [ ] **Step 2: Run the tests to verify the failures**

Run:

```bash
cd 'Structure Analysis/structmech-lab' && npm run test -- utils/agent/ruleParser.test.ts utils/agent/parser.test.ts
```

Expected: FAIL with missing modules.

- [ ] **Step 3: Implement the rule parser**

Create `structmech-lab/utils/agent/ruleParser.ts`:

```ts
import { StructureType } from '@/types';
import type { AgentParseResult } from './types';

const chineseDigits: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
};

function readSpanCount(text: string): number | null {
  const match = text.match(/([一二三四五六]|\d+)跨/);
  if (!match) return null;
  return Number(match[1]) || chineseDigits[match[1]] || null;
}

function readMagnitude(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*kN/i);
  return match ? Number(match[1]) : null;
}

export function parseRuleInput(text: string): AgentParseResult | null {
  const normalized = text.replace(/\s+/g, '');

  if (normalized.includes('连续梁')) {
    const spans = readSpanCount(normalized) ?? 3;
    const eachSpan = Number(normalized.match(/(\d+(?:\.\d+)?)米/)?.[1] ?? 6);
    return {
      userText: text,
      summary: `识别为 ${spans} 跨连续梁`,
      confidence: 0.95,
      actions: [
        {
          kind: 'create_structure',
          payload: { structureType: StructureType.MultiSpanBeam, numSpans: spans, width: spans * eachSpan },
        },
      ],
      riskLevel: 'medium',
      requiresConfirmation: true,
    };
  }

  if (normalized.includes('集中力')) {
    const magnitude = readMagnitude(normalized) ?? 10;
    const spanIndex = Number(normalized.match(/第(\d+)跨/)?.[1] ?? 1);
    return {
      userText: text,
      summary: `识别为第 ${spanIndex} 跨集中力`,
      confidence: 0.92,
      actions: [
        {
          kind: 'add_load',
          payload: {
            loadType: 'point',
            magnitude: normalized.includes('向下') ? -magnitude : magnitude,
            direction: 'y',
            targetSpan: spanIndex,
            location: 0.5,
          },
        },
      ],
      riskLevel: 'low',
      requiresConfirmation: false,
    };
  }

  if (normalized.includes('跨长改成')) {
    const width = Number(normalized.match(/跨长改成(\d+(?:\.\d+)?)米/)?.[1] ?? 0);
    return {
      userText: text,
      summary: `识别为把跨长改为 ${width}m`,
      confidence: 0.91,
      actions: [{ kind: 'update_geometry', payload: { width } }],
      riskLevel: 'low',
      requiresConfirmation: false,
    };
  }

  if (normalized.includes('删除所有荷载') || normalized.includes('清除所有荷载')) {
    return {
      userText: text,
      summary: '识别为删除全部荷载',
      confidence: 0.93,
      actions: [{ kind: 'remove_load', payload: { scope: 'all' } }],
      riskLevel: 'high',
      requiresConfirmation: true,
    };
  }

  if (normalized.includes('固支') || normalized.includes('滚支') || normalized.includes('铰支')) {
    const target = normalized.includes('左端') ? 'left_end' : 'right_end';
    const supportType = normalized.includes('固支')
      ? 'Fixed'
      : normalized.includes('铰支')
        ? 'Pinned'
        : 'Roller';
    return {
      userText: text,
      summary: `识别为修改 ${target} 支座`,
      confidence: 0.9,
      actions: [{ kind: 'update_support', payload: { target, supportType } }],
      riskLevel: 'low',
      requiresConfirmation: false,
    };
  }

  if (normalized.includes('为什么') || normalized.includes('最大')) {
    return {
      userText: text,
      summary: '识别为结果解释请求',
      confidence: 0.88,
      actions: [{ kind: 'explain_results', payload: { question: text } }],
      riskLevel: 'low',
      requiresConfirmation: false,
    };
  }

  return null;
}
```

- [ ] **Step 4: Implement parser orchestration**

Create `structmech-lab/utils/agent/parser.ts`:

```ts
import type { AnalysisResult, SolverParams } from '@/types';
import { buildModelSummary } from './modelSummary';
import { parseRuleInput } from './ruleParser';
import { assessAgentRisk } from './risk';
import type { AgentParseResult } from './types';

interface ParserContext {
  params: SolverParams;
  results: AnalysisResult;
}

type LlmParser = (text: string, context: ParserContext) => Promise<AgentParseResult | null>;

export async function parseAgentInput(
  text: string,
  context: ParserContext,
  llmParser?: LlmParser,
): Promise<AgentParseResult> {
  const summary = buildModelSummary(context.params, context.results);
  const ruleResult = parseRuleInput(text);

  if (ruleResult && ruleResult.confidence >= 0.9) {
    const risk = assessAgentRisk(context.params, ruleResult.actions);
    return { ...ruleResult, riskLevel: risk.level, requiresConfirmation: risk.requiresConfirmation };
  }

  if (llmParser) {
    const llmResult = await llmParser(text, context);
    if (llmResult) return llmResult;
  }

  return {
    userText: text,
    summary: `当前模型：${summary.structureLabel}。需要进一步确认用户意图。`,
    confidence: 0.3,
    actions: [],
    riskLevel: 'medium',
    requiresConfirmation: true,
    clarification: '请补充结构位置、荷载类型或目标对象。',
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:

```bash
cd 'Structure Analysis/structmech-lab' && npm run test -- utils/agent/ruleParser.test.ts utils/agent/parser.test.ts
```

Expected: PASS

- [ ] **Step 6: Local checkpoint**

Run:

```bash
cd 'Structure Analysis/structmech-lab' && npm run typecheck
```

Expected: PASS

## Task 4: Shared AI Client And LLM-Assisted Parsing

**Files:**

- Create: `structmech-lab/utils/aiClient.ts`
- Create: `structmech-lab/utils/agent/llmParser.ts`
- Modify: `structmech-lab/utils/agent/explainer.ts`
- Modify: `structmech-lab/components/AITutor.tsx`

- [ ] **Step 1: Write the failing llm parser test**

Append to `structmech-lab/utils/agent/parser.test.ts`:

```ts
test('falls back to llm parser when the sentence is ambiguous but still returns structured actions', async () => {
  const llm = vi.fn().mockResolvedValue({
    userText: '把它再大一点',
    summary: '识别为把上一次荷载增大到 30kN',
    confidence: 0.74,
    actions: [{ kind: 'update_load', payload: { loadId: 'load-1', magnitude: -30 } }],
    riskLevel: 'medium',
    requiresConfirmation: true,
  });

  const result = await parseAgentInput('把它再大一点', { params, results: { elements: [], maxDeflection: 0, reactions: [], displacements: [] } }, llm);

  expect(llm).toHaveBeenCalledTimes(1);
  expect(result.actions[0].kind).toBe('update_load');
});
```

- [ ] **Step 2: Run the test to verify the red state**

Run:

```bash
cd 'Structure Analysis/structmech-lab' && npm run test -- utils/agent/parser.test.ts
```

Expected: FAIL until LLM path is wired in.

- [ ] **Step 3: Extract the shared AI client**

Create `structmech-lab/utils/aiClient.ts`:

```ts
import { AI_MODELS } from './aiModels';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function sendChatCompletion(messages: AIMessage[]): Promise<string> {
  const apiKey = localStorage.getItem('ai_api_key');
  const modelId = localStorage.getItem('ai_model') || 'deepseek';
  const model = AI_MODELS.find(item => item.id === modelId) ?? AI_MODELS[0];

  if (!apiKey) {
    throw new Error('未配置 API Key');
  }

  const response = await fetch(model.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model.model,
      messages,
      max_tokens: 400,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content ?? '';
}
```

- [ ] **Step 4: Implement LLM parser and refactor AITutor**

Create `structmech-lab/utils/agent/llmParser.ts`:

```ts
import type { AnalysisResult, SolverParams } from '@/types';
import { sendChatCompletion } from '@/utils/aiClient';
import type { AgentParseResult } from './types';

export async function parseWithLLM(
  text: string,
  context: { params: SolverParams; results: AnalysisResult; modelSummary: string },
): Promise<AgentParseResult | null> {
  const response = await sendChatCompletion([
    {
      role: 'system',
      content:
        '你是结构求解器 Agent。只返回 JSON，字段必须包含 userText, summary, confidence, actions, riskLevel, requiresConfirmation。',
    },
    {
      role: 'user',
      content: `当前模型：${context.modelSummary}\n用户输入：${text}`,
    },
  ]);

  try {
    return JSON.parse(response) as AgentParseResult;
  } catch {
    return null;
  }
}
```

Extend `structmech-lab/utils/agent/explainer.ts` with semantic explanation:

```ts
import { sendChatCompletion } from '@/utils/aiClient';

export async function explainResultsWithLLM(context: AgentExplainerContext, question: string): Promise<string> {
  const prompt = buildExplainerPrompt(context, question);
  const response = await sendChatCompletion([
    { role: 'system', content: '你是结构力学助教。只能根据提供的事实解释，不得编造数值。' },
    { role: 'user', content: prompt },
  ]);
  return response.trim();
}
```

Refactor `structmech-lab/components/AITutor.tsx` so `callAIAPI` only 组装 messages，并调用 `sendChatCompletion`：

```ts
import { sendChatCompletion } from '../utils/aiClient';

const response = await sendChatCompletion([
  { role: 'system', content: systemPrompt },
  ...messages.map(m => ({ role: m.role, content: m.content })),
  { role: 'user', content: userMessage },
]);
return response || '抱歉，我没有理解你的问题。';
```

- [ ] **Step 5: Update parser orchestration to call the LLM implementation**

Change `structmech-lab/utils/agent/parser.ts` to pass `modelSummary` into `llmParser`:

```ts
import { describeModelSummary, buildModelSummary } from './modelSummary';
import { parseWithLLM } from './llmParser';

const modelSummary = describeModelSummary(buildModelSummary(context.params, context.results));

if (llmParser) {
  const llmResult = await llmParser(text, context);
  if (llmResult) return llmResult;
}

const fallback = await parseWithLLM(text, { ...context, modelSummary });
if (fallback) return fallback;
```

- [ ] **Step 6: Run the parser tests and typecheck**

Run:

```bash
cd 'Structure Analysis/structmech-lab' && npm run test -- utils/agent/parser.test.ts && npm run typecheck
```

Expected: PASS

## Task 5: Atomic Executor, Geometry Mapping, And Undo Snapshots

**Files:**

- Create: `structmech-lab/utils/agent/executor.ts`
- Create: `structmech-lab/utils/agent/executor.test.ts`

- [ ] **Step 1: Write the failing executor tests**

Create `structmech-lab/utils/agent/executor.test.ts`:

```ts
import { expect, test } from 'vitest';
import { StructureType, type SolverParams } from '@/types';
import { applyAgentActions } from './executor';

const baseParams: SolverParams = {
  structureType: StructureType.PortalFrame,
  stiffnessType: 'Elastic',
  width: 10,
  height: 5,
  roofHeight: 0,
  numSpans: 2,
  numStories: 1,
  numBays: 1,
  elasticModulus: 200,
  crossSectionArea: 50,
  momentOfInertia: 200,
  nodes: [],
  elements: [],
  loads: [],
};

test('creates a three-span beam and appends a midpoint load in the same atomic pass', () => {
  const result = applyAgentActions(baseParams, [
    { kind: 'create_structure', payload: { structureType: StructureType.MultiSpanBeam, numSpans: 3, width: 18 } },
    { kind: 'add_load', payload: { loadType: 'point', magnitude: -20, direction: 'y', targetSpan: 2, location: 0.5 } },
  ]);

  expect(result.params.structureType).toBe(StructureType.MultiSpanBeam);
  expect(result.params.loads).toHaveLength(1);
  expect(result.params.loads[0].elementId).toBe(2);
});

test('maps left-end support updates onto the regenerated nodes', () => {
  const result = applyAgentActions(baseParams, [
    { kind: 'create_structure', payload: { structureType: StructureType.Beam, width: 6 } },
    { kind: 'update_support', payload: { target: 'left_end', supportType: 'Fixed' } },
  ]);

  expect(result.params.nodes[0].restraints).toEqual([true, true, true]);
});

test('updates material, rewrites a load, and removes all loads when requested', () => {
  const result = applyAgentActions(
    {
      ...baseParams,
      loads: [{ id: 'load-1', type: 'point', magnitude: -10, direction: 'y', elementId: 1, location: 0.5 }],
    },
    [
      { kind: 'update_material', payload: { elasticModulus: 210, crossSectionArea: 60 } },
      { kind: 'update_load', payload: { loadId: 'load-1', magnitude: -30 } },
      { kind: 'remove_load', payload: { scope: 'all' } },
    ],
  );

  expect(result.params.elasticModulus).toBe(210);
  expect(result.params.crossSectionArea).toBe(60);
  expect(result.params.loads).toHaveLength(0);
});
```

- [ ] **Step 2: Run the tests to verify the failures**

Run:

```bash
cd 'Structure Analysis/structmech-lab' && npm run test -- utils/agent/executor.test.ts
```

Expected: FAIL with missing module.

- [ ] **Step 3: Implement the executor**

Create `structmech-lab/utils/agent/executor.ts`:

```ts
import { StructureType, type Load, type SolverNode, type SolverParams } from '@/types';
import { generateGeometry } from '@/utils/geometryGenerator';
import type { AgentAction, AgentExecutionResult } from './types';

function supportToRestraints(supportType: string): [boolean, boolean, boolean] {
  if (supportType === 'Fixed') return [true, true, true];
  if (supportType === 'Pinned') return [true, true, false];
  if (supportType === 'Roller') return [false, true, false];
  return [false, false, false];
}

function regenerateGeometry(params: SolverParams): SolverParams {
  if (params.structureType === StructureType.Custom) return params;
  const geometry = generateGeometry(
    params.structureType,
    params.width,
    params.height,
    params.roofHeight,
    params.elasticModulus,
    params.crossSectionArea,
    params.momentOfInertia,
    params.numSpans,
    params.numStories,
    params.numBays,
  );
  return { ...params, nodes: geometry.nodes, elements: geometry.elements };
}

function targetElementId(params: SolverParams, targetSpan: number): number {
  return params.elements[targetSpan - 1]?.id ?? params.elements[0]?.id ?? 1;
}

export function applyAgentActions(params: SolverParams, actions: AgentAction[]): AgentExecutionResult {
  let draft = regenerateGeometry({ ...params, loads: [...params.loads], nodes: [...params.nodes], elements: [...params.elements] });

  for (const action of actions) {
    if (action.kind === 'create_structure') {
      draft = regenerateGeometry({
        ...draft,
        structureType: action.payload.structureType as StructureType,
        numSpans: Number(action.payload.numSpans ?? draft.numSpans),
        width: Number(action.payload.width ?? draft.width),
        loads: [],
      });
    }

    if (action.kind === 'add_load') {
      const load: Load = {
        id: `agent-${draft.loads.length + 1}`,
        type: action.payload.loadType as Load['type'],
        magnitude: Number(action.payload.magnitude),
        direction: (action.payload.direction as 'x' | 'y') ?? 'y',
        elementId: targetElementId(draft, Number(action.payload.targetSpan ?? 1)),
        location: Number(action.payload.location ?? 0.5),
      };
      draft = { ...draft, loads: [...draft.loads, load] };
    }

    if (action.kind === 'update_geometry') {
      draft = regenerateGeometry({
        ...draft,
        width: Number(action.payload.width ?? draft.width),
        height: Number(action.payload.height ?? draft.height),
        roofHeight: Number(action.payload.roofHeight ?? draft.roofHeight),
        numSpans: Number(action.payload.numSpans ?? draft.numSpans),
        numStories: Number(action.payload.numStories ?? draft.numStories),
        numBays: Number(action.payload.numBays ?? draft.numBays),
      });
    }

    if (action.kind === 'update_material') {
      draft = regenerateGeometry({
        ...draft,
        elasticModulus: Number(action.payload.elasticModulus ?? draft.elasticModulus),
        crossSectionArea: Number(action.payload.crossSectionArea ?? draft.crossSectionArea),
        momentOfInertia: Number(action.payload.momentOfInertia ?? draft.momentOfInertia),
      });
    }

    if (action.kind === 'update_load') {
      draft = {
        ...draft,
        loads: draft.loads.map(existing =>
          existing.id === action.payload.loadId
            ? {
                ...existing,
                magnitude: Number(action.payload.magnitude ?? existing.magnitude),
                location: Number(action.payload.location ?? existing.location ?? 0.5),
              }
            : existing,
        ),
      };
    }

    if (action.kind === 'remove_load') {
      draft = {
        ...draft,
        loads: action.payload.scope === 'all' ? [] : draft.loads.filter(load => load.id !== action.payload.loadId),
      };
    }

    if (action.kind === 'update_support') {
      const target = action.payload.target;
      const supportType = String(action.payload.supportType);
      const targetNode = target === 'right_end' ? draft.nodes[draft.nodes.length - 1] : draft.nodes[0];
      const nodes = draft.nodes.map((node: SolverNode) =>
        node.id === targetNode.id ? { ...node, restraints: supportToRestraints(supportType) } : node,
      );
      draft = { ...draft, nodes };
    }
  }

  return {
    params: draft,
    summary: `已执行 ${actions.length} 个 Agent 动作`,
    appliedActions: actions,
  };
}
```

- [ ] **Step 4: Add snapshot helpers for undo**

Extend `structmech-lab/utils/agent/executor.ts`:

```ts
import type { AgentSnapshot } from './types';

export function createAgentSnapshot(params: SolverParams, summary: string): AgentSnapshot {
  return {
    params: JSON.parse(JSON.stringify(params)) as SolverParams,
    summary,
    createdAt: Date.now(),
  };
}
```

- [ ] **Step 5: Run the tests and typecheck**

Run:

```bash
cd 'Structure Analysis/structmech-lab' && npm run test -- utils/agent/executor.test.ts && npm run typecheck
```

Expected: PASS

## Task 6: Agent Panel UI And Solver Integration

**Files:**

- Create: `structmech-lab/components/solver/AgentActionCard.tsx`
- Create: `structmech-lab/components/solver/AgentMessageList.tsx`
- Create: `structmech-lab/components/solver/AgentPanel.tsx`
- Create: `structmech-lab/components/solver/AgentPanel.test.tsx`
- Modify: `structmech-lab/components/SolverModule.tsx`

- [ ] **Step 1: Write the failing Agent panel test**

Create `structmech-lab/components/solver/AgentPanel.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { StructureType, type AnalysisResult, type SolverParams } from '@/types';
import AgentPanel from './AgentPanel';

const params: SolverParams = {
  structureType: StructureType.Beam,
  stiffnessType: 'Elastic',
  width: 6,
  height: 0,
  roofHeight: 0,
  numSpans: 1,
  numStories: 1,
  numBays: 1,
  elasticModulus: 200,
  crossSectionArea: 50,
  momentOfInertia: 200,
  nodes: [],
  elements: [],
  loads: [],
};

const results: AnalysisResult = {
  elements: [],
  maxDeflection: 0,
  reactions: [],
  displacements: [],
};

test('shows a confirmation card when the parsed action requires confirmation', async () => {
  const onApply = vi.fn();
  render(
    <AgentPanel
      params={params}
      results={results}
      parseInput={async () => ({
        userText: '建一个三跨连续梁',
        summary: '识别为三跨连续梁',
        confidence: 0.95,
        actions: [{ kind: 'create_structure', payload: { structureType: StructureType.MultiSpanBeam, numSpans: 3, width: 18 } }],
        riskLevel: 'high',
        requiresConfirmation: true,
      })}
      onApplyActions={onApply}
      onExplainResults={async () => '最大位移为 0.0120 m，跨中弯矩控制。'}
      onUndo={() => {}}
      canUndo={false}
    />,
  );

  fireEvent.change(screen.getByPlaceholderText('输入建模或荷载指令...'), { target: { value: '建一个三跨连续梁' } });
  fireEvent.click(screen.getByRole('button', { name: '发送' }));

  expect(await screen.findByText('识别为三跨连续梁')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '确认执行' })).toBeInTheDocument();
  expect(onApply).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test to verify the failure**

Run:

```bash
cd 'Structure Analysis/structmech-lab' && npm run test -- components/solver/AgentPanel.test.tsx
```

Expected: FAIL with missing component modules.

- [ ] **Step 3: Implement the action card and message list**

Create `structmech-lab/components/solver/AgentActionCard.tsx`:

```tsx
import React from 'react';
import type { AgentParseResult } from '@/utils/agent/types';

interface AgentActionCardProps {
  parsed: AgentParseResult;
  onConfirm: () => void;
}

const AgentActionCard: React.FC<AgentActionCardProps> = ({ parsed, onConfirm }) => (
  <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3">
    <p className="text-sm font-semibold text-amber-100">{parsed.summary}</p>
    <p className="mt-1 text-xs text-amber-200/80">风险等级：{parsed.riskLevel}</p>
    <button
      type="button"
      onClick={onConfirm}
      className="mt-3 rounded-xl bg-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-900"
    >
      确认执行
    </button>
  </div>
);

export default AgentActionCard;
```

Create `structmech-lab/components/solver/AgentMessageList.tsx`:

```tsx
import React from 'react';

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const AgentMessageList: React.FC<{ messages: AgentMessage[] }> = ({ messages }) => (
  <div className="space-y-3 overflow-y-auto px-1 py-1">
    {messages.map(message => (
      <div
        key={message.id}
        className={`rounded-2xl px-4 py-3 text-sm ${
          message.role === 'user' ? 'ml-10 bg-sky-500 text-slate-950' : 'mr-10 bg-slate-800 text-slate-100'
        }`}
      >
        {message.content}
      </div>
    ))}
  </div>
);

export default AgentMessageList;
```

- [ ] **Step 4: Implement AgentPanel**

Create `structmech-lab/components/solver/AgentPanel.tsx`:

```tsx
import React, { useState } from 'react';
import type { AnalysisResult, SolverParams } from '@/types';
import type { AgentAction, AgentParseResult } from '@/utils/agent/types';
import AgentActionCard from './AgentActionCard';
import AgentMessageList, { type AgentMessage } from './AgentMessageList';

interface AgentPanelProps {
  params: SolverParams;
  results: AnalysisResult;
  parseInput: (text: string) => Promise<AgentParseResult>;
  onApplyActions: (actions: AgentAction[], summary: string) => void;
  onExplainResults: (question: string) => Promise<string>;
  onUndo: () => void;
  canUndo: boolean;
}

const AgentPanel: React.FC<AgentPanelProps> = ({ parseInput, onApplyActions, onExplainResults, onUndo, canUndo }) => {
  const [value, setValue] = useState('');
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [pending, setPending] = useState<AgentParseResult | null>(null);

  async function handleSend() {
    if (!value.trim()) return;
    const text = value.trim();
    setMessages(prev => [...prev, { id: `user-${prev.length}`, role: 'user', content: text }]);
    setValue('');

    const parsed = await parseInput(text);
    setMessages(prev => [...prev, { id: `assistant-${prev.length}`, role: 'assistant', content: parsed.summary }]);

    if (parsed.requiresConfirmation) {
      setPending(parsed);
      return;
    }

    if (parsed.actions[0]?.kind === 'explain_results') {
      const reply = await onExplainResults(String(parsed.actions[0].payload.question ?? text));
      setMessages(prev => [...prev, { id: `assistant-explain-${prev.length}`, role: 'assistant', content: reply }]);
      return;
    }

    onApplyActions(parsed.actions, parsed.summary);
  }

  function handleConfirm() {
    if (!pending) return;
    onApplyActions(pending.actions, pending.summary);
    setPending(null);
  }

  return (
    <section className="flex-shrink-0 rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-100">Agent 模式</h2>
          <p className="text-xs text-slate-400">自然语言建模、改荷载、问结果</p>
        </div>
        <button
          type="button"
          disabled={!canUndo}
          onClick={onUndo}
          className="rounded-xl border border-slate-700 px-3 py-1.5 text-xs text-slate-200 disabled:opacity-40"
        >
          撤销上一步
        </button>
      </div>

      <div className="max-h-56 overflow-hidden rounded-xl bg-slate-950/60 p-2">
        <AgentMessageList messages={messages} />
      </div>

      {pending ? <div className="mt-3"><AgentActionCard parsed={pending} onConfirm={handleConfirm} /></div> : null}

      <div className="mt-3 flex gap-2">
        <input
          value={value}
          onChange={event => setValue(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') void handleSend();
          }}
          placeholder="输入建模或荷载指令..."
          className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none"
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          className="rounded-xl bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950"
        >
          发送
        </button>
      </div>
    </section>
  );
};

export default AgentPanel;
```

- [ ] **Step 5: Integrate AgentPanel into SolverModule**

Modify `structmech-lab/components/SolverModule.tsx`:

```tsx
import AgentPanel from './solver/AgentPanel';
import { parseAgentInput } from '../utils/agent/parser';
import { applyAgentActions, createAgentSnapshot } from '../utils/agent/executor';
import { explainResultsWithLLM, summarizeResultFacts } from '../utils/agent/explainer';
import type { AgentSnapshot } from '../utils/agent/types';

const [agentSnapshots, setAgentSnapshots] = useState<AgentSnapshot[]>([]);

const handleApplyAgentActions = (actions: AgentAction[], summary: string) => {
  setAgentSnapshots(prev => [...prev, createAgentSnapshot(params, summary)]);
  const execution = applyAgentActions(params, actions);
  setParams(execution.params);
};

const handleUndoAgentAction = () => {
  setAgentSnapshots(prev => {
    const previous = prev[prev.length - 1];
    if (previous) setParams(previous.params);
    return prev.slice(0, -1);
  });
};

const handleExplainResults = async (question: string) => {
  const facts = summarizeResultFacts(params, results).join('；');
  try {
    return await explainResultsWithLLM({ params, results, loads: params.loads }, question);
  } catch {
    return facts;
  }
};

<AgentPanel
  params={params}
  results={results}
  parseInput={(text) => parseAgentInput(text, { params, results })}
  onApplyActions={handleApplyAgentActions}
  onExplainResults={handleExplainResults}
  onUndo={handleUndoAgentAction}
  canUndo={agentSnapshots.length > 0}
/>
```

Render it inside the main column just above `ResultsPanel`.

- [ ] **Step 6: Run the component test, full test suite, and typecheck**

Run:

```bash
cd 'Structure Analysis/structmech-lab' && npm run test -- components/solver/AgentPanel.test.tsx && npm run test && npm run typecheck
```

Expected: PASS

- [ ] **Step 7: Manual verification checklist**

Run:

```bash
cd 'Structure Analysis/structmech-lab' && npm run dev
```

Verify these flows in the browser:

```text
1. 输入“建一个三跨连续梁，跨长都 6 米”，面板先显示确认卡。
2. 点击“确认执行”，结构切换为连续梁，原模型被替换。
3. 输入“在第二跨跨中加 20kN 向下集中力”，荷载直接落到第二跨。
4. 输入“把左端改成固支”，左端支座图示更新。
5. 输入“删除所有荷载”，面板先显示确认卡，确认后荷载清空。
6. 输入“最大位移是多少”，面板返回事实型摘要。
7. 输入“为什么这里弯矩最大”，面板返回基于事实的工程语义解释。
8. 点击“撤销上一步”，结构状态回退到前一个 Agent 快照。
```

- [ ] **Step 8: Local checkpoint**

Run:

```bash
cd 'Structure Analysis/structmech-lab' && npm run build
```

Expected: PASS
