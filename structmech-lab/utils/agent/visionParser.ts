import type { AgentAction, AgentParseResult } from './types';
import {
  sendVisionCompletion,
  compressImageIfNeeded,
  type MultimodalContentPart,
  type VisionMessage,
} from '@/utils/visionClient';

// ══════════════════════════════════════════════════════
// 直接识别：模型直接输出 JSON 结构
// 不使用网格，直接从原图识别
// ══════════════════════════════════════════════════════

function buildDirectPrompt(userHint?: string): string {
  const hintLine = userHint ? `\n用户补充信息：${userHint}` : '';
  return [
    '请识别这张结构力学图片。分四步回答：',
    hintLine,
    '',
    '## 第一步：描述结构',
    '简要描述结构类型（梁/刚架/桁架/组合结构）、形状、对称性。',
    '',
    '## 第二步：列出节点表',
    '仔细读取图中标注的尺寸，累加计算每个节点的精确坐标。',
    '只在以下位置设置节点：支座、内铰、杆件端点、杆件交叉点。',
    '荷载作用点不需要节点（荷载用坐标定位）。',
    '',
    '格式：',
    '| 节点 | x(m) | y(m) | 支座类型 | 是否内铰 |',
    '| A | 0 | 0 | fixed | 否 |',
    '| B | 4 | 0 | roller | 否 |',
    '| C | 6 | 0 | none | 是 |',
    '',
    '【如何区分支座和内铰】',
    '- 支座（support）：三角形▽在梁的下方，支撑地面。有 fixed/pin/roller',
    '- 内铰（hinge）：小圆圈○在梁上，表示弯矩释放。support 填 "none"，内铰填"是"',
    '- 有些位置既是支座又有内铰（如滚动支座上方有圆圈），此时 support 填支座类型，内铰也填"是"',
    '',
    '【support 取值】',
    '- "fixed": 固定端（墙壁嵌入，左侧或右侧有斜线阴影，约束水平+竖向+转角）',
    '- "guided": 定向支座（墙壁+两根水平链杆/导轨，约束竖向+转角，允许水平滑动）',
    '- "pin": 铰支座（三角形▽紧贴地面，约束水平+竖向）',
    '- "roller": 滚动支座（三角形▽下有滚轮/圆点/横线，只约束一个方向）',
    '- "none": 无支座（自由节点、纯内铰点、杆件端点）',
    '',
    '## 第三步：输出 JSON',
    '严格按照第二步节点表生成 JSON。坐标和类型必须与节点表完全一致。',
    '',
    '示例（多跨静定梁：固定端A + 两个滚动支座B,D + 内铰C + 自由端E）：',
    '```json',
    '{',
    '  "nodes": [',
    '    {"id": 1, "x": 0, "y": 0, "support": "fixed"},',
    '    {"id": 2, "x": 4, "y": 0, "support": "roller"},',
    '    {"id": 3, "x": 6, "y": 0, "support": "none"},',
    '    {"id": 4, "x": 10, "y": 0, "support": "roller"},',
    '    {"id": 5, "x": 14, "y": 0, "support": "none"}',
    '  ],',
    '  "elements": [',
    '    {"start": 1, "end": 2},',
    '    {"start": 2, "end": 3, "releaseEnd": true},',
    '    {"start": 3, "end": 4, "releaseStart": true},',
    '    {"start": 4, "end": 5}',
    '  ],',
    '  "loads": [',
    '    {"type": "point", "x": 2, "y": 0, "fx": 0, "fy": -10},',
    '    {"type": "distributed", "x1": 10, "y1": 0, "x2": 14, "y2": 0, "qx": 0, "qy": -5}',
    '  ]',
    '}',
    '```',
    '',
    '【elements 规则】',
    '- 每条可见直线段 = 一个 element',
    '- 内铰处：相邻两个 element 在铰节点端分别设置 releaseEnd/releaseStart 为 true',
    '- 没有铰的 element 不写 releaseStart/releaseEnd',
    '',
    '【loads 规则】',
    '- 集中力: {"type": "point", "x": 坐标, "y": 坐标, "fx": 水平力, "fy": 竖向力}',
    '- 均布荷载: {"type": "distributed", "x1": 起点x, "y1": 起点y, "x2": 终点x, "y2": 终点y, "qx": 0, "qy": -10}',
    '- 力矩: {"type": "moment", "x": 坐标, "y": 坐标, "m": 值}（逆时针为正）',
    '- 向下为负 fy，向左为负 fx',
    '- 无力学荷载（如只有温度）则 loads 为空数组 []',
    '',
    '【坐标规则】',
    '- X 轴向右为正，Y 轴向上为正',
    '- 左端支座为原点 (0,0)',
    '- 单位：米。根据图中标注累加计算精确坐标',
    '',
    '## 第四步：自查',
    '检查 JSON 是否满足：',
    '1. 节点坐标与第二步节点表一致',
    '2. 每个内铰的两侧 element 都设置了 release',
    '3. element 数量 = 节点数 - 1（对于梁结构）',
    '4. 所有荷载坐标在结构范围内',
  ].join('\n');
}

