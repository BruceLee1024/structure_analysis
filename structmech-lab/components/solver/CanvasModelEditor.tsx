import { canvasBoxSelection } from '../../utils/canvasBoxSelection';
import { moveCanvasLoad, type LoadDragPart } from '../../utils/moveCanvasLoad';
import LoadDirectionControl from '../ui/LoadDirectionControl';
import { rotateSolverLoad, solverLoadAngle } from '../../utils/loadDirection';
import React, { useEffect, useRef, useState, useId } from 'react';
import { MousePointer2, PencilRuler, CircleDot, Move, Undo2, Redo2, ZoomIn, ZoomOut, Maximize2, FilePlus2 } from 'lucide-react';
import { StructureType, type SolverParams, type Load } from '../../types';
import { getActiveLoadCaseId, loadCaseName } from '../../utils/loadCases';
import { addCanvasLoad, deleteCanvasSelection, drawCanvasMember, fitCanvas, fromCanvas, hitCanvasObject, insertCanvasNode, moveCanvasNode, nearestMember, projectToMember, setCanvasSupport, snapCanvasPoint, toCanvas, zoomCanvasAt, type CanvasPoint, type CanvasSelection, type CanvasViewport } from '../../utils/canvasModel';
import CanvasSelectionEditor from './CanvasSelectionEditor';

export interface CanvasInteraction {
  viewport: CanvasViewport;
  previewNodes?: SolverParams['nodes'];
  svgProps: React.SVGProps<SVGSVGElement>;
  background: React.ReactNode;
  overlay: React.ReactNode;
}
interface Props {
  params: SolverParams;
  onChange: React.Dispatch<React.SetStateAction<SolverParams>>;
  renderCanvas: (interaction: CanvasInteraction) => React.ReactNode;
  showLoads?: boolean;
  showGrid?: boolean;
}
type Tool = 'select' | 'member' | 'node' | 'fixed' | 'pinned' | 'rollerY' | 'rollerX' | 'point' | 'distributed' | 'trapezoidal' | 'moment' | 'pan';
type Gesture = { kind: 'box'; down: CanvasPoint; additive: boolean; previous: CanvasSelection[] } | { kind: 'loadDrag'; id: string; down: CanvasPoint; before: SolverParams; part: LoadDragPart; moved?: boolean } | { kind: 'member'; origin: CanvasPoint; first: boolean; down: CanvasPoint } | { kind: 'node'; nodeId: number; down: CanvasPoint } | { kind: 'lineLoad'; elementId: number; start: number } | { kind: 'pan'; down: CanvasPoint; viewport: CanvasViewport };
const tools: { id: Tool; label: string; icon?: React.ReactNode }[] = [
  { id: 'select', label: '选择 / 移动', icon: <MousePointer2 size={14} /> }, { id: 'member', label: '画杆件', icon: <PencilRuler size={14} /> }, { id: 'node', label: '加节点', icon: <CircleDot size={14} /> },
  { id: 'fixed', label: '固定支座' }, { id: 'pinned', label: '铰支座' }, { id: 'rollerY', label: '竖向滚动支座' }, { id: 'rollerX', label: '水平滚动支座' },
  { id: 'point', label: '集中力' }, { id: 'distributed', label: '均布荷载' }, { id: 'trapezoidal', label: '梯形荷载' }, { id: 'moment', label: '力矩' }, { id: 'pan', label: '平移画布', icon: <Move size={14} /> },
];
const help: Record<Tool, string> = {
  select: '空白处拖动框选：左→右包含，右→左交叉；Shift 追加。拖动荷载调整位置。', member: '点击起点和终点，或按住拖动绘制；Esc 结束连续绘制。', node: '点击添加节点；落在杆件上时自动连接。',
  fixed: '点击节点放置固定支座，也可以在杆件上插入支座节点。', pinned: '点击节点放置铰支座。', rollerY: '点击放置约束竖向位移的滚动支座。', rollerX: '点击放置约束水平位移的滚动支座。',
  point: '点击节点或杆件放置集中力；负值向下 / 向左。', moment: '点击节点或杆件放置力矩；正值逆时针。', distributed: '沿同一根杆件拖动，确定均布荷载的起点和终点。', trapezoidal: '沿同一根杆件拖动，确定梯形荷载的作用范围。', pan: '按住拖动画布；适应模型可以回到完整视图。',
};
const inputClass = 'w-20 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-400';
const format = (value: number) => Number(value.toFixed(4)).toString();
const modelSignature = (params: SolverParams) => JSON.stringify(params);
const geometrySignature = (params: SolverParams) => JSON.stringify([params.nodes.map(n => [n.id, n.x, n.y]), params.elements.map(e => [e.id, e.startNode, e.endNode])]);

