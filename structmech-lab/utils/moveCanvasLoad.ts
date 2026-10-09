import type { SolverParams } from '../types';
import { nearestMember, type CanvasPoint } from './canvasModel';
import { getLineLoadRange } from './lineLoads';

export type LoadDragPart = 'move' | 'start' | 'end';
/** Move loads on the structural geometry; never change force, direction or line-load length. */
export function moveCanvasLoad(params: SolverParams, id: string, down: CanvasPoint, pointer: CanvasPoint, scale: number, part: LoadDragPart = 'move', grid?: number): SolverParams {
  const load = params.loads.find(l => l.id === id);
  if (!load) return params;
  const element = params.elements.find(e => e.id === load.elementId);
  const a = params.nodes.find(n => n.id === (load.nodeId ?? element?.startNode));
  const b = params.nodes.find(n => n.id === element?.endNode);
  if (!a) return params;
  let moved = { ...load };
  if ((load.type === 'distributed' || load.type === 'trapezoidal') && b) {
    const dx = b.x-a.x, dy = b.y-a.y, length2 = dx*dx+dy*dy;
    if (!length2) return params;
    let delta = ((pointer.x-down.x)*dx+(pointer.y-down.y)*dy)/length2;
    // Snap along the member, rather than world X/Y, so inclined members behave equally.
    const length = Math.sqrt(length2);
    const range = getLineLoadRange(load);
    if (grid && grid > 0 && Math.abs(delta) * length > 1e-9) {
      const anchor = part === 'end' ? range.end : range.start;
      delta = Math.round((anchor + delta) * length / grid) * grid / length - anchor;
    }
    const minRange = Math.min(0.01 / Math.sqrt(length2), (range.end-range.start)/2);
    if (part === 'start') moved.startLocation = Math.max(0, Math.min(range.end-minRange, range.start+delta));
    else if (part === 'end') moved.endLocation = Math.min(1, Math.max(range.start+minRange, range.end+delta));
    else {
      const shift = Math.max(-range.start, Math.min(1-range.end, delta));
      moved.startLocation = range.start+shift; moved.endLocation = range.end+shift;
    }
  } else if (load.type === 'point' || load.type === 'moment') {
    const t = load.location ?? 0.5;
    const origin = b ? { x: a.x+(b.x-a.x)*t, y: a.y+(b.y-a.y)*t } : a;
    const target = { x: origin.x+pointer.x-down.x, y: origin.y+pointer.y-down.y };
    const node = params.nodes.slice().sort((n,m) => Math.hypot(n.x-target.x,n.y-target.y)-Math.hypot(m.x-target.x,m.y-target.y))[0];
    if (node && Math.hypot(node.x-target.x,node.y-target.y)*scale <= 10) {
      moved.nodeId = node.id; delete moved.elementId; delete moved.location;
    } else {
      const hit = nearestMember(target, params, 30/scale);
      if (!hit) return params;
      moved.elementId = hit.element.id; moved.location = hit.t; delete moved.nodeId;
    }
  } else return params;
  return { ...params, loads: params.loads.map(l => l.id === id ? moved : l) };
}
