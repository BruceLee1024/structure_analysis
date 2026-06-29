import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SolverParams, StructureType, Load } from '../../types';
import GeometryEditor from './GeometryEditor';

interface ControlPanelProps {
  params: SolverParams;
  setParams: React.Dispatch<React.SetStateAction<SolverParams>>;
  onClearLoads: () => void;
}

interface CollapsibleSectionProps {
  title: string;
  accentClass: string;
  defaultOpen?: boolean;
  subtitle?: string;
  headerRight?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  accentClass,
  defaultOpen = true,
  subtitle,
  headerRight,
  className,
  contentClassName,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={className ?? 'space-y-2 border-t border-slate-800 pt-3'}>
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-left transition-colors hover:bg-slate-800/80"
      >
        <div>
          <h3 className={`text-xs font-semibold uppercase tracking-wider ${accentClass}`}>{title}</h3>
          {subtitle ? <p className="mt-0.5 text-[10px] text-slate-500">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {headerRight}
          <svg
            className={`h-3.5 w-3.5 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isOpen ? <div className={contentClassName}>{children}</div> : null}
    </div>
  );
};

interface DarkSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  accent?: string;
  unit?: string;
  disabled?: boolean;
  displayOverride?: string;
  onChange: (val: number) => void;
}

const accentClasses: Record<string, { text: string; border: string; slider: string }> = {
  indigo:  { text: 'text-indigo-300',  border: 'border-indigo-500',  slider: 'accent-indigo-500' },
  purple:  { text: 'text-purple-300',  border: 'border-purple-500',  slider: 'accent-purple-500' },
  cyan:    { text: 'text-cyan-300',    border: 'border-cyan-500',    slider: 'accent-cyan-500' },
  emerald: { text: 'text-emerald-300', border: 'border-emerald-500', slider: 'accent-emerald-500' },
};

const DarkSlider: React.FC<DarkSliderProps> = ({ label, value, min, max, step, accent = 'indigo', unit, disabled, displayOverride, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const decimals = step < 0.001 ? 4 : step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
  const ac = accentClasses[accent] || accentClasses.indigo;

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitValue = useCallback(() => {
    setEditing(false);
    const parsed = parseFloat(draft);
    if (!isNaN(parsed)) {
      if (step >= 1) {
        const stepped = Math.round(parsed / step) * step;
        onChange(parseFloat(stepped.toFixed(0)));
      } else {
        onChange(parseFloat(parsed.toFixed(4)));
      }
    }
  }, [draft, step, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitValue();
    if (e.key === 'Escape') setEditing(false);
  };

  const displayVal = displayOverride ?? value.toFixed(decimals);

  return (
    <div className={disabled ? 'opacity-40 pointer-events-none' : ''}>
      <label className="text-[10px] text-slate-300 flex justify-between items-center">
        <span>{label}{unit ? ` (${unit})` : ''}</span>
        {editing ? (
          <input
            ref={inputRef}
            type="number"
            value={draft}
            step={step}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitValue}
            onKeyDown={handleKeyDown}
            className={`w-16 text-[10px] font-mono ${ac.text} bg-slate-800 px-1.5 py-0.5 rounded border ${ac.border} text-right outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
          />
        ) : (
          <button
            onClick={() => { setDraft(parseFloat(value.toFixed(4)).toString()); setEditing(true); }}
            className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 hover:ring-1 hover:ring-slate-500 transition-all cursor-text"
            title="点击输入精确值"
          >
            {displayVal}
          </button>
        )}
      </label>
      <input type="range" min={Math.min(min, value)} max={Math.max(max, value)} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full ${ac.slider} h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer`}/>
      {(value < min || value > max) && (
        <div className="text-[9px] text-amber-500/70 mt-0.5">默认范围: {min}–{max}{unit ? ` ${unit}` : ''}</div>
      )}
    </div>
  );
};

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
  const showHeight = params.structureType !== StructureType.Custom && params.structureType !== StructureType.Beam && params.structureType !== StructureType.MultiSpanBeam && params.structureType !== StructureType.Cantilever;
  const showRoof = params.structureType === StructureType.GableFrame;
  const showSpans = params.structureType === StructureType.MultiSpanBeam || params.structureType === StructureType.Truss;
  const showFrameGrid = params.structureType === StructureType.MultiStoryFrame;
  const showOverhang = params.structureType === StructureType.Beam || params.structureType === StructureType.MultiSpanBeam;

  return (
    <div className="w-56 xl:w-60 2xl:w-72 flex-shrink-0 bg-slate-900 p-4 flex flex-col gap-4 overflow-y-auto border-r border-slate-800 h-full">
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

      <CollapsibleSection title="结构类型" accentClass="text-indigo-400" subtitle="选择当前结构类别" className="space-y-2">
        <select value={params.structureType} onChange={(e) => handleChange('structureType', e.target.value)}
            className="w-full bg-slate-800 text-slate-200 text-xs rounded p-2 border border-slate-700 focus:ring-1 focus:ring-indigo-500 outline-none">
            <optgroup label="基础">
                <option value={StructureType.Beam}>简支/连续梁</option>
                <option value={StructureType.PortalFrame}>门式刚架</option>
                <option value={StructureType.Cantilever}>悬臂梁</option>
                <option value={StructureType.GableFrame}>人字形刚架</option>
            </optgroup>
            <optgroup label="高级参数化">
                <option value={StructureType.MultiSpanBeam}>多跨连续梁</option>
                <option value={StructureType.MultiStoryFrame}>多层多跨框架</option>
                <option value={StructureType.Truss}>桁架</option>
            </optgroup>
            <option value={StructureType.Custom}>自定义</option>
        </select>
      </CollapsibleSection>

      {params.structureType !== StructureType.Custom && (
      <CollapsibleSection title="参数化几何" accentClass="text-indigo-400" subtitle="调整当前参数化结构尺寸" className="space-y-2">
        {showWidth && (
            <DarkSlider label="总宽度" unit="m" value={params.width} min={3} max={50} step={1} accent="indigo"
              onChange={(v) => handleChange('width', v)} />
        )}
        {showHeight && (
            <DarkSlider label="总高度" unit="m" value={params.height} min={2} max={50} step={1} accent="indigo"
              onChange={(v) => handleChange('height', v)} />
        )}
        {showRoof && (
            <DarkSlider label="屋脊高度" unit="m" value={params.roofHeight} min={0.5} max={5} step={0.1} accent="indigo"
              onChange={(v) => handleChange('roofHeight', v)} />
        )}
        {showSpans && (
            <DarkSlider label={params.structureType === StructureType.Truss ? '桁架段数' : '跨数'} value={params.numSpans} min={2} max={10} step={1} accent="purple"
              onChange={(v) => handleChange('numSpans', v)} />
        )}
        {showFrameGrid && (
            <>
                <DarkSlider label="跨数" value={params.numBays} min={1} max={6} step={1} accent="purple"
                  onChange={(v) => handleChange('numBays', v)} />
                <DarkSlider label="层数" value={params.numStories} min={1} max={8} step={1} accent="purple"
                  onChange={(v) => handleChange('numStories', v)} />
            </>
        )}
        {showOverhang && (
            <>
                <DarkSlider label="左悬挑" unit="m" value={params.overhangLeft} min={0} max={10} step={0.5} accent="cyan"
                  onChange={(v) => handleChange('overhangLeft', v)} />
                <DarkSlider label="右悬挑" unit="m" value={params.overhangRight} min={0} max={10} step={0.5} accent="cyan"
                  onChange={(v) => handleChange('overhangRight', v)} />
            </>
        )}
      </CollapsibleSection>
      )}

      <CollapsibleSection
        title="荷载管理"
        accentClass="text-rose-400"
        subtitle="拖拽或编辑当前荷载"
        contentClassName="flex min-h-0 flex-col gap-2"
        headerRight={params.loads.length > 0 ? <span className="text-[10px] text-slate-500">{params.loads.length} 条</span> : null}
      >
        {params.loads.length > 0 && (
          <div className="flex justify-end">
            <button onClick={onClearLoads} className="text-[10px] text-slate-500 hover:text-red-400 underline">清除所有</button>
          </div>
        )}
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
                            <input type="number" step="0.0001" value={load.magnitude} onChange={(e) => updateLoad(load.id, 'magnitude', parseFloat(e.target.value))}
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
      </CollapsibleSection>

      <CollapsibleSection title="截面属性" accentClass="text-emerald-400" subtitle="刚度与截面参数" className="space-y-2 border-t border-slate-800 pt-3">
        <div>
            <label className="text-[10px] text-slate-300 block mb-0.5">刚度假设</label>
            <select value={params.stiffnessType} onChange={(e) => handleChange('stiffnessType', e.target.value)}
                className="w-full bg-slate-800 text-slate-200 text-[10px] rounded p-1.5 border border-slate-700 focus:ring-1 focus:ring-emerald-500 outline-none">
                <option value="Elastic">Elastic (弹性)</option>
                <option value="AxiallyRigid">Axially Rigid (轴向刚性)</option>
                <option value="Rigid">Rigid Body (绝对刚性)</option>
            </select>
        </div>
        <DarkSlider label="E" unit="GPa" value={params.elasticModulus} min={20} max={210} step={10} accent="emerald"
          disabled={isRigid} displayOverride={isRigid ? '∞' : undefined}
          onChange={(v) => handleChange('elasticModulus', v)} />
        <DarkSlider label="A" unit="cm²" value={params.crossSectionArea} min={10} max={500} step={10} accent="emerald"
          disabled={isRigid || isAxiallyRigid} displayOverride={isAxiallyRigid || isRigid ? '∞' : undefined}
          onChange={(v) => handleChange('crossSectionArea', v)} />
        <DarkSlider label="I" unit="10⁻⁶ m⁴" value={params.momentOfInertia} min={50} max={500} step={10} accent="emerald"
          disabled={isRigid} displayOverride={isRigid ? '∞' : undefined}
          onChange={(v) => handleChange('momentOfInertia', v)} />
      </CollapsibleSection>

      <CollapsibleSection
        title="几何建模"
        accentClass="text-violet-400"
        subtitle="节点与单元编辑器"
        defaultOpen={false}
        className="space-y-2 border-t border-slate-800 pt-3"
      >
        <div className="max-h-[560px] overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/40 p-2">
          <GeometryEditor
            params={params}
            setParams={setParams}
            showHeader={false}
            className="flex min-h-0 flex-col gap-4 bg-transparent p-0"
          />
        </div>
      </CollapsibleSection>

    </div>
  );
};

export default ControlPanel;