function extractJsonPayload(content: string): string | null {
  const trimmed = content.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);

  return null;
}

const allowedActionKinds = new Set<AgentAction['kind']>([
  'create_structure',
  'create_custom_structure',
  'update_geometry',
  'update_material',
  'add_load',
  'update_support',
]);

function isValidCustomStructure(action: unknown): boolean {
  if (!action || typeof action !== 'object') return false;
  const a = action as { kind?: string; payload?: { nodes?: unknown[]; elements?: unknown[] } };
  if (a.kind !== 'create_custom_structure') return false;
  const p = a.payload;
  if (!p || typeof p !== 'object') return false;
  return Array.isArray(p.nodes) && p.nodes.length >= 2 && Array.isArray(p.elements) && p.elements.length >= 1;
}

function sanitizeVisionResult(raw: unknown): AgentParseResult | null {
  if (!raw || typeof raw !== 'object') return null;

  const candidate = raw as Partial<AgentParseResult> & { actions?: unknown[] };
  const actions = Array.isArray(candidate.actions)
    ? candidate.actions.filter(action => {
        if (!action || typeof action !== 'object') return false;
        const a = action as AgentAction;
        if (!allowedActionKinds.has(a.kind)) return false;
        if (a.kind === 'create_custom_structure') return isValidCustomStructure(action);
        return typeof a.payload === 'object';
      })
    : [];

  return {
    userText: typeof candidate.userText === 'string' ? candidate.userText : '图片识别',
    summary: typeof candidate.summary === 'string' ? candidate.summary : '已从图片中识别结构信息。',
    confidence: typeof candidate.confidence === 'number' ? candidate.confidence : 0.6,
    actions: actions as AgentAction[],
    riskLevel: 'high',
    requiresConfirmation: true,
  };
}

