import { solverLoadAngle } from './loadDirection';
import { StructureType, type SolverParams, type SolverNode, type SolverElement, type Load } from '../types';
import { autoConnectNodes } from './geometryGenerator';
import { getActiveLoadCaseId } from './loadCases';

export interface CanvasPoint { x: number; y: number }
export interface CanvasViewport { width: number; height: number; scale: number; cx: number; cy: number }
export type CanvasSelection = { kind: 'node' | 'element'; id: number } | { kind: 'load'; id: string };
const EPS = 1e-6;
const distance = (a: CanvasPoint, b: CanvasPoint) => Math.hypot(a.x - b.x, a.y - b.y);
export const cleanCoordinate = (n: number) => Math.round(n * 1e8) / 1e8;
export const toCanvas = (p: CanvasPoint, v: CanvasViewport) => ({ x: v.width / 2 + (p.x - v.cx) * v.scale, y: v.height / 2 - (p.y - v.cy) * v.scale });
export const fromCanvas = (p: CanvasPoint, v: CanvasViewport) => ({ x: v.cx + (p.x - v.width / 2) / v.scale, y: v.cy - (p.y - v.height / 2) / v.scale });

export function fitCanvas(nodes: SolverNode[], width = 800, height = 400): CanvasViewport {
  if (!nodes.length) return { width, height, scale: 50, cx: width * 0.3125 / 50, cy: height * 0.125 / 50 };
  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return { width, height, scale: Math.max(8, Math.min(Math.max(40, width - 120) / Math.max(4, maxX - minX), Math.max(40, height - 120) / Math.max(2, maxY - minY))), cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

/** Zoom around a canvas pixel, keeping the world point under it fixed. */
export function zoomCanvasAt(viewport: CanvasViewport, pixel: CanvasPoint, factor: number): CanvasViewport {
  const anchor = fromCanvas(pixel, viewport);
  const scale = Math.max(8, Math.min(400, viewport.scale * factor));
  return { ...viewport, scale, cx: anchor.x - (pixel.x - viewport.width / 2) / scale, cy: anchor.y + (pixel.y - viewport.height / 2) / scale };
}

export function projectToMember(p: CanvasPoint, a: CanvasPoint, b: CanvasPoint) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const t = length > EPS ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (length * length))) : 0;
  const point = { x: a.x + t * dx, y: a.y + t * dy };
  return { point, t, length, distance: distance(p, point) };
}

export function nearestMember(p: CanvasPoint, params: SolverParams, tolerance: number) {
  let hit: { element: SolverElement; point: CanvasPoint; t: number; length: number; distance: number } | null = null;
  for (const element of params.elements) {
    const a = params.nodes.find(n => n.id === element.startNode), b = params.nodes.find(n => n.id === element.endNode);
    if (!a || !b) continue;
    const projection = projectToMember(p, a, b);
    if (projection.distance <= tolerance && (!hit || projection.distance < hit.distance)) hit = { element, ...projection };
  }
  return hit;
}

export function snapCanvasPoint(p: CanvasPoint, params: SolverParams, scale: number, grid: number, excludeNode?: number): CanvasPoint {
  const node = params.nodes.filter(n => n.id !== excludeNode).sort((a, b) => distance(p, a) - distance(p, b))[0];
  if (node && distance(node, p) <= 12 / scale) return { x: node.x, y: node.y };
  const gridPoint = grid > 0 ? { x: cleanCoordinate(Math.round(p.x / grid) * grid), y: cleanCoordinate(Math.round(p.y / grid) * grid) } : p;
  // 移动节点时避开它自身相连的杆件，否则会被吸附回原位置。
  const eligible = excludeNode === undefined ? params : { ...params, elements: params.elements.filter(e => e.startNode !== excludeNode && e.endNode !== excludeNode) };
  const member = nearestMember(p, eligible, 8 / scale);
  if (member) {
    const a = params.nodes.find(n => n.id === member.element.startNode)!, b = params.nodes.find(n => n.id === member.element.endNode)!;
    return projectToMember(gridPoint, a, b).point;
  }
  return gridPoint;
}

function ensurePoint(nodes: SolverNode[], point: CanvasPoint): SolverNode {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('节点坐标必须是有限数值');
  const existing = nodes.find(n => distance(n, point) < EPS);
  if (existing) return existing;
  const node: SolverNode = { id: Math.max(0, ...nodes.map(n => n.id)) + 1, x: cleanCoordinate(point.x), y: cleanCoordinate(point.y), restraints: [false, false, false] };
  nodes.push(node);
  return node;
}

const connect = (params: SolverParams, nodes: SolverNode[], elements = params.elements): SolverParams => ({
  ...params, structureType: StructureType.Custom,
  ...autoConnectNodes(nodes, elements, params.loads, { tolerance: EPS, endpointTolerance: 1e-9 }),
});

