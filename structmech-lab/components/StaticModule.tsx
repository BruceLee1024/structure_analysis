import React, { useState, useMemo, useEffect } from 'react';
import { Slider } from './Slider';
import {
  StructuralDefs,
  PinSupport,
  RollerSupport,
  FixedSupport,
  PointLoadV,
  PointLoadH,
  DistributedLoadV,
  StructuralNode,
} from './ui/StructuralSvg';
import AITutor from './AITutor';
import ResultCard from './ui/ResultCard';
import SolutionSteps from './ui/SolutionSteps';
import CollapsiblePanel from './ui/CollapsiblePanel';
import AIBubble from './ui/AIBubble';
import LearningMilestone from './ui/LearningMilestone';
import ProgressBar from './ui/ProgressBar';
import { GeometryScgCompactViewer } from './ui/GeometryScg';
import { useAIEngine } from '../hooks/useAIEngine';
import { getBeamHints, getFrameHints, getTrussHints, getArchHints, getCompositeHints, type ResultHint } from '../utils/resultHints';
import {
  cloneGeometryCounts,
  defaultGeometryCounts,
  evaluateGeometrySystem,
  geometryPresets,
  type GeometryCounts,
  type GeometryPreset,
  type GeometryPresetId,
} from '../utils/geometryAnalysis';
import { geometryScgFigureMap, geometryScgFigures } from '../data/geometryScgScenes';

const findHint = (hints: ResultHint[], label: string) => hints.find(h => h.label === label)?.hint;

// 内力图组件
interface DiagramProps {
  data: { x: number; y: number }[];
  maxValue: number;
  label: string;
  color: string;
}