function validateAndFixPayload(
  payload: { nodes?: unknown[]; elements?: unknown[]; loads?: unknown[] },
): { nodes: unknown[]; elements: unknown[]; loads: unknown[] } {
  let nodes: any[] = Array.isArray(payload.nodes) ? [...payload.nodes] : [];
  let elements: any[] = Array.isArray(payload.elements) ? [...payload.elements] : [];
  const loads: any[] = Array.isArray(payload.loads) ? [...payload.loads] : [];

  // ── Fix 1: Merge duplicate/near-duplicate nodes (within 0.1m) ──
  const MERGE_TOL = 0.1;
  const mergeMap = new Map<number, number>(); // oldId → survivingId
  const merged: any[] = [];
  for (const n of nodes) {
    const existing = merged.find(
      (m: any) => Math.abs(m.x - n.x) < MERGE_TOL && Math.abs(m.y - n.y) < MERGE_TOL,
    );
    if (existing) {
      mergeMap.set(n.id, existing.id);
      // Preserve the stronger restraint
      if (n.restraints) {
        for (let i = 0; i < 3; i++) {
          if (n.restraints[i]) existing.restraints[i] = true;
        }
      }
    } else {
      mergeMap.set(n.id, n.id);
      merged.push({ ...n });
    }
  }
  nodes = merged;

  // ── Fix 2: Update element references after merge ──
  elements = elements.map((e: any) => ({
    ...e,
    startNode: mergeMap.get(e.startNode) ?? e.startNode,
    endNode: mergeMap.get(e.endNode) ?? e.endNode,
  }));

  // ── Fix 3: Remove elements with invalid refs or self-loops ──
  const nodeIds = new Set(nodes.map((n: any) => n.id));
  elements = elements.filter((e: any) =>
    nodeIds.has(e.startNode) && nodeIds.has(e.endNode) && e.startNode !== e.endNode,
  );

  // ── Fix 4: Remove duplicate elements (same pair of nodes) ──
  const seenPairs = new Set<string>();
  elements = elements.filter((e: any) => {
    const key = [Math.min(e.startNode, e.endNode), Math.max(e.startNode, e.endNode)].join('-');
    if (seenPairs.has(key)) return false;
    seenPairs.add(key);
    return true;
  });

  // ── Fix 5: Remove orphan nodes (not used by any element) ──
  const usedNodeIds = new Set<number>();
  for (const e of elements) {
    usedNodeIds.add(e.startNode);
    usedNodeIds.add(e.endNode);
  }
  nodes = nodes.filter((n: any) => usedNodeIds.has(n.id));

  // ── Fix 6: Re-number node IDs sequentially ──
  const nodeRenumber = new Map<number, number>();
  nodes = nodes.map((n: any, idx: number) => {
    const newId = idx + 1;
    nodeRenumber.set(n.id, newId);
    return { ...n, id: newId };
  });

  // ── Fix 7: Update element node refs and re-number element IDs ──
  elements = elements.map((e: any, idx: number) => ({
    ...e,
    id: idx + 1,
    startNode: nodeRenumber.get(e.startNode) ?? e.startNode,
    endNode: nodeRenumber.get(e.endNode) ?? e.endNode,
  }));

  // ── Fix 8: Build old→new element ID map and fix load refs ──
  const elemIdSet = new Set(elements.map((e: any) => e.id));
  const fixedLoads = loads.map((l: any) => {
    if (l.elementId && !elemIdSet.has(l.elementId)) {
      // Try to find closest valid element
      const clamped = Math.max(1, Math.min(l.elementId, elements.length));
      return { ...l, elementId: clamped };
    }
    return l;
  });

  return { nodes, elements, loads: fixedLoads };
}