export function insertCanvasNode(params: SolverParams, point: CanvasPoint): { params: SolverParams; nodeId: number } {
  const nodes = [...params.nodes];
  const node = ensurePoint(nodes, point);
  return { params: connect(params, nodes), nodeId: node.id };
}

export function drawCanvasMember(params: SolverParams, start: CanvasPoint, end: CanvasPoint): SolverParams {
  if (distance(start, end) < EPS) throw new Error('杆件长度必须大于 0');
  // 禁止共线重叠；普通交点自动生成共用节点。
  const dx = end.x - start.x, dy = end.y - start.y;
  const nodes = [...params.nodes];
  ensurePoint(nodes, start); ensurePoint(nodes, end);
  for (const el of params.elements) {
    const a = nodes.find(n => n.id === el.startNode)!, b = nodes.find(n => n.id === el.endNode)!;
    if (!a || !b) continue;
    const ex = b.x - a.x, ey = b.y - a.y, det = dx * ey - dy * ex;
    if (Math.abs(det) < EPS) {
      if (Math.abs((a.x - start.x) * dy - (a.y - start.y) * dx) < EPS) {
        const len2 = dx * dx + dy * dy;
        const ta = ((a.x - start.x) * dx + (a.y - start.y) * dy) / len2;
        const tb = ((b.x - start.x) * dx + (b.y - start.y) * dy) / len2;
        if (Math.min(1, Math.max(ta, tb)) - Math.max(0, Math.min(ta, tb)) > EPS) throw new Error('新杆件与已有杆件重叠，请从现有节点继续绘制');
      }
      continue;
    }
    const ax = a.x - start.x, ay = a.y - start.y;
    const t = (ax * ey - ay * ex) / det, u = (ax * dy - ay * dx) / det;
    if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS) ensurePoint(nodes, { x: start.x + t * dx, y: start.y + t * dy });
  }
  const a = ensurePoint(nodes, start), b = ensurePoint(nodes, end);
  const element: SolverElement = { id: Math.max(0, ...params.elements.map(e => e.id)) + 1, startNode: a.id, endNode: b.id, E: params.elasticModulus, A: params.crossSectionArea, I: params.momentOfInertia };
  return connect(params, nodes, [...params.elements, element]);
}

export function moveCanvasNode(params: SolverParams, nodeId: number, point: CanvasPoint): SolverParams {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('节点坐标必须是有限数值');
  const current = params.nodes.find(n => n.id === nodeId);
  if (current && distance(current, point) < 1e-9) return params;
  if (params.nodes.some(n => n.id !== nodeId && distance(n, point) < EPS)) throw new Error('节点位置已占用，请选择其他位置');
  const nodes = params.nodes.map(n => n.id === nodeId ? { ...n, x: cleanCoordinate(point.x), y: cleanCoordinate(point.y) } : n);
  // 不能将节点移动到它相连杆件的另一端。
  for (const el of params.elements) {
    const a = nodes.find(n => n.id === el.startNode), b = nodes.find(n => n.id === el.endNode);
    if (a && b && distance(a, b) < EPS) throw new Error('节点移动后杆件长度不能为 0');
  }
  for (const el of params.elements.filter(e => e.startNode === nodeId || e.endNode === nodeId)) {
    const a = nodes.find(n => n.id === el.startNode)!, b = nodes.find(n => n.id === el.endNode)!;
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    for (const other of params.elements.filter(e => e.id !== el.id)) {
      const c = nodes.find(n => n.id === other.startNode)!, d = nodes.find(n => n.id === other.endNode)!;
      if (!a || !b || !c || !d) continue;
      const cross = (p: CanvasPoint) => Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / length;
      if (cross(c) > EPS || cross(d) > EPS) continue;
      const t = (p: CanvasPoint) => ((p.x - a.x) * dx + (p.y - a.y) * dy) / (length * length);
      if (Math.min(1, Math.max(t(c), t(d))) - Math.max(0, Math.min(t(c), t(d))) > EPS) throw new Error('节点移动会使杆件重叠，请调整位置');
    }
  }
  return connect(params, nodes);
}

export const CANVAS_SUPPORTS: Record<string, [boolean, boolean, boolean]> = {
  fixed: [true, true, true], pinned: [true, true, false], rollerY: [false, true, false], rollerX: [true, false, false], guided: [false, true, true], free: [false, false, false],
};

export function setCanvasSupport(params: SolverParams, point: CanvasPoint, support: string) {
  const restraints = CANVAS_SUPPORTS[support];
  if (!restraints) throw new Error('请选择支座类型');
  const inserted = insertCanvasNode(params, point);
  return { params: { ...inserted.params, nodes: inserted.params.nodes.map(n => n.id === inserted.nodeId ? { ...n, restraints: [...restraints] as SolverNode['restraints'], springStiffness: [0, 0, 0] as [number, number, number] } : n) }, nodeId: inserted.nodeId };
}