export default function CanvasModelEditor({ params, onChange, renderCanvas, showLoads = true, showGrid = true }: Props) {
  const [tool, setTool] = useState<Tool>(() => params.nodes.length === 0 ? 'member' : 'select');
  const [viewport, setViewport] = useState(() => fitCanvas(params.nodes));
  const [grid, setGrid] = useState(0.5);
  const [snapping, setSnapping] = useState(true);
  const [continuous, setContinuous] = useState(true);
  const [memberLength, setMemberLength] = useState('');
  const [memberDirection, setMemberDirection] = useState('free');
  const [magnitude, setMagnitude] = useState('-2');
  const [lineMagnitude, setLineMagnitude] = useState('-3');
  const [magnitudeEnd, setMagnitudeEnd] = useState('-6');
  const [loadDirection, setLoadDirection] = useState<'x' | 'y'>('y');
  const [anchor, setAnchor] = useState<CanvasPoint | null>(null);
  const [cursor, setCursor] = useState<CanvasPoint | null>(null);
  const [selection, setSelection] = useState<CanvasSelection | null>(null);
  const [batchSelection, setBatchSelection] = useState<CanvasSelection[]>([]);
  const [notice, setNotice] = useState('');
  const [past, setPast] = useState<SolverParams[]>([]);
  const [future, setFuture] = useState<SolverParams[]>([]);
  const pendingLoadClick = useRef<{ id: string; x: number; y: number; time: number } | null>(null);
  const rotationBefore = useRef<SolverParams | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const [gesturePreview, setGesturePreview] = useState<Gesture | null>(null);
  const expectedSignature = useRef(modelSignature(params));
  const previousGeometry = useRef(geometrySignature(params));
  const surfaceRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef(viewport);
  const paramsRef = useRef(params);
  const moveFrame = useRef<number | null>(null);
  const pendingMove = useRef<(() => void) | null>(null);
  const clearMoveFrame = () => { if (moveFrame.current !== null) cancelAnimationFrame(moveFrame.current); moveFrame.current = null; pendingMove.current = null; };
  const scheduleMove = (update: () => void) => {
    pendingMove.current = update;
    if (moveFrame.current !== null) return;
    moveFrame.current = requestAnimationFrame(() => { moveFrame.current = null; const latest = pendingMove.current; pendingMove.current = null; latest?.(); });
  };
  useEffect(() => () => clearMoveFrame(), []);
  viewportRef.current = viewport;
  paramsRef.current = params;

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    let firstMeasurement = true;
    const measure = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      const fit = firstMeasurement;
      firstMeasurement = false;
      setViewport(previous => fit ? fitCanvas(paramsRef.current.nodes, width, height) : { ...previous, width, height });
    };
    const rect = surface.getBoundingClientRect();
    measure(rect.width, rect.height);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) measure(entry.contentRect.width, entry.contentRect.height);
    });
    observer?.observe(surface);
    const layoutFrame = requestAnimationFrame(() => { const bounds = surface.getBoundingClientRect(); measure(bounds.width, bounds.height); });
    const onWheel = (event: WheelEvent) => {
      if (!event.deltaY) return;
      const svg = surface.querySelector('svg');
      if (!svg) return;
      const bounds = svg.getBoundingClientRect(), current = viewportRef.current;
      const ratio = Math.min(bounds.width / current.width, bounds.height / current.height);
      if (!ratio) return;
      event.preventDefault();
      const pixel = { x: (event.clientX - bounds.left - (bounds.width - current.width * ratio) / 2) / ratio, y: (event.clientY - bounds.top - (bounds.height - current.height * ratio) / 2) / ratio };
      setViewport(previous => zoomCanvasAt(previous, pixel, Math.exp(-Math.max(-500, Math.min(500, event.deltaY)) * 0.002)));
    };
    surface.addEventListener('wheel', onWheel, { passive: false });
    return () => { cancelAnimationFrame(layoutFrame); observer?.disconnect(); surface.removeEventListener('wheel', onWheel); };
  }, []);


  useEffect(() => {
    // 参数面板、AI、文件加载等外部修改后，不能撤销掉新的外部工作。
    const signature = modelSignature(params);
    if (signature !== expectedSignature.current) {
      setBatchSelection([]);
      setPast([]); setFuture([]); setAnchor(null); gesture.current = null; setGesturePreview(null);
      if (geometrySignature(params) !== previousGeometry.current) {
        setViewport(fitCanvas(params.nodes, viewportRef.current.width, viewportRef.current.height));
        if (!params.nodes.length) setTool('member');
      }
    }
    previousGeometry.current = geometrySignature(params);
    expectedSignature.current = signature;
    setSelection(current => {
      if (!current) return current;
      const exists = current.kind === 'node' ? params.nodes.some(n => n.id === current.id) : current.kind === 'element' ? params.elements.some(e => e.id === current.id) : params.loads.some(l => l.id === current.id && (l.loadCaseId ?? 'dead') === getActiveLoadCaseId(params));
      return exists ? current : null;
    });
  }, [params]);

  const commit = (next: SolverParams, message = '', record = true) => {
    const normalized = { ...next, structureType: StructureType.Custom };
    if (modelSignature(normalized) === modelSignature(params)) { if (message) setNotice(message); return; }
    if (record) setPast(old => [...old.slice(-49), { ...params, structureType: StructureType.Custom }]); setFuture([]);
    expectedSignature.current = modelSignature(normalized); onChange(normalized); setNotice(message);
  };
  const cancelGesture = () => { clearMoveFrame(); const current = gesture.current; if (current?.kind === 'loadDrag') { expectedSignature.current = modelSignature(current.before); onChange(current.before); } gesture.current = null; setGesturePreview(null); setAnchor(null); };
  const undo = () => {
    const before = past.at(-1); if (!before) return;
    expectedSignature.current = modelSignature(before); setPast(old => old.slice(0, -1)); setFuture(old => [params, ...old]); onChange(before); cancelGesture(); setSelection(null); setBatchSelection([]); setNotice('已撤销画布操作');
  };
  const redo = () => {
    const after = future[0]; if (!after) return;
    expectedSignature.current = modelSignature(after); setFuture(old => old.slice(1)); setPast(old => [...old, params]); onChange(after); cancelGesture(); setSelection(null); setBatchSelection([]); setNotice('已重做画布操作');
  };
  const run = (action: () => void) => { try { action(); } catch (error) { setNotice(error instanceof Error ? error.message : '操作失败'); } };
  const chooseTool = (next: Tool) => { setTool(next); setBatchSelection([]); cancelGesture(); setNotice(''); if (next !== 'select') setSelection(null); };
  const pointFromEvent = (event: React.MouseEvent<SVGElement>, view = viewport): CanvasPoint => {
    const rect = (event.currentTarget.ownerSVGElement ?? event.currentTarget).getBoundingClientRect();
    const ratio = Math.min(rect.width / view.width, rect.height / view.height) || 1;
    return fromCanvas({ x: (event.clientX - rect.left - (rect.width - view.width * ratio) / 2) / ratio, y: (event.clientY - rect.top - (rect.height - view.height * ratio) / 2) / ratio }, view);
  };
  const snap = (p: CanvasPoint, excludeNode?: number) => snapping ? snapCanvasPoint(p, params, viewport.scale, grid, excludeNode) : p;
  const endpoint = (origin: CanvasPoint, target: CanvasPoint) => {
    let dx = target.x - origin.x, dy = target.y - origin.y;
    if (memberDirection === 'horizontal') dy = 0;
    if (memberDirection === 'vertical') dx = 0;
    if (memberLength.trim()) {
      const length = Number(memberLength);
      if (!Number.isFinite(length) || length <= 0) throw new Error('杆件长度必须是大于 0 的数值');
      if (Math.hypot(dx, dy) < 1e-8) { dx = memberDirection === 'vertical' ? 0 : 1; dy = memberDirection === 'vertical' ? 1 : 0; }
      const ratio = length / Math.hypot(dx, dy); dx *= ratio; dy *= ratio;
    }
    return { x: origin.x + dx, y: origin.y + dy };
  };
  const finishMember = (origin: CanvasPoint, target: CanvasPoint) => run(() => {
    const end = endpoint(origin, target);
    commit(drawCanvasMember(params, origin, end), `已绘制 ${format(Math.hypot(end.x - origin.x, end.y - origin.y))} m 杆件`);
    setAnchor(continuous ? end : null); setCursor(end);
  });
  const linePosition = (elementId: number, p: CanvasPoint) => {
    const el = params.elements.find(e => e.id === elementId)!;
    const a = params.nodes.find(n => n.id === el.startNode)!, b = params.nodes.find(n => n.id === el.endNode)!;
    const hit = projectToMember(p, a, b);
    const t = snapping ? Math.round(hit.t * hit.length / grid) * grid / hit.length : hit.t;
    return { ...hit, t: Math.max(0, Math.min(1, t)) };
  };
  const removeSelection = () => { if (batchSelection.length) { commit(batchSelection.reduce((next, item) => deleteCanvasSelection(next, item), params), `已删除 ${batchSelection.length} 个选中对象，可撤销恢复`); setBatchSelection([]); return; } if (!selection) return; commit(deleteCanvasSelection(params, selection), '已删除选中对象，可撤销恢复'); setSelection(null); };
  const placePointLoad = (p: CanvasPoint) => {
    const node = params.nodes.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)).find(n => Math.hypot(n.x - p.x, n.y - p.y) <= 12 / viewport.scale);
    const hit = nearestMember(p, params, 12 / viewport.scale);
    if (!node && !hit) throw new Error('请点击节点或杆件放置荷载');
    if (!magnitude.trim()) throw new Error('请输入荷载大小');
    const added = addCanvasLoad(params, { type: tool as 'point' | 'moment', magnitude: Number(magnitude), direction: loadDirection,
      ...(node ? { nodeId: node.id } : { elementId: hit!.element.id, location: linePosition(hit!.element.id, p).t }),
    });
    commit(added.params, '已放置荷载'); setSelection({ kind: 'load', id: added.loadId });
  };

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
    event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture?.(event.pointerId);
    const raw = pointFromEvent(event), p = event.altKey ? raw : snap(raw); setCursor(p); setNotice('');
    run(() => {
      if (tool === 'pan' || event.button === 1 || event.button === 2) gesture.current = { kind: 'pan', down: raw, viewport };
      else if (tool === 'member') { gesture.current = { kind: 'member', origin: anchor ?? p, first: !anchor, down: p }; if (!anchor) setAnchor(p); }
      else if (tool === 'select') {
        const hit = hitCanvasObject(raw, showLoads ? params : { ...params, loads: [] }, viewport.scale); setSelection(hit);
        if (!hit) {
          gesture.current = { kind: 'box', down: raw, additive: event.shiftKey, previous: batchSelection.length ? batchSelection : selection ? [selection] : [] };
          setCursor(raw);
        } else setBatchSelection([]);
        if (hit?.kind === 'load') gesture.current = { kind: 'loadDrag', id: hit.id, down: raw, before: params, part: 'move' };
        if (hit?.kind === 'load') pendingLoadClick.current = { id: hit.id, x: event.clientX, y: event.clientY, time: Date.now() };
        else if (!pendingLoadClick.current || Date.now() - pendingLoadClick.current.time > 600 || Math.hypot(event.clientX - pendingLoadClick.current.x, event.clientY - pendingLoadClick.current.y) > 6) pendingLoadClick.current = null;
        if (hit?.kind === 'node') gesture.current = { kind: 'node', nodeId: hit.id, down: raw };
      } else if (tool === 'node') {
        const inserted = insertCanvasNode(params, p); commit(inserted.params, '已添加节点'); setSelection({ kind: 'node', id: inserted.nodeId });
      } else if (['fixed', 'pinned', 'rollerY', 'rollerX'].includes(tool)) {
        const node = params.nodes.slice().sort((a, b) => Math.hypot(a.x - raw.x, a.y - raw.y) - Math.hypot(b.x - raw.x, b.y - raw.y)).find(n => Math.hypot(n.x - raw.x, n.y - raw.y) <= 12 / viewport.scale);
        const member = nearestMember(raw, params, 12 / viewport.scale);
        if (!node && !member) throw new Error('请在已有节点或杆件上放置支座');
        const support = setCanvasSupport(params, node ?? linePosition(member!.element.id, p).point, tool);
        commit(support.params, '已放置支座'); setSelection({ kind: 'node', id: support.nodeId });
      } else if (tool === 'point' || tool === 'moment') placePointLoad(raw);
      else {
        const hit = nearestMember(raw, params, 12 / viewport.scale);
        if (!hit) throw new Error('请沿已有杆件拖动以绘制荷载');
        gesture.current = { kind: 'lineLoad', elementId: hit.element.id, start: linePosition(hit.element.id, raw).t };
      }
      setGesturePreview(gesture.current);
    });
  };
  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const current = gesture.current;
    const raw = pointFromEvent(event);
    const altKey = event.altKey;
    const panPoint = current?.kind === 'pan' ? pointFromEvent(event, current.viewport) : null;
    scheduleMove(() => {
      if (current?.kind === 'pan') {
        const point = panPoint!;
        setViewport({ ...current.viewport, cx: current.viewport.cx - (point.x - current.down.x), cy: current.viewport.cy - (point.y - current.down.y) });
        return;
      }
      if (current?.kind === 'box') { setCursor(raw); return; }
      if (current?.kind === 'loadDrag') {
        if (current.moved || Math.hypot(raw.x-current.down.x, raw.y-current.down.y)*viewport.scale > 3) {
          current.moved = true;
          pendingLoadClick.current = null;
          const next = moveCanvasLoad(current.before, current.id, current.down, raw, viewport.scale, current.part);
          expectedSignature.current = modelSignature(next); onChange(next);
        }
        return;
      }
      // Move the structure continuously; apply the precision grid once on release.
      setCursor(current?.kind === 'node' || altKey ? raw : snap(raw));
    });
  };
  const onPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    const lastMove = pendingMove.current; clearMoveFrame(); lastMove?.();
    const current = gesture.current; gesture.current = null; setGesturePreview(null);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!current) return;
    const raw = pointFromEvent(event);
    if (current.kind === 'box') {
      const moved = Math.hypot(raw.x-current.down.x,raw.y-current.down.y)*viewport.scale;
      const items = moved > 4 ? canvasBoxSelection(showLoads ? params : { ...params, loads: [] },current.down,raw,viewport.scale) : [];
      const combined = current.additive ? [...current.previous,...items] : items;
      const unique = combined.filter((item,index)=>combined.findIndex(other=>other.kind===item.kind&&other.id===item.id)===index);
      setBatchSelection(unique.length > 1 ? unique : []); setSelection(unique.length === 1 ? unique[0] : null);
      setNotice(unique.length ? `已框选 ${unique.length} 个对象 · Delete 删除 · Shift 框选追加` : '未选中对象');
    } else if (current.kind === 'loadDrag') {
      if (current.moved || Math.hypot(raw.x-current.down.x, raw.y-current.down.y)*viewport.scale > 3) {
        const returned = Math.hypot(raw.x-current.down.x, raw.y-current.down.y)*viewport.scale <= 3;
        const next = returned ? current.before : moveCanvasLoad(current.before, current.id, current.down, raw, viewport.scale, current.part, snapping && !event.altKey ? grid : undefined);
        expectedSignature.current = modelSignature(next); onChange(next);
        if (modelSignature(next) !== modelSignature(current.before)) { setPast(old => [...old.slice(-49), current.before]); setFuture([]); setNotice('已移动荷载 · 松手吸附网格 · Alt 自由定位 · 可撤销'); }
      }
    } else if (current.kind === 'member') {
      const p = event.altKey ? raw : snap(raw);
      const moved = Math.hypot(p.x - current.down.x, p.y - current.down.y) * viewport.scale;
      if (!current.first || moved > 4) {
        if (Math.hypot(p.x - current.origin.x, p.y - current.origin.y) > 1e-6 || memberLength.trim()) finishMember(current.origin, p);
      }
    } else if (current.kind === 'node') {
      if (Math.hypot(raw.x - current.down.x, raw.y - current.down.y) * viewport.scale > 3) run(() => commit(moveCanvasNode(params, current.nodeId, event.altKey ? raw : snap(raw, current.nodeId)), '已移动节点'));
    } else if (current.kind === 'lineLoad') run(() => {
      const hit = linePosition(current.elementId, raw);
      if (hit.distance * viewport.scale > 30) throw new Error('请沿同一根杆件拖动，或按 Esc 取消');
      if (!lineMagnitude.trim() || (tool === 'trapezoidal' && !magnitudeEnd.trim())) throw new Error('请输入荷载大小');
      const startLocation = Math.min(current.start, hit.t), endLocation = Math.max(current.start, hit.t);
      // 反向拖动时，梯形的起终值也反向映射到单元坐标。
      const reverse = current.start > hit.t;
      const added = addCanvasLoad(params, { type: tool as 'distributed' | 'trapezoidal', elementId: current.elementId, direction: loadDirection, startLocation, endLocation,
        magnitude: Number(tool === 'trapezoidal' && reverse ? magnitudeEnd : lineMagnitude),
        ...(tool === 'trapezoidal' ? { magnitudeEnd: Number(reverse ? lineMagnitude : magnitudeEnd) } : {}),
      });
      commit(added.params, `已绘制 ${format((endLocation - startLocation) * hit.length)} m 荷载范围`); setSelection({ kind: 'load', id: added.loadId });
    });
  };

  const dotPatternId = useId();
  const visualGrid = grid * viewport.scale >= 16 ? grid : grid * Math.ceil(16 / (grid * viewport.scale));
  const spacing = visualGrid * viewport.scale;
  const origin = toCanvas({ x: 0, y: 0 }, viewport);
  const background = <g aria-hidden="true" pointerEvents="none" data-canvas-background="dots">{showGrid && <>
    <defs><pattern id={dotPatternId} x={origin.x-spacing/2} y={origin.y-spacing/2} width={spacing} height={spacing} patternUnits="userSpaceOnUse"><circle cx={spacing/2} cy={spacing/2} r=".85" fill="#526b86" opacity=".4" /></pattern></defs>
    <rect width={viewport.width} height={viewport.height} fill={`url(#${dotPatternId})`} />
  </>}</g>;
  let memberEnd: CanvasPoint | null = null;
  if (anchor && tool === 'member') { try { memberEnd = endpoint(anchor, cursor ?? anchor); } catch { /* 输入未完成时不显示预览 */ } }
  const previewNodes = gesturePreview?.kind === 'node' && cursor ? params.nodes.map(n => n.id === gesturePreview.nodeId ? { ...n, x: cursor.x, y: cursor.y } : n) : undefined;
  const displayNodes = previewNodes ?? params.nodes;
  const selectedNode = selection?.kind === 'node' ? displayNodes.find(n => n.id === selection.id) : null;
  const selectedElement = selection?.kind === 'element' ? params.elements.find(e => e.id === selection.id) : null;
  const linePreview = gesturePreview?.kind === 'lineLoad' ? (() => {
    const el = params.elements.find(e => e.id === gesturePreview.elementId); if (!el || !cursor) return null;
    const a = params.nodes.find(n => n.id === el.startNode)!, b = params.nodes.find(n => n.id === el.endNode)!;
    const end = linePosition(el.id, cursor).t;
    return { a: toCanvas({ x: a.x + (b.x - a.x) * gesturePreview.start, y: a.y + (b.y - a.y) * gesturePreview.start }, viewport), b: toCanvas({ x: a.x + (b.x - a.x) * end, y: a.y + (b.y - a.y) * end }, viewport), length: Math.abs(end - gesturePreview.start) * Math.hypot(b.x - a.x, b.y - a.y) };
  })() : null;
  const selectedLoad = showLoads && selection?.kind === 'load' ? params.loads.find(l => l.id === selection.id) : null;
  const cursorPx = cursor ? toCanvas(cursor, viewport) : null;
  const changeLoadAngle = (load: Load, angle: number) => commit({ ...paramsRef.current, loads: paramsRef.current.loads.map(l => l.id === load.id ? rotateSolverLoad(l, angle) : l) }, '已调整荷载方向', !rotationBefore.current);
  const reverseFromDoubleClick = (event: React.MouseEvent) => {
    // Retain the first load hit when its direction control catches the second click.
    const pending = pendingLoadClick.current;
    if (tool !== 'select' || !showLoads || !pending || Date.now() - pending.time > 600 || Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > 6) return;
    const load = paramsRef.current.loads.find(l => l.id === pending.id);
    if (!load) return;
    event.preventDefault(); event.stopPropagation(); pendingLoadClick.current = null;
    setSelection({ kind: 'load', id: load.id }); changeLoadAngle(load, solverLoadAngle(load) + 180);
  };
  const directionControl = selectedLoad && tool === 'select' ? (() => {
    const el = params.elements.find(e => e.id === selectedLoad.elementId);
    const a = params.nodes.find(n => n.id === (selectedLoad.nodeId ?? el?.startNode)), b = params.nodes.find(n => n.id === el?.endNode);
    if (!a) return null;
    const t = selectedLoad.type === 'distributed' || selectedLoad.type === 'trapezoidal' ? ((selectedLoad.startLocation ?? 0) + (selectedLoad.endLocation ?? 1)) / 2 : selectedLoad.location ?? .5;
    const p = toCanvas(b ? { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t } : a, viewport);
    return <LoadDirectionControl {...p} width={viewport.width} height={viewport.height} moment={selectedLoad.type === 'moment'} angle={solverLoadAngle(selectedLoad)} onAngleChange={angle => changeLoadAngle(selectedLoad, angle)} onReverse={() => changeLoadAngle(selectedLoad, solverLoadAngle(selectedLoad) + 180)} onClose={() => setSelection(null)}
      onRotateStart={() => { rotationBefore.current = paramsRef.current; }} onRotateEnd={() => { const before = rotationBefore.current; rotationBefore.current = null; if (before && modelSignature(before) !== modelSignature(paramsRef.current)) setPast(old => [...old.slice(-49), before]); }} />;
  })() : null;
  const loadHandles = selectedLoad && tool === 'select' ? (() => {
    const el = params.elements.find(e => e.id === selectedLoad.elementId);
    const a = params.nodes.find(n => n.id === (selectedLoad.nodeId ?? el?.startNode)), b = params.nodes.find(n => n.id === el?.endNode);
    if (!a) return null;
    const at = (t: number) => toCanvas(b ? { x: a.x+(b.x-a.x)*t, y: a.y+(b.y-a.y)*t } : a, viewport);
    const line = selectedLoad.type === 'distributed' || selectedLoad.type === 'trapezoidal';
    const handles: [LoadDragPart, number, string][] = line
      ? [['start', selectedLoad.startLocation ?? 0, '拖动荷载起点'], ['end', selectedLoad.endLocation ?? 1, '拖动荷载终点'], ['move', ((selectedLoad.startLocation ?? 0)+(selectedLoad.endLocation ?? 1))/2, '拖动荷载作用范围']]
      : [['move', selectedLoad.location ?? .5, '拖动荷载作用点']];
    return <g>{handles.map(([part,t,label]) => { const p=at(t); return <circle key={part} {...{cx:p.x,cy:p.y}} r={6} fill="#0c2635" stroke="#67e8f9" strokeWidth={2} role="button" aria-label={label} style={{cursor:'grab'}} onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      const svg = event.currentTarget.ownerSVGElement; svg?.setPointerCapture?.(event.pointerId);
      gesture.current = { kind:'loadDrag', id:selectedLoad.id, down:pointFromEvent(event), before:paramsRef.current, part };
      setGesturePreview(gesture.current);
    }}><title>{label}</title></circle>; })}</g>;
  })() : null;
  const overlay = <g pointerEvents="none" aria-hidden="true">
    {gesturePreview?.kind === 'box' && cursor && (() => {
      const a=toCanvas(gesturePreview.down,viewport),b=toCanvas(cursor,viewport),crossing=cursor.x<gesturePreview.down.x;
      return <rect data-selection-box={crossing?'crossing':'contains'} x={Math.min(a.x,b.x)} y={Math.min(a.y,b.y)} width={Math.abs(b.x-a.x)} height={Math.abs(b.y-a.y)} fill={crossing?'#34d399':'#38bdf8'} fillOpacity={.1} stroke={crossing?'#34d399':'#38bdf8'} strokeWidth={1.2} strokeDasharray={crossing?'5 3':undefined}/>;
    })()}
    {batchSelection.map(item => {
      if(item.kind==='node') {const node=displayNodes.find(n=>n.id===item.id);if(!node)return null;const p=toCanvas(node,viewport);return <circle key={`n${item.id}`} cx={p.x} cy={p.y} r={8} fill="#22d3ee" fillOpacity={.15} stroke="#67e8f9" strokeWidth={2}/>;}
      const el=params.elements.find(e=>e.id===(item.kind==='element'?item.id:params.loads.find(l=>l.id===item.id)?.elementId));
      const load=item.kind==='load'?params.loads.find(l=>l.id===item.id):null;
      const a=displayNodes.find(n=>n.id===(load?.nodeId??el?.startNode)),b=displayNodes.find(n=>n.id===el?.endNode);if(!a)return null;
      const at=(t:number)=>toCanvas(b?{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}:a,viewport);
      if(item.kind==='element'&&b){const p=at(0),q=at(1);return <line key={`e${item.id}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#67e8f9" strokeWidth={5} strokeOpacity={.65}/>;}
      if(load){const line=load.type==='distributed'||load.type==='trapezoidal';const p=at(line?load.startLocation??0:load.location??.5),q=at(line?load.endLocation??1:load.location??.5);return <rect key={`l${item.id}`} x={Math.min(p.x,q.x)-10} y={Math.min(p.y,q.y)-32} width={Math.abs(q.x-p.x)+20} height={Math.abs(q.y-p.y)+64} rx={5} fill="none" stroke="#67e8f9" strokeDasharray="4 3"/>;}
      return null;
    })}
    {params.elements.map(el => {
      const a = displayNodes.find(n => n.id === el.startNode)!, b = displayNodes.find(n => n.id === el.endNode)!; if (!a || !b) return null;
      const p = toCanvas({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, viewport);
      let angle = Math.atan2(-(b.y-a.y),b.x-a.x)*180/Math.PI;
      if(angle>90)angle-=180; if(angle < -90)angle+=180;
      return <text key={el.id} transform={`translate(${p.x} ${p.y}) rotate(${angle})`} y={-10} fill="#9cacc0" fontSize={9} textAnchor="middle" stroke="#0f172a" strokeWidth={3} paintOrder="stroke">E{el.id} · {Number(Math.hypot(b.x-a.x,b.y-a.y).toFixed(2))} m</text>;
    })}
    {selectedElement && (() => { const a = toCanvas(displayNodes.find(n => n.id === selectedElement.startNode)!, viewport), b = toCanvas(displayNodes.find(n => n.id === selectedElement.endNode)!, viewport); return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#22d3ee" strokeWidth={5} strokeOpacity={0.7} />; })()}
    {selectedLoad && (() => {
      const el = params.elements.find(e => e.id === selectedLoad.elementId);
      const a = displayNodes.find(n => n.id === (selectedLoad.nodeId ?? el?.startNode)), b = displayNodes.find(n => n.id === el?.endNode);
      if (!a) return null;
      const at = (t: number) => toCanvas(b ? { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t } : a, viewport);
      if (selectedLoad.type === 'distributed' || selectedLoad.type === 'trapezoidal') {
        const p = at(selectedLoad.startLocation ?? 0), q = at(selectedLoad.endLocation ?? 1);
        return <rect x={Math.min(p.x, q.x) - 12} y={Math.min(p.y, q.y) - 30} width={Math.abs(q.x - p.x) + 24} height={Math.abs(q.y - p.y) + 60} rx={6} fill="none" stroke="#22d3ee" strokeWidth={1.5} strokeDasharray="4 3" />;
      }
      const p = at(selectedLoad.location ?? 0.5), aRad = solverLoadAngle(selectedLoad) * Math.PI / 180;
      return <circle cx={p.x - (selectedLoad.type !== 'moment' ? Math.cos(aRad) * 12 : 0)} cy={p.y + (selectedLoad.type !== 'moment' ? Math.sin(aRad) * 12 : 0)} r={22} fill="none" stroke="#22d3ee" strokeWidth={1.5} strokeDasharray="4 3" />;
    })()}
    {selectedNode && (() => { const p = toCanvas(selectedNode, viewport); return <circle cx={p.x} cy={p.y} r={9} fill="none" stroke="#22d3ee" strokeWidth={2} />; })()}
    {anchor && memberEnd && (() => { const a = toCanvas(anchor, viewport), b = toCanvas(memberEnd, viewport); return <g><circle cx={a.x} cy={a.y} r={5} fill="#fbbf24" /><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fbbf24" strokeWidth={2.5} strokeDasharray="6 4" /><text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 12} fill="#fbbf24" fontSize={12} textAnchor="middle">{format(Math.hypot(memberEnd.x - anchor.x, memberEnd.y - anchor.y))} m</text></g>; })()}
    {linePreview && <g><line x1={linePreview.a.x} y1={linePreview.a.y - 18} x2={linePreview.b.x} y2={linePreview.b.y - 18} stroke="#d8b4fe" strokeWidth={5} strokeDasharray="5 3" /><text x={(linePreview.a.x + linePreview.b.x) / 2} y={(linePreview.a.y + linePreview.b.y) / 2 - 32} fill="#d8b4fe" fontSize={12} textAnchor="middle">范围 {format(linePreview.length)} m</text></g>}
    {cursorPx && tool !== 'select' && tool !== 'pan' && <circle cx={cursorPx.x} cy={cursorPx.y} r={6} fill="none" stroke="#67e8f9" strokeWidth={1.5} />}
    {cursorPx && gesturePreview?.kind === 'node' && <circle cx={cursorPx.x} cy={cursorPx.y} r={7} fill="#fbbf24" fillOpacity={0.5} stroke="#fbbf24" />}
  </g>;
  const iconButton = (label: string, icon: React.ReactNode, action: () => void, disabled = false) => <button type="button" title={label} aria-label={label} disabled={disabled} onClick={action} className="rounded-md border border-slate-700 bg-slate-900 p-2 text-slate-400 hover:border-slate-500 hover:text-white disabled:opacity-30">{icon}</button>;
  const keyDown = (event: React.KeyboardEvent) => {
    if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes((event.target as HTMLElement).tagName)) return;
    if (event.key === 'Escape') { event.preventDefault(); cancelGesture(); setBatchSelection([]); setSelection(null); setNotice('已结束当前绘制'); }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeSelection(); }
    else if (event.key === 'Enter' && anchor) { event.preventDefault(); finishMember(anchor, cursor ?? anchor); }
    else if (!event.ctrlKey && !event.metaKey && !event.altKey) { const shortcut = ({ v: 'select', l: 'member', n: 'node', h: 'pan' } as const)[event.key.toLowerCase()]; if (shortcut) { event.preventDefault(); chooseTool(shortcut); } }
  };

  return <section aria-label="直接绘图建模" onDoubleClickCapture={reverseFromDoubleClick} onKeyDown={keyDown} className="canvas-editor flex h-full min-h-0 flex-col overflow-auto rounded-lg border border-slate-800 bg-slate-900">
    <div className="canvas-command-row">
    <div role="toolbar" aria-label="绘图工具" className="canvas-draw-toolbar">
      <div className="canvas-tool-group">
        {tools.filter(item => ['select', 'member', 'node'].includes(item.id)).map(item => {
          const shortcut = ({ select: 'V', member: 'L', node: 'N' } as Record<string, string>)[item.id];
          return <button key={item.id} type="button" title={`${item.label} (${shortcut})`} aria-label={item.label} aria-keyshortcuts={shortcut} aria-pressed={tool === item.id} onClick={() => chooseTool(item.id)}>{item.icon}<span className="canvas-tool-label">{({ select: '选择', member: '杆件', node: '节点' } as Record<string, string>)[item.id]}</span></button>;
        })}
        <button type="button" title="平移画布 (H / 右键或中键拖动)" aria-label="平移画布" aria-keyshortcuts="H" aria-pressed={tool === 'pan'} onClick={() => chooseTool('pan')}><Move size={14} /></button>
      </div>
      <div className="canvas-insert-group">
        <select aria-label="选择支座工具" value={['fixed', 'pinned', 'rollerY', 'rollerX'].includes(tool) ? tool : ''} onChange={event => chooseTool(event.target.value as Tool)} className={['fixed', 'pinned', 'rollerY', 'rollerX'].includes(tool) ? 'is-active' : ''}><option value="" disabled>放支座</option>{tools.filter(item => ['fixed', 'pinned', 'rollerY', 'rollerX'].includes(item.id)).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
        <select aria-label="选择荷载工具" value={['point', 'distributed', 'trapezoidal', 'moment'].includes(tool) ? tool : ''} onChange={event => chooseTool(event.target.value as Tool)} className={['point', 'distributed', 'trapezoidal', 'moment'].includes(tool) ? 'is-active' : ''}><option value="" disabled>加荷载</option>{tools.filter(item => ['point', 'distributed', 'trapezoidal', 'moment'].includes(item.id)).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
      </div>
    </div>
    <div role="toolbar" aria-label="画布视图" className="canvas-view-toolbar">
      <div className="canvas-view-group">{iconButton('撤销画布操作', <Undo2 size={14} />, undo, !past.length)}{iconButton('重做画布操作', <Redo2 size={14} />, redo, !future.length)}</div>
      <div className="canvas-view-group">{iconButton('缩小画布', <ZoomOut size={14} />, () => setViewport(v => zoomCanvasAt(v, { x: v.width / 2, y: v.height / 2 }, 1 / 1.25)))}{iconButton('放大画布', <ZoomIn size={14} />, () => setViewport(v => zoomCanvasAt(v, { x: v.width / 2, y: v.height / 2 }, 1.25)))}{iconButton('适应模型', <Maximize2 size={14} />, () => { const bounds = surfaceRef.current?.getBoundingClientRect(); setViewport(fitCanvas(params.nodes, bounds?.width || viewport.width, bounds?.height || viewport.height)); })}</div>
      <button type="button" aria-label="新建空白模型" title="新建空白模型（可撤销）" onClick={() => { chooseTool('member'); setSelection(null); setViewport(fitCanvas([], viewport.width, viewport.height)); commit({ ...params, nodes: [], elements: [], loads: [] }, '已新建空白模型，可撤销恢复'); }} className="canvas-new-model"><FilePlus2 size={14} />新建空白</button>
    </div>
    </div>
    <div className="canvas-config-row">
    {tool === 'member' && <div className="canvas-tool-options">
      <label>长度<input aria-label="绘制杆件长度 (m)" type="number" min="0" step="any" value={memberLength} onChange={e => setMemberLength(e.target.value)} placeholder="自由" className={inputClass} />m</label>
      <select aria-label="绘制杆件方向" value={memberDirection} onChange={e => setMemberDirection(e.target.value)} className={inputClass}><option value="free">任意方向</option><option value="horizontal">水平</option><option value="vertical">竖直</option></select>
      <label><input type="checkbox" checked={continuous} onChange={e => setContinuous(e.target.checked)} className="accent-cyan-400" />连续绘制</label>
      {anchor && <button type="button" onClick={() => finishMember(anchor, cursor ?? anchor)} className="canvas-complete-member">完成杆件</button>}
    </div>}
    {['point', 'moment', 'distributed', 'trapezoidal'].includes(tool) && <div className="canvas-tool-options">
      <label>{tool === 'trapezoidal' ? '起点大小' : '大小'}<input aria-label="绘制荷载大小" type="number" step="any" value={tool === 'distributed' || tool === 'trapezoidal' ? lineMagnitude : magnitude} onChange={e => tool === 'distributed' || tool === 'trapezoidal' ? setLineMagnitude(e.target.value) : setMagnitude(e.target.value)} className={inputClass} />{tool === 'moment' ? 'kN·m' : tool === 'point' ? 'kN' : 'kN/m'}</label>
      {tool === 'trapezoidal' && <label>终点大小<input aria-label="绘制荷载终点大小" type="number" step="any" value={magnitudeEnd} onChange={e => setMagnitudeEnd(e.target.value)} className={inputClass} /></label>}
      {tool !== 'moment' && <select aria-label="绘制荷载方向" value={loadDirection} onChange={e => setLoadDirection(e.target.value as 'x' | 'y')} className={inputClass}><option value="y">竖向 Y</option><option value="x">水平 X</option></select>}
    </div>}
    <div className="canvas-settings-row">
      <span className="canvas-edit-case">编辑 {loadCaseName(params, getActiveLoadCaseId(params))}</span>
      <label title="吸附到节点、杆件和网格；按住 Alt 临时自由绘制"><input type="checkbox" checked={snapping} onChange={e => setSnapping(e.target.checked)} className="accent-cyan-400" />吸附<span className="canvas-snap-hint"> · Alt 自由</span></label>
      <label>网格<select aria-label="画布网格间距" value={grid} onChange={e => setGrid(Number(e.target.value))} className={inputClass}>{[0.1, 0.25, 0.5, 1, 2].map(value => <option key={value} value={value}>{value} m</option>)}</select></label>
    </div>
    </div>
    <div className={`canvas-editor-body ${selection ? "has-selection" : ""}`}><div ref={surfaceRef} className="canvas-editor-surface">{renderCanvas({ viewport, previewNodes, background, overlay: <>{overlay}{directionControl}{loadHandles}</>, svgProps: { role: 'application', 'aria-label': '结构绘图画布', tabIndex: 0, style: { touchAction: 'none', cursor: gesturePreview?.kind === 'loadDrag' ? 'grabbing' : gesturePreview?.kind === 'pan' ? 'grabbing' : tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair' }, onPointerDown, onPointerMove, onPointerUp, onDoubleClick: event => { if (tool !== 'select' || !showLoads) return; const hit = hitCanvasObject(pointFromEvent(event), params, viewport.scale); if (hit?.kind === 'load') { const load = params.loads.find(l => l.id === hit.id); if (load) { setSelection(hit); changeLoadAngle(load, solverLoadAngle(load) + 180); } } }, onContextMenu: event => event.preventDefault(), onAuxClick: event => event.preventDefault(), onPointerCancel: cancelGesture, onPointerLeave: () => { if (!gesture.current) setCursor(null); } } })}</div>{batchSelection.length>1 && <aside className="canvas-inspector bg-slate-900/95 p-4" aria-label="框选对象属性"><div className="flex items-center justify-between"><h4 className="text-xs font-semibold text-cyan-200">已选中 {batchSelection.length} 个对象</h4><button type="button" aria-label="取消框选" onClick={()=>setBatchSelection([])} className="text-xs text-slate-400">取消</button></div><p className="my-3 text-[11px] text-slate-400">{batchSelection.filter(i=>i.kind==='node').length} 节点 · {batchSelection.filter(i=>i.kind==='element').length} 杆件 · {batchSelection.filter(i=>i.kind==='load').length} 荷载</p><p className="mb-3 text-[10px] text-slate-500">删除节点会同时删除相连杆件及其荷载。可用 Ctrl / ⌘ Z 撤销。</p><button type="button" onClick={removeSelection} className="w-full rounded border border-rose-500/30 py-2 text-xs text-rose-300">删除选中对象</button></aside>}{selection && <CanvasSelectionEditor params={params} selection={selection} onApply={next => run(() => commit(next, '已应用对象属性'))} onDelete={removeSelection} onDeselect={() => setSelection(null)} />}</div>
    <div className="canvas-statusbar"><div><span role="status" className={notice ? 'text-amber-200' : ''}>{gesturePreview?.kind === 'node' ? '拖动预览 · 松开后吸附网格并计算 · Alt 自由定位' : notice || help[tool]}</span><span className="canvas-coordinate">{cursor ? `X ${format(cursor.x)} · Y ${format(cursor.y)} m` : `${params.nodes.length} 节点 · ${params.elements.length} 杆件`}</span></div><span className="canvas-shortcut-hint">L 画杆件 · V 选择 · N 节点 · 滚轮缩放 · 右键 / 中键平移 · Esc 结束</span></div>
  </section>;
}
