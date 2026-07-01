import React, { useState, useMemo, useEffect } from 'react';
import { Bot, PanelRightOpen, X } from 'lucide-react';
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
  const initialGeom = generateGeometry(StructureType.PortalFrame, 10, 5, 2, 200, 50, 200, 2, 2, 2, 0, 0);
  return {
    unitSystem: 'metric-kN-m',
    deflectionLimitRatio: 250,
    structureType: StructureType.PortalFrame,
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
    nodes: initialGeom.nodes,
    elements: initialGeom.elements,
    loads: [],
    loadCases: DEFAULT_LOAD_CASES,
    loadCombinations: DEFAULT_LOAD_COMBINATIONS,
    activeLoadCaseId: DEFAULT_LOAD_CASES[0].id,
    activeAnalysisType: 'loadCase',
    activeAnalysisId: DEFAULT_LOAD_CASES[0].id,
  };
};

const SolverModule: React.FC = () => {
  const [solverMode, setSolverMode] = useState<'plane' | 'space'>('plane');
  const [agentSnapshots, setAgentSnapshots] = useState<AgentSnapshot[]>([]);
  const [agentSession, setAgentSession] = useState<AgentSessionState>(() => createAgentSession());
  const [modelFileStatus, setModelFileStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [selectedResult, setSelectedResult] = useState<ResultSelection | null>(null);
  const [isAgentDrawerOpen, setIsAgentDrawerOpen] = useState(false);
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

  const analysisLoads = useMemo(() => getAnalysisLoads(params), [params]);
  const activeAnalysis = useMemo(() => getActiveAnalysis(params), [params]);

  const results: AnalysisResult = useMemo(() => {
      if (params.nodes.length < 2 || params.elements.length === 0) {
          return { elements: [], maxDeflection: 0, reactions: [], displacements: [] };
      }
      return solveStructure(params.nodes, params.elements, analysisLoads, params.stiffnessType);
  }, [params.nodes, params.elements, analysisLoads, params.stiffnessType]);

  const validationIssues = useMemo(
    () => validateModel(params, analysisLoads, results.error),
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

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-slate-950 text-slate-200 rounded-xl">
      <ControlPanel 
        params={params} 
        setParams={setParams} 
        onClearLoads={handleClearLoads}
        analysisLoads={analysisLoads}
        activeAnalysis={activeAnalysis}
        validationIssues={validationIssues}
        diagramLayers={diagramLayers}
        setDiagramLayers={setDiagramLayers}
        modelFileStatus={modelFileStatus}
        onSaveModel={handleSaveModel}
        onImportModelText={handleImportModelText}
        onResetModel={handleResetModel}
        onExportReport={handleExportReport}
      />

      <main className="flex-1 flex flex-col h-full min-w-0 bg-slate-950">
        {results.error && (
          <div className="mx-4 mt-4 mb-2 px-4 py-2 bg-amber-900/60 border border-amber-600/50 rounded-lg text-amber-200 text-sm flex-shrink-0">
            ⚠️ {results.error}
          </div>
        )}
        <div className="flex-1 min-h-0 p-4 pb-0 overflow-y-auto">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2">
              <div className="min-w-0">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Solver Mode</div>
                <div className="truncate text-[11px] font-semibold text-slate-200">平面杆系 · 3 自由度节点</div>
              </div>
              <div className="inline-flex rounded-md border border-slate-700 bg-slate-950 p-0.5">
                <button
                  type="button"
                  className="rounded px-3 py-1.5 text-[10px] font-semibold text-white bg-indigo-600"
                  aria-pressed="true"
                >
                  平面
                </button>
                <button
                  type="button"
                  onClick={() => setSolverMode('space')}
                  className="rounded px-3 py-1.5 text-[10px] font-semibold text-slate-400 transition-colors hover:bg-slate-800 hover:text-cyan-200"
                  aria-pressed="false"
                >
                  空间结构原型
                </button>
              </div>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2 text-[11px] lg:grid-cols-6">
              <div className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Analysis</div>
                <div className="mt-0.5 truncate font-semibold text-slate-200">{activeAnalysis.label}</div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Loads</div>
                <div className="mt-0.5 font-mono font-semibold text-rose-300">{analysisLoads.length}</div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Max M</div>
                <div className="mt-0.5 font-mono font-semibold text-blue-300">
                  {extrema.moment ? `${extrema.moment.value.toFixed(2)} kN·m` : '0.00 kN·m'}
                </div>
                <div className="mt-0.5 truncate text-[9px] text-slate-500">
                  {extrema.moment ? `E${extrema.moment.elementId} · x=${extrema.moment.x.toFixed(2)}m` : '无控制截面'}
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Max δ</div>
                <div className="mt-0.5 font-mono font-semibold text-purple-300">
                  {extrema.deflection ? `${extrema.deflection.value.toFixed(4)} mm` : '0.0000 mm'}
                </div>
                <div className="mt-0.5 truncate text-[9px] text-slate-500">
                  {extrema.deflection
                    ? extrema.deflection.elementId !== undefined && extrema.deflection.x !== undefined
                      ? `E${extrema.deflection.elementId} · x=${extrema.deflection.x.toFixed(2)}m`
                      : `N${extrema.deflection.nodeId} · ${extrema.deflection.component}`
                    : '无控制截面'}
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Checks</div>
                <div className={`mt-0.5 font-semibold ${issueSummary.errors > 0 ? 'text-red-300' : issueSummary.warnings > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                  {issueSummary.errors} 错误 · {issueSummary.warnings} 警告
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Deflection</div>
                <div className={`mt-0.5 font-mono font-semibold ${worstServiceability?.passed === false ? 'text-amber-300' : 'text-emerald-300'}`}>
                  {worstServiceability ? `${(worstServiceability.utilization * 100).toFixed(1)}%` : '0.0%'}
                </div>
                <div className="mt-0.5 truncate text-[9px] text-slate-500">
                  {worstServiceability ? `E${worstServiceability.elementId} · L/${worstServiceability.limitRatio}` : '无校核数据'}
                </div>
              </div>
            </div>
            <SolverDiagnostics
              summary={diagnosticSummary}
              momentSelection={momentSelection}
              deflectionSelection={deflectionSelection}
              onSelectResult={setSelectedResult}
            />
            <StructureVisualizer 
                params={params} 
                nodes={params.nodes} 
                elements={params.elements} 
                results={results} 
                loads={analysisLoads}
                onAddLoad={handleAddLoad}
                layers={diagramLayers}
                selectedResult={selectedResult}
            />
        </div>
        <div className="px-4 xl:hidden">
          <AgentPanel
            params={params}
            results={results}
            parseInput={(text, contextHint, onChunk) => parseAgentInput(text, { params, results, session: contextHint ? { ...agentSession, lastSummary: contextHint } : agentSession }, undefined, onChunk)}
            onApplyActions={handleApplyAgentActions}
            onExplainResults={handleExplainResults}
            onParseImage={parseImageToActions}
            onUndo={handleUndoAgentAction}
            canUndo={agentSnapshots.length > 0}
          />
        </div>
        <ResultsPanel 
            results={results}
            nodes={params.nodes}
            elements={params.elements}
            loads={analysisLoads}
            activeAnalysis={activeAnalysis}
            selectedResult={selectedResult}
            onSelectResult={setSelectedResult}
            envelopeRows={envelopeRows}
            serviceabilityRows={serviceabilityRows}
            onActivateAnalysis={handleActivateAnalysis}
        />
      </main>

      <aside
        className={`hidden min-h-0 shrink-0 flex-col overflow-hidden border-l border-slate-800 bg-slate-950/98 transition-[width] duration-300 xl:flex ${
          isAgentDrawerOpen ? 'w-[23rem]' : 'w-12'
        }`}
        aria-hidden={!isAgentDrawerOpen}
      >
        {!isAgentDrawerOpen ? (
          <div className="flex h-full w-12 flex-col items-center border-slate-800 bg-slate-950 py-3">
            <button
              type="button"
              onClick={() => setIsAgentDrawerOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-400 transition-colors hover:border-cyan-500/50 hover:bg-cyan-500/10 hover:text-cyan-200"
              aria-label="打开结构助手"
              title="打开结构助手"
            >
              <Bot className="h-4 w-4" />
            </button>
            <div className="mt-3 flex select-none flex-col items-center gap-1 text-[10px] font-semibold text-slate-600">
              <span className="[writing-mode:vertical-rl]">结构助手</span>
              <PanelRightOpen className="h-3.5 w-3.5" />
            </div>
          </div>
        ) : (
          <>
            <div className="flex h-12 w-[23rem] shrink-0 items-center justify-between border-b border-slate-800 px-4">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/15 text-cyan-200">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs font-bold text-slate-100">结构助手</div>
                  <div className="truncate text-[10px] text-slate-500">右侧栏模式，不遮挡绘图区</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAgentDrawerOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-800 bg-slate-900 text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-100"
                aria-label="收起结构助手"
                title="收起结构助手"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="min-h-0 w-[23rem] flex-1 overflow-y-auto p-4">
            <AgentPanel
              params={params}
              results={results}
              parseInput={(text, contextHint, onChunk) => parseAgentInput(text, { params, results, session: contextHint ? { ...agentSession, lastSummary: contextHint } : agentSession }, undefined, onChunk)}
              onApplyActions={handleApplyAgentActions}
              onExplainResults={handleExplainResults}
              onParseImage={parseImageToActions}
              onUndo={handleUndoAgentAction}
              canUndo={agentSnapshots.length > 0}
              variant="sidebar"
              className="flex h-full flex-col rounded-none border-0 bg-transparent p-0"
              messageClassName="max-h-72 overflow-y-auto rounded-xl bg-slate-900/80 p-2"
            />
            </div>
          </>
        )}
      </aside>
    </div>
  );
};

export default SolverModule;
