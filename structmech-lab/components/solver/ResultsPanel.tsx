import React, { useState, useRef, useCallback, useMemo } from 'react';
import { AnalysisResult, SolverNode, SolverElement, Load, AnalysisTargetType, type ResultSelection } from '../../types';
import { getResultExtrema, getSelectionForExtreme, type ResultExtrema } from '../../utils/resultExtrema';
import { computeEquilibriumResidual } from '../../utils/solverDiagnostics';
import type { EnvelopeRow } from '../../utils/resultEnvelope';
import type { ServiceabilityRow } from '../../utils/serviceabilityChecks';

type ResultTab = 'controls' | 'envelope' | 'serviceability' | 'reactions' | 'elements' | 'displacements' | 'equilibrium';

interface ResultsPanelProps {
  results: AnalysisResult;
  nodes: SolverNode[];
  elements: SolverElement[];
  loads: Load[];
  activeAnalysis?: { type: AnalysisTargetType; id: string; label: string };
  selectedResult?: ResultSelection | null;
  onSelectResult?: (selection: ResultSelection) => void;
  envelopeRows?: EnvelopeRow[];
  serviceabilityRows?: ServiceabilityRow[];
  onActivateAnalysis?: (target: { type: AnalysisTargetType; id: string }) => void;
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

const deflectionLocationText = (extrema: ResultExtrema) => {
  const deflection = extrema.deflection;
  if (!deflection) return '无';
  if (deflection.elementId !== undefined && deflection.x !== undefined) {
    return `单元 ${deflection.elementId} · x=${deflection.x.toFixed(2)} m`;
  }
  return `节点 ${deflection.nodeId} · ${deflection.component}`;
};

const controlRows = (extrema: ResultExtrema) => [
  {
    key: 'moment',
    label: '最大弯矩',
    location: extrema.moment ? `单元 ${extrema.moment.elementId} · x=${extrema.moment.x.toFixed(2)} m` : '无',
    value: extrema.moment ? formatForce(extrema.moment.value) : '0.00',
    unit: 'kN·m',
    colorClass: 'text-blue-300',
    selection: getSelectionForExtreme(extrema, 'moment'),
  },
  {
    key: 'shear',
    label: '最大剪力',
    location: extrema.shear ? `单元 ${extrema.shear.elementId} · x=${extrema.shear.x.toFixed(2)} m` : '无',
    value: extrema.shear ? formatForce(extrema.shear.value) : '0.00',
    unit: 'kN',
    colorClass: 'text-rose-300',
    selection: getSelectionForExtreme(extrema, 'shear'),
  },
  {
    key: 'axial',
    label: '最大轴力',
    location: extrema.axial ? `单元 ${extrema.axial.elementId} · x=${extrema.axial.x.toFixed(2)} m` : '无',
    value: extrema.axial ? formatForce(extrema.axial.value) : '0.00',
    unit: 'kN',
    colorClass: 'text-emerald-300',
    selection: getSelectionForExtreme(extrema, 'axial'),
  },
  {
    key: 'deflection',
    label: '最大位移',
    location: deflectionLocationText(extrema),
    value: extrema.deflection ? formatDisp(extrema.deflection.value) : '0.0000',
    unit: 'mm',
    colorClass: 'text-purple-300',
    selection: getSelectionForExtreme(extrema, 'deflection'),
  },
];

const MIN_HEIGHT = 36;
const DEFAULT_HEIGHT = 240;
const MAX_HEIGHT = 500;

const ResultsPanel: React.FC<ResultsPanelProps> = ({
  results,
  nodes,
  elements,
  loads,
  activeAnalysis,
  selectedResult,
  onSelectResult,
  envelopeRows = [],
  serviceabilityRows = [],
  onActivateAnalysis,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ResultTab>('reactions');
  const [panelHeight, setPanelHeight] = useState(DEFAULT_HEIGHT);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);
  const extrema = useMemo(() => getResultExtrema(results), [results]);

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
    { key: 'controls', label: '控制项', icon: '◎' },
    { key: 'envelope', label: '包络', icon: '◇' },
    { key: 'serviceability', label: '挠度限值', icon: 'L' },
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
    } else if (activeTab === 'controls') {
      csv = '控制项,位置,数值,单位\n';
      controlRows(extrema).forEach(row => {
        csv += `${row.label},${row.location},${row.value},${row.unit}\n`;
      });
    } else if (activeTab === 'envelope') {
      csv = '包络项,来源,位置,数值,单位\n';
      envelopeRows.forEach(row => {
        csv += `${row.label},${row.sourceLabel},${row.location},${row.value ?? ''},${row.unit}\n`;
      });
    } else if (activeTab === 'serviceability') {
      csv = '单元,长度(m),限值,允许值(mm),计算值(mm),利用率,状态\n';
      serviceabilityRows.forEach(row => {
        csv += `${row.elementId},${row.lengthM.toFixed(3)},L/${row.limitRatio},${row.limitMm.toFixed(3)},${row.deflectionMm.toFixed(3)},${row.utilization.toFixed(3)},${row.passed ? '通过' : '超限'}\n`;
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
  }, [activeTab, results, elements, extrema, envelopeRows, serviceabilityRows]);

  return (
    <div
      className="flex-shrink-0 bg-slate-900 border-t border-slate-700 flex flex-col rounded-b-xl overflow-hidden"
      style={{ height: isOpen ? panelHeight : MIN_HEIGHT }}
    >
      {/* Drag resize handle */}
      {isOpen && (
        <div
          className="h-1.5 flex-shrink-0 cursor-ns-resize group hover:bg-indigo-500/30 transition-colors flex items-center justify-center"
          onMouseDown={handleDragStart}
        >
          <div className="w-10 h-0.5 rounded-full bg-slate-600 group-hover:bg-indigo-400 transition-colors" />
        </div>
      )}

      {/* Handle bar */}
      <div
        className="h-9 flex-shrink-0 flex items-center gap-2 px-3 cursor-pointer select-none hover:bg-slate-800/60 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <svg
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">计算结果</span>

        {isOpen && (
          <div className="flex gap-1 ml-3">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={(e) => { e.stopPropagation(); setActiveTab(tab.key); }}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors flex items-center gap-1 ${
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
            className="ml-auto px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400 hover:text-emerald-300 hover:bg-slate-700 transition-colors flex items-center gap-1"
            title="导出 CSV"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            CSV
          </button>
        )}

        {!isOpen && hasResults && (
          <span className="ml-auto text-[10px] text-slate-500">
            {activeAnalysis ? `${activeAnalysis.label} · ` : ''}{results.reactions.length} 个反力 · {results.elements.length} 个单元 · {results.displacements?.length ?? 0} 个位移
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
              {activeAnalysis && (
                <div className="mb-2 rounded border border-slate-800 bg-slate-950/40 px-2 py-1 text-[10px] text-slate-400">
                  当前结果：<span className="font-semibold text-slate-200">{activeAnalysis.label}</span>
                  <span className="ml-2 text-slate-500">{activeAnalysis.type === 'combination' ? '荷载组合' : '单一工况'} · {loads.length} 条参与荷载</span>
                </div>
              )}
              {activeTab === 'controls' && <ControlsTable extrema={extrema} selectedResult={selectedResult} onSelectResult={onSelectResult} />}
              {activeTab === 'envelope' && (
                <EnvelopeTable
                  rows={envelopeRows}
                  selectedResult={selectedResult}
                  onSelectResult={onSelectResult}
                  onActivateAnalysis={onActivateAnalysis}
                />
              )}
              {activeTab === 'serviceability' && <ServiceabilityTable rows={serviceabilityRows} />}
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

/* ===== Controls Tab ===== */
const isSameSelection = (a?: ResultSelection | null, b?: ResultSelection | null) => {
  if (!a || !b) return false;
  return (
    a.kind === b.kind &&
    a.elementId === b.elementId &&
    a.nodeId === b.nodeId &&
    a.component === b.component &&
    Math.abs((a.x ?? 0) - (b.x ?? 0)) < 1e-6
  );
};

const ControlsTable: React.FC<{
  extrema: ResultExtrema;
  selectedResult?: ResultSelection | null;
  onSelectResult?: (selection: ResultSelection) => void;
}> = ({ extrema, selectedResult, onSelectResult }) => (
  <table className="w-full text-[11px]">
    <thead>
      <tr className="text-slate-400 border-b border-slate-700">
        <th className={thClassLeft}>控制项</th>
        <th className={thClassLeft}>位置</th>
        <th className={thClass}>数值</th>
        <th className={thClassLeft}>单位</th>
        <th className={thClassCenter}>定位</th>
      </tr>
    </thead>
    <tbody>
      {controlRows(extrema).map(row => {
        const selected = isSameSelection(selectedResult, row.selection);
        return (
        <tr key={row.key} className={`border-b border-slate-800/50 transition-colors ${selected ? 'bg-cyan-500/10 ring-1 ring-inset ring-cyan-500/30' : 'hover:bg-slate-800/40'}`}>
          <td className="py-1.5 px-2 font-semibold text-slate-300">{row.label}</td>
          <td className="py-1.5 px-2 font-mono text-[10px] text-slate-400">{row.location}</td>
          <td className={`py-1.5 px-2 text-right font-mono font-bold ${row.colorClass}`}>{row.value}</td>
          <td className="py-1.5 px-2 text-slate-500">{row.unit}</td>
          <td className="py-1.5 px-2 text-center">
            <button
              type="button"
              disabled={!row.selection || !onSelectResult}
              onClick={() => row.selection && onSelectResult?.(row.selection)}
              className={`rounded border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                selected
                  ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100'
                  : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-cyan-500/50 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40'
              }`}
              title="在结构图中高亮控制位置"
            >
              定位
            </button>
          </td>
        </tr>
      )})}
    </tbody>
  </table>
);

const envelopeColorClass = (key: EnvelopeRow['key']) => {
  if (key.startsWith('moment')) return 'text-blue-300';
  if (key.startsWith('shear')) return 'text-rose-300';
  if (key.startsWith('axial')) return 'text-emerald-300';
  return 'text-purple-300';
};

const formatEnvelopeValue = (row: EnvelopeRow) => {
  if (row.value === null) return '无';
  if (row.key === 'deflection-abs') return formatDisp(row.value);
  return formatForce(row.value);
};

const EnvelopeTable: React.FC<{
  rows: EnvelopeRow[];
  selectedResult?: ResultSelection | null;
  onSelectResult?: (selection: ResultSelection) => void;
  onActivateAnalysis?: (target: { type: AnalysisTargetType; id: string }) => void;
}> = ({ rows, selectedResult, onSelectResult, onActivateAnalysis }) => {
  if (rows.length === 0) {
    return <div className="text-slate-500 text-xs text-center py-4">暂无包络数据，请至少添加一个工况荷载</div>;
  }

  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="text-slate-400 border-b border-slate-700">
          <th className={thClassLeft}>包络项</th>
          <th className={thClassLeft}>控制来源</th>
          <th className={thClassLeft}>位置</th>
          <th className={thClass}>数值</th>
          <th className={thClassLeft}>单位</th>
          <th className={thClassCenter}>操作</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => {
          const selected = isSameSelection(selectedResult, row.selection);
          return (
            <tr key={row.key} className={`border-b border-slate-800/50 transition-colors ${selected ? 'bg-cyan-500/10 ring-1 ring-inset ring-cyan-500/30' : 'hover:bg-slate-800/40'}`}>
              <td className="py-1.5 px-2 font-semibold text-slate-300">{row.label}</td>
              <td className="py-1.5 px-2 text-slate-400">
                <span className="font-semibold text-slate-300">{row.sourceLabel}</span>
                {row.sourceType && (
                  <span className="ml-1 rounded bg-slate-800 px-1 py-0.5 text-[9px] text-slate-500">
                    {row.sourceType === 'combination' ? '组合' : '工况'}
                  </span>
                )}
              </td>
              <td className="py-1.5 px-2 font-mono text-[10px] text-slate-400">{row.location}</td>
              <td className={`py-1.5 px-2 text-right font-mono font-bold ${envelopeColorClass(row.key)}`}>{formatEnvelopeValue(row)}</td>
              <td className="py-1.5 px-2 text-slate-500">{row.unit}</td>
              <td className="py-1.5 px-2">
                <div className="flex justify-center gap-1">
                  <button
                    type="button"
                    disabled={!row.selection || !onSelectResult}
                    onClick={() => row.selection && onSelectResult?.(row.selection)}
                    className={`rounded border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                      selected
                        ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100'
                        : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-cyan-500/50 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40'
                    }`}
                    title="在结构图中高亮包络控制位置"
                  >
                    定位
                  </button>
                  <button
                    type="button"
                    disabled={!row.sourceType || !row.sourceId || !onActivateAnalysis}
                    onClick={() => row.sourceType && row.sourceId && onActivateAnalysis?.({ type: row.sourceType, id: row.sourceId })}
                    className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400 transition-colors hover:border-indigo-500/50 hover:text-indigo-200 disabled:cursor-not-allowed disabled:opacity-40"
                    title="切换到控制来源的计算结果"
                  >
                    查看
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

/* ===== Serviceability Tab ===== */
const ServiceabilityTable: React.FC<{ rows: ServiceabilityRow[] }> = ({ rows }) => {
  if (rows.length === 0) {
    return <div className="text-slate-500 text-xs text-center py-4">暂无挠度限值校核数据</div>;
  }

  const worst = rows.reduce((current, row) => row.utilization > current.utilization ? row : current, rows[0]);

  return (
    <div className="space-y-2">
      <div className={`rounded border px-2 py-1.5 text-[10px] font-semibold ${
        worst.passed
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
          : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
      }`}>
        控制单元 E{worst.elementId} · 利用率 {(worst.utilization * 100).toFixed(1)}% · {worst.passed ? '满足限值' : '超过限值'}
      </div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-slate-400 border-b border-slate-700">
            <th className={thClassLeft}>单元</th>
            <th className={thClass}>长度 (m)</th>
            <th className={thClass}>限值</th>
            <th className={thClass}>允许 (mm)</th>
            <th className={thClass}>计算 (mm)</th>
            <th className={thClass}>利用率</th>
            <th className={thClassCenter}>状态</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.elementId} className="border-b border-slate-800/50 hover:bg-slate-800/40 transition-colors">
              <td className="py-1.5 px-2 font-mono font-bold text-indigo-300">E{row.elementId}</td>
              <td className="py-1.5 px-2 text-right font-mono text-slate-300">{row.lengthM.toFixed(3)}</td>
              <td className="py-1.5 px-2 text-right font-mono text-slate-300">L/{row.limitRatio}</td>
              <td className="py-1.5 px-2 text-right font-mono text-slate-300">{row.limitMm.toFixed(3)}</td>
              <td className="py-1.5 px-2 text-right font-mono text-purple-300">{row.deflectionMm.toFixed(3)}</td>
              <td className={`py-1.5 px-2 text-right font-mono font-bold ${row.passed ? 'text-emerald-300' : 'text-amber-300'}`}>
                {(row.utilization * 100).toFixed(1)}%
              </td>
              <td className="py-1.5 px-2 text-center">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  row.passed ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'
                }`}>
                  {row.passed ? '通过' : '超限'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

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
  const check = useMemo(
    () => computeEquilibriumResidual(results, nodes, loads, elements),
    [results, nodes, loads, elements],
  );

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