export async function parseImageToActions(
  imageDataUrl: string,
  userHint?: string,
  onProgress?: (status: string) => void,
): Promise<AgentParseResult> {
  // ══ 预处理：压缩图片（不叠加网格） ══
  onProgress?.('正在预处理图片...');
  let compressedUrl: string;
  try {
    compressedUrl = await compressImageIfNeeded(imageDataUrl);
  } catch {
    return {
      userText: '图片识别',
      summary: '图片预处理失败，请重试。',
      confidence: 0,
      actions: [],
      riskLevel: 'low',
      requiresConfirmation: true,
    };
  }

  try {
    // ══ 直接识别：模型输出 JSON ══
    onProgress?.('正在识别结构...');

    const promptParts: MultimodalContentPart[] = [
      { type: 'image_url', image_url: { url: compressedUrl } },
      { type: 'text', text: buildDirectPrompt(userHint) },
    ];

    const messages: VisionMessage[] = [
      { role: 'system', content: '你是结构力学识别专家。请从图片中识别结构的节点、杆件、支座和荷载，直接输出 JSON。只输出 JSON，不要输出分析过程。' },
      { role: 'user', content: promptParts },
    ];

    const response = await sendVisionCompletion(messages, { maxTokens: 3000 });
    console.log('[Vision] 模型原始输出：', response);

    // ══ 解析 JSON ══
    const jsonStr = extractJsonPayload(response);
    if (!jsonStr) {
      return {
        userText: '图片识别',
        summary: `无法从模型输出中提取 JSON。\n\n原始输出：${response.slice(0, 500)}`,
        confidence: 0.2,
        actions: [],
        riskLevel: 'low',
        requiresConfirmation: true,
      };
    }

    const parsed = JSON.parse(jsonStr);
    console.log('[Vision] 解析到 JSON：', parsed);

    // ══ 转换为标准 payload ══
    const supportMap: Record<string, [boolean, boolean, boolean]> = {
      'fixed': [true, true, true],
      'pin': [true, true, false],
      'roller': [false, true, false],
      'guided': [false, true, true],
      'none': [false, false, false],
    };

    const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    const rawElements = Array.isArray(parsed.elements) ? parsed.elements : [];
    const rawLoads = Array.isArray(parsed.loads) ? parsed.loads : [];

    // Build ID mapping: model may use string IDs ("A","B","1") → remap to sequential numbers
    const idMap = new Map<string, number>();
    rawNodes.forEach((n: any, i: number) => {
      idMap.set(String(n.id), i + 1);
    });
    const mapId = (raw: any): number => idMap.get(String(raw)) ?? 0;

    const nodes = rawNodes.map((n: any, i: number) => ({
      id: i + 1,
      x: Number(n.x) || 0,
      y: Number(n.y) || 0,
      restraints: supportMap[n.support] ?? [false, false, false],
    }));

    const elements = rawElements.map((e: any, i: number) => ({
      id: i + 1,
      startNode: mapId(e.start ?? e.startNode ?? e.from),
      endNode: mapId(e.end ?? e.endNode ?? e.to),
      ...(e.releaseStart ? { releaseStart: true } : {}),
      ...(e.releaseEnd ? { releaseEnd: true } : {}),
    })).filter((e: any) => e.startNode > 0 && e.endNode > 0 && e.startNode !== e.endNode);

    // Helper: find which element contains a point (x,y) and compute fractional location
    const findElementAt = (px: number, py: number): { elemId: number; location: number } | null => {
      let bestElem: { elemId: number; location: number } | null = null;
      let bestDist = Infinity;
      for (const e of elements) {
        const nA = nodes.find((n: any) => n.id === e.startNode);
        const nB = nodes.find((n: any) => n.id === e.endNode);
        if (!nA || !nB) continue;
        const dx = nB.x - nA.x;
        const dy = nB.y - nA.y;
        const len2 = dx * dx + dy * dy;
        if (len2 < 1e-10) continue;
        // Project point onto element line
        let t = ((px - nA.x) * dx + (py - nA.y) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        // Distance from point to projection
        const projX = nA.x + t * dx;
        const projY = nA.y + t * dy;
        const dist = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
        if (dist < bestDist) {
          bestDist = dist;
          bestElem = { elemId: e.id, location: Math.round(t * 100) / 100 };
        }
      }
      return bestElem;
    };

    const loads: unknown[] = [];
    for (const l of rawLoads) {
      if (l.type === 'point') {
        // Support both coordinate-based and node-based load placement
        let px: number | undefined, py: number | undefined;
        if (l.x != null && l.y != null) {
          px = Number(l.x); py = Number(l.y);
        } else if (l.node != null) {
          const nodeNumId = mapId(l.node);
          const n = nodes.find((nd: any) => nd.id === nodeNumId);
          if (n) { px = n.x; py = n.y; }
        }
        if (px != null && py != null) {
          const hit = findElementAt(px, py);
          if (hit) {
            const mag = Math.sqrt((l.fx || 0) ** 2 + (l.fy || 0) ** 2);
            const dir = Math.abs(l.fx || 0) > Math.abs(l.fy || 0) ? 'x' : 'y';
            const sign = dir === 'y' ? Math.sign(l.fy || -1) : Math.sign(l.fx || -1);
            loads.push({ type: 'point', magnitude: mag * sign, direction: dir, elementId: hit.elemId, location: hit.location });
          }
        }
      } else if (l.type === 'distributed') {
        // Support coordinate-based or node-pair-based
        let x1: number | undefined, y1: number | undefined, x2: number | undefined, y2: number | undefined;
        if (l.x1 != null && l.x2 != null) {
          x1 = Number(l.x1); y1 = Number(l.y1 ?? 0); x2 = Number(l.x2); y2 = Number(l.y2 ?? 0);
        } else if (l.element != null) {
          const refs = Array.isArray(l.element) ? l.element : [l.element];
          if (refs.length === 2) {
            const n1 = nodes.find((nd: any) => nd.id === mapId(refs[0]));
            const n2 = nodes.find((nd: any) => nd.id === mapId(refs[1]));
            if (n1 && n2) { x1 = n1.x; y1 = n1.y; x2 = n2.x; y2 = n2.y; }
          }
        }
        if (x1 != null && x2 != null) {
          // Find all elements that overlap with the load range
          const midX = (x1 + x2) / 2;
          const midY = ((y1 ?? 0) + (y2 ?? 0)) / 2;
          const hit = findElementAt(midX, midY);
          if (hit) {
            const mag = Math.sqrt((l.qx || 0) ** 2 + (l.qy || 0) ** 2);
            const dir = Math.abs(l.qx || 0) > Math.abs(l.qy || 0) ? 'x' : 'y';
            const sign = dir === 'y' ? Math.sign(l.qy || -1) : Math.sign(l.qx || -1);
            loads.push({ type: 'distributed', magnitude: mag * sign, direction: dir, elementId: hit.elemId });
          }
        }
      } else if (l.type === 'moment') {
        let px: number | undefined, py: number | undefined;
        if (l.x != null && l.y != null) {
          px = Number(l.x); py = Number(l.y);
        } else if (l.node != null) {
          const nodeNumId = mapId(l.node);
          const n = nodes.find((nd: any) => nd.id === nodeNumId);
          if (n) { px = n.x; py = n.y; }
        }
        if (px != null && py != null) {
          const hit = findElementAt(px, py);
          if (hit) {
            loads.push({ type: 'moment', magnitude: l.m || 0, direction: 'y', elementId: hit.elemId, location: hit.location });
          }
        }
      }
    }

    const rawPayload = { nodes, elements, loads };
    console.log('[Vision] 构建 payload：', JSON.stringify(rawPayload, null, 2));

    // Post-process
    const fixed = validateAndFixPayload(rawPayload);
    console.log('[Vision] 后处理 payload：', JSON.stringify(fixed, null, 2));

    const nodeCount = (fixed.nodes as unknown[]).length;
    const elemCount = (fixed.elements as unknown[]).length;
    const loadCount = (fixed.loads as unknown[]).length;

    const result: AgentParseResult = {
      userText: '图片识别',
      summary: `识别完成：${nodeCount} 个节点，${elemCount} 个单元，${loadCount} 个荷载。请在编辑器中检查并修正。`,
      confidence: 0.7,
      actions: [{
        kind: 'create_custom_structure',
        payload: {
          nodes: fixed.nodes,
          elements: fixed.elements,
          loads: fixed.loads,
        } as AgentAction['payload'],
      }],
      riskLevel: 'high',
      requiresConfirmation: true,
    };

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return {
      userText: '图片识别',
      summary: `图片识别失败：${message}`,
      confidence: 0,
      actions: [],
      riskLevel: 'low',
      requiresConfirmation: true,
      clarification: message.includes('API Key')
        ? '请在设置中配置视觉模型的 API Key。'
        : '请检查网络连接或稍后重试。',
    };
  }
}
