import { StructureType, type Load, type SolverNode, type SolverParams } from '@/types';
import { generateGeometry } from '@/utils/geometryGenerator';
import { DEFAULT_LOAD_CASE_ID, getActiveLoadCaseId } from '@/utils/loadCases';
import { describeAgentAction } from './actionText';
import type { AgentAction, AgentExecutionResult, AgentSessionState, AgentSnapshot } from './types';

function cloneParams(params: SolverParams): SolverParams {
  return JSON.parse(JSON.stringify(params)) as SolverParams;
}

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
    params.overhangLeft,
    params.overhangRight,
  );
  return { ...params, nodes: geometry.nodes, elements: geometry.elements };
}

function targetElementId(params: SolverParams, targetSpan: number): number {
  return params.elements[targetSpan - 1]?.id ?? params.elements[0]?.id ?? 1;
}

function clampLocation(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function parseNumeric(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveTargetLoad(params: SolverParams, action: AgentAction): Load | undefined {
  if (typeof action.payload.loadId === 'string') {
    return params.loads.find(load => load.id === action.payload.loadId);
  }

  const ordinal = Number(action.payload.loadOrdinal);
  if (Number.isInteger(ordinal) && ordinal >= 1) {
    return params.loads[ordinal - 1];
  }

  return undefined;
}

export function applyAgentActions(params: SolverParams, actions: AgentAction[]): AgentExecutionResult {
  let draft = regenerateGeometry(cloneParams(params));
  const warnings: string[] = [];
  const appliedActions: AgentAction[] = [];

  for (const action of actions) {
    const currentLoadCaseId = getActiveLoadCaseId(draft);

    if (action.kind === 'create_structure') {
      draft = regenerateGeometry({
        ...draft,
        structureType: (action.payload.structureType as StructureType) ?? draft.structureType,
        width: parseNumeric(action.payload.width, draft.width),
        height: parseNumeric(action.payload.height, draft.height),
        roofHeight: parseNumeric(action.payload.roofHeight, draft.roofHeight),
        numSpans: parseNumeric(action.payload.numSpans, draft.numSpans),
        numStories: parseNumeric(action.payload.numStories, draft.numStories),
        numBays: parseNumeric(action.payload.numBays, draft.numBays),
        overhangLeft: parseNumeric(action.payload.overhangLeft, draft.overhangLeft),
        overhangRight: parseNumeric(action.payload.overhangRight, draft.overhangRight),
        loads: [],
      });
      appliedActions.push(action);
    }

    if (action.kind === 'create_custom_structure') {
      const payloadNodes = Array.isArray(action.payload.nodes) ? action.payload.nodes : [];
      const payloadElements = Array.isArray(action.payload.elements) ? action.payload.elements : [];
      const payloadLoads = Array.isArray(action.payload.loads) ? action.payload.loads : [];

      if (payloadNodes.length >= 2 && payloadElements.length >= 1) {
        const nodes: SolverNode[] = payloadNodes.map((n: { id?: number; x?: number; y?: number; restraints?: [boolean, boolean, boolean] }, idx: number) => ({
          id: typeof n.id === 'number' ? n.id : idx + 1,
          x: parseNumeric(n.x, 0),
          y: parseNumeric(n.y, 0),
          restraints: Array.isArray(n.restraints) && n.restraints.length === 3
            ? n.restraints.map(Boolean) as [boolean, boolean, boolean]
            : [false, false, false],
        }));

        const elements = payloadElements.map((e: { id?: number; startNode?: number; endNode?: number; releaseStart?: boolean; releaseEnd?: boolean }, idx: number) => ({
          id: typeof e.id === 'number' ? e.id : idx + 1,
          startNode: parseNumeric(e.startNode, 1),
          endNode: parseNumeric(e.endNode, 2),
          E: draft.elasticModulus,
          A: draft.crossSectionArea,
          I: draft.momentOfInertia,
          releaseStart: Boolean(e.releaseStart),
          releaseEnd: Boolean(e.releaseEnd),
        }));

        const loads: Load[] = payloadLoads.map((l: { type?: string; magnitude?: number; direction?: string; elementId?: number; nodeId?: number; location?: number }, idx: number) => ({
          id: `vision-${idx + 1}`,
          type: (['point', 'distributed', 'moment'].includes(String(l.type)) ? l.type : 'point') as Load['type'],
          magnitude: parseNumeric(l.magnitude, -10),
          direction: (l.direction === 'x' ? 'x' : 'y') as 'x' | 'y',
          elementId: typeof l.elementId === 'number' ? l.elementId : elements[0]?.id,
          nodeId: typeof l.nodeId === 'number' ? l.nodeId : undefined,
          location: clampLocation(parseNumeric(l.location, 0.5)),
          loadCaseId: currentLoadCaseId,
        }));

        const xs = nodes.map(n => n.x);
        const ys = nodes.map(n => n.y);

        draft = {
          ...draft,
          structureType: StructureType.Custom,
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys),
          nodes,
          elements,
          loads,
        };
        appliedActions.push(action);
      } else {
        warnings.push(`自定义结构需要至少 2 个节点和 1 个单元，当前识别到 ${payloadNodes.length} 个节点和 ${payloadElements.length} 个单元。`);
      }
    }

    if (action.kind === 'update_geometry') {
      draft = regenerateGeometry({
        ...draft,
        width: parseNumeric(action.payload.width, draft.width),
        height: parseNumeric(action.payload.height, draft.height),
        roofHeight: parseNumeric(action.payload.roofHeight, draft.roofHeight),
        numSpans: parseNumeric(action.payload.numSpans, draft.numSpans),
        numStories: parseNumeric(action.payload.numStories, draft.numStories),
        numBays: parseNumeric(action.payload.numBays, draft.numBays),
        overhangLeft: parseNumeric(action.payload.overhangLeft, draft.overhangLeft),
        overhangRight: parseNumeric(action.payload.overhangRight, draft.overhangRight),
      });
      appliedActions.push(action);
    }

    if (action.kind === 'update_material') {
      draft = regenerateGeometry({
        ...draft,
        elasticModulus: parseNumeric(action.payload.elasticModulus, draft.elasticModulus),
        crossSectionArea: parseNumeric(action.payload.crossSectionArea, draft.crossSectionArea),
        momentOfInertia: parseNumeric(action.payload.momentOfInertia, draft.momentOfInertia),
      });
      appliedActions.push(action);
    }

    if (action.kind === 'add_load') {
      const requestedSpan = parseNumeric(action.payload.targetSpan, 1);
      if (requestedSpan > draft.elements.length) {
        warnings.push(`未找到第 ${requestedSpan} 跨，已改为作用在当前可用单元上。`);
      }
      const loadId = typeof action.payload.loadId === 'string' ? action.payload.loadId : `agent-${draft.loads.length + 1}`;
      const load: Load = {
        id: loadId,
        type: (action.payload.loadType as Load['type']) ?? 'point',
        magnitude: parseNumeric(action.payload.magnitude, -10),
        direction: (action.payload.direction as 'x' | 'y') ?? 'y',
        elementId: targetElementId(draft, requestedSpan),
        location: clampLocation(parseNumeric(action.payload.location, 0.5)),
        loadCaseId: currentLoadCaseId || DEFAULT_LOAD_CASE_ID,
      };
      draft = { ...draft, loads: [...draft.loads, load] };
      appliedActions.push({ ...action, payload: { ...action.payload, loadId } });
    }

    if (action.kind === 'update_load') {
      const existingLoad = resolveTargetLoad(draft, action);
      const targetLoadId = existingLoad?.id;
      if (!existingLoad || !targetLoadId) {
        warnings.push(
          typeof action.payload.loadId === 'string'
            ? `未找到荷载 ${action.payload.loadId}，本次未完成修改。`
            : typeof action.payload.loadOrdinal === 'number'
              ? `未找到第 ${action.payload.loadOrdinal} 个荷载，本次未完成修改。`
              : '缺少要修改的荷载标识，本次未完成修改。',
        );
        continue;
      }
      draft = {
        ...draft,
        loads: draft.loads.map(existing =>
          existing.id === targetLoadId
            ? {
                ...existing,
                magnitude:
                  action.payload.magnitudeScale !== undefined
                    ? existing.magnitude * parseNumeric(action.payload.magnitudeScale, 1)
                    : action.payload.magnitudeDelta !== undefined
                    ? existing.magnitude + parseNumeric(action.payload.magnitudeDelta, 0)
                    : parseNumeric(action.payload.magnitude, existing.magnitude),
                location:
                  action.payload.locationDelta !== undefined
                    ? clampLocation((existing.location ?? 0.5) + parseNumeric(action.payload.locationDelta, 0))
                    : clampLocation(parseNumeric(action.payload.location, existing.location ?? 0.5)),
                direction: (action.payload.direction as 'x' | 'y') ?? existing.direction,
                elementId:
                  action.payload.targetSpan !== undefined
                    ? targetElementId(draft, parseNumeric(action.payload.targetSpan, 1))
                    : existing.elementId,
              }
            : existing,
        ),
      };
      appliedActions.push({ ...action, payload: { ...action.payload, loadId: targetLoadId } });
    }

    if (action.kind === 'remove_load') {
      const targetLoad = action.payload.scope === 'all' ? undefined : resolveTargetLoad(draft, action);
      if (action.payload.scope !== 'all' && !targetLoad) {
        warnings.push(
          typeof action.payload.loadId === 'string'
            ? `未找到荷载 ${action.payload.loadId}，本次未完成删除。`
            : typeof action.payload.loadOrdinal === 'number'
              ? `未找到第 ${action.payload.loadOrdinal} 个荷载，本次未完成删除。`
              : '缺少要删除的荷载标识，本次未完成删除。',
        );
        continue;
      }
      draft = {
        ...draft,
        loads: action.payload.scope === 'all' ? [] : draft.loads.filter(load => load.id !== targetLoad?.id),
      };
      appliedActions.push(targetLoad ? { ...action, payload: { ...action.payload, loadId: targetLoad.id } } : action);
    }

    if (action.kind === 'update_support') {
      const targetNode = action.payload.target === 'right_end' ? draft.nodes[draft.nodes.length - 1] : draft.nodes[0];
      if (targetNode) {
        const restraints = supportToRestraints(String(action.payload.supportType ?? 'Free'));
        draft = {
          ...draft,
          nodes: draft.nodes.map((node: SolverNode) => (node.id === targetNode.id ? { ...node, restraints } : node)),
        };
        appliedActions.push(action);
      } else {
        warnings.push('当前结构未找到可修改的端部支座节点。');
      }
    }
  }

  return {
    params: draft,
    summary:
      appliedActions.length > 0
        ? appliedActions.map(action => describeAgentAction(action, 'past')).join('；')
        : '未执行任何 Agent 动作',
    appliedActions,
    warning: warnings.length > 0 ? warnings.join('；') : undefined,
  };
}

export function createAgentSnapshot(params: SolverParams, summary: string, session?: AgentSessionState): AgentSnapshot {
  return {
    params: cloneParams(params),
    session: session ? { ...session } : undefined,
    summary,
    createdAt: Date.now(),
  };
}
