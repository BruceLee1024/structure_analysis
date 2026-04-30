import React, { useState, useRef, useCallback, useMemo } from 'react';
import { AnalysisResult, SolverNode, SolverElement, Load } from '../../types';

type ResultTab = 'reactions' | 'elements' | 'displacements' | 'equilibrium';

interface ResultsPanelProps {
  results: AnalysisResult;
  nodes: SolverNode[];
  elements: SolverElement[];
  loads: Load[];
}

const formatForce = (val: number) => {
    if (Math.abs(val) < 0.005) return '0.00';
    return val.toFixed(2);
};

const formatDisp = (val: number) => {
    if (Math.abs(val) < 0.00005) return '0.0000';
    return val.toFixed(4);
};

const formatRot = (val: number) => {
    if (Math.abs(val) < 0.0000005) return '0.000000';
    return val.toFixed(6);
};

const MIN_HEIGHT = 36;
const DEFAULT_HEIGHT = 240;
const MAX_HEIGHT = 500;

const ResultsPanel: React.FC<ResultsPanelProps> = ({ results, nodes, elements, loads }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ResultTab>('reactions');
  const [panelHeight, setPanelHeight] = useState(DEFAULT_HEIGHT);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = true;
    startY.current = e.clientY;
    startHeight.current = panelHeight;

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startY.current - ev.clientY;
      const newH = Math.max(MIN_HEIGHT + 40, Math.min(MAX_HEIGHT, startHeight.current + delta));
      setPanelHeight(newH);
    };
    const onUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [panelHeight]);

  const tabs: { key: ResultTab; label: string; icon: string }[] = [
    { key: 'reactions', label: '支座反力', icon: '⬆' },
    { key: 'elements', label: '单元内力', icon: '≡' },
    { key: 'displacements', label: '节点位移', icon: '↔' },
    { key: 'equilibrium', label: '平衡校验', icon: '✓' },
  ];

  const hasResults = results.elements.length > 0;

  const exportCSV = useCallback(() => {
    let csv = '';
    if (activeTab === 'reactions') {
      csv = '节点,Fx(kN),Fy(kN),M(kN·m)\n';
      results.reactions.forEach(r => {
        csv += `${r.nodeId},${formatForce(r.fx)},${formatForce(r.fy)},${formatForce(r.m)}\n`;
      });
    } else if (activeTab === 'elements') {
      csv = '单元,N1,N2,Mi(kN·m),Mj(kN·m),M_max,Vi(kN),Vj(kN),V_max,Ni(kN),Nj(kN),N_max\n';
      results.elements.forEach(res => {
        const el = elements.find(e => e.id === res.elementId);
        const s0 = res.stations[0];
        const sN = res.stations[res.stations.length - 1];
        csv += `${res.elementId},${el?.startNode},${el?.endNode},${formatForce(s0?.moment??0)},${formatForce(sN?.moment??0)},${formatForce(res.maxMoment)},${formatForce(s0?.shear??0)},${formatForce(sN?.shear??0)},${formatForce(res.maxShear)},${formatForce(s0?.axial??0)},${formatForce(sN?.axial??0)},${formatForce(res.maxAxial)}\n`;
      });
    } else if (activeTab === 'displacements') {
      csv = '节点,Δx(mm),Δy(mm),θ(rad)\n';
      (results.displacements ?? []).forEach(d => {
        csv += `${d.nodeId},${formatDisp(d.dx)},${formatDisp(d.dy)},${formatRot(d.rotation)}\n`;
      });
    }
    if (!csv) return;
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTab}_results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeTab, results, elements]);

  return (
    <div
      className="flex-shrink-0 overflow-hidden rounded-b-lg border-t border-slate-700 bg-slate-900 flex flex-col"
      style={{ height: isOpen ? panelHeight : MIN_HEIGHT }}
    >
      {/* Drag resize handle */}
      {isOpen && (
        <div
          className="group flex h-1.5 flex-shrink-0 cursor-ns-resize items-center justify-center transition-colors hover:bg-indigo-500/30"
          onMouseDown={handleDragStart}
          aria-hidden="true"
        >
          <div className="w-10 h-0.5 rounded-full bg-slate-600 group-hover:bg-indigo-400 transition-colors" />
        </div>
      )}

      {/* Handle bar */}
      <div className="flex h-9 flex-shrink-0 items-center gap-2 px-3 transition-colors hover:bg-slate-800/60">
        <button
          type="button"
          className="flex min-w-0 shrink-0 items-center gap-2 rounded px-1 py-1 text-left focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
        >
          <svg
            className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">计算结果</span>
        </button>

        {isOpen && (
          <div className="ml-1 flex min-w-0 gap-1 overflow-x-auto sm:ml-3">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={(e) => { e.stopPropagation(); setActiveTab(tab.key); }}
                className={`flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400/40 ${
                  activeTab === tab.key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                }`}
              >
                <span className="text-[9px]">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {isOpen && hasResults && activeTab !== 'equilibrium' && (
          <button
            onClick={(e) => { e.stopPropagation(); exportCSV(); }}
            className="ml-auto flex shrink-0 items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400 transition-colors hover:bg-slate-700 hover:text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
            title="导出 CSV"
            aria-label="导出 CSV"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            CSV
          </button>
        )}

        {!isOpen && hasResults && (
          <span className="ml-auto truncate text-[10px] text-slate-500">
            {results.reactions.length} 个反力 · {results.elements.length} 个单元 · {results.displacements?.length ?? 0} 个位移
          </span>
        )}
      </div>

      {/* Content area */}
      {isOpen && (
        <div className="flex-1 min-h-0 overflow-auto px-3 pb-2">
          {!hasResults ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-xs">
              暂无计算结果，请添加荷载后查看
            </div>
          ) : (
            <>
              {activeTab === 'reactions' && <ReactionsTable results={results} />}
              {activeTab === 'elements' && <ElementsTable results={results} nodes={nodes} elements={elements} />}
              {activeTab === 'displacements' && <DisplacementsTable results={results} />}
              {activeTab === 'equilibrium' && <EquilibriumCheck results={results} nodes={nodes} loads={loads} elements={elements} />}
            </>
          )}
        </div>
      )}
    </div>
  );
};

