import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, FileDown, FileText, FileUp, RotateCcw } from 'lucide-react';
import { SolverParams, StructureType, Load, DiagramLayerSettings, ModelIssue, AnalysisTargetType } from '../../types';
import GeometryEditor from './GeometryEditor';
import {
  DEFAULT_LOAD_CASE_ID,
  describeCombination,
  getActiveLoadCaseId,
  getLoadCases,
  getLoadCombinations,
  getLoadsForCase,
  loadCaseName,
} from '../../utils/loadCases';
import { summarizeIssues } from '../../utils/modelValidation';
import { applyMaterialAndSection, MATERIAL_PRESETS, SECTION_PRESETS } from '../../utils/sectionLibrary';

type DiagramToggleKey = Exclude<keyof DiagramLayerSettings, 'diagramScale'>;

interface ControlPanelProps {
  params: SolverParams;
  setParams: React.Dispatch<React.SetStateAction<SolverParams>>;
  onClearLoads: () => void;
  analysisLoads: Load[];
  activeAnalysis: { type: AnalysisTargetType; id: string; label: string };
  validationIssues: ModelIssue[];
  diagramLayers: DiagramLayerSettings;
  setDiagramLayers: React.Dispatch<React.SetStateAction<DiagramLayerSettings>>;
  modelFileStatus: { type: 'success' | 'error'; message: string } | null;
  onSaveModel: () => void;
  onImportModelText: (text: string) => void;
  onResetModel: () => void;
  onExportReport: () => void;
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
        <div className="min-w-0">
          <h3 className={`truncate text-xs font-semibold uppercase tracking-wider ${accentClass}`}>{title}</h3>
          {subtitle ? <p className="mt-0.5 truncate text-[10px] text-slate-500">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
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

const ControlPanel: React.FC<ControlPanelProps> = ({
  params,
  setParams,
  onClearLoads,
  analysisLoads,
  activeAnalysis,
  validationIssues,
  diagramLayers,
  setDiagramLayers,
  modelFileStatus,
  onSaveModel,
  onImportModelText,
  onResetModel,
  onExportReport,
}) => {
  const [selectedMaterialId, setSelectedMaterialId] = useState(MATERIAL_PRESETS[0]?.id ?? '');
  const [selectedSectionId, setSelectedSectionId] = useState(SECTION_PRESETS[1]?.id ?? '');
  const [showCombinationEditor, setShowCombinationEditor] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const loadCases = getLoadCases(params);
  const loadCombinations = getLoadCombinations(params);
  const activeLoadCaseId = getActiveLoadCaseId(params);
  const activeCaseLoads = getLoadsForCase(params.loads, activeLoadCaseId);
  const issueSummary = summarizeIssues(validationIssues);

  const handleChange = (key: keyof SolverParams, value: any) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const handlePropertyChange = (key: 'elasticModulus' | 'crossSectionArea' | 'momentOfInertia', value: number) => {
    const elementKey = key === 'elasticModulus' ? 'E' : key === 'crossSectionArea' ? 'A' : 'I';
    setParams(prev => ({
      ...prev,
      [key]: value,
      elements: prev.elements.map(element => ({ ...element, [elementKey]: value })),
    }));
  };

  const setActiveLoadCase = (loadCaseId: string) => {
    setParams(prev => ({
      ...prev,
      activeLoadCaseId: loadCaseId,
      activeAnalysisType: prev.activeAnalysisType === 'loadCase' ? 'loadCase' : prev.activeAnalysisType,
      activeAnalysisId: prev.activeAnalysisType === 'loadCase' ? loadCaseId : prev.activeAnalysisId,
    }));
  };

  const setAnalysisTarget = (value: string) => {
    const [targetType, id] = value.split(':') as [AnalysisTargetType, string];
    setParams(prev => ({
      ...prev,
      activeAnalysisType: targetType,
      activeAnalysisId: id,
    }));
  };

  const addLoadCase = () => {
    setParams(prev => {
      const nextId = `case-${Date.now()}`;
      return {
        ...prev,
        loadCases: [...getLoadCases(prev), { id: nextId, name: `自定义工况 ${getLoadCases(prev).length + 1}`, category: 'custom' }],
        activeLoadCaseId: nextId,
        activeAnalysisType: 'loadCase',
        activeAnalysisId: nextId,
      };
    });
  };

  const updateLoadCaseName = (id: string, name: string) => {
    setParams(prev => ({
      ...prev,
      loadCases: getLoadCases(prev).map(loadCase => loadCase.id === id ? { ...loadCase, name } : loadCase),
    }));
  };

  const deleteLoadCase = (id: string) => {
    setParams(prev => {
      const cases = getLoadCases(prev).filter(loadCase => loadCase.id !== id);
      const fallbackId = cases[0]?.id ?? DEFAULT_LOAD_CASE_ID;
      return {
        ...prev,
        loadCases: cases,
        loads: prev.loads.filter(load => (load.loadCaseId ?? DEFAULT_LOAD_CASE_ID) !== id),
        loadCombinations: getLoadCombinations(prev).map(combo => {
          const { [id]: _removed, ...factors } = combo.factors;
          return { ...combo, factors };
        }),
        activeLoadCaseId: prev.activeLoadCaseId === id ? fallbackId : prev.activeLoadCaseId,
        activeAnalysisType: prev.activeAnalysisId === id ? 'loadCase' : prev.activeAnalysisType,
        activeAnalysisId: prev.activeAnalysisId === id ? fallbackId : prev.activeAnalysisId,
      };
    });
  };

  const addCombination = () => {
    setParams(prev => {
      const cases = getLoadCases(prev);
      const firstId = cases[0]?.id ?? DEFAULT_LOAD_CASE_ID;
      const nextId = `combo-${Date.now()}`;
      return {
        ...prev,
        loadCombinations: [...getLoadCombinations(prev), { id: nextId, name: `组合 ${getLoadCombinations(prev).length + 1}`, factors: { [firstId]: 1 } }],
        activeAnalysisType: 'combination',
        activeAnalysisId: nextId,
      };
    });
  };

  const updateCombination = (id: string, updater: (factors: Record<string, number>, name: string) => { factors?: Record<string, number>; name?: string }) => {
    setParams(prev => ({
      ...prev,
      loadCombinations: getLoadCombinations(prev).map(combo => {
        if (combo.id !== id) return combo;
        const next = updater(combo.factors, combo.name);
        return { ...combo, factors: next.factors ?? combo.factors, name: next.name ?? combo.name };
      }),
    }));
  };

  const deleteCombination = (id: string) => {
    setParams(prev => {
      const combos = getLoadCombinations(prev).filter(combo => combo.id !== id);
      return {
        ...prev,
        loadCombinations: combos,
        activeAnalysisType: prev.activeAnalysisId === id ? 'loadCase' : prev.activeAnalysisType,
        activeAnalysisId: prev.activeAnalysisId === id ? getActiveLoadCaseId(prev) : prev.activeAnalysisId,
      };
    });
  };

  const toggleLayer = (key: DiagramToggleKey) => {
    setDiagramLayers(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const applyPreset = () => {
    const material = MATERIAL_PRESETS.find(item => item.id === selectedMaterialId);
    const section = SECTION_PRESETS.find(item => item.id === selectedSectionId);
    setParams(prev => applyMaterialAndSection(prev, material, section));
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
          loadCaseId: activeLoadCaseId,
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

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onImportModelText(reader.result);
      }
    };
    reader.readAsText(file);
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
    <div className="w-80 xl:w-[21rem] 2xl:w-[23rem] flex-shrink-0 bg-slate-950 flex flex-col border-r border-slate-800 h-full">
      <div className="shrink-0 border-b border-slate-800 bg-slate-950/95 px-3 py-3">
        <input
          ref={importInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleImportFile}
          className="hidden"
        />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/15 text-indigo-200">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M7 7v10m10-10v10M4 17h16" />
                </svg>
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-black leading-tight text-white">结构求解器</h1>
                <p className="text-[10px] font-medium text-slate-500">矩阵位移法</p>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={onExportReport}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-400 transition-colors hover:border-emerald-500/50 hover:text-emerald-200"
              title="导出计算报告"
              aria-label="导出计算报告"
            >
              <FileText className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onSaveModel}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-400 transition-colors hover:border-cyan-500/50 hover:text-cyan-200"
              title="保存模型"
              aria-label="保存模型"
            >
              <FileDown className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => importInputRef.current?.click()}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-400 transition-colors hover:border-cyan-500/50 hover:text-cyan-200"
              title="加载模型"
              aria-label="加载模型"
            >
              <FileUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => {
                if (window.confirm('恢复默认模型会替换当前求解模型，是否继续？')) onResetModel();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-400 transition-colors hover:border-amber-500/50 hover:text-amber-200"
              title="恢复默认模型"
              aria-label="恢复默认模型"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1.5">
          <div className="min-w-0">
            <div className="truncate text-[10px] text-slate-500">当前计算</div>
            <div className="truncate text-[11px] font-semibold text-slate-200">{activeAnalysis.label}</div>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-center">
            <div className="text-[8px] font-bold uppercase text-slate-600">Nodes</div>
            <div className="font-mono text-[11px] font-bold text-indigo-300">{params.nodes.length}</div>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-center">
            <div className="text-[8px] font-bold uppercase text-slate-600">Elems</div>
            <div className="font-mono text-[11px] font-bold text-indigo-300">{params.elements.length}</div>
          </div>
        </div>

        {modelFileStatus && (
          <div className={`mt-2 rounded border px-2 py-1.5 text-[10px] ${
            modelFileStatus.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              : 'border-red-500/30 bg-red-500/10 text-red-200'
          }`}>
            {modelFileStatus.message}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
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
      <CollapsibleSection title="参数化几何" accentClass="text-indigo-400" subtitle="调整当前参数化结构尺寸" className="space-y-2 border-t border-slate-800 pt-3">
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
        title="工况与组合"
        accentClass="text-sky-400"
        subtitle={`当前计算：${activeAnalysis.label} · ${analysisLoads.length} 条荷载`}
        className="space-y-2 border-t border-slate-800 pt-3"
      >
        <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2">
          <div>
            <label className="mb-1 block text-[10px] font-semibold text-slate-400">分析目标</label>
            <select
              value={`${activeAnalysis.type}:${activeAnalysis.id}`}
              onChange={(e) => setAnalysisTarget(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-800 p-1.5 text-[10px] text-slate-200 outline-none focus:ring-1 focus:ring-sky-500"
            >
              <optgroup label="单一工况">
                {loadCases.map(loadCase => <option key={loadCase.id} value={`loadCase:${loadCase.id}`}>{loadCase.name}</option>)}
              </optgroup>
              <optgroup label="组合">
                {loadCombinations.map(combo => <option key={combo.id} value={`combination:${combo.id}`}>{combo.name}</option>)}
              </optgroup>
            </select>
          </div>
          <label className="text-[10px] text-slate-300 block">编辑工况</label>
          <div className="flex gap-1">
            <select
              value={activeLoadCaseId}
              onChange={(e) => setActiveLoadCase(e.target.value)}
              className="min-w-0 flex-1 bg-slate-800 text-slate-200 text-[10px] rounded p-1.5 border border-slate-700 focus:ring-1 focus:ring-sky-500 outline-none"
            >
              {loadCases.map(loadCase => (
                <option key={loadCase.id} value={loadCase.id}>
                  {loadCase.name} ({getLoadsForCase(params.loads, loadCase.id).length})
                </option>
              ))}
            </select>
            <button onClick={addLoadCase} className="px-2 rounded bg-sky-600 text-white text-[10px] font-semibold hover:bg-sky-500">+</button>
          </div>
          <div className="flex gap-1">
            <input
              value={loadCases.find(item => item.id === activeLoadCaseId)?.name ?? ''}
              onChange={(e) => updateLoadCaseName(activeLoadCaseId, e.target.value)}
              className="min-w-0 flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 text-[10px] outline-none focus:border-sky-500"
            />
            <button
              onClick={() => deleteLoadCase(activeLoadCaseId)}
              disabled={loadCases.length <= 1}
              className="px-2 rounded bg-slate-800 text-slate-400 text-[10px] hover:text-red-300 disabled:opacity-40 disabled:hover:text-slate-400"
            >
              删除
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-2">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setShowCombinationEditor(prev => !prev)}
              className="flex min-w-0 flex-1 items-center justify-between rounded bg-slate-800 px-2 py-1 text-left text-[10px] font-semibold text-sky-200 hover:bg-slate-700"
            >
              <span className="truncate">编辑组合系数</span>
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${showCombinationEditor ? 'rotate-180' : ''}`} />
            </button>
            <button onClick={addCombination} className="rounded bg-sky-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-sky-500">新增</button>
          </div>
          {!showCombinationEditor && (
            <div className="mt-2 space-y-1">
              {loadCombinations.map(combo => (
                <div key={combo.id} className="flex items-center justify-between gap-2 rounded bg-slate-950/50 px-2 py-1 text-[9px]">
                  <span className="min-w-0 truncate text-slate-300">{combo.name}</span>
                  <span className="shrink-0 text-slate-500">{describeCombination(combo, loadCases)}</span>
                </div>
              ))}
            </div>
          )}
          {showCombinationEditor && (
          <div className="mt-2 space-y-1.5">
            {loadCombinations.map(combo => (
              <div key={combo.id} className="rounded-lg border border-slate-800 bg-slate-950/30 p-2">
                <div className="mb-1.5 flex items-center gap-1">
                  <input
                    value={combo.name}
                    onChange={(e) => updateCombination(combo.id, (_factors, _name) => ({ name: e.target.value }))}
                    className="min-w-0 flex-1 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-slate-100 text-[10px] outline-none focus:border-sky-500"
                  />
                  <button onClick={() => deleteCombination(combo.id)} className="px-1.5 text-[10px] text-slate-500 hover:text-red-300">x</button>
                </div>
                <div className="space-y-1">
                  {loadCases.map(loadCase => (
                    <label key={loadCase.id} className="grid grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-2 rounded bg-slate-900/70 px-2 py-1 text-[10px] text-slate-400">
                      <span className="truncate">{loadCase.name}</span>
                      <input
                        type="number"
                        step="0.1"
                        value={combo.factors[loadCase.id] ?? 0}
                        onChange={(e) => updateCombination(combo.id, factors => ({ factors: { ...factors, [loadCase.id]: Number(e.target.value) } }))}
                        className="min-w-0 rounded border border-slate-800 bg-slate-950/70 px-1 py-0.5 text-right text-slate-100 outline-none focus:border-sky-500"
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-1 text-[9px] text-slate-500">{describeCombination(combo, loadCases)}</div>
              </div>
            ))}
          </div>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="荷载管理"
        accentClass="text-rose-400"
        subtitle={`编辑 ${loadCaseName(params, activeLoadCaseId)} 的荷载`}
        contentClassName="flex min-h-0 flex-col gap-2"
        headerRight={activeCaseLoads.length > 0 ? <span className="text-[10px] text-slate-500">{activeCaseLoads.length} 条</span> : null}
      >
        {activeCaseLoads.length > 0 && (
          <div className="flex justify-end">
            <button onClick={onClearLoads} className="text-[10px] text-slate-500 hover:text-red-400 underline">清除当前工况</button>
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
             {activeCaseLoads.length === 0 && (
                 <div className="text-center text-slate-600 text-[10px] py-3 flex flex-col gap-1">
                     <span>暂无荷载</span>
                     <span className="text-[9px] text-slate-700">拖拽上方图标至结构添加</span>
                 </div>
             )}
             {activeCaseLoads.map((load, idx) => {
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

      <CollapsibleSection
        title="图层显示"
        accentClass="text-cyan-400"
        subtitle="控制模型与结果图层"
        defaultOpen={false}
        className="space-y-2 border-t border-slate-800 pt-3"
      >
        <div className="grid grid-cols-2 gap-1.5">
          {([
            ['grid', '网格'],
            ['loads', '荷载'],
            ['reactions', '反力'],
            ['moment', '弯矩 M'],
            ['shear', '剪力 V'],
            ['axial', '轴力 N'],
            ['deflection', '变形 δ'],
            ['labels', '峰值标注'],
          ] as [DiagramToggleKey, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => toggleLayer(key)}
              className={`rounded border px-2 py-1 text-[10px] font-semibold transition-colors ${
                diagramLayers[key]
                  ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200'
                  : 'border-slate-800 bg-slate-950/50 text-slate-500 hover:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-2">
          <DarkSlider
            label="结果图幅值"
            value={diagramLayers.diagramScale}
            min={0.25}
            max={2.5}
            step={0.25}
            accent="cyan"
            displayOverride={`${diagramLayers.diagramScale.toFixed(2)}x`}
            onChange={(value) => setDiagramLayers(prev => ({ ...prev, diagramScale: value }))}
          />
          <button
            onClick={() => setDiagramLayers(prev => ({ ...prev, diagramScale: 1 }))}
            className="mt-1 w-full rounded bg-slate-800 px-2 py-1 text-[10px] font-semibold text-slate-400 transition-colors hover:bg-slate-700 hover:text-cyan-200"
          >
            重置幅值
          </button>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="模型校验"
        accentClass={issueSummary.errors > 0 ? 'text-red-400' : issueSummary.warnings > 0 ? 'text-amber-400' : 'text-emerald-400'}
        subtitle={`${issueSummary.errors} 错误 · ${issueSummary.warnings} 警告 · ${issueSummary.infos} 提示`}
        defaultOpen={issueSummary.errors > 0 || issueSummary.warnings > 0}
        className="space-y-2 border-t border-slate-800 pt-3"
      >
        <div className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-950/30 p-1.5">
          {validationIssues.length === 0 ? (
            <div className="rounded bg-emerald-500/10 px-2 py-1.5 text-[10px] font-semibold text-emerald-300">未发现明显建模问题</div>
          ) : validationIssues.map(item => (
            <div
              key={item.id}
              className={`rounded border px-2 py-1.5 text-[10px] ${
                item.severity === 'error'
                  ? 'border-red-500/30 bg-red-500/10 text-red-200'
                  : item.severity === 'warning'
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                  : 'border-sky-500/25 bg-sky-500/10 text-sky-200'
              }`}
            >
              <div className="font-semibold">{item.title}</div>
              <div className="mt-0.5 text-[9px] opacity-80">{item.detail}</div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="截面属性" accentClass="text-emerald-400" subtitle="刚度与截面参数" className="space-y-2 border-t border-slate-800 pt-3">
        <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/30 p-2">
            <div className="grid grid-cols-1 gap-1.5">
                <div>
                    <label className="text-[10px] text-slate-300 block mb-0.5">材料库</label>
                    <select value={selectedMaterialId} onChange={(e) => setSelectedMaterialId(e.target.value)}
                        className="w-full bg-slate-800 text-slate-200 text-[10px] rounded p-1.5 border border-slate-700 focus:ring-1 focus:ring-emerald-500 outline-none">
                        {MATERIAL_PRESETS.map(item => <option key={item.id} value={item.id}>{item.name} · E={item.E}GPa</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-[10px] text-slate-300 block mb-0.5">截面库</label>
                    <select value={selectedSectionId} onChange={(e) => setSelectedSectionId(e.target.value)}
                        className="w-full bg-slate-800 text-slate-200 text-[10px] rounded p-1.5 border border-slate-700 focus:ring-1 focus:ring-emerald-500 outline-none">
                        {SECTION_PRESETS.map(item => <option key={item.id} value={item.id}>{item.name} · A={item.A}cm² · I={item.I}</option>)}
                    </select>
                </div>
            </div>
            <button onClick={applyPreset} className="w-full rounded bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-500">
                应用到全部单元
            </button>
        </div>
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
          onChange={(v) => handlePropertyChange('elasticModulus', v)} />
        <DarkSlider label="A" unit="cm²" value={params.crossSectionArea} min={10} max={500} step={10} accent="emerald"
          disabled={isRigid || isAxiallyRigid} displayOverride={isAxiallyRigid || isRigid ? '∞' : undefined}
          onChange={(v) => handlePropertyChange('crossSectionArea', v)} />
        <DarkSlider label="I" unit="10⁻⁶ m⁴" value={params.momentOfInertia} min={50} max={500} step={10} accent="emerald"
          disabled={isRigid} displayOverride={isRigid ? '∞' : undefined}
          onChange={(v) => handlePropertyChange('momentOfInertia', v)} />
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
    </div>
  );
};

export default ControlPanel;
