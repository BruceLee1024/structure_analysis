import React from 'react';
import { SolverParams, StructureType, Load } from '../../types';

interface ControlPanelProps {
  params: SolverParams;
  setParams: React.Dispatch<React.SetStateAction<SolverParams>>;
  onClearLoads: () => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ params, setParams, onClearLoads }) => {
  const handleChange = (key: keyof SolverParams, value: any) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const updateLoad = (id: string, field: keyof Load, value: any) => {
      setParams(prev => ({
          ...prev,
          loads: prev.loads.map(l => l.id === id ? { ...l, [field]: value } : l)
      }));
  };

  const toggleLoadTarget = (id: string, currentTargetIsNode: boolean) => {
      setParams(prev => ({
          ...prev,
          loads: prev.loads.map(l => {
              if (l.id !== id) return l;
              if (currentTargetIsNode) {
                  return { ...l, nodeId: undefined, elementId: params.elements[0]?.id || 1, location: 0.5 };
              } else {
                  return { ...l, elementId: undefined, location: undefined, nodeId: params.nodes[0]?.id || 1 };
              }
          })
      }));
  };

  const deleteLoad = (id: string) => {
      setParams(prev => ({ ...prev, loads: prev.loads.filter(l => l.id !== id) }));
  };

  const addManualLoad = (type: 'point' | 'distributed' | 'moment') => {
      const newLoad: Load = {
          id: Date.now().toString(),
          type,
          magnitude: type === 'point' ? -10 : (type === 'moment' ? 10 : -5),
          direction: 'y',
          nodeId: type !== 'distributed' ? (params.nodes[0]?.id || 1) : undefined,
          elementId: type === 'distributed' ? (params.elements[0]?.id || 1) : undefined,
          location: type === 'distributed' ? undefined : (type === 'point' || type === 'moment' ? undefined : 0.5)
      };
      setParams(prev => ({ ...prev, loads: [...prev.loads, newLoad] }));
  };

  const handleDragStart = (e: React.DragEvent, type: 'point' | 'distributed' | 'moment') => {
    e.dataTransfer.setData('loadType', type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const getElementLength = (elId?: number) => {
      if (!elId) return 1;
      const el = params.elements.find(e => e.id === elId);
      if (!el) return 1;
      const n1 = params.nodes.find(n => n.id === el.startNode);
      const n2 = params.nodes.find(n => n.id === el.endNode);
      if (!n1 || !n2) return 1;
      return Math.sqrt(Math.pow(n2.x - n1.x, 2) + Math.pow(n2.y - n1.y, 2));
  };

  const isAxiallyRigid = params.stiffnessType === 'AxiallyRigid';
  const isRigid = params.stiffnessType === 'Rigid';
  const showWidth = params.structureType !== StructureType.Custom;
  const showHeight = params.structureType !== StructureType.Custom && params.structureType !== StructureType.Beam && params.structureType !== StructureType.MultiSpanBeam;
  const showRoof = params.structureType === StructureType.GableFrame;
  const showSpans = params.structureType === StructureType.MultiSpanBeam || params.structureType === StructureType.Truss;
  const showFrameGrid = params.structureType === StructureType.MultiStoryFrame;

  return (
    <div className="w-72 flex-shrink-0 bg-slate-900 p-4 flex flex-col gap-4 overflow-y-auto border-r border-slate-800 h-full">
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-3 rounded-xl border border-slate-700 shadow-lg relative overflow-hidden">
         <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
         <div className="flex items-center gap-3 mb-2 relative z-10">
            <div className="w-8 h-8 shrink-0 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-900/50">
                 <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                 </svg>
            </div>
            <div>
                <h1 className="text-lg font-black text-white tracking-tight leading-none">结构求解器</h1>
                <p className="text-[10px] text-slate-400 mt-0.5">矩阵位移法</p>
            </div>
         </div>
         <div className="grid grid-cols-2 gap-2 relative z-10">
            <div className="bg-slate-950/50 rounded p-1 text-center border border-slate-800/50">
                <span className="text-[9px] text-slate-500 uppercase tracking-wider block">Nodes</span>
                <span className="text-xs font-mono text-indigo-300 font-bold">{params.nodes.length}</span>
            </div>
            <div className="bg-slate-950/50 rounded p-1 text-center border border-slate-800/50">
                <span className="text-[9px] text-slate-500 uppercase tracking-wider block">Elements</span>
                <span className="text-xs font-mono text-indigo-300 font-bold">{params.elements.length}</span>
            </div>
         </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">结构类型</h3>
        <select value={params.structureType} onChange={(e) => handleChange('structureType', e.target.value)}
            className="w-full bg-slate-800 text-slate-200 text-xs rounded p-2 border border-slate-700 focus:ring-1 focus:ring-indigo-500 outline-none">
            <optgroup label="基础">
                <option value={StructureType.Beam}>简支/连续梁</option>
                <option value={StructureType.PortalFrame}>门式刚架</option>
                <option value={StructureType.Cantilever}>悬臂刚架</option>
                <option value={StructureType.GableFrame}>人字形刚架</option>
            </optgroup>
            <optgroup label="高级参数化">
                <option value={StructureType.MultiSpanBeam}>多跨连续梁</option>
                <option value={StructureType.MultiStoryFrame}>多层多跨框架</option>
                <option value={StructureType.Truss}>桁架</option>
            </optgroup>
            <option value={StructureType.Custom}>自定义</option>
        </select>
      </div>

      {params.structureType !== StructureType.Custom && (
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">参数化几何</h3>
        {showWidth && (
            <div>
            <label className="text-[10px] text-slate-300 flex justify-between"><span>总宽度 (m)</span><span>{params.width}</span></label>
            <input type="range" min="3" max="50" step="1" value={params.width} onChange={(e) => handleChange('width', Number(e.target.value))}
                className="w-full accent-indigo-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"/>
            </div>
        )}
        {showHeight && (
            <div>
            <label className="text-[10px] text-slate-300 flex justify-between"><span>总高度 (m)</span><span>{params.height}</span></label>
            <input type="range" min="2" max="50" step="1" value={params.height} onChange={(e) => handleChange('height', Number(e.target.value))}
                className="w-full accent-indigo-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"/>
            </div>
        )}
        {showRoof && (
            <div>
            <label className="text-[10px] text-slate-300 flex justify-between"><span>屋脊高度 (m)</span><span>{params.roofHeight}</span></label>
            <input type="range" min="0.5" max="5" step="0.1" value={params.roofHeight} onChange={(e) => handleChange('roofHeight', Number(e.target.value))}
                className="w-full accent-indigo-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"/>
            </div>
        )}
        {showSpans && (
            <div>
            <label className="text-[10px] text-slate-300 flex justify-between"><span>{params.structureType === StructureType.Truss ? '桁架段数' : '跨数'}</span><span>{params.numSpans}</span></label>
            <input type="range" min="2" max="10" step="1" value={params.numSpans} onChange={(e) => handleChange('numSpans', Number(e.target.value))}
                className="w-full accent-purple-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"/>
            </div>
        )}
        {showFrameGrid && (
            <>
                <div>
                <label className="text-[10px] text-slate-300 flex justify-between"><span>跨数</span><span>{params.numBays}</span></label>
                <input type="range" min="1" max="6" step="1" value={params.numBays} onChange={(e) => handleChange('numBays', Number(e.target.value))}
                    className="w-full accent-purple-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"/>
                </div>
                <div>
                <label className="text-[10px] text-slate-300 flex justify-between"><span>层数</span><span>{params.numStories}</span></label>
                <input type="range" min="1" max="8" step="1" value={params.numStories} onChange={(e) => handleChange('numStories', Number(e.target.value))}
                    className="w-full accent-purple-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"/>
                </div>
            </>
        )}
      </div>
      )}


      <div className="space-y-2 border-t border-slate-800 pt-3 flex-1 min-h-0 flex flex-col">
        <div className="flex justify-between items-end mb-1">
            <h3 className="text-xs font-semibold text-rose-400 uppercase tracking-wider">荷载管理</h3>
            {params.loads.length > 0 && (
                <button onClick={onClearLoads} className="text-[10px] text-slate-500 hover:text-red-400 underline">清除所有</button>
            )}
        </div>
        <div className="grid grid-cols-3 gap-1 mb-1">
            <div draggable onDragStart={(e) => handleDragStart(e, 'point')} onClick={() => addManualLoad('point')}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded p-1.5 flex flex-col items-center cursor-grab active:cursor-grabbing transition-colors group">
                <div className="text-red-400 text-sm font-bold mb-0.5 group-hover:scale-110 transition-transform">↓</div>
                <div className="text-[9px] text-slate-400">集中力</div>
            </div>
            <div draggable onDragStart={(e) => handleDragStart(e, 'moment')} onClick={() => addManualLoad('moment')}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded p-1.5 flex flex-col items-center cursor-grab active:cursor-grabbing transition-colors group">
                <div className="text-orange-400 text-sm font-bold mb-0.5 group-hover:scale-110 transition-transform">↺</div>
                <div className="text-[9px] text-slate-400">力矩</div>
            </div>
            <div draggable onDragStart={(e) => handleDragStart(e, 'distributed')} onClick={() => addManualLoad('distributed')}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded p-1.5 flex flex-col items-center cursor-grab active:cursor-grabbing transition-colors group">
                <div className="text-purple-400 text-sm font-bold mb-0.5 flex tracking-tighter group-hover:scale-110 transition-transform">↓↓↓</div>
                <div className="text-[9px] text-slate-400">分布载</div>
            </div>
        </div>
        
        <div className="space-y-1.5 overflow-y-auto pr-1 flex-1 bg-slate-950/30 p-1.5 rounded-lg border border-slate-800/50">
             {params.loads.length === 0 && (
                 <div className="text-center text-slate-600 text-[10px] py-3 flex flex-col gap-1">
                     <span>暂无荷载</span>
                     <span className="text-[9px] text-slate-700">拖拽上方图标至结构添加</span>
                 </div>
             )}
             {params.loads.map((load, idx) => {
                 const isElementLoad = !!load.elementId;
                 const L = isElementLoad ? getElementLength(load.elementId) : 1;
                 return (
                 <div key={load.id} className="bg-slate-800 p-1.5 rounded border border-slate-700 text-[10px] group relative">
                     <div className="flex justify-between items-center mb-1">
                         <span className={`font-bold text-[9px] px-1 rounded ${
                             load.type === 'point' ? 'bg-red-500/20 text-red-400' : 
                             load.type === 'moment' ? 'bg-orange-500/20 text-orange-400' : 
                             'bg-purple-500/20 text-purple-400'
                         }`}>
                            {load.type === 'point' && 'F'}
                            {load.type === 'distributed' && 'q'}
                            {load.type === 'moment' && 'M'}
                         </span>
                         <button onClick={() => deleteLoad(load.id)} className="text-slate-500 hover:text-red-400 px-1 font-bold">×</button>
                     </div>
                     <div className="grid grid-cols-2 gap-1">
                        <div className="col-span-2 bg-slate-900/50 p-1 rounded border border-slate-800">
                            <div className="flex justify-between mb-0.5">
                                <label className="text-[8px] text-slate-500">作用对象</label>
                                {load.type !== 'distributed' && (
                                    <button onClick={() => toggleLoadTarget(load.id, !isElementLoad)} className="text-[8px] text-blue-400 hover:underline">
                                        {isElementLoad ? "→节点" : "→单元"}
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="text-[8px] text-slate-400 font-mono w-6 text-right">{isElementLoad ? 'EL' : 'ND'}</span>
                                <input type="number" value={isElementLoad ? load.elementId : load.nodeId}
                                    onChange={(e) => {
                                        const val = Number(e.target.value);
                                        if(isElementLoad) updateLoad(load.id, 'elementId', val);
                                        else updateLoad(load.id, 'nodeId', val);
                                    }}
                                    className="w-full bg-transparent text-white text-center focus:outline-none font-mono border-b border-slate-700 focus:border-blue-500 text-[10px]"/>
                            </div>
                        </div>
                        {isElementLoad && load.type !== 'distributed' && (
                            <div className="col-span-2 bg-slate-900/50 p-1 rounded border border-slate-800">
                                <div className="flex justify-between mb-0.5 items-center">
                                    <label className="text-[8px] text-slate-500">位置 (m)</label>
                                    <span className="text-[8px] text-slate-400">{((load.location || 0.5) * L).toFixed(1)} / {L.toFixed(1)}</span>
                                </div>
                                <input type="range" min="0" max="1" step="0.01" value={load.location || 0.5}
                                    onChange={(e) => updateLoad(load.id, 'location', Number(e.target.value))}
                                    className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"/>
                            </div>
                        )}
                        <div>
                            <label className="text-[8px] text-slate-500 block">大小 ({load.type === 'moment' ? 'kNm' : load.type === 'distributed' ? 'kN/m' : 'kN'})</label>
                            <input type="number" value={load.magnitude} onChange={(e) => updateLoad(load.id, 'magnitude', parseFloat(e.target.value))}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-1 text-white focus:border-rose-500 outline-none text-[10px]"/>
                        </div>
                        {load.type !== 'moment' ? (
                        <div>
                            <label className="text-[8px] text-slate-500 block">方向</label>
                            <select value={load.direction} onChange={(e) => updateLoad(load.id, 'direction', e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-1 text-white focus:border-rose-500 outline-none h-[20px] text-[10px]">
                                <option value="y">Y</option>
                                <option value="x">X</option>
                            </select>
                        </div>
                        ) : <div></div>}
                     </div>
                 </div>
             )})}
        </div>
      </div>

      <div className="space-y-2 border-t border-slate-800 pt-3">
        <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">截面属性</h3>
        <div>
            <label className="text-[10px] text-slate-300 block mb-0.5">刚度假设</label>
            <select value={params.stiffnessType} onChange={(e) => handleChange('stiffnessType', e.target.value)}
                className="w-full bg-slate-800 text-slate-200 text-[10px] rounded p-1.5 border border-slate-700 focus:ring-1 focus:ring-emerald-500 outline-none">
                <option value="Elastic">Elastic (弹性)</option>
                <option value="AxiallyRigid">Axially Rigid (轴向刚性)</option>
                <option value="Rigid">Rigid Body (绝对刚性)</option>
            </select>
        </div>
        <div className={`transition-opacity duration-200 ${isRigid ? 'opacity-40 pointer-events-none' : ''}`}>
          <label className="text-[10px] text-slate-300 flex justify-between"><span>E (GPa)</span><span className="font-mono">{isRigid ? '∞' : params.elasticModulus}</span></label>
          <input type="range" min="20" max="210" step="10" value={params.elasticModulus} onChange={(e) => handleChange('elasticModulus', Number(e.target.value))}
            className="w-full accent-emerald-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"/>
        </div>
        <div className={`transition-opacity duration-200 ${isRigid || isAxiallyRigid ? 'opacity-40 pointer-events-none' : ''}`}>
           <label className="text-[10px] text-slate-300 flex justify-between"><span>A (cm²)</span><span className="font-mono">{isAxiallyRigid || isRigid ? '∞' : params.crossSectionArea}</span></label>
           <input type="range" min="10" max="500" step="10" value={params.crossSectionArea} onChange={(e) => handleChange('crossSectionArea', Number(e.target.value))}
             className="w-full accent-emerald-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"/>
        </div>
        <div className={`transition-opacity duration-200 ${isRigid ? 'opacity-40 pointer-events-none' : ''}`}>
          <label className="text-[10px] text-slate-300 flex justify-between"><span>I (10⁻⁶ m⁴)</span><span className="font-mono">{isRigid ? '∞' : params.momentOfInertia}</span></label>
          <input type="range" min="50" max="500" step="10" value={params.momentOfInertia} onChange={(e) => handleChange('momentOfInertia', Number(e.target.value))}
            className="w-full accent-emerald-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"/>
        </div>
      </div>

    </div>
  );
};

export default ControlPanel;