const thClass = "text-right py-1.5 px-2 font-semibold sticky top-0 bg-slate-900 z-10";
const thClassLeft = "text-left py-1.5 px-2 font-semibold sticky top-0 bg-slate-900 z-10";
const thClassCenter = "text-center py-1.5 px-2 font-semibold sticky top-0 bg-slate-900 z-10";

/* ===== Reactions Tab ===== */
const ReactionsTable: React.FC<{ results: AnalysisResult }> = ({ results }) => {
  if (results.reactions.length === 0) {
    return <div className="text-slate-500 text-xs text-center py-4">无约束节点</div>;
  }
  const sumFx = results.reactions.reduce((s, r) => s + r.fx, 0);
  const sumFy = results.reactions.reduce((s, r) => s + r.fy, 0);
  const sumM = results.reactions.reduce((s, r) => s + r.m, 0);
  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="text-slate-400 border-b border-slate-700">
          <th className={thClassLeft}>节点</th>
          <th className={thClass}>Fx (kN)</th>
          <th className={thClass}>Fy (kN)</th>
          <th className={thClass}>M (kN·m)</th>
        </tr>
      </thead>
      <tbody>
        {results.reactions.map(r => (
          <tr key={r.nodeId} className="border-b border-slate-800/50 hover:bg-slate-800/40 transition-colors">
            <td className="py-1.5 px-2 font-mono font-bold text-indigo-300">{r.nodeId}</td>
            <td className={`py-1.5 px-2 text-right font-mono ${Math.abs(r.fx) > 0.005 ? 'text-slate-200' : 'text-slate-500'}`}>{formatForce(r.fx)}</td>
            <td className={`py-1.5 px-2 text-right font-mono ${Math.abs(r.fy) > 0.005 ? 'text-slate-200' : 'text-slate-500'}`}>{formatForce(r.fy)}</td>
            <td className={`py-1.5 px-2 text-right font-mono ${Math.abs(r.m) > 0.005 ? 'text-slate-200' : 'text-slate-500'}`}>{formatForce(r.m)}</td>
          </tr>
        ))}
        <tr className="border-t-2 border-slate-600 bg-slate-800/30">
          <td className="py-1.5 px-2 font-bold text-slate-300">Σ 合计</td>
          <td className={`py-1.5 px-2 text-right font-mono font-bold ${Math.abs(sumFx) < 0.05 ? 'text-emerald-400' : 'text-amber-400'}`}>{formatForce(sumFx)}</td>
          <td className={`py-1.5 px-2 text-right font-mono font-bold ${Math.abs(sumFy) < 0.05 ? 'text-emerald-400' : 'text-amber-400'}`}>{formatForce(sumFy)}</td>
          <td className={`py-1.5 px-2 text-right font-mono font-bold ${Math.abs(sumM) < 0.05 ? 'text-emerald-400' : 'text-amber-400'}`}>{formatForce(sumM)}</td>
        </tr>
      </tbody>
    </table>
  );
};