export function addCanvasLoad(params: SolverParams, load: Omit<Load, 'id'>): { params: SolverParams; loadId: string } {
  if (!Number.isFinite(load.magnitude) || (load.type === 'trapezoidal' && !Number.isFinite(load.magnitudeEnd))) throw new Error('荷载大小必须是有限数值');
  if (load.nodeId === undefined && load.elementId === undefined) throw new Error('请点击节点或杆件放置荷载');
  if ((load.type === 'distributed' || load.type === 'trapezoidal') && !(load.elementId !== undefined && (load.endLocation ?? 1) - (load.startLocation ?? 0) > EPS)) throw new Error('沿杆件拖动以确定荷载范围');
  const item = { ...load, id: crypto.randomUUID(), loadCaseId: load.loadCaseId ?? getActiveLoadCaseId(params) };
  return { params: { ...params, loads: [...params.loads, item] }, loadId: item.id };
}

export function deleteCanvasSelection(params: SolverParams, selection: CanvasSelection): SolverParams {
  if (selection.kind === 'load') return { ...params, loads: params.loads.filter(l => l.id !== selection.id) };
  const removedElements = params.elements.filter(e => selection.kind === 'node' ? e.startNode === selection.id || e.endNode === selection.id : e.id === selection.id);
  const removedIds = new Set(removedElements.map(e => e.id));
  return { ...params, structureType: StructureType.Custom,
    nodes: selection.kind === 'node' ? params.nodes.filter(n => n.id !== selection.id) : params.nodes,
    elements: params.elements.filter(e => !removedIds.has(e.id)),
    loads: params.loads.filter(l => !(selection.kind === 'node' && l.nodeId === selection.id) && !(l.elementId !== undefined && removedIds.has(l.elementId))),
  };
}

export function hitCanvasObject(p: CanvasPoint, params: SolverParams, scale: number): CanvasSelection | null {
  const node = params.nodes.slice().sort((a, b) => distance(p, a) - distance(p, b))[0];
  if (node && distance(node, p) < 10 / scale) return { kind: 'node', id: node.id };
  // Support symbols extend beyond the node dot; hit their rotated screen-space footprint.
  for (const support of params.nodes.filter(n => n.restraints.some(Boolean))) {
    const [rx, ry, rz] = support.restraints;
    const fixed = rx && ry && rz;
    const attached = params.elements.find(e => e.startNode === support.id || e.endNode === support.id);
    const other = params.nodes.find(n => n.id === (attached?.startNode === support.id ? attached.endNode : attached?.startNode));
    const horizontal = other && Math.abs(other.x - support.x) > Math.abs(other.y - support.y);
    const rotation = fixed && horizontal ? (other.x > support.x ? 90 : -90) : !ry && rx ? -90 : 0;
    const angle = rotation * Math.PI / 180;
    const dx = (p.x - support.x) * scale, dy = -(p.y - support.y) * scale;
    const x = dx * Math.cos(angle) + dy * Math.sin(angle);
    const y = -dx * Math.sin(angle) + dy * Math.cos(angle);
    if (Math.abs(x) <= 17 && y >= -5 && y <= (fixed ? 8 : 28)) return { kind: 'node', id: support.id };
  }
  const caseId = getActiveLoadCaseId(params);
  for (const load of [...params.loads].reverse().filter(l => (l.loadCaseId ?? 'dead') === caseId)) {
    const element = params.elements.find(e => e.id === load.elementId);
    const a = params.nodes.find(n => n.id === (load.nodeId ?? element?.startNode));
    const b = params.nodes.find(n => n.id === element?.endNode);
    if (!a) continue;
    const pos = (t: number) => b ? { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t } : a;
    const origin = pos(load.location ?? 0.5);
    const angle = solverLoadAngle(load) * Math.PI / 180;
    const offset = (pt: CanvasPoint) => ({ x: pt.x - Math.cos(angle) * 25 / scale, y: pt.y - Math.sin(angle) * 25 / scale });
    if (load.type === 'distributed' || load.type === 'trapezoidal') {
      // Include the arrow body, not only the thin outer rail.
      const start = pos(load.startLocation ?? 0), end = pos(load.endLocation ?? 1);
      for (const pixels of [0, 12.5, 25]) {
        const shift = (pt: CanvasPoint) => ({ x: pt.x - Math.cos(angle) * pixels / scale, y: pt.y - Math.sin(angle) * pixels / scale });
        if (projectToMember(p, shift(start), shift(end)).distance < 8 / scale) return { kind: 'load', id: load.id };
      }
    } else if (load.type === 'moment' ? distance(p, origin) < 24 / scale : projectToMember(p, origin, offset(origin)).distance < 12 / scale) return { kind: 'load', id: load.id };
  }
  const member = nearestMember(p, params, 10 / scale);
  return member ? { kind: 'element', id: member.element.id } : null;
}
