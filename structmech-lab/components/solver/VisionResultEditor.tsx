import React, { useCallback, useMemo, useState } from 'react';
import { Check, Plus, Trash2, X as XIcon } from 'lucide-react';
import type { AgentAction, AgentParseResult } from '@/utils/agent/types';

// ── Editable data types (mirrors payload shape) ──

interface EditNode {
  id: number;
  x: number;
  y: number;
  restraints: [boolean, boolean, boolean];
}

interface EditElement {
  id: number;
  startNode: number;
  endNode: number;
  releaseStart: boolean;
  releaseEnd: boolean;
}

interface EditLoad {
  id: number;
  type: 'point' | 'distributed' | 'moment';
  magnitude: number;
  direction: 'x' | 'y';
  elementId: number;
  location: number;
}

interface VisionResultEditorProps {
  parsed: AgentParseResult;
  onConfirm: (corrected: AgentParseResult) => void;
  onCancel: () => void;
}

// ── Helpers ──

function extractPayload(parsed: AgentParseResult) {
  const action = parsed.actions.find(a => a.kind === 'create_custom_structure');
  if (!action) return null;
  const p = action.payload;
  return {
    nodes: Array.isArray(p.nodes) ? p.nodes : [],
    elements: Array.isArray(p.elements) ? p.elements : [],
    loads: Array.isArray(p.loads) ? p.loads : [],
  };
}

function toEditNodes(raw: unknown[]): EditNode[] {
  return raw.map((n: any, i) => ({
    id: typeof n.id === 'number' ? n.id : i + 1,
    x: Number(n.x) || 0,
    y: Number(n.y) || 0,
    restraints: Array.isArray(n.restraints) && n.restraints.length === 3
      ? [Boolean(n.restraints[0]), Boolean(n.restraints[1]), Boolean(n.restraints[2])] as [boolean, boolean, boolean]
      : [false, false, false],
  }));
}

function toEditElements(raw: unknown[]): EditElement[] {
  return raw.map((e: any, i) => ({
    id: typeof e.id === 'number' ? e.id : i + 1,
    startNode: Number(e.startNode) || 1,
    endNode: Number(e.endNode) || 2,
    releaseStart: Boolean(e.releaseStart),
    releaseEnd: Boolean(e.releaseEnd),
  }));
}

function toEditLoads(raw: unknown[]): EditLoad[] {
  return raw.map((l: any, i) => ({
    id: i + 1,
    type: (['point', 'distributed', 'moment'].includes(l.type) ? l.type : 'point') as EditLoad['type'],
    magnitude: Number(l.magnitude) || 0,
    direction: (l.direction === 'x' ? 'x' : 'y') as 'x' | 'y',
    elementId: Number(l.elementId) || 1,
    location: Number(l.location) || 0.5,
  }));
}

function restraintLabel(r: [boolean, boolean, boolean]): string {
  if (r[0] && r[1] && r[2]) return '固定端';
  if (!r[0] && r[1] && r[2]) return '定向支座';
  if (r[0] && r[1] && !r[2]) return '铰支座';
  if (!r[0] && r[1] && !r[2]) return '滚动支座';
  return '自由';
}

function restraintFromLabel(label: string): [boolean, boolean, boolean] {
  switch (label) {
    case '固定端': return [true, true, true];
    case '定向支座': return [false, true, true];
    case '铰支座': return [true, true, false];
    case '滚动支座': return [false, true, false];
    default: return [false, false, false];
  }
}

// ── SVG Preview ──