/* ===== Elements Tab ===== */
const ElementsTable: React.FC<{ results: AnalysisResult; nodes: SolverNode[]; elements: SolverElement[] }> = ({ results, nodes, elements }) => {
  if (results.elements.length === 0) {
    return <div className="text-slate-500 text-xs text-center py-4">无单元结果</div>;
  }
  const globalMaxM = Math.max(...results.elements.map(e => e.maxMoment));
  const globalMaxV = Math.max(...results.elements.map(e => e.maxShear));
  const globalMaxN = Math.max(...results.elements.map(e => e.maxAxial));
  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="text-slate-400 border-b border-slate-700">
          <th className={thClassLeft}>单元</th>
          <th className={thClassCenter}>N1→N2</th>
          <th className={thClass}>Mi (kN·m)</th>
          <th className={thClass}>Mj (kN·m)</th>
          <th className={thClass}>M_max</th>
          <th className={thClass}>Vi (kN)</th>
          <th className={thClass}>Vj (kN)</th>
          <th className={thClass}>V_max</th>
          <th className={thClass}>Ni (kN)</th>
          <th className={thClass}>Nj (kN)</th>
          <th className={thClass}>N_max</th>
        </tr>
      </thead>
      <tbody>
        {results.elements.map(res => {
          const el = elements.find(e => e.id === res.elementId);
          const startStation = res.stations[0];
          const endStation = res.stations[res.stations.length - 1];
          return (
            <tr key={res.elementId} className="border-b border-slate-800/50 hover:bg-slate-800/40 transition-colors">
              <td className="py-1.5 px-2 font-mono font-bold text-indigo-300">{res.elementId}</td>
              <td className="py-1.5 px-2 text-center text-slate-400 font-mono text-[10px]">{el?.startNode}→{el?.endNode}</td>
              <td className="py-1.5 px-2 text-right font-mono text-blue-300">{formatForce(startStation?.moment ?? 0)}</td>
              <td className="py-1.5 px-2 text-right font-mono text-blue-300">{formatForce(endStation?.moment ?? 0)}</td>
              <td className="py-1.5 px-2 text-right font-mono font-bold text-blue-400">{formatForce(res.maxMoment)}</td>
              <td className="py-1.5 px-2 text-right font-mono text-rose-300">{formatForce(startStation?.shear ?? 0)}</td>
              <td className="py-1.5 px-2 text-right font-mono text-rose-300">{formatForce(endStation?.shear ?? 0)}</td>
              <td className="py-1.5 px-2 text-right font-mono font-bold text-rose-400">{formatForce(res.maxShear)}</td>
              <td className="py-1.5 px-2 text-right font-mono text-emerald-300">{formatForce(startStation?.axial ?? 0)}</td>
              <td className="py-1.5 px-2 text-right font-mono text-emerald-300">{formatForce(endStation?.axial ?? 0)}</td>
              <td className="py-1.5 px-2 text-right font-mono font-bold text-emerald-400">{formatForce(res.maxAxial)}</td>
            </tr>
          );
        })}
        <tr className="border-t-2 border-slate-600 bg-slate-800/30">
          <td className="py-1.5 px-2 font-bold text-slate-300" colSpan={2}>全局最大值</td>
          <td colSpan={2}></td>
          <td className="py-1.5 px-2 text-right font-mono font-bold text-blue-300">{formatForce(globalMaxM)}</td>
          <td colSpan={2}></td>
          <td className="py-1.5 px-2 text-right font-mono font-bold text-rose-300">{formatForce(globalMaxV)}</td>
          <td colSpan={2}></td>
          <td className="py-1.5 px-2 text-right font-mono font-bold text-emerald-300">{formatForce(globalMaxN)}</td>
        </tr>
      </tbody>
    </table>
  );
};

