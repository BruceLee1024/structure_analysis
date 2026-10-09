import { useQuasiStatic, scaleLoads } from '../hooks/useQuasiStatic';
import { ForceFlowScope } from './ui/ForceFlow';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Bot, SlidersHorizontal, FileDown, FileUp, FileText, X } from 'lucide-react';
import ControlPanel from './solver/ControlPanel';
import StructureVisualizer from './solver/StructureVisualizer';
import ResultsPanel from './solver/ResultsPanel';
import AgentPanel from './solver/AgentPanel';
import SolverDiagnostics from './solver/SolverDiagnostics';
import SpaceSolverPrototype from './solver/SpaceSolverPrototype';
import { SolverParams, StructureType, AnalysisResult, Load, DiagramLayerSettings, type ResultSelection } from '../types';
import { solveStructure } from '../utils/solver';
import { generateGeometry } from '../utils/geometryGenerator';
import { DEFAULT_LOAD_CASES, DEFAULT_LOAD_COMBINATIONS, getActiveAnalysis, getActiveLoadCaseId, getAnalysisLoads, getLoadCases, getLoadCombinations, getLoadsForCase } from '../utils/loadCases';
import { summarizeIssues, validateModel } from '../utils/modelValidation';
import { getResultExtrema, getSelectionForExtreme } from '../utils/resultExtrema';
import { buildSolverDiagnosticSummary } from '../utils/solverDiagnostics';
import { buildResultEnvelopeRows } from '../utils/resultEnvelope';
import { buildServiceabilityRows, getWorstServiceabilityRow } from '../utils/serviceabilityChecks';
import { parseAgentInput } from '../utils/agent/parser';
import { applyAgentActions, createAgentSnapshot } from '../utils/agent/executor';
import { explainResultsWithLLM, summarizeResultFacts } from '../utils/agent/explainer';
import { parseImageToActions } from '../utils/agent/visionParser';
import { createAgentSession, updateSessionFromActions } from '../utils/agent/session';
import { createSolverModelFileName, importSolverModel, stringifySolverModel } from '../utils/modelIO';
import { createCalculationReport, createReportFileName } from '../utils/reportExport';
import type { AgentAction, AgentSessionState, AgentSnapshot } from '../utils/agent/types';

const createDefaultSolverParams = (): SolverParams => {
  return {
    unitSystem: 'metric-kN-m',
    deflectionLimitRatio: 250,
    structureType: StructureType.Custom,
    stiffnessType: 'Elastic',
    width: 10,
    height: 5,
    roofHeight: 2,
    numSpans: 3,
    numStories: 2,
    numBays: 2,
    overhangLeft: 0,
    overhangRight: 0,
    elasticModulus: 200,
    crossSectionArea: 50,
    momentOfInertia: 200,
    nodes: [],
    elements: [],
    loads: [],
    loadCases: DEFAULT_LOAD_CASES,
    loadCombinations: DEFAULT_LOAD_COMBINATIONS,
    activeLoadCaseId: DEFAULT_LOAD_CASES[0].id,
    activeAnalysisType: 'loadCase',
    activeAnalysisId: DEFAULT_LOAD_CASES[0].id,
  };
};