const SVGPreview: React.FC<{ nodes: EditNode[]; elements: EditElement[]; loads: EditLoad[] }> = ({
  nodes, elements, loads,
}) => {
  const { viewBox, scale, offsetX, offsetY } = useMemo(() => {
    if (nodes.length === 0) return { viewBox: '0 0 200 150', scale: 1, offsetX: 0, offsetY: 0 };
    const xs = nodes.map(n => n.x);
    const ys = nodes.map(n => n.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const pad = 40;
    const w = 320;
    const h = 200;
    const s = Math.min((w - 2 * pad) / rangeX, (h - 2 * pad) / rangeY);
    return {
      viewBox: `0 0 ${w} ${h}`,
      scale: s,
      offsetX: pad + ((w - 2 * pad) - rangeX * s) / 2 - minX * s,
      offsetY: h - pad - ((h - 2 * pad) - rangeY * s) / 2 + minY * s,
    };
  }, [nodes]);

  const tx = useCallback((x: number) => offsetX + x * scale, [offsetX, scale]);
  const ty = useCallback((y: number) => offsetY - y * scale, [offsetY, scale]);

  const nodeMap = useMemo(() => {
    const m = new Map<number, EditNode>();
    nodes.forEach(n => m.set(n.id, n));
    return m;
  }, [nodes]);

  return (
    <svg viewBox={viewBox} className="h-full w-full" style={{ background: '#0f172a' }}>
      {/* Elements */}
      {elements.map(e => {
        const sn = nodeMap.get(e.startNode);
        const en = nodeMap.get(e.endNode);
        if (!sn || !en) return null;
        return (
          <line
            key={`e-${e.id}`}
            x1={tx(sn.x)} y1={ty(sn.y)}
            x2={tx(en.x)} y2={ty(en.y)}
            stroke="#38bdf8" strokeWidth={2.5}
          />
        );
      })}
      {/* Element IDs */}
      {elements.map(e => {
        const sn = nodeMap.get(e.startNode);
        const en = nodeMap.get(e.endNode);
        if (!sn || !en) return null;
        const mx = (tx(sn.x) + tx(en.x)) / 2;
        const my = (ty(sn.y) + ty(en.y)) / 2;
        return (
          <text key={`eid-${e.id}`} x={mx} y={my - 6} textAnchor="middle" fill="#7dd3fc" fontSize={9} fontWeight="bold">
            E{e.id}
          </text>
        );
      })}
      {/* Loads */}
      {loads.map((l, i) => {
        const el = elements.find(e => e.id === l.elementId);
        if (!el) return null;
        const sn = nodeMap.get(el.startNode);
        const en = nodeMap.get(el.endNode);
        if (!sn || !en) return null;
        const loc = l.location ?? 0.5;
        const px = tx(sn.x + (en.x - sn.x) * loc);
        const py = ty(sn.y + (en.y - sn.y) * loc);
        const isDown = l.direction === 'y' && l.magnitude < 0;
        const isUp = l.direction === 'y' && l.magnitude > 0;
        const dy = isDown ? 20 : isUp ? -20 : 0;
        const dx = l.direction === 'x' ? (l.magnitude > 0 ? 20 : -20) : 0;
        if (l.type === 'distributed') {
          return (
            <g key={`load-${i}`}>
              <rect x={tx(sn.x)} y={ty(sn.y) - (l.magnitude < 0 ? 0 : 15)} width={tx(en.x) - tx(sn.x)} height={15}
                fill="rgba(239,68,68,0.2)" stroke="#ef4444" strokeWidth={0.5} />
              <text x={(tx(sn.x) + tx(en.x)) / 2} y={ty(sn.y) - (l.magnitude < 0 ? -12 : 22)} textAnchor="middle"
                fill="#fca5a5" fontSize={8}>{Math.abs(l.magnitude)}kN/m</text>
            </g>
          );
        }
        return (
          <g key={`load-${i}`}>
            <line x1={px} y1={py - dy} x2={px} y2={py} stroke="#ef4444" strokeWidth={2} markerEnd="url(#arrowhead)" />
            <line x1={px - dx} y1={py} x2={px} y2={py} stroke="#ef4444" strokeWidth={2} markerEnd="url(#arrowhead)" />
            <text x={px + 4} y={py - dy - 4} fill="#fca5a5" fontSize={8}>{Math.abs(l.magnitude)}kN</text>
          </g>
        );
      })}
      {/* Nodes */}
      {nodes.map(n => {
        const cx = tx(n.x);
        const cy = ty(n.y);
        const isFixed = n.restraints[0] && n.restraints[1] && n.restraints[2];
        const isGuided = !n.restraints[0] && n.restraints[1] && n.restraints[2];
        const isPinned = n.restraints[0] && n.restraints[1] && !n.restraints[2];
        const isRoller = !n.restraints[0] && n.restraints[1] && !n.restraints[2];
        let fill = '#94a3b8';
        if (isFixed) fill = '#f97316';
        else if (isGuided) fill = '#eab308';
        else if (isPinned) fill = '#22c55e';
        else if (isRoller) fill = '#a78bfa';
        return (
          <g key={`n-${n.id}`}>
            <circle cx={cx} cy={cy} r={5} fill={fill} stroke="#fff" strokeWidth={1} />
            <text x={cx} y={cy - 8} textAnchor="middle" fill="#e2e8f0" fontSize={9} fontWeight="bold">{n.id}</text>
            {isFixed && (
              <rect x={cx - 7} y={cy - 1} width={14} height={3} fill={fill} opacity={0.6} />
            )}
            {isPinned && (
              <polygon points={`${cx},${cy} ${cx - 6},${cy + 8} ${cx + 6},${cy + 8}`} fill="none" stroke={fill} strokeWidth={1.5} />
            )}
            {isRoller && (
              <>
                <polygon points={`${cx},${cy} ${cx - 6},${cy + 8} ${cx + 6},${cy + 8}`} fill="none" stroke={fill} strokeWidth={1.5} />
                <circle cx={cx} cy={cy + 11} r={2.5} fill="none" stroke={fill} strokeWidth={1} />
              </>
            )}
          </g>
        );
      })}
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#ef4444" />
        </marker>
      </defs>
    </svg>
  );
};

// ── Main Editor ──

const VisionResultEditor: React.FC<VisionResultEditorProps> = ({ parsed, onConfirm, onCancel }) => {
  const initial = extractPayload(parsed);
  const [nodes, setNodes] = useState<EditNode[]>(() => toEditNodes(initial?.nodes ?? []));
  const [elements, setElements] = useState<EditElement[]>(() => toEditElements(initial?.elements ?? []));
  const [loads, setLoads] = useState<EditLoad[]>(() => toEditLoads(initial?.loads ?? []));
  const [activeTab, setActiveTab] = useState<'nodes' | 'elements' | 'loads'>('elements');

  // ── Node operations ──
  const updateNode = (id: number, field: string, value: unknown) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, [field]: value } : n));
  };
  const addNode = () => {
    const nextId = nodes.length > 0 ? Math.max(...nodes.map(n => n.id)) + 1 : 1;
    setNodes(prev => [...prev, { id: nextId, x: 0, y: 0, restraints: [false, false, false] }]);
  };
  const removeNode = (id: number) => {
    setNodes(prev => prev.filter(n => n.id !== id));
    setElements(prev => prev.filter(e => e.startNode !== id && e.endNode !== id));
  };

  // ── Element operations ──
  const updateElement = (id: number, field: string, value: unknown) => {
    setElements(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  };
  const addElement = () => {
    const nextId = elements.length > 0 ? Math.max(...elements.map(e => e.id)) + 1 : 1;
    const nodeIds = nodes.map(n => n.id);
    setElements(prev => [...prev, {
      id: nextId,
      startNode: nodeIds[0] ?? 1,
      endNode: nodeIds[1] ?? 2,
      releaseStart: false,
      releaseEnd: false,
    }]);
  };
  const removeElement = (id: number) => {
    setElements(prev => prev.filter(e => e.id !== id));
    setLoads(prev => prev.map(l => l.elementId === id ? { ...l, elementId: elements[0]?.id ?? 1 } : l));
  };

  // ── Load operations ──
  const updateLoad = (id: number, field: string, value: unknown) => {
    setLoads(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  };
  const addLoad = () => {
    const nextId = loads.length > 0 ? Math.max(...loads.map(l => l.id)) + 1 : 1;
    setLoads(prev => [...prev, {
      id: nextId, type: 'point', magnitude: -10, direction: 'y',
      elementId: elements[0]?.id ?? 1, location: 0.5,
    }]);
  };
  const removeLoad = (id: number) => {
    setLoads(prev => prev.filter(l => l.id !== id));
  };

  // ── Confirm ──
  const handleConfirm = () => {
    const correctedAction: AgentAction = {
      kind: 'create_custom_structure',
      payload: {
        nodes: nodes.map(n => ({ id: n.id, x: n.x, y: n.y, restraints: n.restraints })),
        elements: elements.map(e => ({
          id: e.id, startNode: e.startNode, endNode: e.endNode,
          ...(e.releaseStart ? { releaseStart: true } : {}),
          ...(e.releaseEnd ? { releaseEnd: true } : {}),
        })),
        loads: loads.map(l => ({
          type: l.type, magnitude: l.magnitude, direction: l.direction,
          elementId: l.elementId, location: l.location,
        })),
      },
    };
    onConfirm({
      ...parsed,
      actions: [correctedAction],
    });
  };

  // ── Validation ──
  const nodeIds = new Set(nodes.map(n => n.id));
  const invalidElements = elements.filter(e => !nodeIds.has(e.startNode) || !nodeIds.has(e.endNode));
  const elemIds = new Set(elements.map(e => e.id));
  const invalidLoads = loads.filter(l => !elemIds.has(l.elementId));

  const tabClass = (tab: string) =>
    `px-3 py-1 text-[11px] font-semibold rounded-t-lg transition-colors ${
      activeTab === tab
        ? 'bg-slate-800 text-sky-300 border-b-2 border-sky-400'
        : 'text-slate-400 hover:text-slate-200'
    }`;

  const inputClass = 'w-full rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[11px] text-slate-100 outline-none focus:border-sky-500';
  const selectClass = 'w-full rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[11px] text-slate-100 outline-none focus:border-sky-500';

  return (
    <div className="rounded-2xl border border-sky-500/30 bg-slate-900/95 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold text-sky-200">识别结果编辑器</p>
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <span className="rounded bg-sky-900/50 px-1.5 py-0.5">{nodes.length} 节点</span>
          <span className="rounded bg-sky-900/50 px-1.5 py-0.5">{elements.length} 单元</span>
          <span className="rounded bg-sky-900/50 px-1.5 py-0.5">{loads.length} 荷载</span>
        </div>
      </div>

      {/* SVG Preview */}
      <div className="mb-2 h-48 overflow-hidden rounded-xl border border-slate-700">
        <SVGPreview nodes={nodes} elements={elements} loads={loads} />
      </div>

      {/* Legend */}
      <div className="mb-2 flex flex-wrap gap-3 text-[10px] text-slate-400">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-orange-500" />固定端</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-yellow-500" />定向支座</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-green-500" />铰支座</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-violet-400" />滚动支座</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-slate-400" />自由</span>
        <span className="flex items-center gap-1"><span className="inline-block h-1 w-4 bg-sky-400" />单元</span>
        <span className="flex items-center gap-1"><span className="inline-block h-1 w-4 bg-red-500" />荷载</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-700">
        <button type="button" className={tabClass('nodes')} onClick={() => setActiveTab('nodes')}>
          节点 ({nodes.length})
        </button>
        <button type="button" className={tabClass('elements')} onClick={() => setActiveTab('elements')}>
          单元 ({elements.length})
          {invalidElements.length > 0 && <span className="ml-1 text-red-400">⚠</span>}
        </button>
        <button type="button" className={tabClass('loads')} onClick={() => setActiveTab('loads')}>
          荷载 ({loads.length})
          {invalidLoads.length > 0 && <span className="ml-1 text-red-400">⚠</span>}
        </button>
      </div>

      {/* Table */}
      <div className="max-h-40 overflow-auto">
        {activeTab === 'nodes' && (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="px-1 py-1">ID</th>
                <th className="px-1 py-1">X(m)</th>
                <th className="px-1 py-1">Y(m)</th>
                <th className="px-1 py-1">支座</th>
                <th className="w-8 px-1 py-1" />
              </tr>
            </thead>
            <tbody>
              {nodes.map(n => (
                <tr key={n.id} className="border-t border-slate-800">
                  <td className="px-1 py-0.5 text-slate-300">{n.id}</td>
                  <td className="px-1 py-0.5">
                    <input type="number" step="0.1" value={n.x} className={inputClass}
                      onChange={e => updateNode(n.id, 'x', parseFloat(e.target.value) || 0)} />
                  </td>
                  <td className="px-1 py-0.5">
                    <input type="number" step="0.1" value={n.y} className={inputClass}
                      onChange={e => updateNode(n.id, 'y', parseFloat(e.target.value) || 0)} />
                  </td>
                  <td className="px-1 py-0.5">
                    <select value={restraintLabel(n.restraints)} className={selectClass}
                      onChange={e => updateNode(n.id, 'restraints', restraintFromLabel(e.target.value))}>
                      <option>自由</option>
                      <option>滚动支座</option>
                      <option>定向支座</option>
                      <option>铰支座</option>
                      <option>固定端</option>
                    </select>
                  </td>
                  <td className="px-1 py-0.5">
                    <button type="button" onClick={() => removeNode(n.id)}
                      className="rounded p-0.5 text-red-400/60 hover:bg-red-500/10 hover:text-red-400"><Trash2 size={12} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeTab === 'elements' && (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="px-1 py-1">ID</th>
                <th className="px-1 py-1">起始</th>
                <th className="px-1 py-1">终止</th>
                <th className="px-1 py-1">铰接</th>
                <th className="w-8 px-1 py-1" />
              </tr>
            </thead>
            <tbody>
              {elements.map(e => {
                const invalid = !nodeIds.has(e.startNode) || !nodeIds.has(e.endNode);
                return (
                  <tr key={e.id} className={`border-t border-slate-800 ${invalid ? 'bg-red-500/10' : ''}`}>
                    <td className="px-1 py-0.5 text-slate-300">{e.id}</td>
                    <td className="px-1 py-0.5">
                      <select value={e.startNode} className={`${selectClass} ${!nodeIds.has(e.startNode) ? 'border-red-500' : ''}`}
                        onChange={ev => updateElement(e.id, 'startNode', parseInt(ev.target.value))}>
                        {nodes.map(n => <option key={n.id} value={n.id}>{n.id}</option>)}
                        {!nodeIds.has(e.startNode) && <option value={e.startNode}>{e.startNode} ⚠</option>}
                      </select>
                    </td>
                    <td className="px-1 py-0.5">
                      <select value={e.endNode} className={`${selectClass} ${!nodeIds.has(e.endNode) ? 'border-red-500' : ''}`}
                        onChange={ev => updateElement(e.id, 'endNode', parseInt(ev.target.value))}>
                        {nodes.map(n => <option key={n.id} value={n.id}>{n.id}</option>)}
                        {!nodeIds.has(e.endNode) && <option value={e.endNode}>{e.endNode} ⚠</option>}
                      </select>
                    </td>
                    <td className="px-1 py-0.5">
                      <select value={e.releaseStart && e.releaseEnd ? '两端' : e.releaseStart ? '起端' : e.releaseEnd ? '终端' : '无'}
                        className={selectClass}
                        onChange={ev => {
                          const v = ev.target.value;
                          updateElement(e.id, 'releaseStart', v === '起端' || v === '两端');
                          updateElement(e.id, 'releaseEnd', v === '终端' || v === '两端');
                        }}>
                        <option>无</option>
                        <option>起端</option>
                        <option>终端</option>
                        <option>两端</option>
                      </select>
                    </td>
                    <td className="px-1 py-0.5">
                      <button type="button" onClick={() => removeElement(e.id)}
                        className="rounded p-0.5 text-red-400/60 hover:bg-red-500/10 hover:text-red-400"><Trash2 size={12} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {activeTab === 'loads' && (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="px-1 py-1">类型</th>
                <th className="px-1 py-1">单元</th>
                <th className="px-1 py-1">位置</th>
                <th className="px-1 py-1">大小</th>
                <th className="px-1 py-1">方向</th>
                <th className="w-8 px-1 py-1" />
              </tr>
            </thead>
            <tbody>
              {loads.map(l => {
                const invalid = !elemIds.has(l.elementId);
                return (
                  <tr key={l.id} className={`border-t border-slate-800 ${invalid ? 'bg-red-500/10' : ''}`}>
                    <td className="px-1 py-0.5">
                      <select value={l.type} className={selectClass}
                        onChange={e => updateLoad(l.id, 'type', e.target.value)}>
                        <option value="point">集中力</option>
                        <option value="distributed">均布</option>
                        <option value="moment">力矩</option>
                      </select>
                    </td>
                    <td className="px-1 py-0.5">
                      <select value={l.elementId} className={`${selectClass} ${invalid ? 'border-red-500' : ''}`}
                        onChange={e => updateLoad(l.id, 'elementId', parseInt(e.target.value))}>
                        {elements.map(el => <option key={el.id} value={el.id}>{el.id}</option>)}
                        {invalid && <option value={l.elementId}>{l.elementId} ⚠</option>}
                      </select>
                    </td>
                    <td className="px-1 py-0.5">
                      {l.type !== 'distributed' ? (
                        <input type="number" step="0.1" min="0" max="1" value={l.location} className={inputClass}
                          onChange={e => updateLoad(l.id, 'location', parseFloat(e.target.value) || 0)} />
                      ) : <span className="text-slate-500">全跨</span>}
                    </td>
                    <td className="px-1 py-0.5">
                      <input type="number" step="1" value={l.magnitude} className={inputClass}
                        onChange={e => updateLoad(l.id, 'magnitude', parseFloat(e.target.value) || 0)} />
                    </td>
                    <td className="px-1 py-0.5">
                      <select value={l.direction} className={selectClass}
                        onChange={e => updateLoad(l.id, 'direction', e.target.value)}>
                        <option value="y">Y</option>
                        <option value="x">X</option>
                      </select>
                    </td>
                    <td className="px-1 py-0.5">
                      <button type="button" onClick={() => removeLoad(l.id)}
                        className="rounded p-0.5 text-red-400/60 hover:bg-red-500/10 hover:text-red-400"><Trash2 size={12} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add button */}
      <button type="button" className="mt-1 flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-sky-300 hover:bg-sky-500/10"
        onClick={() => {
          if (activeTab === 'nodes') addNode();
          else if (activeTab === 'elements') addElement();
          else addLoad();
        }}>
        <Plus size={12} />
        添加{activeTab === 'nodes' ? '节点' : activeTab === 'elements' ? '单元' : '荷载'}
      </button>

      {/* Validation warnings */}
      {invalidElements.length > 0 && (
        <p className="mt-1 text-[10px] text-red-400">
          ⚠ {invalidElements.length} 个单元引用了不存在的节点
        </p>
      )}
      {invalidLoads.length > 0 && (
        <p className="mt-0.5 text-[10px] text-red-400">
          ⚠ {invalidLoads.length} 个荷载引用了不存在的单元
        </p>
      )}

      {/* Actions */}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={handleConfirm}
          disabled={nodes.length < 2 || elements.length < 1 || invalidElements.length > 0}
          className="flex items-center gap-1.5 rounded-xl bg-sky-500 px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-sky-400 disabled:opacity-40">
          <Check size={14} />
          确认应用
        </button>
        <button type="button" onClick={onCancel}
          className="flex items-center gap-1.5 rounded-xl border border-slate-700 px-4 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
          <XIcon size={14} />
          取消
        </button>
      </div>
    </div>
  );
};

export default VisionResultEditor;