/* ===== Displacements Tab ===== */
const DisplacementsTable: React.FC<{ results: AnalysisResult }> = ({ results }) => {
  const displacements = results.displacements ?? [];
  if (displacements.length === 0) {
    return <div className="text-slate-500 text-xs text-center py-4">无位移数据</div>;
  }
  const maxDx = Math.max(...displacements.map(d => Math.abs(d.dx)));
  const maxDy = Math.max(...displacements.map(d => Math.abs(d.dy)));
  const maxRot = Math.max(...displacements.map(d => Math.abs(d.rotation)));
  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="text-slate-400 border-b border-slate-700">
          <th className={thClassLeft}>节点</th>
          <th className={thClass}>Δx (mm)</th>
          <th className={thClass}>Δy (mm)</th>
          <th className={thClass}>θ (rad)</th>
        </tr>
      </thead>
      <tbody>
        {displacements.map(d => (
          <tr key={d.nodeId} className="border-b border-slate-800/50 hover:bg-slate-800/40 transition-colors">
            <td className="py-1.5 px-2 font-mono font-bold text-indigo-300">{d.nodeId}</td>
            <td className={`py-1.5 px-2 text-right font-mono ${Math.abs(d.dx) > 0.00005 ? 'text-purple-300' : 'text-slate-500'}`}>{formatDisp(d.dx)}</td>
            <td className={`py-1.5 px-2 text-right font-mono ${Math.abs(d.dy) > 0.00005 ? 'text-purple-300' : 'text-slate-500'}`}>{formatDisp(d.dy)}</td>
            <td className={`py-1.5 px-2 text-right font-mono ${Math.abs(d.rotation) > 0.0000005 ? 'text-purple-300' : 'text-slate-500'}`}>{formatRot(d.rotation)}</td>
          </tr>
        ))}
        <tr className="border-t-2 border-slate-600 bg-slate-800/30">
          <td className="py-1.5 px-2 font-bold text-slate-300">最大绝对值</td>
          <td className="py-1.5 px-2 text-right font-mono font-bold text-purple-300">{formatDisp(maxDx)}</td>
          <td className="py-1.5 px-2 text-right font-mono font-bold text-purple-300">{formatDisp(maxDy)}</td>
          <td className="py-1.5 px-2 text-right font-mono font-bold text-purple-300">{formatRot(maxRot)}</td>
        </tr>
      </tbody>
    </table>
  );
};

