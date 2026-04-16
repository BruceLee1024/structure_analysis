import React, { useState, useMemo, useEffect } from 'react';
import ControlPanel from './solver/ControlPanel';
import StructureVisualizer from './solver/StructureVisualizer';
import ResultsPanel from './solver/ResultsPanel';
import AgentPanel from './solver/AgentPanel';
import { SolverParams, StructureType, AnalysisResult, Load } from '../types';
import { solveStructure } from '../utils/solver';
import { generateGeometry } from '../utils/geometryGenerator';
import { parseAgentInput } from '../utils/agent/parser';
import { applyAgentActions, createAgentSnapshot } from '../utils/agent/executor';
import { explainResultsWithLLM, summarizeResultFacts } from '../utils/agent/explainer';
import { parseImageToActions } from '../utils/agent/visionParser';
import { createAgentSession, updateSessionFromActions } from '../utils/agent/session';
import type { AgentAction, AgentSessionState, AgentSnapshot } from '../utils/agent/types';

const SolverModule: React.FC = () => {
  const [agentSnapshots, setAgentSnapshots] = useState<AgentSnapshot[]>([]);
  const [agentSession, setAgentSession] = useState<AgentSessionState>(() => createAgentSession());
  const [params, setParams] = useState<SolverParams>(() => {
    const initialGeom = generateGeometry(StructureType.PortalFrame, 10, 5, 2, 200, 50, 200, 2, 2, 2, 0, 0);
    return {
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
      loads: []
    };
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

  const results: AnalysisResult = useMemo(() => {
      if (params.nodes.length < 2 || params.elements.length === 0) {
          return { elements: [], maxDeflection: 0, reactions: [], displacements: [] };
      }
      return solveStructure(params.nodes, params.elements, params.loads, params.stiffnessType);
  }, [params.nodes, params.elements, params.loads, params.stiffnessType]);

  const handleAddLoad = (load: Load) => {
      setParams(prev => ({
          ...prev,
          loads: [...prev.loads, load]
      }));
  };

  const handleClearLoads = () => {
    setParams(prev => ({
        ...prev,
        loads: []
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
      return await explainResultsWithLLM({ params, results, loads: params.loads }, question, onChunk);
    } catch {
      return facts;
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-950 text-slate-200 rounded-xl">
      <ControlPanel 
        params={params} 
        setParams={setParams} 
        onClearLoads={handleClearLoads}
      />

      <main className="flex-1 flex flex-col h-full min-w-0 bg-slate-950">
        {results.error && (
          <div className="mx-4 mt-4 mb-2 px-4 py-2 bg-amber-900/60 border border-amber-600/50 rounded-lg text-amber-200 text-sm flex-shrink-0">
            ⚠️ {results.error}
          </div>
        )}
        <div className="flex-1 min-h-0 p-4 pb-0 overflow-y-auto">
            <StructureVisualizer 
                params={params} 
                nodes={params.nodes} 
                elements={params.elements} 
                results={results} 
                loads={params.loads}
                onAddLoad={handleAddLoad}
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
            loads={params.loads}
        />
      </main>

      <aside className="hidden xl:flex w-80 2xl:w-[26rem] flex-shrink-0 flex-col border-l border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950/95 overflow-y-auto">
        <div className="p-4">
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
            className="flex flex-col rounded-none border-0 bg-transparent p-0"
            messageClassName="max-h-72 overflow-y-auto rounded-xl bg-slate-950/60 p-2"
          />
        </div>
      </aside>
    </div>
  );
};

export default SolverModule;