const InternalForceDiagram: React.FC<DiagramProps> = ({ data, maxValue, label, color }) => {
  const width = 260, height = 110;
  const MARGIN = { left: 35, right: 20, top: 25, bottom: 25 };
  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = height - MARGIN.top - MARGIN.bottom;
  const baseY = MARGIN.top + plotH / 2;
  const scale = maxValue > 0 ? (plotH / 2 - 8) / maxValue : 1;

  const pathData = data.map((p, i) => {
    const x = MARGIN.left + (p.x * plotW);
    const y = baseY - p.y * scale;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  const areaPath = `M ${MARGIN.left} ${baseY} ${pathData.replace('M', 'L')} L ${MARGIN.left + plotW} ${baseY} Z`;

  // 找出所有需要标注的关键点
  const keyPoints: { x: number; y: number; isMax?: boolean }[] = [];
  
  // 找最大值点
  const maxPoint = data.reduce((max, p) => Math.abs(p.y) > Math.abs(max.y) ? p : max, data[0]);
  
  // 添加起点
  if (Math.abs(data[0].y) > 0.01) {
    keyPoints.push({ ...data[0], isMax: data[0] === maxPoint });
  }
  
  // 添加终点（如果和起点不同位置）
  const lastPoint = data[data.length - 1];
  if (Math.abs(lastPoint.y) > 0.01 && Math.abs(lastPoint.x - data[0].x) > 0.05) {
    keyPoints.push({ ...lastPoint, isMax: lastPoint === maxPoint });
  }
  
  // 添加最大值点（如果不是起点或终点）
  if (Math.abs(maxPoint.y) > 0.01) {
    const isStartOrEnd = Math.abs(maxPoint.x - data[0].x) < 0.05 || Math.abs(maxPoint.x - lastPoint.x) < 0.05;
    if (!isStartOrEnd) {
      keyPoints.push({ ...maxPoint, isMax: true });
    }
  }
  
  // 添加中间的转折点（值变化较大的点）
  for (let i = 1; i < data.length - 1; i++) {
    const prev = data[i - 1];
    const curr = data[i];
    const next = data[i + 1];
    // 如果是转折点（斜率变化）且值不为0
    const slope1 = (curr.y - prev.y) / (curr.x - prev.x + 0.001);
    const slope2 = (next.y - curr.y) / (next.x - curr.x + 0.001);
    if (Math.abs(slope1 - slope2) > 5 && Math.abs(curr.y) > 0.5) {
      // 检查是否已经添加过
      const exists = keyPoints.some(p => Math.abs(p.x - curr.x) < 0.05);
      if (!exists) {
        keyPoints.push(curr);   
      }
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 flex-1 shadow-sm min-w-0">
      <div className="text-xs font-semibold text-slate-700 mb-2">{label}</div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="bg-gradient-to-b from-slate-50 to-white rounded-lg" preserveAspectRatio="xMidYMid meet">
        <StructuralDefs id="ifd" />
        {/* 基准线 */}
        <line x1={MARGIN.left} y1={baseY} x2={MARGIN.left + plotW} y2={baseY} stroke="#cbd5e1" strokeWidth="0.9" strokeDasharray="3 3" strokeLinecap="round" />
        {/* 填充区域 */}
        <path d={areaPath} fill={color} fillOpacity="0.14" filter="url(#ifd-soft)" />
        {/* 曲线 */}
        <path d={pathData} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" filter="url(#ifd-soft)" />
        {/* 关键点标注 */}
        {keyPoints.map((p, i) => {
          const cx = MARGIN.left + p.x * plotW;
          const cy = baseY - p.y * scale;
          const textY = p.y > 0 ? cy - 12 : cy + 16;
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r={p.isMax ? 5 : 4} fill="white" stroke={color} strokeWidth="2" filter="url(#ifd-shadow)" />
              <circle cx={cx} cy={cy} r="1.4" fill={color} />
              <text x={cx} y={textY} className="fill-slate-800 font-bold" textAnchor="middle" style={{ fontSize: 11 }} stroke="white" strokeWidth="2" paintOrder="stroke">
                {p.y.toFixed(1)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// 公式卡片
const FormulaCard: React.FC<{ title: string; formula: string; desc?: string }> = ({ title, formula, desc }) => (
  <div className="bg-gradient-to-br from-slate-50 to-white rounded-xl p-4 border border-slate-200 flex-1 shadow-sm">
    <div className="text-xs font-semibold text-slate-500 mb-2">{title}</div>
    <div className="text-base font-serif text-slate-800 text-center py-1">{formula}</div>
    {desc && <div className="text-xs text-slate-500 mt-2 text-center">{desc}</div>}
  </div>
);


// ==================== 几何组成分析 ====================
const toneCardClass: Record<'red' | 'green' | 'blue', string> = {
  red: 'bg-gradient-to-br from-red-50 to-red-100/60 border-red-200 text-red-700',
  green: 'bg-gradient-to-br from-green-50 to-green-100/60 border-green-200 text-green-700',
  blue: 'bg-gradient-to-br from-blue-50 to-blue-100/60 border-blue-200 text-blue-700',
};

const toneTextClass: Record<'red' | 'green' | 'blue', string> = {
  red: 'text-red-600',
  green: 'text-green-600',
  blue: 'text-blue-600',
};

const toneResultCardColor: Record<'red' | 'green' | 'blue', 'red' | 'green' | 'blue'> = {
  red: 'red',
  green: 'green',
  blue: 'blue',
};

const memberStroke = {
  stroke: 'url(#geo-member)',
  strokeWidth: 3.2,
  strokeLinecap: 'round' as const,
  filter: 'url(#geo-shadow)',
};

const GeometryPreview: React.FC<{ preset: GeometryPreset }> = ({ preset }) => {
  const figure = preset.figureType;

  return (
    <svg width="100%" viewBox="0 0 220 120" className="block h-auto w-full" preserveAspectRatio="xMidYMid meet">
      <StructuralDefs id="geo" />
      <defs>
        <linearGradient id="geo-surface" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#eef4ff" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="212" height="112" rx="18" fill="url(#geo-surface)" stroke="#dbe5f4" strokeWidth="1.2" />
      <path d="M 20 92 H 200" stroke="#d9e2f2" strokeWidth="1" strokeDasharray="3 5" />

      {figure === 'custom' && (
        <>
          <rect x="28" y="20" width="164" height="70" rx="14" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="6 4" />
          <text x="110" y="48" textAnchor="middle" className="fill-slate-700 font-semibold" style={{ fontSize: 14 }}>
            自定义计数模式
          </text>
          <text x="110" y="68" textAnchor="middle" className="fill-slate-500" style={{ fontSize: 10 }}>
            没有模型图时，只能做 W 值预判
          </text>
          <text x="110" y="84" textAnchor="middle" className="fill-slate-400" style={{ fontSize: 10 }}>
            不能直接下静定 / 超静定结论
          </text>
        </>
      )}

      {figure === 'simple_beam' && (
        <>
          <PinSupport cx={38} cy={62} size={8} defsId="geo" />
          <RollerSupport cx={182} cy={66.4} size={8} defsId="geo" />
          <line x1="38" y1="62" x2="182" y2="62" stroke="#1e293b" strokeWidth="4" strokeLinecap="round" filter="url(#geo-shadow)" />
          <circle cx={38} cy={62} r="2.2" fill="#1e293b" />
          <circle cx={182} cy={62} r="2.2" fill="#1e293b" />
        </>
      )}

      {figure === 'cantilever' && (
        <>
          <FixedSupport cx={36} cy={60} size={12} defsId="geo" orientation="left" />
          <line x1="36" y1="60" x2="184" y2="60" {...memberStroke} />
        </>
      )}

      {figure === 'portal_frame' && (
        <>
          <line x1="50" y1="88" x2="50" y2="32" {...memberStroke} />
          <line x1="50" y1="32" x2="170" y2="32" {...memberStroke} />
          <line x1="170" y1="32" x2="170" y2="88" {...memberStroke} />
          <PinSupport cx={50} cy={88} size={8} defsId="geo" />
          <RollerSupport cx={170} cy={88} size={8} defsId="geo" />
          <StructuralNode cx={50} cy={32} r={2.8} />
          <StructuralNode cx={170} cy={32} r={2.8} />
          <text x="50" y="24" textAnchor="middle" className="fill-slate-500" style={{ fontSize: 9 }}>
            刚结
          </text>
          <text x="170" y="24" textAnchor="middle" className="fill-slate-500" style={{ fontSize: 9 }}>
            刚结
          </text>
        </>
      )}

      {figure === 'fixed_fixed_beam' && (
        <>
          <FixedSupport cx={36} cy={60} size={12} defsId="geo" orientation="left" />
          <FixedSupport cx={184} cy={60} size={12} defsId="geo" orientation="right" />
          <line x1="36" y1="60" x2="184" y2="60" {...memberStroke} />
        </>
      )}

      {figure === 'parallel_link_mechanism' && (
        <>
          <rect x="48" y="22" width="124" height="10" rx="5" fill="#334155" opacity="0.92" />
          {[68, 96, 124, 152].map((x) => (
            <g key={x}>
              <line x1={x} y1="32" x2={x} y2="86" stroke="#64748b" strokeWidth="2.4" strokeLinecap="round" />
              <circle cx={x} cy={32} r="2.2" fill="#fff" stroke="#334155" strokeWidth="1.2" />
              <circle cx={x} cy={86} r="2.2" fill="#fff" stroke="#334155" strokeWidth="1.2" />
            </g>
          ))}
          <line x1="42" y1="88" x2="178" y2="88" stroke="#475569" strokeWidth="1.2" strokeLinecap="round" />
          <rect x="42" y="88" width="136" height="10" fill="url(#geo-ground)" />
          <line x1="178" y1="27" x2="204" y2="27" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" markerEnd="url(#geo-arrow-red)" />
          <text x="198" y="18" textAnchor="middle" className="fill-red-600 font-bold" style={{ fontSize: 9 }}>
            可水平移动
          </text>
          <text x="110" y="109" textAnchor="middle" className="fill-slate-500" style={{ fontSize: 9 }}>
            四根链杆平行，约束方向重复
          </text>
        </>
      )}
    </svg>
  );
};

const countBadgeMeta: Array<{ key: keyof GeometryCounts; label: string }> = [
  { key: 'rigidBodies', label: '刚片' },
  { key: 'chainLinks', label: '链杆' },
  { key: 'simpleHinges', label: '单铰' },
  { key: 'rigidJoints', label: '刚结' },
  { key: 'rollerSupports', label: '活动铰' },
  { key: 'pinSupports', label: '固定铰' },
  { key: 'guidedSupports', label: '定向支座' },
  { key: 'fixedSupports', label: '固定端' },
];

const GeometryAnalysis: React.FC = () => {
  const [presetId, setPresetId] = useState<GeometryPresetId>('simple_beam');
  const [counts, setCounts] = useState<GeometryCounts>(() => cloneGeometryCounts(defaultGeometryCounts));
  const [previewMode, setPreviewMode] = useState<'textbook' | 'model'>('textbook');
  const [selectedTextbookFigureId, setSelectedTextbookFigureId] = useState('2-9');
  const { bubble, sync, ctx, milestone, dismissMilestone } = useAIEngine({ module: 'static', subModule: 'geometry' });
  const preset = useMemo(
    () => geometryPresets.find((item) => item.id === presetId) ?? geometryPresets[0],
    [presetId],
  );
  const selectedTextbookFigure = useMemo(
    () => geometryScgFigureMap[selectedTextbookFigureId] ?? geometryScgFigures[0],
    [selectedTextbookFigureId],
  );
  const evaluation = useMemo(
    () => evaluateGeometrySystem(counts, preset.modelHint),
    [counts, preset.modelHint],
  );
  const previewBadges = useMemo(() => {
    const badges: Array<{ key: string; label: string; value: number }> = countBadgeMeta
      .filter(({ key }) => counts[key] > 0)
      .map(({ key, label }) => ({
        key,
        label,
        value: counts[key],
      }));

    badges.push({ key: 'w', label: 'W', value: evaluation.W });
    return badges;
  }, [counts, evaluation.W]);

  const setCount = (key: keyof GeometryCounts, value: number) => {
    setCounts((prev) => ({ ...prev, [key]: value }));
    setPresetId('custom');
  };

  const handlePreset = (id: GeometryPresetId) => {
    setPresetId(id);
    const matched = geometryPresets.find((item) => item.id === id);
    if (matched && id !== 'custom') {
      setCounts(cloneGeometryCounts(matched.counts));
    }
  };

  // Sync AI context
  useEffect(() => {
    sync(
      {
        preset: presetId,
        rigidBodies: counts.rigidBodies,
        chainLinks: counts.chainLinks,
        simpleHinges: counts.simpleHinges,
        rigidJoints: counts.rigidJoints,
        rollerSupports: counts.rollerSupports,
        pinSupports: counts.pinSupports,
        guidedSupports: counts.guidedSupports,
        fixedSupports: counts.fixedSupports,
        nodes: counts.rigidBodies,
        bars: counts.simpleHinges,
        constraints: evaluation.totalConstraints,
        hasModelPreview: presetId !== 'custom',
        previewMode,
        selectedTextbookFigure: selectedTextbookFigure.id,
      },
      {
        W: evaluation.W,
        totalDOF: evaluation.totalDOF,
        totalConstraints: evaluation.totalConstraints,
        status: evaluation.quickTitle,
        modelStatus: evaluation.modelTitle,
        previewModeLabel: previewMode === 'textbook' ? '概念图' : '当前模型',
        textbookFigureTitle: selectedTextbookFigure.title,
      },
    );
  }, [counts, presetId, evaluation.W, evaluation.totalDOF, evaluation.totalConstraints, evaluation.quickTitle, evaluation.modelTitle, previewMode, selectedTextbookFigure.id, selectedTextbookFigure.title, sync]);
  const context = ctx.toPromptString();

  const solveSteps = useMemo(() => [
    {
      title: '确定刚片自由度',
      equation: `3m = 3 × ${counts.rigidBodies} = ${evaluation.totalDOF}`,
      explanation: '本页约定 m 为刚片数（不含基础），每个刚片在平面内有 3 个自由度。',
    },
    {
      title: '折算各类约束',
      equation: `Σc = ${evaluation.weightedFormula} = ${evaluation.totalConstraints}`,
      explanation: '链杆/活动铰按 1 计，单铰/固定铰/定向支座按 2 计，刚结点/固定端按 3 计；复铰与复刚结应按 n-1 折算后计入。',
    },
    {
      title: '代入计算自由度',
      equation: `W = 3m - Σc = ${evaluation.totalDOF} - ${evaluation.totalConstraints}`,
      result: `${evaluation.W}`,
      explanation: '这里的 W 是计算自由度，不等于最终的结构结论。',
    },
    {
      title: '先做 W 值预判',
      result: evaluation.quickTitle,
      explanation: evaluation.quickSummary,
    },
    {
      title: '再结合模型图判断',
      result: evaluation.modelTitle,
      explanation: preset.modelConclusion,
    },
  ], [counts.rigidBodies, evaluation.totalDOF, evaluation.totalConstraints, evaluation.weightedFormula, evaluation.W, evaluation.quickTitle, evaluation.quickSummary, evaluation.modelTitle, preset.modelConclusion]);

  return (
    <div className="flex flex-col lg:flex-row gap-3 min-h-full p-3">
      <CollapsiblePanel title="参数" icon="🔧" side="left" storageKey="param-panel-geometry">
        <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-sm overflow-y-auto">
          <h4 className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">🔧 参数设置</h4>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {geometryPresets.map((item) => (
              <button
                key={item.id}
                onClick={() => handlePreset(item.id)}
                className={`px-2 py-1 text-[10px] font-medium rounded-lg transition-all ${presetId === item.id ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {item.name}
              </button>
            ))}
          </div>
          <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
            <div className="text-[11px] font-semibold text-slate-700 mb-1">当前示例</div>
            <div className="text-[11px] leading-relaxed text-slate-500">{preset.summary}</div>
          </div>
          <Slider label="刚片数 m" value={counts.rigidBodies} min={1} max={6} unit="" onChange={(v) => setCount('rigidBodies', v)} />
          <Slider label="链杆数" value={counts.chainLinks} min={0} max={8} unit="" onChange={(v) => setCount('chainLinks', v)} />
          <Slider label="单铰数" value={counts.simpleHinges} min={0} max={8} unit="" onChange={(v) => setCount('simpleHinges', v)} />
          <Slider label="刚结点数" value={counts.rigidJoints} min={0} max={8} unit="" onChange={(v) => setCount('rigidJoints', v)} />
          <Slider label="活动铰支座" value={counts.rollerSupports} min={0} max={4} unit="" onChange={(v) => setCount('rollerSupports', v)} />
          <Slider label="固定铰支座" value={counts.pinSupports} min={0} max={4} unit="" onChange={(v) => setCount('pinSupports', v)} />
          <Slider label="定向支座" value={counts.guidedSupports} min={0} max={4} unit="" onChange={(v) => setCount('guidedSupports', v)} />
          <Slider label="固定端" value={counts.fixedSupports} min={0} max={4} unit="" onChange={(v) => setCount('fixedSupports', v)} />
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
            复铰与复刚结请先按本页规则折算成等效的单铰/单刚结后再输入。没有模型图时，本页只做 W 值预判。
          </div>
        </div>
      </CollapsiblePanel>
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {milestone && <LearningMilestone milestone={milestone} onDismiss={dismissMilestone} />}
        <ProgressBar currentModule="几何组成" />
        <AIBubble message={bubble} />
        <div className="grid grid-cols-1 items-start xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-3">
          <div className="self-start bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h4 className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">🖼 模型 / 概念示意</h4>
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                {preset.name}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {[
                { id: 'textbook', label: '概念图' },
                { id: 'model', label: '当前模型' },
              ].map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => setPreviewMode(mode.id as 'textbook' | 'model')}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all ${
                    previewMode === mode.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {previewMode === 'model' ? (
              <>
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-3">
                  <GeometryPreview preset={preset} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {previewBadges.map((badge) => (
                    <div
                      key={badge.key}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        badge.label === 'W'
                          ? evaluation.quickBadgeTone === 'red'
                            ? 'bg-red-50 text-red-600'
                            : evaluation.quickBadgeTone === 'green'
                              ? 'bg-green-50 text-green-600'
                              : 'bg-blue-50 text-blue-600'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <span>{badge.label}</span>
                      <span>{badge.value}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">示意说明</div>
                  <div className="mt-1 text-xs leading-relaxed text-slate-600">{preset.summary}</div>
                </div>
              </>
            ) : (
              <GeometryScgCompactViewer
                figures={geometryScgFigures}
                selectedFigureId={selectedTextbookFigure.id}
                onSelectFigure={setSelectedTextbookFigureId}
              />
            )}
          </div>

          <div className="self-start bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex flex-col gap-3">
            <h4 className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">📐 公式说明</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FormulaCard
                title="计算自由度"
                formula="W = 3m - Σc"
                desc="m 为刚片数；Σc 为各类约束折算值之和"
              />
              <FormulaCard
                title="约束折算"
                formula="链杆/活动铰=1，单铰/固定铰=2，刚结/固定端=3"
                desc="定向支座按 2 计；复铰、复刚结需按 n-1 折算"
              />
            </div>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
              <ResultCard label="3m" value={evaluation.totalDOF.toString()} unit="" color="purple" aiHint="刚片总自由度" />
              <ResultCard label="Σc" value={evaluation.totalConstraints.toString()} unit="" color="blue" aiHint={`约束折算：${evaluation.weightedFormula}`} />
              <ResultCard label="W" value={evaluation.W.toString()} unit="" color={toneResultCardColor[evaluation.quickBadgeTone]} aiHint={evaluation.quickSummary} />
              <ResultCard label="模型判定" value={evaluation.modelTitle} unit="" color={toneResultCardColor[evaluation.modelBadgeTone]} aiHint={evaluation.modelSummary} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm">
          <h4 className="text-xs font-semibold text-slate-600 mb-3 flex items-center gap-1.5">📊 结论分层</h4>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className={`rounded-xl border p-4 ${toneCardClass[evaluation.quickBadgeTone]}`}>
              <div className="text-[11px] font-semibold opacity-70 mb-1">只根据 W 值</div>
              <div className={`text-lg font-bold ${toneTextClass[evaluation.quickBadgeTone]}`}>{evaluation.quickTitle}</div>
              <div className="mt-2 text-sm leading-relaxed text-slate-700">{evaluation.quickSummary}</div>
            </div>
            <div className={`rounded-xl border p-4 ${toneCardClass[evaluation.modelBadgeTone]}`}>
              <div className="text-[11px] font-semibold opacity-70 mb-1">结合当前模型图</div>
              <div className={`text-lg font-bold ${toneTextClass[evaluation.modelBadgeTone]}`}>{evaluation.modelTitle}</div>
              <div className="mt-2 text-sm leading-relaxed text-slate-700">{preset.modelConclusion}</div>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
            <strong>⚠ 规则提醒：</strong>{evaluation.caution}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_19rem] gap-3 lg:gap-4 items-start">
          <div className="flex-1">
            <SolutionSteps steps={solveSteps} title="求解过程" />
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/70 p-4 lg:p-5 shadow-sm w-full h-fit">
            <h4 className="text-xs font-semibold text-slate-600 mb-3">📖 约束折算速查</h4>
            <div className="space-y-2">
              {evaluation.contributions.map((item) => (
                <div key={item.key} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-700">{item.label}</span>
                    <span className="text-sm font-bold text-blue-600">{item.weight} × {item.count} = {item.value}</span>
                  </div>
                  <div className="mt-1 text-[11px] leading-relaxed text-slate-500">{item.note}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
              如果是复铰或复刚结：先按 <strong>n-1</strong> 个单铰或单刚结折算，再计入上面的数量。
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm">
          <h4 className="text-xs font-semibold text-slate-600 mb-3 flex items-center gap-1.5">🧭 使用建议</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              {
                title: 'W > 0',
                desc: '可以直接判为几何可变体系，说明必要约束不足。',
              },
              {
                title: 'W = 0',
                desc: '只能说明满足必要条件；还要检查链杆是否平行、共点，以及虚铰是否共线。',
              },
              {
                title: 'W < 0',
                desc: '先判断模型图是否几何不变。若已知几何不变，才可进一步说“有多余约束、属于超静定”。',
              },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-sm font-bold text-slate-800">{item.title}</div>
                <div className="mt-1 text-xs leading-relaxed text-slate-500">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <CollapsiblePanel title="AI助手" icon="🤖" side="right" storageKey="ai-panel-geometry">
        <AITutor context={context} moduleTitle="几何组成分析"
          suggestedQuestions={['W<0 为什么也不能直接判超静定？', '复铰应该怎么折算？', '为什么四根平行链杆还是可变体系？']} />
      </CollapsiblePanel>
    </div>
  );
};

// ==================== 静定梁 ====================
const StaticBeam: React.FC = () => {
  const [beamType, setBeamType] = useState<'simple' | 'cantilever' | 'overhanging'>('simple');
  const [loadType, setLoadType] = useState<'point' | 'distributed'>('point');
  const [L, setL] = useState(8);
  const [P, setP] = useState(20);
  const [q, setQ] = useState(10);
  const [a, setA] = useState(50);
  const [overhang, setOverhang] = useState(2);
  const { bubble, sync, ctx, milestone, dismissMilestone } = useAIEngine({ module: 'static', subModule: 'beam' });
  
  // Clamp overhang when L shrinks
  const safeOverhang = Math.min(overhang, Math.max(1, Math.floor(L / 2)));
  
  let RA = 0, RB = 0, Mmax = 0, Vmax = 0;
  
  const loadPos = (a / 100) * L;
  const bLen = L - loadPos;
  
  if (beamType === 'overhanging') {
    const totalL = L + safeOverhang;
    if (loadType === 'point') {
      const pPos = (a / 100) * totalL;
      RB = (P * pPos) / L;
      RA = P - RB;
      if (pPos <= L) {
        Mmax = RA * pPos;
      } else {
        Mmax = Math.max(Math.abs(P * (pPos - L)), Math.abs(RB * L));
      }
      Vmax = Math.max(Math.abs(RA), Math.abs(RB));
    } else {
      // 修正: 原代码 RA/RB 反力标签互换。ΣMA=0 ⇒ RB·L = q·totalL²/2
      RB = (q * totalL * totalL) / (2 * L);
      RA = q * totalL - RB;
      const x0 = RA / q; // 主跨内剪力过零点 (从A量起)
      const Mspan = RA * x0 - q * x0 * x0 / 2;       // 跨内正弯矩极值
      const Moverhang = q * safeOverhang * safeOverhang / 2; // 悬臂段B处负弯矩
      Mmax = Math.max(Math.abs(Mspan), Math.abs(Moverhang));
      Vmax = Math.max(Math.abs(RA), Math.abs(RB));
    }
  } else if (loadType === 'point') {
    if (beamType === 'simple') {
      RB = (P * loadPos) / L;
      RA = P - RB;
      Mmax = (P * loadPos * bLen) / L;
      Vmax = Math.max(RA, RB);
    } else {
      RA = P; Mmax = P * loadPos; Vmax = P;
    }
  } else {
    if (beamType === 'simple') {
      RA = RB = (q * L) / 2;
      Mmax = (q * L * L) / 8;
      Vmax = RA;
    } else {
      RA = q * L;
      Mmax = (q * L * L) / 2;
      Vmax = RA;
    }
  }
  
  const mScale = 35 / (Mmax || 1);
  const vScale = 30 / (Vmax || 1);

  const beamLabel = beamType === 'simple' ? '简支梁' : beamType === 'cantilever' ? '悬臂梁' : '外伸梁';
  useEffect(() => {
    sync(
      { beamType, loadType, L, P, q, a },
      { RA, RB, Mmax, Vmax },
    );
  }, [beamType, loadType, L, P, q, a, RA, RB, Mmax, Vmax, sync]);
  const context = ctx.toPromptString();

  const beamHints = useMemo(() => getBeamHints({ beamType, loadType, L, P, q, RA, RB, Mmax, Vmax }), [beamType, loadType, L, P, q, RA, RB, Mmax, Vmax]);

  const solveSteps = useMemo(() => {
    const steps: { title: string; equation?: string; result?: string; explanation?: string; aiWhy?: string }[] = [];
    if (beamType === 'simple' && loadType === 'point') {
      const aPos = loadPos, bPos = bLen;
      steps.push({ title: '取整体平衡 ΣMA=0', equation: `RB×${L} = P×a = ${P}×${aPos.toFixed(1)}`, result: `RB = ${RB.toFixed(2)} kN`, aiWhy: '对A点取矩可以消去RA，只剩RB一个未知数，一个方程就能求解。这是求解静定结构的标准策略。' });
      steps.push({ title: 'ΣFy=0', equation: `RA + RB = P`, result: `RA = ${RA.toFixed(2)} kN`, aiWhy: '竖向平衡条件：所有竖向力之和为零。已知P和RB，直接求出RA。' });
      steps.push({ title: '求最大弯矩', equation: `Mmax = P·a·b/L = ${P}×${aPos.toFixed(1)}×${bPos.toFixed(1)}/${L}`, result: `${Mmax.toFixed(2)} kN·m`, explanation: '在集中力作用点处', aiWhy: '集中力作用点处弯矩图有尖角（斜率突变），所以最大弯矩一定在这里。当a=b=L/2时Mmax=PL/4为最大。' });
    } else if (beamType === 'simple' && loadType === 'distributed') {
      steps.push({ title: '对称性 → RA=RB', equation: `RA = RB = qL/2 = ${q}×${L}/2`, result: `${RA.toFixed(2)} kN`, aiWhy: '均布荷载对称且结构对称，所以两个支座反力相等，各承担一半。' });
      steps.push({ title: '求跨中最大弯矩', equation: `Mmax = qL²/8 = ${q}×${L}²/8`, result: `${Mmax.toFixed(2)} kN·m`, explanation: '抛物线分布，最大值在跨中', aiWhy: '均布荷载下弯矩图为抛物线，跨中剪力为零，正是弯矩的极值点。qL²/8是结构工程中最常见的公式之一。' });
    } else if (beamType === 'cantilever' && loadType === 'point') {
      steps.push({ title: 'ΣFy=0', equation: `RA = P`, result: `${RA.toFixed(2)} kN`, aiWhy: '悬臂梁只有一个固定端，所有竖向力必须由固定端承受。' });
      steps.push({ title: '固定端弯矩', equation: `M = P×a = ${P}×${loadPos.toFixed(1)}`, result: `${Mmax.toFixed(2)} kN·m`, explanation: '弯矩在固定端最大', aiWhy: '固定端弯矩=力×力臂，荷载越远离固定端，弯矩越大。这就是悬臂梁跨度通常较短的原因。' });
    } else if (beamType === 'cantilever' && loadType === 'distributed') {
      steps.push({ title: 'ΣFy=0', equation: `RA = qL = ${q}×${L}`, result: `${RA.toFixed(2)} kN` });
      steps.push({ title: '固定端弯矩', equation: `M = qL²/2 = ${q}×${L}²/2`, result: `${Mmax.toFixed(2)} kN·m`, aiWhy: '均布荷载下悬臂梁固定端弯矩 = qL²/2，比简支梁的 qL²/8 大四倍！这就是为什么悬臂梁不适合大跨度。' });
    } else if (beamType === 'overhanging') {
      steps.push({ title: 'ΣMA=0 求RB', result: `RB = ${RB.toFixed(2)} kN` });
      steps.push({ title: 'ΣFy=0 求RA', result: `RA = ${RA.toFixed(2)} kN` });
      steps.push({ title: '最大弯矩', result: `Mmax = ${Mmax.toFixed(2)} kN·m`, explanation: '注意悬臂端负弯矩', aiWhy: '外伸梁在支座B处可能出现负弯矩，悬臂段的荷载会“翻转”弯矩方向。' });
    }
    steps.push({ title: '最大剪力', result: `Vmax = ${Vmax.toFixed(2)} kN` });
    return steps;
  }, [beamType, loadType, L, P, q, a, RA, RB, Mmax, Vmax, loadPos, bLen, safeOverhang]);

  // 梁基础结构组件
  const BeamBase = ({ showLoad = true }: { showLoad?: boolean }) => {
    const beamEnd = beamType === 'overhanging' ? 230 : 210;
    const supportB = beamType === 'overhanging' ? 170 : 210;
    const loadX = 30 + (a / 100) * (beamEnd - 30);
    return (
    <>
      <StructuralDefs id="sd" />
      {/* 梁体: 渐变矩形 + 圆角 */}
      <rect x="30" y="57.5" width={beamEnd - 30} height="5" rx="1" fill="url(#sd-member)" stroke="#0f172a" strokeWidth="0.4" filter="url(#sd-shadow)" />
      {/* 支座 */}
      {beamType === 'cantilever' ? (
        <FixedSupport cx={30} cy={60} size={12} defsId="sd" orientation="left" />
      ) : (
        <>
          <PinSupport cx={30} cy={62.5} size={7} defsId="sd" />
          <RollerSupport cx={supportB} cy={62.5} size={7} defsId="sd" />
        </>
      )}
      {/* 荷载 */}
      {showLoad && loadType === 'point' && (
        <PointLoadV x={loadX} yTop={22} yBase={55} label={`P=${P}kN`} defsId="sd" />
      )}
      {showLoad && loadType === 'distributed' && (
        <DistributedLoadV x1={32} x2={beamEnd - 2} yTop={30} yBase={55} count={10} label={`q=${q} kN/m`} defsId="sd" />
      )}
      {/* 跨度标注 */}
      <text x={(30 + beamEnd) / 2} y="95" className="fill-slate-500 font-medium" textAnchor="middle" style={{ fontSize: 9 }}>
        L={L}m{beamType === 'overhanging' ? ` + ${safeOverhang}m悬臂` : ''}
      </text>
    </>
    );
  };

  // 弯矩图路径
  const getMomentPath = () => {
    const baseY = 60;
    if (beamType === 'overhanging') {
      const totalL = L + safeOverhang;
      let path = `M 30,${baseY}`;
      for (let i = 0; i <= 30; i++) {
        const xi = i / 30;
        const x = 30 + xi * 200;
        const xPos = xi * totalL;
        let m = 0;
        if (loadType === 'distributed') {
          m = RA * xPos - q * xPos * xPos / 2;
        } else {
          const pPos = (a / 100) * totalL;
          m = xPos <= pPos ? RA * xPos : RA * xPos - P * (xPos - pPos);
        }
        path += ` L ${x},${baseY + m * mScale}`;
      }
      path += ` L 230,${baseY} Z`;
      return path;
    }
    if (loadType === 'point') {
      const loadX = 30 + (a / 100) * 180;
      if (beamType === 'simple') {
        return `M 30,${baseY} L ${loadX},${baseY + Mmax * mScale} L 210,${baseY} Z`;
      } else {
        return `M 30,${baseY - Mmax * mScale} L ${loadX},${baseY} L 210,${baseY} L 30,${baseY} Z`;
      }
    } else {
      let path = `M 30,${baseY}`;
      for (let i = 0; i <= 20; i++) {
        const xi = i / 20;
        const x = 30 + xi * 180;
        if (beamType === 'simple') {
          const m = (q * L * xi / 2) * (L - L * xi);
          path += ` L ${x},${baseY + m * mScale}`;
        } else {
          const xPos = xi * L;
          const m = (q * (L - xPos) * (L - xPos)) / 2;
          path += ` L ${x},${baseY - m * mScale}`;
        }
      }
      path += ` L 210,${baseY} Z`;
      return path;
    }
  };

  // 剪力图路径
  const getShearPath = () => {
    const baseY = 60;
    if (beamType === 'overhanging') {
      const totalL = L + safeOverhang;
      let path = `M 30,${baseY}`;
      for (let i = 0; i <= 30; i++) {
        const xi = i / 30;
        const x = 30 + xi * 200;
        const xPos = xi * totalL;
        let v = 0;
        if (loadType === 'distributed') {
          v = RA - q * xPos;
        } else {
          const pPos = (a / 100) * totalL;
          v = xPos < pPos ? RA : RA - P;
        }
        path += ` L ${x},${baseY - v * vScale}`;
      }
      path += ` L 230,${baseY} Z`;
      return path;
    }
    if (loadType === 'point') {
      const loadX = 30 + (a / 100) * 180;
      if (beamType === 'simple') {
        return `M 30,${baseY} L 30,${baseY - RA * vScale} L ${loadX},${baseY - RA * vScale} L ${loadX},${baseY + RB * vScale} L 210,${baseY + RB * vScale} L 210,${baseY} Z`;
      } else {
        return `M 30,${baseY} L 30,${baseY + P * vScale} L ${loadX},${baseY + P * vScale} L ${loadX},${baseY} L 210,${baseY} Z`;
      }
    } else {
      if (beamType === 'simple') {
        return `M 30,${baseY} L 30,${baseY - RA * vScale} L 210,${baseY + RA * vScale} L 210,${baseY} Z`;
      } else {
        return `M 30,${baseY} L 30,${baseY + RA * vScale} L 210,${baseY} Z`;
      }
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-3 min-h-full p-3">
      <CollapsiblePanel title="参数" icon="🔧" side="left" storageKey="param-panel-beam">
        <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-sm overflow-y-auto">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">🔧 参数设置</h4>
          <div className="flex gap-1.5 mb-2">
            {(['simple', 'cantilever', 'overhanging'] as const).map(t => (
              <button key={t} onClick={() => setBeamType(t)}
                className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${beamType === t ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 hover:bg-slate-200'}`}>
                {t === 'simple' ? '简支梁' : t === 'cantilever' ? '悬臂梁' : '外伸梁'}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mb-4">
            <button onClick={() => setLoadType('point')}
              className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${loadType === 'point' ? 'bg-green-600 text-white shadow-md' : 'bg-slate-100 hover:bg-slate-200'}`}>集中力</button>
            <button onClick={() => setLoadType('distributed')}
              className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${loadType === 'distributed' ? 'bg-green-600 text-white shadow-md' : 'bg-slate-100 hover:bg-slate-200'}`}>均布荷载</button>
          </div>
          <Slider label="跨度 L" value={L} min={4} max={15} unit="m" onChange={setL} />
          {beamType === 'overhanging' && (
            <Slider label="悬臂长度" value={safeOverhang} min={1} max={Math.floor(L / 2)} unit="m" onChange={setOverhang} />
          )}
          {loadType === 'point' ? (
            <>
              <Slider label="集中力 P" value={P} min={5} max={50} unit="kN" onChange={setP} />
              <Slider label="荷载位置" value={a} min={10} max={90} unit="%" onChange={setA} />
            </>
          ) : (
            <Slider label="均布荷载 q" value={q} min={5} max={30} unit="kN/m" onChange={setQ} />
          )}
        </div>
      </CollapsiblePanel>
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {milestone && <LearningMilestone milestone={milestone} onDismiss={dismissMilestone} />}
        <ProgressBar currentModule="静定梁" />
        <AIBubble message={bubble} />

        {/* 核心区域：结构图(左) + 内力图竖排(右)，固定总高等高 */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-3 lg:h-[30rem] lg:min-h-48 lg:resize-y lg:overflow-hidden">
          {/* 左：结构示意图 + 结果条 */}
          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden flex flex-col h-full">
            <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <h3 className="text-xs font-bold text-slate-700">📐 {beamLabel}</h3>
              <span className="text-[10px] text-slate-400">L={L}m {beamType === 'overhanging' ? `+ ${safeOverhang}m悬臂` : ''} · {loadType === 'point' ? `P=${P}kN` : `q=${q}kN/m`}</span>
            </div>
            <div className="flex-1 flex items-center justify-center p-3 min-h-0">
              <svg width="100%" viewBox="0 0 250 110" className="bg-gradient-to-b from-slate-50/60 to-white rounded-lg max-h-full">
                <BeamBase showLoad={true} />
              </svg>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-100 border-t border-slate-100 flex-shrink-0">
              <ResultCard label="RA" value={RA.toFixed(1)} unit="kN" color="blue" aiHint={findHint(beamHints, 'RA')} />
              <ResultCard label="RB" value={beamType === 'cantilever' ? '-' : RB.toFixed(1)} unit="kN" color="blue" aiHint={findHint(beamHints, 'RB')} />
              <ResultCard label="Mmax" value={Mmax.toFixed(1)} unit="kN·m" color="red" aiHint={findHint(beamHints, 'Mmax')} />
              <ResultCard label="Vmax" value={Vmax.toFixed(1)} unit="kN" color="green" aiHint={findHint(beamHints, 'Vmax')} />
            </div>
          </div>

          {/* 右：M / V 竖排，两图均分总高 */}
          <div className="flex flex-col gap-1 h-full min-h-0">
            <div className="bg-white rounded-lg border border-slate-200/60 shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
              <div className="px-2 py-1 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                <h4 className="text-[10px] font-semibold text-slate-700">弯矩 M</h4>
                <span className="text-[9px] font-mono text-red-600">{Mmax.toFixed(1)} kN·m</span>
              </div>
              <div className="flex-1 min-h-0 p-0.5">
                <svg width="100%" height="100%" viewBox="0 0 250 110" preserveAspectRatio="xMidYMid meet" className="block">
                  <BeamBase showLoad={false} />
                  <path d={getMomentPath()} fill="url(#sd-m-fill)" stroke="#dc2626" strokeWidth="1.6" strokeLinejoin="round" filter="url(#sd-soft)" />
                  {loadType === 'point' && beamType !== 'overhanging' ? (
                    <text x={30 + (a/100) * 180} y={beamType === 'simple' ? 60 + Mmax * mScale + 12 : 60 - Mmax * mScale - 5} 
                      className="text-[10px] fill-red-700 font-bold" textAnchor="middle">{Mmax.toFixed(1)}</text>
                  ) : beamType !== 'overhanging' && (
                    <text x="120" y={beamType === 'simple' ? 60 + Mmax * mScale + 12 : 60 - Mmax * mScale - 5} 
                      className="text-[10px] fill-red-700 font-bold" textAnchor="middle">{Mmax.toFixed(1)}</text>
                  )}
                </svg>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-slate-200/60 shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
              <div className="px-2 py-1 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                <h4 className="text-[10px] font-semibold text-slate-700">剪力 V</h4>
                <span className="text-[9px] font-mono text-green-600">{Vmax.toFixed(1)} kN</span>
              </div>
              <div className="flex-1 min-h-0 p-0.5">
                <svg width="100%" height="100%" viewBox="0 0 250 110" preserveAspectRatio="xMidYMid meet" className="block">
                  <BeamBase showLoad={false} />
                  <path d={getShearPath()} fill="url(#sd-v-fill)" stroke="#059669" strokeWidth="1.6" strokeLinejoin="round" filter="url(#sd-soft)" />
                  {beamType !== 'overhanging' && (
                    <>
                      <text x="40" y={beamType === 'simple' ? 60 - RA * vScale - 5 : 60 + RA * vScale + 12} 
                        className="text-[10px] fill-green-700 font-bold">{beamType === 'simple' ? RA.toFixed(1) : (-RA).toFixed(1)}</text>
                      {beamType === 'simple' && (
                        <text x="200" y={60 + RB * vScale + 12} 
                          className="text-[10px] fill-green-700 font-bold" textAnchor="end">{(-RB).toFixed(1)}</text>
                      )}
                    </>
                  )}
                </svg>
              </div>
            </div>
          </div>
        </div>

        <SolutionSteps steps={solveSteps} title="求解过程" />
      </div>

      <CollapsiblePanel title="AI助手" icon="🤖" side="right" storageKey="ai-panel-beam">
        <AITutor context={context} moduleTitle="静定梁"
          suggestedQuestions={['均布荷载弯矩图为什么是抛物线？', '外伸梁反力可能向下吗？', '剪力图斜率代表什么？']} />
      </CollapsiblePanel>
    </div>
  );
};


// ==================== 静定刚架 ====================
// 门式刚架：左柱底部铰支座A，右柱底部滚动支座B
const StaticFrame: React.FC = () => {
  const [L, setL] = useState(6);
  const [H, setH] = useState(6);
  const [P, setP] = useState(10);
  const { bubble, sync, ctx, milestone, dismissMilestone } = useAIEngine({ module: 'static', subModule: 'frame' });
  const [q, setQ] = useState(20);
  const [hPos, setHPos] = useState(50); // 水平力位置（0-100%，从底部算起）
  
  // 水平力作用点高度
  const hLoad = (hPos / 100) * H;
  
  // 求解支座反力
  const FxA = P;
  const FyA = (q * L) / 2 + (P * hLoad) / L;
  const FyB = (q * L) / 2 - (P * hLoad) / L;
  
  // 内力计算 (约定: 梁以下侧受拉为正 sagging+, 柱以外侧受拉为正)
  // 左柱顶 E: 取左柱下部为隔离体 → M_E = P·hLoad (外侧受拉)
  const M_E = P * hLoad;
  // 右柱无水平力、B 为滚动支座无水平反力 → 右柱弯矩恒为 0
  const M_D = 0;
  // 梁端弯矩 (作用于梁端, 传递 M_E 使梁在 E 端上缘受拉, sagging+ 约定取负)
  // 梁弯矩方程: M_beam(x) = FyA·x − q·x²/2 − M_E  (0 ≤ x ≤ L)
  // 跨中: M_mid = FyA·L/2 − qL²/8 − M_E
  //            = (qL/2 + P·hLoad/L)·L/2 − qL²/8 − P·hLoad
  //            = qL²/8 − P·hLoad/2
  const M_mid = (q * L * L) / 8 - M_E / 2;
  // 梁弯矩极值位置: dM/dx = FyA − qx = 0 → x* = FyA/q
  const xStar = Math.max(0, Math.min(L, FyA / (q || 1)));
  const M_beam_max = FyA * xStar - (q * xStar * xStar) / 2 - M_E;
  // 左柱剪力: hLoad 以下 = P, 以上 = 0
  const Q_col_below = P;
  const Q_col_above = 0;
  // 梁剪力: 两端
  const Q_beam_left = FyA;
  const Q_beam_right = FyA - q * L; // = -FyB
  // 轴力
  const N_left = -FyA;   // 左柱受压
  const N_right = -FyB;  // 右柱受压
  const N_beam = -P;     // 梁受压 (水平力经梁传向右柱再经 FxA 平衡? 实际: 梁轴力 = -P 在 E 截面, 在 hLoad 以上的柱段轴力 = -FyA; 此处简化标识)
  
  const Mmax = Math.max(Math.abs(M_E), Math.abs(M_beam_max), Math.abs(M_mid));
  const Qmax = Math.max(Math.abs(Q_col_below), Math.abs(Q_beam_left), Math.abs(Q_beam_right));
  const Nmax = Math.max(Math.abs(N_left), Math.abs(N_right), Math.abs(N_beam));
  
  const mScale = 20 / (Mmax || 1);
  const qScale = 15 / (Qmax || 1);
  const nScale = 14 / (Nmax || 1);

  useEffect(() => {
    sync({ L, H, P, hPos, q }, { FyA, FyB, FxA, M_E: M_E, M_mid });
  }, [L, H, P, hPos, q, FyA, FyB, FxA, M_E, M_mid, sync]);
  const context = ctx.toPromptString();

  const frameHints = useMemo(() => getFrameHints({ L, H, P, q, FyA, FyB, FxA, M_E }), [L, H, P, q, FyA, FyB, FxA, M_E]);

  const solveSteps = useMemo(() => [
    { title: 'ΣFx=0 → FxA', equation: `FxA = P = ${P}`, result: `${FxA.toFixed(2)} kN`, aiWhy: '水平方向只有P和FxA两个力，B为滚动支座无水平反力，故 FxA = P (方向与P相反)。' },
    { title: 'ΣMA=0 → FyB', equation: `FyB·L = qL²/2 + P·h → FyB = qL/2 + P·h/L`, result: `${FyB.toFixed(2)} kN`, explanation: `注意: 对A取矩时, P 作用点在 A 的上方, 力矩方向决定 FyB 符号`, aiWhy: '对A点取矩消去A点反力。水平力P会使刚架绕A点顺时针转动, 由FyB和FyA反抗。' },
    { title: 'ΣFy=0 → FyA', equation: `FyA = qL − FyB`, result: `${FyA.toFixed(2)} kN` },
    { title: '左柱顶弯矩 ME', equation: `ME = P·h = ${P}×${hLoad.toFixed(1)}`, result: `${M_E.toFixed(2)} kN·m`, explanation: '截面法, 取左柱下部为隔离体', aiWhy: '左柱顶切开取下部: 柱底 FxA 与 P 合成的力矩即 ME = P·h。水平力位置越高, 柱顶弯矩越大。' },
    { title: '右柱顶弯矩 MD', equation: `MD = 0`, result: `0 kN·m`, explanation: 'B 为滚动支座, 右柱无水平力 → 右柱弯矩恒为 0', aiWhy: '这是门式刚架 (铰+辊) 的典型特征: 荷载不对称时, 两柱弯矩不对称。若 B 改为铰支座, 则 MD ≠ 0 (超静定)。' },
    { title: '梁跨中弯矩', equation: `M_mid = qL²/8 − ME/2 = ${(q*L*L/8).toFixed(1)} − ${(M_E/2).toFixed(1)}`, result: `${M_mid.toFixed(2)} kN·m`, aiWhy: '梁两端等效弯矩: E 端 = -ME (hogging), D 端 = 0。叠加均布荷载的简支梁效应 qL²/8, 得跨中值 = qL²/8 − ME/2。' },
    { title: '梁最大弯矩位置', equation: `x* = FyA/q = ${FyA.toFixed(1)}/${q}`, result: `x* = ${xStar.toFixed(2)} m,  M_max = ${M_beam_max.toFixed(2)} kN·m`, explanation: '剪力过零点即弯矩极值点', aiWhy: '梁剪力 V(x) = FyA − qx, 令 V=0 得极值点位置。非对称荷载使最大弯矩偏离跨中。' },
  ], [L, P, q, hLoad, FxA, FyA, FyB, M_E, M_mid, xStar, M_beam_max]);

  // 绘制刚架基础结构的SVG组件 - 紧凑版
  const FrameBase = () => (
    <>
      <StructuralDefs id="sd" />
      {/* 左柱 / 梁 / 右柱: 渐变矩形 (宽度3px) */}
      <rect x="33.5" y="25" width="3" height="60" fill="url(#sd-member)" stroke="#0f172a" strokeWidth="0.3" />
      <rect x="35" y="23.5" width="100" height="3" fill="url(#sd-member)" stroke="#0f172a" strokeWidth="0.3" />
      <rect x="133.5" y="25" width="3" height="60" fill="url(#sd-member)" stroke="#0f172a" strokeWidth="0.3" />
      {/* 刚性节点 (小方块) */}
      <rect x="33" y="23" width="4" height="4" fill="#1e293b" />
      <rect x="133" y="23" width="4" height="4" fill="#1e293b" />
      {/* 节点标签 */}
      <text x="28" y="92" className="fill-slate-700 font-bold" style={{ fontSize: 8 }}>A</text>
      <text x="28" y="22" className="fill-slate-700 font-bold" style={{ fontSize: 8 }}>E</text>
      <text x="138" y="22" className="fill-slate-700 font-bold" style={{ fontSize: 8 }}>D</text>
      <text x="138" y="92" className="fill-slate-700 font-bold" style={{ fontSize: 8 }}>B</text>
      {/* 支座 */}
      <PinSupport cx={35} cy={86} size={6} defsId="sd" />
      <RollerSupport cx={135} cy={86} size={6} defsId="sd" />
    </>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-3 min-h-full p-3">
      <CollapsiblePanel title="参数" icon="🔧" side="left" storageKey="param-panel-frame">
        <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-sm overflow-y-auto">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">🔧 参数设置</h4>
          <Slider label="跨度 L" value={L} min={4} max={12} unit="m" onChange={setL} />
          <Slider label="柱高 H" value={H} min={3} max={10} unit="m" onChange={setH} />
          <Slider label="水平力 P" value={P} min={5} max={30} unit="kN" onChange={setP} />
          <Slider label="水平力位置" value={hPos} min={10} max={100} unit="%" onChange={setHPos} />
          <Slider label="均布荷载 q" value={q} min={10} max={40} unit="kN/m" onChange={setQ} />
        </div>
      </CollapsiblePanel>
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {milestone && <LearningMilestone milestone={milestone} onDismiss={dismissMilestone} />}
        <ProgressBar currentModule="静定刚架" />
        <AIBubble message={bubble} />

        {/* 核心区域：结构图(左) + 内力图竖排(右)，固定总高等高 */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-3 lg:h-[30rem] lg:min-h-48 lg:resize-y lg:overflow-hidden">
          {/* 左：结构示意图 */}
          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden flex flex-col h-full">
            <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <h3 className="text-xs font-bold text-slate-700">📐 结构示意</h3>
              <span className="text-[10px] text-slate-400">L={L}m · H={H}m</span>
            </div>
            <div className="flex-1 flex items-center justify-center p-3 min-h-0">
              <svg width="100%" viewBox="0 0 170 110" className="bg-gradient-to-b from-slate-50/60 to-white rounded-lg max-h-full">
                <FrameBase />
                {(() => {
                  const loadY = 85 - (hPos / 100) * 60;
                  return <PointLoadH xStart={12} xEnd={34} y={loadY} label={`P=${P}kN`} defsId="sd" />;
                })()}
                <DistributedLoadV x1={37} x2={133} yTop={13} yBase={23} count={8} label={`q=${q} kN/m`} defsId="sd" />
                <text x="85" y="108" className="fill-slate-500 font-medium" textAnchor="middle" style={{ fontSize: 9 }}>L={L}m, H={H}m</text>
              </svg>
            </div>
          </div>

          {/* 右：M / Q / N 竖排，三图均分总高 */}
          <div className="flex flex-col gap-1 h-full min-h-0">
            {/* 弯矩图 M */}
            <div className="bg-white rounded-lg border border-slate-200/60 shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
              <div className="px-2 py-1 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                <h4 className="text-[10px] font-semibold text-slate-700">弯矩 M</h4>
                <span className="text-[9px] font-mono text-red-600">{Mmax.toFixed(0)} kN·m</span>
              </div>
              <div className="flex-1 min-h-0 p-0.5">
                <svg width="100%" height="100%" viewBox="-10 -10 190 130" preserveAspectRatio="xMidYMid meet" className="block">
                  <FrameBase />
                  {(() => {
                    const yH = 85 - (hLoad / H) * 60;
                    const dx = M_E * mScale;
                    return (
                      <path d={`M 35,85 L ${35 - dx},${yH} L ${35 - dx},25 L 35,25 Z`}
                        fill="url(#sd-m-fill)" stroke="#dc2626" strokeWidth="1.6" strokeLinejoin="round" filter="url(#sd-soft)" />
                    );
                  })()}
                  {(() => {
                    let d = 'M 35,25';
                    const N = 30;
                    for (let i = 0; i <= N; i++) {
                      const xi = i / N;
                      const xr = xi * L;
                      const M = FyA * xr - (q * xr * xr) / 2 - M_E;
                      const px = 35 + xi * 100;
                      const py = 25 + M * mScale;
                      d += ` L ${px},${py}`;
                    }
                    d += ' L 135,25 Z';
                    return <path d={d} fill="url(#sd-m-fill)" stroke="#dc2626" strokeWidth="1.6" strokeLinejoin="round" filter="url(#sd-soft)" />;
                  })()}
                  <text x="138" y="55" className="text-[7px] fill-slate-400">M=0</text>
                  <text x={35 - M_E * mScale - 3} y={85 - (hLoad / H) * 60 - 2} className="text-[8px] fill-red-700 font-bold" textAnchor="end">{M_E.toFixed(1)}</text>
                  {(() => {
                    const pxStar = 35 + (xStar / L) * 100;
                    const pyStar = 25 + M_beam_max * mScale;
                    return <>
                      <circle cx={pxStar} cy={pyStar} r="2" fill="#ef4444" />
                      <text x={pxStar} y={pyStar + (M_beam_max >= 0 ? 10 : -4)} className="text-[8px] fill-red-700 font-bold" textAnchor="middle">{M_beam_max.toFixed(1)}</text>
                    </>;
                  })()}
                </svg>
              </div>
            </div>
            {/* 剪力图 Q */}
            <div className="bg-white rounded-lg border border-slate-200/60 shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
              <div className="px-2 py-1 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                <h4 className="text-[10px] font-semibold text-slate-700">剪力 Q</h4>
                <span className="text-[9px] font-mono text-green-600">{Qmax.toFixed(0)} kN</span>
              </div>
              <div className="flex-1 min-h-0 p-0.5">
                <svg width="100%" height="100%" viewBox="-10 -10 190 130" preserveAspectRatio="xMidYMid meet" className="block">
                  <FrameBase />
                  {(() => {
                    const yH = 85 - (hLoad / H) * 60;
                    const dx = Q_col_below * qScale;
                    return (
                      <path d={`M 35,85 L ${35 + dx},85 L ${35 + dx},${yH} L 35,${yH} Z`}
                        fill="url(#sd-v-fill)" stroke="#059669" strokeWidth="1.6" strokeLinejoin="round" filter="url(#sd-soft)" />
                    );
                  })()}
                  <path d={`M 35,25 L 35,${25 - Q_beam_left * qScale} L 135,${25 - Q_beam_right * qScale} L 135,25 Z`}
                    fill="url(#sd-v-fill)" stroke="#059669" strokeWidth="1.6" strokeLinejoin="round" filter="url(#sd-soft)" />
                  <text x="138" y="55" className="text-[7px] fill-slate-400">V=0</text>
                  <text x={35 + Q_col_below * qScale + 2} y={(85 + (85 - (hLoad/H)*60)) / 2 + 3} className="text-[8px] fill-green-700 font-bold">{Q_col_below.toFixed(1)}</text>
                  <text x="45" y={22 - Q_beam_left * qScale} className="text-[8px] fill-green-700 font-bold">{Q_beam_left.toFixed(1)}</text>
                  <text x="125" y={22 - Q_beam_right * qScale} className="text-[8px] fill-green-700 font-bold">{Q_beam_right.toFixed(1)}</text>
                  {(() => {
                    const pxStar = 35 + (xStar / L) * 100;
                    return <line x1={pxStar} y1="22" x2={pxStar} y2="28" stroke="#059669" strokeWidth="1" strokeDasharray="2" />;
                  })()}
                </svg>
              </div>
            </div>
            {/* 轴力图 N */}
            <div className="bg-white rounded-lg border border-slate-200/60 shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
              <div className="px-2 py-1 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                <h4 className="text-[10px] font-semibold text-slate-700">轴力 N</h4>
                <span className="text-[9px] font-mono text-blue-600">{Nmax.toFixed(0)} kN</span>
              </div>
              <div className="flex-1 min-h-0 p-0.5">
                <svg width="100%" height="100%" viewBox="-10 -10 190 130" preserveAspectRatio="xMidYMid meet" className="block">
                  <FrameBase />
                  <path d={`M 35,85 L ${35 - N_left * nScale},85 L ${35 - N_left * nScale},25 L 35,25`} 
                    fill="url(#sd-n-fill)" stroke="#2563eb" strokeWidth="1.6" strokeLinejoin="round" filter="url(#sd-soft)" />
                  <path d={`M 35,25 L 35,${25 + N_beam * nScale} L 135,${25 + N_beam * nScale} L 135,25`} 
                    fill="url(#sd-n-fill)" stroke="#2563eb" strokeWidth="1.6" strokeLinejoin="round" filter="url(#sd-soft)" />
                  <path d={`M 135,25 L ${135 + N_right * nScale},25 L ${135 + N_right * nScale},85 L 135,85`} 
                    fill="url(#sd-n-fill)" stroke="#2563eb" strokeWidth="1.6" strokeLinejoin="round" filter="url(#sd-soft)" />
                  <text x={35 - N_left * nScale - 3} y="55" className="text-[8px] fill-blue-700 font-bold">{N_left.toFixed(0)}</text>
                  <text x="85" y={28 + N_beam * nScale} className="text-[8px] fill-blue-700 font-bold" textAnchor="middle">{N_beam.toFixed(0)}</text>
                  <text x={135 + N_right * nScale + 3} y="55" className="text-[8px] fill-blue-700 font-bold">{N_right.toFixed(0)}</text>
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* 结果条 */}
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="grid grid-cols-3 md:grid-cols-7 gap-px bg-slate-100">
            <ResultCard label="FyA" value={FyA.toFixed(1)} unit="kN" color="blue" aiHint={findHint(frameHints, 'FyA')} />
            <ResultCard label="FyB" value={FyB.toFixed(1)} unit="kN" color="blue" />
            <ResultCard label="FxA" value={FxA.toFixed(1)} unit="kN" color="blue" aiHint={findHint(frameHints, 'FxA')} />
            <ResultCard label="ME" value={M_E.toFixed(1)} unit="kN·m" color="red" aiHint={findHint(frameHints, 'ME')} />
            <ResultCard label="MD" value={M_D.toFixed(1)} unit="kN·m" color="red" />
            <ResultCard label="M跨中" value={M_mid.toFixed(1)} unit="kN·m" color="red" />
            <ResultCard label="M梁最大" value={M_beam_max.toFixed(1)} unit="kN·m" color="red" />
          </div>
        </div>

        <SolutionSteps steps={solveSteps} title="求解过程" />
      </div>

      <CollapsiblePanel title="AI助手" icon="🤖" side="right" storageKey="ai-panel-frame">
        <AITutor context={context} moduleTitle="静定刚架"
          suggestedQuestions={['刚架弯矩图怎么画？', '如何判断受拉侧？', '刚架与梁有什么区别？']} />
      </CollapsiblePanel>
    </div>
  );
};

// ==================== 静定桁架 ====================
const StaticTruss: React.FC = () => {
  const [P, setP] = useState(50);
  const [L, setL] = useState(12);
  const [H, setH] = useState(4);
  const [showAxial, setShowAxial] = useState(true);
  const { bubble, sync, ctx, milestone, dismissMilestone } = useAIEngine({ module: 'static', subModule: 'truss' });

  const RA = P / 2;
  const diagonal = Math.sqrt((L/4)**2 + H**2);
  const sinA = H / diagonal;
  const cosA = (L/4) / diagonal;
  
  // 各杆件轴力
  const N_bottom = (RA * (L/4)) / H; // 下弦杆（拉）
  const N_top = -N_bottom; // 上弦杆（压）
  const N_diag1 = RA / sinA; // 左斜杆（拉）
  const N_diag2 = -RA / sinA; // 中斜杆（压）

  useEffect(() => {
    sync({ P }, { RA, N_bottom, N_top, N_diag1, N_diag2 });
  }, [P, RA, N_bottom, N_top, N_diag1, N_diag2, sync]);
  const context = ctx.toPromptString();

  const trussHints = useMemo(() => getTrussHints({ P, RA, N_bottom, N_top }), [P, RA, N_bottom, N_top]);

  const solveSteps = useMemo(() => [
    { title: '对称性求反力', equation: `RA = RB = P/2 = ${P}/2`, result: `${RA.toFixed(1)} kN`, explanation: '对称结构 + 对称荷载', aiWhy: '对称结构受对称荷载，反力必然对称。无需列方程，直接RA=RB=P/2。这是利用对称性简化计算的典范。' },
    { title: '截面法：截断1-1', equation: `ΣMC=0: N_底×H = RA×(L/4)`, result: `N_底 = +${N_bottom.toFixed(1)} kN (拉)`, explanation: '对上弦节点C取矩', aiWhy: '截面法的关键是选取矩心：对C点取矩可消去上弦杆和斜杆的力矩，只留下弦杆一个未知。' },
    { title: '截面法：截断1-1', equation: `ΣME=0: N_顶×H = −RA×(L/4)`, result: `N_顶 = ${N_top.toFixed(1)} kN (压)`, aiWhy: '同理，对下弦节点E取矩消去其他杆件的力矩。上弦杆受压是框架和拱杆共同的特征。' },
    { title: '节点法：节点A', equation: `ΣFy=0: N_斜×sinα = RA`, result: `N_斜 = +${N_diag1.toFixed(1)} kN (拉)`, explanation: `sinα = ${sinA.toFixed(3)}, 斜杆角度 = ${(Math.atan2(H, L/4) * 180 / Math.PI).toFixed(1)}°`, aiWhy: '节点法：框架节点受力平衡。在A点，竖向只有RA和斜杆的竖向分量，因此斜杆轴力 = RA/sinα。' },
    { title: '节点法：节点C', result: `N_中斜 = ${N_diag2.toFixed(1)} kN (压)`, explanation: '中间斜杆受压，对称' },
  ], [P, RA, N_bottom, N_top, N_diag1, N_diag2, sinA, H, L]);

  // 桁架基础结构组件 - 紧凑版
  const TrussBase = ({ showLoad = true }: { showLoad?: boolean }) => (
    <>
      <StructuralDefs id="sd" />
      {/* 杆件 (全部使用渐变描边) */}
      <g stroke="url(#sd-member)" strokeLinecap="round">
        {/* 下弦 */}
        <line x1="20" y1="65" x2="180" y2="65" strokeWidth="3.2" />
        {/* 上弦 */}
        <line x1="60" y1="25" x2="140" y2="25" strokeWidth="3.2" />
        {/* 斜杆 */}
        <line x1="20" y1="65" x2="60" y2="25" strokeWidth="2.2" />
        <line x1="60" y1="25" x2="100" y2="65" strokeWidth="2.2" />
        <line x1="100" y1="65" x2="140" y2="25" strokeWidth="2.2" />
        <line x1="140" y1="25" x2="180" y2="65" strokeWidth="2.2" />
      </g>
      {/* 竖杆 (虚线) */}
      <line x1="60" y1="25" x2="60" y2="65" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="2,2" />
      <line x1="140" y1="25" x2="140" y2="65" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="2,2" />
      {/* 节点 */}
      {[[20,65], [60,25], [60,65], [100,65], [140,25], [140,65], [180,65]].map(([x, y], i) => (
        <StructuralNode key={i} cx={x} cy={y} r={2.8} />
      ))}
      {/* 支座 */}
      <PinSupport cx={20} cy={67} size={6} defsId="sd" />
      <RollerSupport cx={180} cy={67} size={6} defsId="sd" />
      {/* 荷载 P - 向下 */}
      {showLoad && (
        <PointLoadV x={100} yTop={8} yBase={62} label={`P=${P}kN`} defsId="sd" />
      )}
    </>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-3 min-h-full p-3">
      <CollapsiblePanel title="参数" icon="🔧" side="left" storageKey="param-panel-truss">
        <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-sm overflow-y-auto">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">🔧 参数设置</h4>
          <Slider label="节点荷载 P" value={P} min={20} max={100} unit="kN" onChange={setP} />
          <Slider label="桁架跨度 L" value={L} min={8} max={24} unit="m" onChange={setL} />
          <Slider label="桁架高度 H" value={H} min={2} max={8} step={0.5} unit="m" onChange={setH} />
          <div className="mt-3 p-2 bg-gradient-to-br from-slate-50 to-white rounded-lg text-[10px] text-slate-500 border border-slate-100">
            矢跨比 H/L = {(H/L).toFixed(2)} · 斜杆角 α = {(Math.atan2(H, L/4) * 180 / Math.PI).toFixed(1)}°
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showAxial} onChange={(e) => setShowAxial(e.target.checked)} 
                className="w-4 h-4 rounded border-slate-300" />
              <span className="text-sm text-slate-700">显示轴力值</span>
            </label>
          </div>
        </div>
      </CollapsiblePanel>
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {milestone && <LearningMilestone milestone={milestone} onDismiss={dismissMilestone} />}
        <ProgressBar currentModule="静定桁架" />
        <AIBubble message={bubble} />

        {/* 核心区域：结构图(左) + 轴力图竖排(右)，固定总高等高 */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-3 lg:h-[30rem] lg:min-h-48 lg:resize-y lg:overflow-hidden">
          {/* 左：结构示意图 */}
          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden flex flex-col h-full">
            <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <h3 className="text-xs font-bold text-slate-700">📐 结构示意</h3>
              <span className="text-[10px] text-slate-400">L={L}m · H={H}m</span>
            </div>
            <div className="flex-1 flex items-center justify-center p-3 min-h-0">
              <svg width="100%" viewBox="0 0 200 90" className="bg-gradient-to-b from-slate-50/60 to-white rounded-lg max-h-full">
                <TrussBase showLoad={true} />
                <text x="100" y="88" className="text-[8px] fill-slate-500" textAnchor="middle">L={L}m, H={H}m</text>
              </svg>
            </div>
          </div>

          {/* 右：下弦 / 上弦 / 斜杆 竖排 */}
          <div className="flex flex-col gap-1 h-full min-h-0">
            {/* 下弦杆轴力 */}
            <div className="bg-white rounded-lg border border-slate-200/60 shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
              <div className="px-2 py-1 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                <h4 className="text-[10px] font-semibold text-slate-700">下弦杆 (拉)</h4>
                <span className="text-[9px] font-mono text-blue-600">+{N_bottom.toFixed(0)} kN</span>
              </div>
              <div className="flex-1 min-h-0 p-0.5">
                <svg width="100%" height="100%" viewBox="0 0 200 90" preserveAspectRatio="xMidYMid meet" className="block">
                  <TrussBase showLoad={false} />
                  <line x1="20" y1="65" x2="180" y2="65" stroke="#2563eb" strokeWidth="6" strokeLinecap="round" filter="url(#sd-soft)" />
                  <line x1="20" y1="65" x2="180" y2="65" stroke="#93c5fd" strokeWidth="2.2" strokeLinecap="round" opacity="0.9" />
                  {showAxial && (
                    <>
                      <rect x="40" y="68" width="40" height="14" fill="white" fillOpacity="0.96" rx="3" stroke="#93c5fd" strokeWidth="0.8" filter="url(#sd-soft)" />
                      <text x="60" y="79" className="text-[9px] fill-blue-700 font-bold" textAnchor="middle">+{N_bottom.toFixed(0)}</text>
                      <rect x="120" y="68" width="40" height="14" fill="white" fillOpacity="0.96" rx="3" stroke="#93c5fd" strokeWidth="0.8" filter="url(#sd-soft)" />
                      <text x="140" y="79" className="text-[9px] fill-blue-700 font-bold" textAnchor="middle">+{N_bottom.toFixed(0)}</text>
                    </>
                  )}
                </svg>
              </div>
            </div>
            {/* 上弦杆轴力 */}
            <div className="bg-white rounded-lg border border-slate-200/60 shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
              <div className="px-2 py-1 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                <h4 className="text-[10px] font-semibold text-slate-700">上弦杆 (压)</h4>
                <span className="text-[9px] font-mono text-red-600">{N_top.toFixed(0)} kN</span>
              </div>
              <div className="flex-1 min-h-0 p-0.5">
                <svg width="100%" height="100%" viewBox="0 0 200 90" preserveAspectRatio="xMidYMid meet" className="block">
                  <TrussBase showLoad={false} />
                  <line x1="60" y1="25" x2="140" y2="25" stroke="#dc2626" strokeWidth="6" strokeLinecap="round" filter="url(#sd-soft)" />
                  <line x1="60" y1="25" x2="140" y2="25" stroke="#fca5a5" strokeWidth="2.2" strokeLinecap="round" opacity="0.9" />
                  {showAxial && (
                    <>
                      <rect x="80" y="8" width="40" height="14" fill="white" fillOpacity="0.96" rx="3" stroke="#fecaca" strokeWidth="0.8" filter="url(#sd-soft)" />
                      <text x="100" y="19" className="text-[9px] fill-red-700 font-bold" textAnchor="middle">{N_top.toFixed(0)}</text>
                    </>
                  )}
                </svg>
              </div>
            </div>
            {/* 斜杆轴力 */}
            <div className="bg-white rounded-lg border border-slate-200/60 shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
              <div className="px-2 py-1 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                <h4 className="text-[10px] font-semibold text-slate-700">斜杆 (拉/压)</h4>
                <span className="text-[9px] font-mono text-slate-600">±{Math.abs(N_diag1).toFixed(0)} kN</span>
              </div>
              <div className="flex-1 min-h-0 p-0.5">
                <svg width="100%" height="100%" viewBox="0 0 200 90" preserveAspectRatio="xMidYMid meet" className="block">
                  <TrussBase showLoad={false} />
                  <line x1="20" y1="65" x2="60" y2="25" stroke="#059669" strokeWidth="5" strokeLinecap="round" filter="url(#sd-soft)" />
                  <line x1="60" y1="25" x2="100" y2="65" stroke="#d97706" strokeWidth="5" strokeLinecap="round" filter="url(#sd-soft)" />
                  <line x1="100" y1="65" x2="140" y2="25" stroke="#d97706" strokeWidth="5" strokeLinecap="round" filter="url(#sd-soft)" />
                  <line x1="140" y1="25" x2="180" y2="65" stroke="#059669" strokeWidth="5" strokeLinecap="round" filter="url(#sd-soft)" />
                  {showAxial && (
                    <>
                      <rect x="25" y="38" width="30" height="12" fill="white" fillOpacity="0.96" rx="3" stroke="#86efac" strokeWidth="0.8" filter="url(#sd-soft)" />
                      <text x="40" y="47" className="text-[8px] fill-green-700 font-bold" textAnchor="middle">+{N_diag1.toFixed(0)}</text>
                      <rect x="65" y="38" width="30" height="12" fill="white" fillOpacity="0.96" rx="3" stroke="#fdba74" strokeWidth="0.8" filter="url(#sd-soft)" />
                      <text x="80" y="47" className="text-[8px] fill-amber-700 font-bold" textAnchor="middle">{N_diag2.toFixed(0)}</text>
                      <rect x="105" y="38" width="30" height="12" fill="white" fillOpacity="0.96" rx="3" stroke="#fdba74" strokeWidth="0.8" filter="url(#sd-soft)" />
                      <text x="120" y="47" className="text-[8px] fill-amber-700 font-bold" textAnchor="middle">{N_diag2.toFixed(0)}</text>
                      <rect x="145" y="38" width="30" height="12" fill="white" fillOpacity="0.96" rx="3" stroke="#86efac" strokeWidth="0.8" filter="url(#sd-soft)" />
                      <text x="160" y="47" className="text-[8px] fill-green-700 font-bold" textAnchor="middle">+{N_diag1.toFixed(0)}</text>
                    </>
                  )}
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* 结果条 */}
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-100">
            <ResultCard label="下弦(拉)" value={`+${N_bottom.toFixed(1)}`} unit="kN" color="blue" aiHint={findHint(trussHints, '下弦杆')} />
            <ResultCard label="上弦(压)" value={N_top.toFixed(1)} unit="kN" color="red" aiHint={findHint(trussHints, '上弦杆')} />
            <ResultCard label="斜杆" value={`±${Math.abs(N_diag1).toFixed(1)}`} unit="kN" color="green" />
            <ResultCard label="支座反力" value={RA.toFixed(1)} unit="kN" color="purple" aiHint={findHint(trussHints, 'RA')} />
          </div>
        </div>

        <SolutionSteps steps={solveSteps} title="求解过程" />
      </div>

      <CollapsiblePanel title="AI助手" icon="🤖" side="right" storageKey="ai-panel-truss">
        <AITutor context={context} moduleTitle="静定桁架"
          suggestedQuestions={['为什么桁架没有弯矩？', '节点法和截面法怎么选？', '什么是零杆？']} />
      </CollapsiblePanel>
    </div>
  );
};


// ==================== 静定拱 ====================
const StaticArch: React.FC = () => {
  const [L, setL] = useState(20);
  const [f, setF] = useState(5);
  const [q, setQ] = useState(10);
  const { bubble, sync, ctx, milestone, dismissMilestone } = useAIEngine({ module: 'static', subModule: 'arch' });
  
  const RA = (q * L) / 2;
  const H_thrust = (q * L * L) / (8 * f);
  const Mmax_beam = (q * L * L) / 8;
  // 抱物线拱在均布荷载下为合理拱轴线，弯矩恒为零
  // 实际工程中活荷载会产生小量弯矩，但此模块展示的是理想情况
  const Mmax_arch = 0; // 抛物线拱 + 均布荷载 → 弯矩恒为0
  const reduction = Mmax_beam > 0 ? Math.round((1 - Mmax_arch / Mmax_beam) * 100) : 100;

  const getAxialForce = (xi: number) => {
    const x = xi * L;
    const dydx = 4 * f * (L - 2 * x) / (L * L);
    const theta = Math.atan(dydx);
    const V = RA - q * x;
    return -H_thrust / Math.cos(theta) - V * Math.sin(theta);
  };
  
  const N_crown = -H_thrust;
  const N_support = getAxialForce(0);

  useEffect(() => {
    sync({ L, f, q }, { RA, H_thrust, N_crown, N_support });
  }, [L, f, q, RA, H_thrust, N_crown, N_support, sync]);
  const context = ctx.toPromptString();

  const archHints = useMemo(() => getArchHints({ L, f, q, RA, H_thrust }), [L, f, q, RA, H_thrust]);

  const solveSteps = useMemo(() => [
    { title: '对称性求竖向反力', equation: `RA = RB = qL/2 = ${q}×${L}/2`, result: `${RA.toFixed(2)} kN`, aiWhy: '拱结构对称且荷载对称，竖向反力各承担一半。与简支梁相同。' },
    { title: '铰C条件求水平推力', equation: `MC=0: H×f = qL²/8 → H = qL²/(8f)`, result: `${H_thrust.toFixed(2)} kN`, explanation: '三铰拱的关键方程：利用拱顶铰弯矩为零', aiWhy: '三铰拱比简支梁多一个未知数H，正好用拱顶铰的弯矩=0这个额外条件求解。这是拱结构分析的核心。' },
    { title: '简支梁弯矩（对比）', equation: `M_梁 = qL²/8 = ${q}×${L}²/8`, result: `${Mmax_beam.toFixed(1)} kN·m`, aiWhy: '先计算同跨度简支梁的弯矩，作为对比基准。拱的优势就是大幅减小弯矩。' },
    { title: '拱弯矩 M = M_梁 − Hy', equation: `当y = 合理拱轴线时, M ≈ 0`, result: '弯矩几乎为零', explanation: '均布荷载下二次抛物线拱的弯矩恒为零', aiWhy: '拱弯矩 = 简支梁弯矩 − H×y。当拱轴线为抛物线时，Hy恰好等于梁弯矩，相减为零！这就是“合理拱轴线”的含义。' },
    { title: '拱顶轴力', equation: `N_拱顶 = −H = −${H_thrust.toFixed(1)}`, result: `${N_crown.toFixed(1)} kN (压)` },
    { title: '拱脚轴力', result: `${N_support.toFixed(1)} kN (压)`, explanation: '拱脚处斜率最大，轴力最大', aiWhy: '拱脚处拱轴线斜率最大，竖向力和水平力都有贡献，合力最大。拱脚是拱结构的关键截面。' },
  ], [L, f, q, RA, H_thrust, Mmax_beam, N_crown, N_support]);

  // 拱基础结构组件 - 紧凑版
  // 拱轴线按 f/L 比例缩放: 基线 y=75, 两拱脚 x=25 / x=175 (150 像素对应 L)
  // 抛物线 y(ξ) = f·4ξ(1-ξ), ξ = x/L. 矢高像素 = rise_px = min(60, (f/L)·150)
  // 二次贝塞尔控制点 y_ctrl 使曲线中点达到抛物线顶 y=75-rise_px
  //   曲线中点 y = (P0.y + 2·P1.y + P2.y)/4 = (75 + 2·y_ctrl + 75)/4
  //   令其 = 75 - rise_px ⇒ y_ctrl = 75 - 2·rise_px
  const rise_px = Math.min(60, Math.max(6, (f / L) * 150));
  const y_ctrl = 75 - 2 * rise_px;
  const y_crown = 75 - rise_px;
  const archPath = `M 25,75 Q 100,${y_ctrl} 175,75`;
  const ArchBase = ({ showLoad = true }: { showLoad?: boolean }) => (
    <>
      <StructuralDefs id="sd" />
      {/* 拱轴线 (稍粗渐变描边) */}
      <path d={archPath} fill="none" stroke="url(#sd-member)" strokeWidth="3.2" strokeLinecap="round" filter="url(#sd-shadow)" />
      {/* 拱顶铰 */}
      <StructuralNode cx={100} cy={y_crown} r={3} />
      {/* 拱脚支座 */}
      <PinSupport cx={25} cy={76} size={6} defsId="sd" />
      <PinSupport cx={175} cy={76} size={6} defsId="sd" />
      {/* 均布荷载 */}
      {showLoad && (
        <DistributedLoadV x1={30} x2={170} yTop={6} yBase={18} count={10} label={`q=${q} kN/m`} defsId="sd" />
      )}
    </>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-3 min-h-full p-3">
      <CollapsiblePanel title="参数" icon="🔧" side="left" storageKey="param-panel-arch">
        <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-sm overflow-y-auto">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">🔧 参数设置</h4>
          <Slider label="跨度 L" value={L} min={10} max={40} unit="m" onChange={setL} />
          <Slider label="矢高 f" value={f} min={2} max={10} unit="m" onChange={setF} />
          <Slider label="均布荷载 q" value={q} min={5} max={30} unit="kN/m" onChange={setQ} />
        </div>
      </CollapsiblePanel>
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {milestone && <LearningMilestone milestone={milestone} onDismiss={dismissMilestone} />}
        <ProgressBar currentModule="三铰拱" />
        <AIBubble message={bubble} />

        {/* 核心区域：结构图(左) + 内力图竖排(右)，固定总高可拖拽 */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-3 lg:h-[30rem] lg:min-h-48 lg:resize-y lg:overflow-hidden">
          {/* 左：结构示意图 */}
          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden flex flex-col h-full">
            <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <h3 className="text-xs font-bold text-slate-700">📐 三铰拱</h3>
              <span className="text-[10px] text-slate-400">L={L}m · f={f}m</span>
            </div>
            <div className="flex-1 flex items-center justify-center p-3 min-h-0">
              <svg width="100%" viewBox="0 0 200 100" className="bg-gradient-to-b from-slate-50/60 to-white rounded-lg max-h-full">
                <ArchBase showLoad={true} />
                <line x1="100" y1={y_crown} x2="100" y2="75" stroke="#94a3b8" strokeWidth="1.1" strokeDasharray="3 3" strokeLinecap="round" />
                <rect x="106" y={(y_crown + 75) / 2 - 6} width="28" height="11" rx="3" fill="white" fillOpacity="0.96" stroke="#cbd5e1" strokeWidth="0.8" filter="url(#sd-soft)" />
                <text x="120" y={(y_crown + 75) / 2 + 1.5} className="text-[7px] fill-slate-500 font-medium" textAnchor="middle">f={f}m</text>
                <text x="100" y="98" className="text-[8px] fill-slate-500" textAnchor="middle">L={L}m, f={f}m</text>
              </svg>
            </div>
          </div>

          {/* 右：M / N / 对比 竖排 */}
          <div className="flex flex-col gap-1 h-full min-h-0">
            <div className="bg-white rounded-lg border border-slate-200/60 shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
              <div className="px-2 py-1 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                <h4 className="text-[10px] font-semibold text-slate-700">弯矩 M</h4>
                <span className="text-[9px] font-mono text-green-600">M ≈ 0 ✓</span>
              </div>
              <div className="flex-1 min-h-0 p-0.5">
                <svg width="100%" height="100%" viewBox="0 0 200 100" preserveAspectRatio="xMidYMid meet" className="block">
                  <ArchBase showLoad={false} />
                  <path d={archPath} fill="none" stroke="#10b981" strokeWidth="5" strokeOpacity="0.3" />
                  <text x="100" y={y_crown - 8} className="text-[11px] fill-green-600 font-bold" textAnchor="middle">M ≈ 0</text>
                  <text x="100" y={y_crown + 5} className="text-[8px] fill-slate-500" textAnchor="middle">(合理拱轴线)</text>
                </svg>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-slate-200/60 shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
              <div className="px-2 py-1 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                <h4 className="text-[10px] font-semibold text-slate-700">轴力 N</h4>
                <span className="text-[9px] font-mono text-blue-600">{N_crown.toFixed(0)} kN</span>
              </div>
              <div className="flex-1 min-h-0 p-0.5">
                <svg width="100%" height="100%" viewBox="0 0 200 100" preserveAspectRatio="xMidYMid meet" className="block">
                  <ArchBase showLoad={false} />
                  <path d={`M 25,75 Q 100,${y_ctrl - 15} 175,75`} fill="url(#sd-n-fill)" stroke="#2563eb" strokeWidth="1.8" strokeLinejoin="round" filter="url(#sd-soft)" />
                  <rect x="72" y="12" width="56" height="14" fill="white" fillOpacity="0.96" rx="3" stroke="#bfdbfe" strokeWidth="0.8" filter="url(#sd-soft)" />
                  <text x="100" y="23" className="text-[9px] fill-blue-700 font-bold" textAnchor="middle">{N_crown.toFixed(0)}</text>
                  <rect x="2" y="55" width="42" height="12" fill="white" fillOpacity="0.96" rx="3" stroke="#bfdbfe" strokeWidth="0.8" filter="url(#sd-soft)" />
                  <text x="23" y="64" className="text-[8px] fill-blue-700 font-bold" textAnchor="middle">{N_support.toFixed(0)}</text>
                  <rect x="156" y="55" width="42" height="12" fill="white" fillOpacity="0.96" rx="3" stroke="#bfdbfe" strokeWidth="0.8" filter="url(#sd-soft)" />
                  <text x="177" y="64" className="text-[8px] fill-blue-700 font-bold" textAnchor="middle">{N_support.toFixed(0)}</text>
                </svg>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-slate-200/60 shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
              <div className="px-2 py-1 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                <h4 className="text-[10px] font-semibold text-slate-700">与简支梁对比</h4>
                <span className="text-[9px] font-mono text-amber-600">↓{reduction}%</span>
              </div>
              <div className="flex-1 min-h-0 p-0.5">
                <svg width="100%" height="100%" viewBox="0 0 200 100" preserveAspectRatio="xMidYMid meet" className="block">
                  <ArchBase showLoad={false} />
                  <path d={`M 25,75 Q 100,${75 + 2 * Math.min(25, (Mmax_beam / (q * L))* 4)} 175,75`} fill="url(#sd-m-fill)" stroke="#dc2626" strokeWidth="1.6" strokeLinejoin="round" filter="url(#sd-soft)" strokeDasharray="4" />
                  <text x="100" y="98" className="text-[9px] fill-red-600 font-bold" textAnchor="middle">梁: {Mmax_beam.toFixed(0)}</text>
                  <text x="100" y="42" className="text-[10px] fill-green-600 font-bold" textAnchor="middle">拱: M≈0</text>
                  <text x="100" y="55" className="text-[8px] fill-green-500" textAnchor="middle">↓ 减少{reduction}%</text>
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* 结果条 */}
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-100">
            <ResultCard label="竖向反力R" value={RA.toFixed(1)} unit="kN" color="blue" />
            <ResultCard label="水平推力H" value={H_thrust.toFixed(1)} unit="kN" color="red" aiHint={findHint(archHints, 'H')} />
            <ResultCard label="拱顶轴力" value={N_crown.toFixed(0)} unit="kN" color="purple" />
            <ResultCard label="拱脚轴力" value={N_support.toFixed(0)} unit="kN" color="purple" />
          </div>
        </div>
        <SolutionSteps steps={solveSteps} title="求解过程" />
      </div>

      <CollapsiblePanel title="AI助手" icon="🤖" side="right" storageKey="ai-panel-arch">
        <AITutor context={context} moduleTitle="静定拱"
          suggestedQuestions={['为什么拱能减小弯矩？', '什么是合理拱轴线？', '矢跨比如何影响推力？']} />
      </CollapsiblePanel>
    </div>
  );
};

// ==================== 组合结构 ====================
const CompositeStructure: React.FC = () => {
  const [P, setP] = useState(40);
  const [q, setQ] = useState(15);
  const [L, setL] = useState(12);
  const [H, setH] = useState(6);
  const { bubble, sync, ctx, milestone, dismissMilestone } = useAIEngine({ module: 'static', subModule: 'composite' });

  const R_beam = (q * L) / 2;
  const M_beam = (q * L * L) / 8;
  const M_col = P * H; // 柱底弯矩
  const V_col = P; // 柱剪力
  
  // 缩放比例
  const mScale = 35 / (Math.max(M_beam, M_col) || 1);
  const vScale = 25 / (Math.max(R_beam, V_col) || 1);

  useEffect(() => {
    sync({ P, q }, { R_beam, M_beam, M_col, V_col });
  }, [P, q, R_beam, M_beam, M_col, V_col, sync]);
  const context = ctx.toPromptString();

  const compositeHints = useMemo(() => getCompositeHints({ P, q, R_beam, M_beam, M_col }), [P, q, R_beam, M_beam, M_col]);

  const solveSteps = useMemo(() => [
    { title: '识别结构层次', result: '梁为附属部分，柱为基本部分', explanation: '铰接连接 → 梁独立于柱', aiWhy: '组合结构的关键是识别“附属部分”和“基本部分”。铰接处弯矩为零，梁只传递竖向力给柱，不传弯矩。' },
    { title: '先分析附属部分（梁）', equation: `R_梁 = qL/2 = ${q}×${L}/2`, result: `${R_beam.toFixed(2)} kN`, aiWhy: '先分析附属部分（梁），因为它可以独立求解。这是组合结构分析的标准顺序。' },
    { title: '梁跨中弯矩', equation: `M_梁 = qL²/8 = ${q}×${L}²/8`, result: `${M_beam.toFixed(1)} kN·m` },
    { title: '再分析基本部分（柱）', equation: `V_柱 = P = ${P}`, result: `${V_col.toFixed(1)} kN`, explanation: '柱承受水平力P', aiWhy: '柱作为基本部分，承受梁传来的竖向力 + 外部水平力P。铰接处不传递弯矩。' },
    { title: '柱底弯矩', equation: `M_柱 = P×H = ${P}×${H}`, result: `${M_col.toFixed(1)} kN·m`, explanation: '铰接处弯矩为零，柱底最大', aiWhy: '柱底弯矩 = P×柱高，类似悬臂梁。铰接处是弯矩零点，柱底是固定端，弯矩最大。' },
  ], [P, q, L, H, R_beam, M_beam, V_col, M_col]);

  // 组合结构基础组件 - 紧凑版
  const CompositeBase = ({ showLoad = true }: { showLoad?: boolean }) => (
    <>
      <StructuralDefs id="sd" />
      {/* 主体: 左柱、梁 (突出为附属部分, 蓝色色调)、右柱 */}
      <rect x="33.5" y="30" width="3" height="60" fill="url(#sd-member)" stroke="#0f172a" strokeWidth="0.3" />
      <rect x="35" y="28.5" width="110" height="3" fill="url(#sd-member)" stroke="#1e40af" strokeWidth="0.4" />
      <rect x="143.5" y="30" width="3" height="60" fill="url(#sd-member)" stroke="#0f172a" strokeWidth="0.3" />
      {/* 铰接点 (梁端铰, 附属部分标识) */}
      <StructuralNode cx={35} cy={30} r={2.8} />
      <StructuralNode cx={145} cy={30} r={2.8} />
      {/* 支座 (两端均为铰支座) */}
      <PinSupport cx={35} cy={91} size={6} defsId="sd" />
      <PinSupport cx={145} cy={91} size={6} defsId="sd" />
      {/* 荷载 */}
      {showLoad && (
        <>
          <PointLoadH xStart={12} xEnd={33} y={60} label={`P=${P}kN`} defsId="sd" />
          <DistributedLoadV x1={38} x2={142} yTop={10} yBase={26} count={9} label={`q=${q} kN/m`} defsId="sd" />
        </>
      )}
    </>
  );

  // 梁弯矩图路径（抛物线）
  const getBeamMomentPath = () => {
    let path = `M 35,30`;
    for (let i = 0; i <= 20; i++) {
      const xi = i / 20;
      const x = 35 + xi * 110;
      const M = (q * L * xi / 2) * (L - L * xi);
      path += ` L ${x},${30 + M * mScale}`;
    }
    path += ` L 145,30 Z`;
    return path;
  };

  return (
    <div className="flex flex-col lg:flex-row gap-3 min-h-full p-3">
      <CollapsiblePanel title="参数" icon="🔧" side="left" storageKey="param-panel-composite">
        <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-sm overflow-y-auto">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">🔧 参数设置</h4>
          <Slider label="水平力 P" value={P} min={20} max={80} unit="kN" onChange={setP} />
          <Slider label="均布荷载 q" value={q} min={8} max={25} unit="kN/m" onChange={setQ} />
          <Slider label="梁跨度 L" value={L} min={6} max={20} unit="m" onChange={setL} />
          <Slider label="柱高 H" value={H} min={3} max={10} unit="m" onChange={setH} />
        </div>
      </CollapsiblePanel>
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {milestone && <LearningMilestone milestone={milestone} onDismiss={dismissMilestone} />}
        <ProgressBar currentModule="组合结构" />
        <AIBubble message={bubble} />

        {/* 核心区域：结构图(左) + 内力图竖排(右)，固定总高可拖拽 */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-3 lg:h-[30rem] lg:min-h-48 lg:resize-y lg:overflow-hidden">
          {/* 左：结构示意图 */}
          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden flex flex-col h-full">
            <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <h3 className="text-xs font-bold text-slate-700">📐 组合结构</h3>
              <span className="text-[10px] text-slate-400">L={L}m · H={H}m</span>
            </div>
            <div className="flex-1 flex items-center justify-center p-3 min-h-0">
              <svg width="100%" viewBox="0 0 180 115" className="bg-gradient-to-b from-slate-50/60 to-white rounded-lg max-h-full">
                <CompositeBase showLoad={true} />
                <text x="90" y="112" className="text-[7px] fill-slate-500" textAnchor="middle">L={L}m, H={H}m</text>
              </svg>
            </div>
          </div>

          {/* 右：M / V 竖排 */}
          <div className="flex flex-col gap-1 h-full min-h-0">
            <div className="bg-white rounded-lg border border-slate-200/60 shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
              <div className="px-2 py-1 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                <h4 className="text-[10px] font-semibold text-slate-700">弯矩 M</h4>
                <span className="text-[9px] font-mono text-red-600">{M_beam.toFixed(0)} kN·m</span>
              </div>
              <div className="flex-1 min-h-0 p-0.5">
                <svg width="100%" height="100%" viewBox="0 0 180 115" preserveAspectRatio="xMidYMid meet" className="block">
                  <CompositeBase showLoad={false} />
                  <path d={`M 35,90 L ${35 - M_col * mScale},90 L 35,30`} 
                    fill="url(#sd-m-fill)" stroke="#dc2626" strokeWidth="1.6" strokeLinejoin="round" filter="url(#sd-soft)" />
                  <text x={35 - M_col * mScale - 3} y="95" className="text-[8px] fill-red-700 font-bold">{M_col.toFixed(0)}</text>
                  <path d={getBeamMomentPath()} fill="url(#sd-m-fill)" stroke="#dc2626" strokeWidth="1.6" strokeLinejoin="round" filter="url(#sd-soft)" />
                  <text x="90" y={35 + M_beam * mScale + 10} className="text-[8px] fill-red-700 font-bold" textAnchor="middle">{M_beam.toFixed(0)}</text>
                  <path d={`M 145,30 L 145,90 L ${145 + M_col * mScale},90`} 
                    fill="url(#sd-m-fill)" stroke="#dc2626" strokeWidth="1.6" strokeLinejoin="round" filter="url(#sd-soft)" />
                  <text x={145 + M_col * mScale + 3} y="95" className="text-[8px] fill-red-700 font-bold">{M_col.toFixed(0)}</text>
                  <text x="35" y="24" className="text-[7px] fill-slate-500">M=0</text>
                  <text x="145" y="24" className="text-[7px] fill-slate-500">M=0</text>
                </svg>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-slate-200/60 shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
              <div className="px-2 py-1 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                <h4 className="text-[10px] font-semibold text-slate-700">剪力 V</h4>
                <span className="text-[9px] font-mono text-green-600">{R_beam.toFixed(0)} kN</span>
              </div>
              <div className="flex-1 min-h-0 p-0.5">
                <svg width="100%" height="100%" viewBox="0 0 180 115" preserveAspectRatio="xMidYMid meet" className="block">
                  <CompositeBase showLoad={false} />
                  <path d={`M 35,90 L ${35 + V_col * vScale},90 L ${35 + V_col * vScale},30 L 35,30`} 
                    fill="url(#sd-v-fill)" stroke="#059669" strokeWidth="1.6" strokeLinejoin="round" filter="url(#sd-soft)" />
                  <text x={35 + V_col * vScale + 2} y="60" className="text-[8px] fill-green-700 font-bold">{V_col.toFixed(0)}</text>
                  <path d={`M 35,30 L 35,${30 - R_beam * vScale} L 145,${30 + R_beam * vScale} L 145,30`} 
                    fill="url(#sd-v-fill)" stroke="#059669" strokeWidth="1.6" strokeLinejoin="round" filter="url(#sd-soft)" />
                  <text x="42" y={26 - R_beam * vScale} className="text-[8px] fill-green-700 font-bold">{R_beam.toFixed(0)}</text>
                  <text x="132" y={35 + R_beam * vScale} className="text-[8px] fill-green-700 font-bold">{(-R_beam).toFixed(0)}</text>
                  <path d={`M 145,30 L ${145 - V_col * vScale},30 L ${145 - V_col * vScale},90 L 145,90`} 
                    fill="url(#sd-v-fill)" stroke="#059669" strokeWidth="1.6" strokeLinejoin="round" filter="url(#sd-soft)" />
                  <text x={145 - V_col * vScale - 12} y="60" className="text-[8px] fill-green-700 font-bold">{V_col.toFixed(0)}</text>
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* 结果条 */}
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-100">
            <ResultCard label="梁反力" value={R_beam.toFixed(1)} unit="kN" color="blue" />
            <ResultCard label="梁弯矩" value={M_beam.toFixed(0)} unit="kN·m" color="green" aiHint={findHint(compositeHints, 'M_梁')} />
            <ResultCard label="柱底弯矩" value={M_col.toFixed(0)} unit="kN·m" color="red" aiHint={findHint(compositeHints, 'M_柱')} />
            <ResultCard label="柱剪力" value={V_col.toFixed(0)} unit="kN" color="purple" />
          </div>
        </div>
        <SolutionSteps steps={solveSteps} title="求解过程" />
      </div>

      <CollapsiblePanel title="AI助手" icon="🤖" side="right" storageKey="ai-panel-composite">
        <AITutor context={context} moduleTitle="组合结构"
          suggestedQuestions={['什么是基本部分？', '分析顺序怎么确定？', '铰接处传递什么力？']} />
      </CollapsiblePanel>
    </div>
  );
};

// ==================== 主模块 ====================
interface StaticModuleProps {
  activeSubModule?: 'geometry' | 'beam' | 'frame' | 'truss' | 'arch' | 'composite';
}

const StaticModule: React.FC<StaticModuleProps> = ({ activeSubModule = 'geometry' }) => {
  const subModules = [
    { id: 'geometry' as const, component: GeometryAnalysis },
    { id: 'beam' as const, component: StaticBeam },
    { id: 'frame' as const, component: StaticFrame },
    { id: 'truss' as const, component: StaticTruss },
    { id: 'arch' as const, component: StaticArch },
    { id: 'composite' as const, component: CompositeStructure },
  ];

  const ActiveComponent = subModules.find(m => m.id === activeSubModule)?.component || GeometryAnalysis;

  return (
    <div className="h-full overflow-auto bg-slate-50">
      <ActiveComponent />
    </div>
  );
};

export default StaticModule;