const SolverModule: React.FC<{ mode?: 'plane' | 'space'; onModeChange?: (mode: 'plane' | 'space') => void }> = ({ mode, onModeChange }) => {
  const [localMode, setLocalMode] = useState<'plane' | 'space'>('plane');
  const solverMode = mode ?? localMode;
  const setSolverMode = (next: 'plane' | 'space') => { setLocalMode(next); onModeChange?.(next); };
  const [agentSnapshots, setAgentSnapshots] = useState<AgentSnapshot[]>([]);
  const [agentSession, setAgentSession] = useState<AgentSessionState>(() => createAgentSession());
  const [modelFileStatus, setModelFileStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [selectedResult, setSelectedResult] = useState<ResultSelection | null>(null);
  const [isAgentDrawerOpen, setIsAgentDrawerOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [workspaceView, setWorkspaceView] = useState<'analysis' | 'results'>('analysis');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const modelImportRef = useRef<HTMLInputElement>(null);
  const [diagramLayers, setDiagramLayers] = useState<DiagramLayerSettings>({
    grid: true,
    loads: true,
    reactions: true,
    moment: true,
    shear: true,
    axial: true,
    deflection: true,
    labels: true,
    diagramScale: 1,
  });
  const [params, setParams] = useState<SolverParams>(() => {
    return createDefaultSolverParams();
  });

  useEffect(() => {
      if (params.structureType === StructureType.Custom) return;
      
      const geom = generateGeometry(
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
      
      setParams(prev => ({
          ...prev,
          nodes: geom.nodes,
          elements: geom.elements
      }));
  }, [
      params.structureType, 
      params.width, 
      params.height, 
      params.roofHeight, 
      params.numSpans,
      params.numStories,
      params.numBays,
      params.overhangLeft,
      params.overhangRight,
      params.elasticModulus, 
      params.crossSectionArea, 
      params.momentOfInertia
  ]);

  useEffect(() => {
      setParams(prev => {
           const validNodeIds = new Set(prev.nodes.map(n => n.id));
           const validElIds = new Set(prev.elements.map(e => e.id));
           
           const validLoads = prev.loads.filter(l => {
               if (l.nodeId !== undefined) return validNodeIds.has(l.nodeId);
               if (l.elementId !== undefined) return validElIds.has(l.elementId);
               return false;
           });

           if (validLoads.length !== prev.loads.length) {
               return { ...prev, loads: validLoads };
           }
           return prev;
      });
  }, [params.nodes, params.elements]);

  useEffect(() => {
    setSelectedResult(prev => {
      if (!prev) return prev;
      if (prev.elementId !== undefined && !params.elements.some(element => element.id === prev.elementId)) return null;
      if (prev.nodeId !== undefined && !params.nodes.some(node => node.id === prev.nodeId)) return null;
      return prev;
    });
  }, [params.nodes, params.elements]);

  const playback = useQuasiStatic(JSON.stringify(params));
  const targetLoads = useMemo(() => getAnalysisLoads(params), [params]);
  const analysisLoads = useMemo(() => scaleLoads(targetLoads,playback.factor),[targetLoads,playback.factor]);
  const targetResult = useMemo(() => params.nodes.length < 2 || !params.elements.length ? null : solveStructure(params.nodes,params.elements,targetLoads,params.stiffnessType),[params.nodes,params.elements,params.stiffnessType,targetLoads]);
  const flowPeaks = { N: Math.max(0,...(targetResult?.elements ?? []).map(e=>e.maxAxial)), V: Math.max(0,...(targetResult?.elements ?? []).map(e=>e.maxShear)), M: Math.max(0,...(targetResult?.elements ?? []).map(e=>e.maxMoment)) };
  const activeAnalysis = useMemo(() => getActiveAnalysis(params), [params]);

  const results: AnalysisResult = useMemo(() => {
      if (params.nodes.length < 2 || params.elements.length === 0) {
          return { elements: [], maxDeflection: 0, reactions: [], displacements: [] };
      }
      if (playback.factor === 1 && targetResult) return targetResult;
      return solveStructure(params.nodes, params.elements, analysisLoads, params.stiffnessType);
  }, [params.nodes, params.elements, analysisLoads, params.stiffnessType, playback.factor, targetResult]);

  const validationIssues = useMemo(
    () => params.nodes.length === 0 && params.elements.length === 0 && params.loads.length === 0 ? [] : validateModel(params, analysisLoads, results.error),
    [params, analysisLoads, results.error],
  );
  const issueSummary = useMemo(() => summarizeIssues(validationIssues), [validationIssues]);
  const extrema = useMemo(() => getResultExtrema(results), [results]);
  const momentSelection = useMemo(() => getSelectionForExtreme(extrema, 'moment'), [extrema]);
  const deflectionSelection = useMemo(() => getSelectionForExtreme(extrema, 'deflection'), [extrema]);
  const diagnosticSummary = useMemo(
    () => buildSolverDiagnosticSummary({
      results,
      nodes: params.nodes,
      elements: params.elements,
      loads: analysisLoads,
      extrema,
      issues: validationIssues,
    }),
    [results, params.nodes, params.elements, analysisLoads, extrema, validationIssues],
  );
  const envelopeRows = useMemo(() => {
    if (params.nodes.length < 2 || params.elements.length === 0) return [];

    const loadCaseItems = getLoadCases(params).map(loadCase => ({
      target: { type: 'loadCase' as const, id: loadCase.id, label: loadCase.name },
      loads: getLoadsForCase(params.loads, loadCase.id),
    }));
    const combinationItems = getLoadCombinations(params).map(combo => {
      const loads = getAnalysisLoads({
        ...params,
        activeAnalysisType: 'combination',
        activeAnalysisId: combo.id,
      });
      return {
        target: { type: 'combination' as const, id: combo.id, label: combo.name },
        loads,
      };
    });

    const envelopeInputs = [...loadCaseItems, ...combinationItems]
      .filter(item => item.loads.length > 0)
      .map(item => ({
        target: item.target,
        result: solveStructure(params.nodes, params.elements, item.loads, params.stiffnessType),
      }));

    return buildResultEnvelopeRows(envelopeInputs);
  }, [params]);
  const serviceabilityRows = useMemo(
    () => buildServiceabilityRows(results, params.elements, params.nodes, params.deflectionLimitRatio),
    [results, params.elements, params.nodes, params.deflectionLimitRatio],
  );
  const worstServiceability = useMemo(() => getWorstServiceabilityRow(serviceabilityRows), [serviceabilityRows]);

  const handleAddLoad = (load: Load) => {
      setParams(prev => ({
          ...prev,
          loads: [...prev.loads, { ...load, loadCaseId: load.loadCaseId ?? getActiveLoadCaseId(prev) }]
      }));
  };

  const handleClearLoads = () => {
    setParams(prev => ({
        ...prev,
        loads: prev.loads.filter(load => (load.loadCaseId ?? DEFAULT_LOAD_CASES[0].id) !== getActiveLoadCaseId(prev))
    }));
  };

  const handleSaveModel = () => {
    const blob = new Blob([stringifySolverModel(params)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = createSolverModelFileName();
    link.click();
    URL.revokeObjectURL(url);
    setModelFileStatus({ type: 'success', message: '模型文件已生成。' });
  };

  const handleExportReport = () => {
    const report = createCalculationReport({
      params,
      results,
      activeAnalysis,
      analysisLoads,
      envelopeRows,
      serviceabilityRows,
      validationIssues,
    });
    const blob = new Blob([report], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = createReportFileName();
    link.click();
    URL.revokeObjectURL(url);
    setModelFileStatus({ type: 'success', message: '计算报告已生成。' });
  };

  const handleImportModelText = (text: string) => {
    const result = importSolverModel(text);
    if ('error' in result) {
      setModelFileStatus({ type: 'error', message: result.error });
      return;
    }
      setParams(result.params);
      setAgentSnapshots([]);
      setAgentSession(createAgentSession());
      setSelectedResult(null);
      setModelFileStatus({ type: 'success', message: '模型已加载，结果已重新计算。' });
  };

  const handleResetModel = () => {
    setParams(createDefaultSolverParams());
    setAgentSnapshots([]);
    setAgentSession(createAgentSession());
    setSelectedResult(null);
    setModelFileStatus({ type: 'success', message: '已恢复默认求解模型。' });
  };

  const handleActivateAnalysis = (target: { type: 'loadCase' | 'combination'; id: string }) => {
    setParams(prev => ({
      ...prev,
      activeAnalysisType: target.type,
      activeAnalysisId: target.id,
      activeLoadCaseId: target.type === 'loadCase' ? target.id : prev.activeLoadCaseId,
    }));
  };

  const handleApplyAgentActions = (actions: AgentAction[], summary: string) => {
    setAgentSnapshots(prev => [...prev, createAgentSnapshot(params, summary, agentSession)]);
    const execution = applyAgentActions(params, actions);
    setParams(execution.params);
    setAgentSession(prev => updateSessionFromActions(prev, execution.appliedActions, summary));
    const parts = [execution.summary];
    if (execution.warning) parts.push(`注意：${execution.warning}`);
    parts.push('如需恢复，可点击“撤销上一步”。');
    return parts.join('\n');
  };

  const handleUndoAgentAction = () => {
    setAgentSnapshots(prev => {
      const previous = prev[prev.length - 1];
      if (previous) {
        setParams(previous.params);
        setAgentSession(previous.session ?? createAgentSession());
      }
      return prev.slice(0, -1);
    });
    return agentSnapshots.length > 0 ? '已恢复到上一次 Agent 操作前的模型状态。' : '当前没有可撤销的 Agent 操作。';
  };

  const handleExplainResults = async (question: string, onChunk?: (delta: string) => void) => {
    const facts = summarizeResultFacts(params, results).join('；');
    try {
      return await explainResultsWithLLM({ params, results, loads: analysisLoads }, question, onChunk);
    } catch {
      return facts;
    }
  };

  if (solverMode === 'space') {
    return <SpaceSolverPrototype onSwitchToPlane={() => setSolverMode('plane')} />;
  }

  const selectResult = (selection: ResultSelection) => {
    setSelectedResult(selection);
    setWorkspaceView('analysis');
  };

  return (
    <ForceFlowScope showControls={false} playback={playback} peaks={flowPeaks} initialField={params.structureType === StructureType.Truss ? 'N' : 'V'} invalid={!!results.error}><div className="solver-workbench relative flex h-full min-h-0 flex-col overflow-hidden bg-slate-950 text-slate-200">
      <div className="solver-command-row" aria-label="求解器工具栏">
      <div className="solver-main-toolbar flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-1">
        <div role="tablist" aria-label="求解器工作区" className="flex gap-1 rounded-lg bg-slate-900 p-1">
          {([{ id: 'analysis', label: '建模与内力' }, { id: 'results', label: '结果表' }] as const).map(view => (
            <button key={view.id} role="tab" id={`workspace-tab-${view.id}`} aria-controls={`workspace-${view.id}`} aria-selected={workspaceView === view.id} onClick={() => setWorkspaceView(view.id)} onKeyDown={event => { const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']; if (!keys.includes(event.key)) return; event.preventDefault(); const ids = ['analysis', 'results'] as const; const index = ids.indexOf(view.id); const next = event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length; setWorkspaceView(ids[next]); document.getElementById(`workspace-tab-${ids[next]}`)?.focus(); }} tabIndex={workspaceView === view.id ? 0 : -1} className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${workspaceView === view.id ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>{view.label}</button>
          ))}
        </div>
        <div className="solver-action-group flex flex-wrap items-center gap-1.5">
          <button type="button" aria-expanded={isConfigOpen} aria-controls="model-configuration" onClick={() => { setIsConfigOpen(v => !v); setIsAgentDrawerOpen(false); }} className={`workbench-action ${isConfigOpen ? 'text-cyan-200 bg-cyan-500/10' : ''}`}><SlidersHorizontal size={15} />模型配置</button>
          <span className="mx-1 h-5 border-l border-slate-800" />
          <button type="button" onClick={handleSaveModel} className="workbench-action" title="保存模型"><FileDown size={15} /><span className="hidden sm:inline">保存</span></button>
          <button type="button" onClick={() => modelImportRef.current?.click()} className="workbench-action" title="加载模型"><FileUp size={15} /><span className="hidden sm:inline">加载</span></button>
          <button type="button" disabled={playback.factor !== 1 || playback.playing} onClick={handleExportReport} className="workbench-action" title="恢复 100% 后导出目标工况报告"><FileText size={15} /><span className="hidden sm:inline">报告</span></button>
          <input ref={modelImportRef} type="file" accept=".json,application/json" className="hidden" onChange={async event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; try { handleImportModelText(await file.text()); } catch { setModelFileStatus({ type: 'error', message: '模型文件读取失败' }); } }} />
          <button type="button" aria-expanded={isAgentDrawerOpen} aria-controls="structure-assistant" onClick={() => { setIsAgentDrawerOpen(v => !v); setIsConfigOpen(false); }} className={`workbench-action ml-1 border border-slate-700 ${isAgentDrawerOpen ? 'bg-cyan-500/10 text-cyan-200' : ''}`}><Bot size={15} />结构助手</button>
        </div>
      </div>
      <div className="solver-casebar flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-slate-800/70 px-3 py-1 text-[11px]">
        <div className="solver-case-group flex items-center gap-3">
          <label className="flex items-center gap-2 text-slate-500">工况
            <select aria-label="当前计算工况" value={`${activeAnalysis.type}:${activeAnalysis.id}`} onChange={event => { const [type, id] = event.target.value.split(':'); handleActivateAnalysis({ type: type as 'loadCase' | 'combination', id }); }} className="max-w-44 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 outline-none focus:border-cyan-500">
              {getLoadCases(params).map(item => <option key={item.id} value={`loadCase:${item.id}`}>{item.name}</option>)}
              {getLoadCombinations(params).map(item => <option key={item.id} value={`combination:${item.id}`}>{item.name}</option>)}
            </select>
          </label>
          <span className="text-cyan-300">加载 {Math.round(playback.factor*100)}%</span><span className="hidden sm:inline text-slate-500">{params.nodes.length} 节点 · {params.elements.length} 杆件 · {analysisLoads.length} 荷载</span>
        </div>
        <div className="solver-summary-group flex items-center gap-4">
          <span className="text-slate-500">M <b className="font-mono font-medium text-slate-300">{extrema.moment?.value.toFixed(2) ?? '0.00'}</b> kN·m</span>
          <span className="text-slate-500">δ <b className="font-mono font-medium text-slate-300">{extrema.deflection?.value.toFixed(4) ?? '0.0000'}</b> mm</span>
          <button type="button" aria-expanded={showDiagnostics} onClick={() => setShowDiagnostics(v => !v)} className={issueSummary.errors || results.error ? 'text-red-300' : issueSummary.warnings || worstServiceability?.passed === false ? 'text-amber-300' : 'text-emerald-400'}>{issueSummary.errors ? `${issueSummary.errors} 错误` : issueSummary.warnings ? `${issueSummary.warnings} 警告` : worstServiceability?.passed === false ? '挠度超限' : params.nodes.length === 0 ? '等待建模' : '计算检查'} {showDiagnostics ? '−' : '+'}</button>
          <button type="button" onClick={() => setSolverMode('space')} className="hidden lg:inline text-slate-500 hover:text-slate-200">空间结构原型 ↗</button>
        </div>
      </div>
      </div>
      {modelFileStatus && <div role="status" className={`flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-2 text-xs ${modelFileStatus.type === 'error' ? 'text-red-300' : 'text-emerald-300'}`}>{modelFileStatus.message}<button type="button" aria-label="关闭文件提示" onClick={() => setModelFileStatus(null)}><X size={14} /></button></div>}
      {results.error && <div role="alert" className="solver-calculation-alert">{results.error}</div>}
      {showDiagnostics && <div className="shrink-0 overflow-auto border-b border-slate-800 p-3"><SolverDiagnostics summary={diagnosticSummary} momentSelection={momentSelection} deflectionSelection={deflectionSelection} onSelectResult={selectResult} /></div>}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div id="model-configuration" hidden={!isConfigOpen} className={isConfigOpen ? 'workbench-config' : 'hidden'}>
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-3"><h3 className="text-sm font-semibold">模型配置</h3><button type="button" aria-label="收起模型配置" onClick={() => setIsConfigOpen(false)} className="text-slate-500 hover:text-white"><X size={16} /></button></div>
          <ControlPanel params={params} setParams={setParams} onClearLoads={handleClearLoads} analysisLoads={analysisLoads} activeAnalysis={activeAnalysis} validationIssues={validationIssues} diagramLayers={diagramLayers} setDiagramLayers={setDiagramLayers} onResetModel={handleResetModel} />
        </div>
        <main className="solver-stage min-h-0 min-w-0 flex-1 overflow-hidden p-2">
          <StructureVisualizer view={workspaceView === 'results' ? 'hidden' : 'analysis'} params={params} setParams={setParams} loadFactor={playback.factor} referenceResult={targetResult} nodes={params.nodes} elements={params.elements} results={results} loads={analysisLoads} onAddLoad={handleAddLoad} layers={diagramLayers} selectedResult={selectedResult} />
          <div id="workspace-results" hidden={workspaceView !== 'results'} role="tabpanel" aria-labelledby="workspace-tab-results" className={workspaceView === 'results' ? 'h-full min-h-0' : 'hidden'}>
            <ResultsPanel embedded results={results} nodes={params.nodes} elements={params.elements} loads={analysisLoads} activeAnalysis={activeAnalysis} selectedResult={selectedResult} onSelectResult={selectResult} envelopeRows={envelopeRows} serviceabilityRows={serviceabilityRows} onActivateAnalysis={handleActivateAnalysis} />
          </div>
        </main>
        <aside id="structure-assistant" hidden={!isAgentDrawerOpen} aria-label="结构助手" className={isAgentDrawerOpen ? 'workbench-assistant' : 'hidden'}>
          <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-3"><h3 className="flex items-center gap-2 text-sm font-semibold"><Bot size={16} className="text-cyan-400" />结构助手</h3><button type="button" aria-label="收起结构助手" onClick={() => setIsAgentDrawerOpen(false)} className="text-slate-500 hover:text-white"><X size={16} /></button></div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4"><AgentPanel params={params} results={results} parseInput={(text, contextHint, onChunk) => parseAgentInput(text, { params, results, session: contextHint ? { ...agentSession, lastSummary: contextHint } : agentSession }, undefined, onChunk)} onApplyActions={handleApplyAgentActions} onExplainResults={handleExplainResults} onParseImage={parseImageToActions} onUndo={handleUndoAgentAction} canUndo={agentSnapshots.length > 0} variant="sidebar" className="flex h-full flex-col rounded-none border-0 bg-transparent p-0" messageClassName="max-h-72 overflow-y-auto rounded-xl bg-slate-900/80 p-2" /></div>
        </aside>
      </div>
    </div></ForceFlowScope>
  );
};

export default SolverModule;