/* ===== Equilibrium Check Tab ===== */
const EquilibriumCheck: React.FC<{ results: AnalysisResult; nodes: SolverNode[]; loads: Load[]; elements: SolverElement[] }> = ({ results, nodes, loads, elements }) => {
  const check = useMemo(() => {
    let extFx = 0, extFy = 0, extM = 0;
    const refX = 0, refY = 0;

    loads.forEach(load => {
      if (load.nodeId) {
        const n = nodes.find(nd => nd.id === load.nodeId);
        if (!n) return;
        if (load.type === 'moment') {
          extM += load.magnitude;
        } else {
          const dir = load.direction || 'y';
          if (dir === 'x') {
            extFx += load.magnitude;
            extM += load.magnitude * (n.y - refY);
          } else {
            extFy += load.magnitude;
            extM += -load.magnitude * (n.x - refX);
          }
        }
      } else if (load.elementId) {
        const el = elements.find(e => e.id === load.elementId);
        if (!el) return;
        const n1 = nodes.find(n => n.id === el.startNode);
        const n2 = nodes.find(n => n.id === el.endNode);
        if (!n1 || !n2) return;

        if (load.type === 'distributed') {
          const L = Math.sqrt(Math.pow(n2.x - n1.x, 2) + Math.pow(n2.y - n1.y, 2));
          const totalForce = load.magnitude * L;
          const midX = (n1.x + n2.x) / 2;
          const midY = (n1.y + n2.y) / 2;
          const dir = load.direction || 'y';
          if (dir === 'x') {
            extFx += totalForce;
            extM += totalForce * (midY - refY);
          } else {
            extFy += totalForce;
            extM += -totalForce * (midX - refX);
          }
        } else if (load.type === 'point') {
          const t = load.location ?? 0.5;
          const px = n1.x + t * (n2.x - n1.x);
          const py = n1.y + t * (n2.y - n1.y);
          const dir = load.direction || 'y';
          if (dir === 'x') {
            extFx += load.magnitude;
            extM += load.magnitude * (py - refY);
          } else {
            extFy += load.magnitude;
            extM += -load.magnitude * (px - refX);
          }
        } else if (load.type === 'moment') {
          extM += load.magnitude;
        }
      }
    });

    let reactFx = 0, reactFy = 0, reactM = 0;
    results.reactions.forEach(r => {
      reactFx += r.fx;
      reactFy += r.fy;
      reactM += r.m;
      const n = nodes.find(nd => nd.id === r.nodeId);
      if (n) {
        reactM += -r.fx * (n.y - refY) + r.fy * (n.x - refX);
      }
    });

    const sumFx = extFx + reactFx;
    const sumFy = extFy + reactFy;
    const sumM = extM + reactM;

    const tol = 0.05;
    const fxOk = Math.abs(sumFx) < tol;
    const fyOk = Math.abs(sumFy) < tol;
    const mOk = Math.abs(sumM) < tol;

    return { extFx, extFy, extM, reactFx, reactFy, reactM, sumFx, sumFy, sumM, fxOk, fyOk, mOk, allOk: fxOk && fyOk && mOk };
  }, [results, nodes, loads, elements]);

  const StatusIcon = ({ ok }: { ok: boolean }) => (
    <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${ok ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
      {ok ? '✓' : '!'}
    </span>
  );

  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-semibold ${check.allOk ? 'bg-emerald-900/30 border border-emerald-700/50 text-emerald-300' : 'bg-amber-900/30 border border-amber-700/50 text-amber-300'}`}>
        <span className="text-base">{check.allOk ? '✓' : '⚠'}</span>
        {check.allOk ? '静力平衡校验通过' : '静力平衡校验存在偏差（可能由数值精度或建模导致）'}
      </div>

      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-slate-400 border-b border-slate-700">
            <th className={thClassLeft}>方向</th>
            <th className={thClass}>外荷载</th>
            <th className={thClass}>反力合计</th>
            <th className={thClass}>代数和</th>
            <th className={`${thClassCenter}`}>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-slate-800/50 hover:bg-slate-800/40">
            <td className="py-1.5 px-2 font-bold text-slate-300">ΣFx (kN)</td>
            <td className="py-1.5 px-2 text-right font-mono text-slate-200">{formatForce(check.extFx)}</td>
            <td className="py-1.5 px-2 text-right font-mono text-slate-200">{formatForce(check.reactFx)}</td>
            <td className={`py-1.5 px-2 text-right font-mono font-bold ${check.fxOk ? 'text-emerald-400' : 'text-amber-400'}`}>{formatForce(check.sumFx)}</td>
            <td className="py-1.5 px-2 text-center"><StatusIcon ok={check.fxOk} /></td>
          </tr>
          <tr className="border-b border-slate-800/50 hover:bg-slate-800/40">
            <td className="py-1.5 px-2 font-bold text-slate-300">ΣFy (kN)</td>
            <td className="py-1.5 px-2 text-right font-mono text-slate-200">{formatForce(check.extFy)}</td>
            <td className="py-1.5 px-2 text-right font-mono text-slate-200">{formatForce(check.reactFy)}</td>
            <td className={`py-1.5 px-2 text-right font-mono font-bold ${check.fyOk ? 'text-emerald-400' : 'text-amber-400'}`}>{formatForce(check.sumFy)}</td>
            <td className="py-1.5 px-2 text-center"><StatusIcon ok={check.fyOk} /></td>
          </tr>
          <tr className="border-b border-slate-800/50 hover:bg-slate-800/40">
            <td className="py-1.5 px-2 font-bold text-slate-300">ΣM₀ (kN·m)</td>
            <td className="py-1.5 px-2 text-right font-mono text-slate-200">{formatForce(check.extM)}</td>
            <td className="py-1.5 px-2 text-right font-mono text-slate-200">{formatForce(check.reactM)}</td>
            <td className={`py-1.5 px-2 text-right font-mono font-bold ${check.mOk ? 'text-emerald-400' : 'text-amber-400'}`}>{formatForce(check.sumM)}</td>
            <td className="py-1.5 px-2 text-center"><StatusIcon ok={check.mOk} /></td>
          </tr>
        </tbody>
      </table>

      <p className="text-[10px] text-slate-500 px-1">
        平衡校验基于原点 (0,0) 取矩。外荷载 + 反力 代数和应为零。容差 0.05。
      </p>
    </div>
  );
};

export default ResultsPanel;
