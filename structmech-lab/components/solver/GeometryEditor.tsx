import React from 'react';
import { SolverParams, StructureType, SolverNode, SolverElement } from '../../types';
import { autoConnectNodes } from '../../utils/geometryGenerator';

interface GeometryEditorProps {
  params: SolverParams;
  setParams: React.Dispatch<React.SetStateAction<SolverParams>>;
}

const GeometryEditor: React.FC<GeometryEditorProps> = ({ params, setParams }) => {
  const handleChange = (key: keyof SolverParams, value: any) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const switchToCustom = () => {
      if (params.structureType !== StructureType.Custom) {
          handleChange('structureType', StructureType.Custom);
      }
  };

  const handleAutoConnect = () => {
      switchToCustom();
      const res = autoConnectNodes(params.nodes, params.elements, params.loads);
      setParams(prev => ({ ...prev, nodes: res.nodes, elements: res.elements, loads: res.loads }));
  };

  const updateNode = (id: number, field: keyof SolverNode, value: any) => {
      switchToCustom();
      setParams(prev => ({ ...prev, nodes: prev.nodes.map(n => n.id !== id ? n : { ...n, [field]: value }) }));
  };

  const getNodeSupportType = (r: [boolean, boolean, boolean]) => {
      if (r[0] && r[1] && r[2]) return 'Fixed';
      if (r[0] && r[1] && !r[2]) return 'Pinned';
      if (!r[0] && r[1] && !r[2]) return 'RollerY';
      if (r[0] && !r[1] && !r[2]) return 'RollerX';
      if (!r[0] && !r[1] && !r[2]) return 'Free';
      return 'Custom';
  };

  const setNodeSupport = (id: number, type: string) => {
      switchToCustom();
      let r: [boolean, boolean, boolean] = [false, false, false];
      switch (type) {
          case 'Fixed': r = [true, true, true]; break;
          case 'Pinned': r = [true, true, false]; break;
          case 'RollerY': r = [false, true, false]; break;
          case 'RollerX': r = [true, false, false]; break;
          case 'Free': r = [false, false, false]; break;
          default: return;
      }
      setParams(prev => ({ ...prev, nodes: prev.nodes.map(n => n.id === id ? { ...n, restraints: r } : n) }));
  };

  const addNode = () => {
      switchToCustom();
      setParams(prev => {
          const maxId = prev.nodes.reduce((m, n) => Math.max(m, n.id), 0);
          return { ...prev, nodes: [...prev.nodes, { id: maxId + 1, x: 0, y: 0, restraints: [false, false, false] }] };
      });
  };

  const removeNode = (id: number) => {
      switchToCustom();
      setParams(prev => ({
          ...prev,
          nodes: prev.nodes.filter(n => n.id !== id),
          elements: prev.elements.filter(e => e.startNode !== id && e.endNode !== id),
          loads: prev.loads.filter(l => l.nodeId !== id && 
             (!l.elementId || !prev.elements.some(e => e.id === l.elementId && (e.startNode === id || e.endNode === id))))
      }));
  };

  const updateElement = (id: number, field: keyof SolverElement, value: any) => {
      switchToCustom();
      setParams(prev => ({ ...prev, elements: prev.elements.map(e => e.id === id ? { ...e, [field]: value } : e) }));
  };

  const addElement = () => {
      if (params.nodes.length < 2) return;
      switchToCustom();
      setParams(prev => {
          const maxId = prev.elements.reduce((m, e) => Math.max(m, e.id), 0);
          const n1 = prev.nodes[0].id;
          const n2 = prev.nodes[1] ? prev.nodes[1].id : prev.nodes[0].id;
          return {
              ...prev,
              elements: [...prev.elements, { 
                  id: maxId + 1, startNode: n1, endNode: n2, 
                  E: prev.elasticModulus, A: prev.crossSectionArea, I: prev.momentOfInertia,
                  releaseStart: false, releaseEnd: false
                }]
          };
      });
  };

  const removeElement = (id: number) => {
      switchToCustom();
      setParams(prev => ({
          ...prev,
          elements: prev.elements.filter(e => e.id !== id),
          loads: prev.loads.filter(l => l.elementId !== id)
      }));
  };

  return (
    <div className="w-72 bg-slate-900 p-4 flex flex-col gap-4 overflow-y-auto border-l border-slate-800 h-full flex-shrink-0">
        <div>
            <h2 className="text-xs font-bold text-violet-400 uppercase tracking-wider mb-0.5">几何建模</h2>
            <p className="text-[10px] text-slate-400">节点与单元编辑器</p>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex justify-between items-center mb-1">
            <h4 className="text-[10px] text-slate-300 font-semibold">节点 (Nodes)</h4>
            <button onClick={addNode} className="text-[9px] bg-violet-600 px-1.5 py-0.5 rounded hover:bg-violet-500 text-white transition-colors">+ 添加</button>
            </div>
            <div className="space-y-1 overflow-y-auto pr-1 flex-1 bg-slate-950/30 p-1.5 rounded-lg border border-slate-800/50">
                {params.nodes.length === 0 && <div className="text-[10px] text-slate-600 text-center py-3">暂无节点</div>}
                {params.nodes.map(n => (
                    <div key={n.id} className="bg-slate-800 p-1.5 rounded text-[10px] grid grid-cols-[16px_1fr_1fr_auto] gap-1.5 items-center group">
                        <span className="text-slate-500 font-mono font-bold">{n.id}</span>
                        <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-0.5">
                                <span className="text-[8px] text-slate-500 w-2">X</span>
                                <input type="number" value={n.x} onChange={(e) => updateNode(n.id, 'x', Number(e.target.value))} className="bg-slate-900 w-full p-0.5 rounded border border-slate-700 text-center text-white focus:border-violet-500 outline-none text-[10px]" step="0.1"/>
                            </div>
                            <div className="flex items-center gap-0.5">
                                <span className="text-[8px] text-slate-500 w-2">Y</span>
                                <input type="number" value={n.y} onChange={(e) => updateNode(n.id, 'y', Number(e.target.value))} className="bg-slate-900 w-full p-0.5 rounded border border-slate-700 text-center text-white focus:border-violet-500 outline-none text-[10px]" step="0.1"/>
                            </div>
                        </div>
                        <div className="flex flex-col gap-0.5">
                            <label className="text-[8px] text-slate-500 text-center">约束</label>
                            <select value={getNodeSupportType(n.restraints)} onChange={(e) => setNodeSupport(n.id, e.target.value)}
                                className="bg-slate-900 w-full p-0.5 rounded border border-slate-700 text-white text-[9px] focus:border-violet-500 outline-none appearance-none cursor-pointer hover:bg-slate-800 text-center">
                                <option value="Fixed">Fixed</option>
                                <option value="Pinned">Pinned</option>
                                <option value="RollerY">Roller-Y</option>
                                <option value="RollerX">Roller-X</option>
                                <option value="Free">Free</option>
                            </select>
                        </div>
                        <button onClick={() => removeNode(n.id)} className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xs">×</button>
                    </div>
                ))}
            </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col border-t border-slate-800 pt-3">
            <div className="flex justify-between items-center mb-1">
            <h4 className="text-[10px] text-slate-300 font-semibold">单元 (Elements)</h4>
            <div className="flex gap-1">
                <button onClick={handleAutoConnect} title="自动打断T型连接"
                    className="text-[9px] bg-emerald-600 px-1.5 py-0.5 rounded hover:bg-emerald-500 text-white transition-colors">🔗</button>
                <button onClick={addElement} className="text-[9px] bg-violet-600 px-1.5 py-0.5 rounded hover:bg-violet-500 text-white transition-colors">+ 添加</button>
            </div>
            </div>
            <div className="space-y-1 overflow-y-auto pr-1 flex-1 bg-slate-950/30 p-1.5 rounded-lg border border-slate-800/50">
                {params.elements.length === 0 && <div className="text-[10px] text-slate-600 text-center py-3">暂无单元</div>}
                {params.elements.map(e => (
                    <div key={e.id} className="bg-slate-800 p-1.5 rounded text-[10px] grid grid-cols-[16px_1fr_1fr_32px_auto] gap-1 items-center group">
                        <span className="text-slate-500 font-mono font-bold">{e.id}</span>
                        <div>
                            <label className="text-[8px] text-slate-500 block text-center">N1</label>
                            <select value={e.startNode} onChange={(ev) => updateElement(e.id, 'startNode', Number(ev.target.value))} 
                                className="bg-slate-900 w-full p-0.5 rounded border border-slate-700 text-center text-white focus:border-violet-500 outline-none text-[9px] appearance-none cursor-pointer hover:bg-slate-800">
                                {params.nodes.map(n => (<option key={n.id} value={n.id}>{n.id}</option>))}
                            </select>
                        </div>
                        <div>
                            <label className="text-[8px] text-slate-500 block text-center">N2</label>
                            <select value={e.endNode} onChange={(ev) => updateElement(e.id, 'endNode', Number(ev.target.value))} 
                                className="bg-slate-900 w-full p-0.5 rounded border border-slate-700 text-center text-white focus:border-violet-500 outline-none text-[9px] appearance-none cursor-pointer hover:bg-slate-800">
                                {params.nodes.map(n => (<option key={n.id} value={n.id}>{n.id}</option>))}
                            </select>
                        </div>
                        <div className="flex items-center justify-center gap-0.5">
                            <div className="flex flex-col items-center">
                                <label className="text-[7px] text-slate-500">S</label>
                                <input type="checkbox" checked={!!e.releaseStart} onChange={(ev) => updateElement(e.id, 'releaseStart', ev.target.checked)}
                                    className="accent-violet-500 w-2.5 h-2.5" title="Release Start"/>
                            </div>
                            <div className="flex flex-col items-center">
                                <label className="text-[7px] text-slate-500">E</label>
                                <input type="checkbox" checked={!!e.releaseEnd} onChange={(ev) => updateElement(e.id, 'releaseEnd', ev.target.checked)}
                                    className="accent-violet-500 w-2.5 h-2.5" title="Release End"/>
                            </div>
                        </div>
                        <button onClick={() => removeElement(e.id)} className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xs">×</button>
                    </div>
                ))}
            </div>
        </div>
        
        <div className="text-[9px] text-slate-500 border-t border-slate-800 pt-2">
            提示：T型连接处点击"🔗"自动打断
        </div>
    </div>
  );
};

export default GeometryEditor;
