import React, { useState, useMemo, useEffect } from 'react';
import { Slider } from './Slider';
import { learningChartStyle } from './ui/learningChartPalette';
import { StructuralDefs } from './ui/StructuralSvg';
import AITutor from './AITutor';
import ResultCard from './ui/ResultCard';
import StaticBeam from './static/StaticBeam';
import StaticPlanar from './static/StaticPlanar';
import StaticTruss from './static/StaticTruss';
import SolutionSteps from './ui/SolutionSteps';
import CollapsiblePanel from './ui/CollapsiblePanel';
import AIBubble from './ui/AIBubble';
import LearningMilestone from './ui/LearningMilestone';
import { useAIEngine } from '../hooks/useAIEngine';
import GeometryTheory from './static/GeometryTheory';
import { geometryCountStatus } from '../utils/geometryTheory';


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
const GeometryAnalysis: React.FC = () => {
  const [mode, setMode] = useState<'rigid' | 'truss'>('rigid');
  const [rigidBodies, setRigidBodies] = useState(1);
  const [hinges, setHinges] = useState(0);
  const [constraints, setConstraints] = useState(3);
  const [joints, setJoints] = useState(3);
  const [members, setMembers] = useState(3);
  const [supportLinks, setSupportLinks] = useState(3);
  const [preset, setPreset] = useState<string>('custom');
  const { bubble, sync, ctx, milestone, dismissMilestone } = useAIEngine({ module: 'static', subModule: 'geometry' });

  const presets = [
    { id: 'custom', mode: 'rigid' as const, name: '自定义', m: 1, h: 0, r: 3 },
    { id: 'simple_beam', mode: 'rigid' as const, name: '简支梁', m: 1, h: 0, r: 3 },
    { id: 'cantilever', mode: 'rigid' as const, name: '悬臂梁', m: 1, h: 0, r: 3 },
    { id: 'three_hinged_arch', mode: 'rigid' as const, name: '三铰拱', m: 2, h: 1, r: 4 },
    { id: 'redundant_beam', mode: 'rigid' as const, name: '一次超静定梁', m: 1, h: 0, r: 4 },
    { id: 'triangle_truss', mode: 'truss' as const, name: '三角桁架', j: 3, b: 3, r: 3 },
    { id: 'square_truss', mode: 'truss' as const, name: '无斜杆四边形', j: 4, b: 4, r: 3 },
    { id: 'braced_truss', mode: 'truss' as const, name: '有斜杆四边形', j: 4, b: 5, r: 3 },
    { id: 'redundant_truss', mode: 'truss' as const, name: '多余杆桁架', j: 4, b: 6, r: 3 },
  ];

  const handlePreset = (id: string) => {
    setPreset(id);
    const p = presets.find(x => x.id === id);
    if (!p || id === 'custom') return;
    setMode(p.mode);
    if (p.mode === 'rigid') {
      setRigidBodies(p.m);
      setHinges(p.h);
      setConstraints(p.r);
    } else {
      setJoints(p.j);
      setMembers(p.b);
      setSupportLinks(p.r);
    }
  };

  const isRigidMode = mode === 'rigid';
  const W = isRigidMode
    ? 3 * rigidBodies - 2 * hinges - constraints
    : 2 * joints - members - supportLinks;

  const getStatus = () => {
    if (W > 0) return { text: '几何可变体系', short: '缺少约束', color: 'text-red-600', bg: 'bg-red-50 border-red-200', icon: '!' };
    if (W === 0) return { text: geometryCountStatus(W).label, short: '数量刚好', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', icon: '○' };
    return { text: geometryCountStatus(W).label, short: '有多余约束', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', icon: '+' };
  };

  const status = getStatus();
  const formula = isRigidMode ? 'W = 3m - 2h - r' : 'W = 2j - b - r';
  const substituted = isRigidMode
    ? `W = 3×${rigidBodies} - 2×${hinges} - ${constraints} = ${W}`
    : `W = 2×${joints} - ${members} - ${supportLinks} = ${W}`;
  const modeTitle = isRigidMode ? '刚片体系' : '铰接桁架体系';
  const modeDesc = isRigidMode
    ? '把梁、刚架杆段或组合刚片视为平面刚体，内部铰提供二元约束。'
    : '把节点视为铰结点，杆件只承受轴力，每根杆提供一个约束。';

  // Sync AI context
  useEffect(() => {
    sync(
      isRigidMode
        ? { mode, rigidBodies, hinges, constraints, preset }
        : { mode, joints, members, supportLinks, preset },
      { W, status: status.text, formula, assessmentScope: '仅数量初筛，未验证几何布置；W≤0不能单独判稳定；几何不变后才可由−W判断超静定次数' },
    );
  }, [isRigidMode, mode, rigidBodies, hinges, constraints, joints, members, supportLinks, preset, W, status.text, formula, sync]);

  const context = ctx.toPromptString();

  const solveSteps = useMemo(() => {
    if (isRigidMode) {
      return [
        { title: '选择分析对象', equation: modeTitle, explanation: '梁、刚架或刚片组合优先用刚片体系口径。不要把梁端点直接当作桁架节点套用。' },
        { title: '计算刚片自由度', equation: `3m = 3 × ${rigidBodies} = ${3 * rigidBodies}`, explanation: '平面内每个刚片有3个自由度：水平、竖向和转动。' },
        { title: '计算约束总数', equation: `2h + r = 2 × ${hinges} + ${constraints} = ${2 * hinges + constraints}`, explanation: '单铰限制两个相对平移；连接 k 个刚片的复铰计 k−1 个单铰。r 按外部标量约束数计：铰支座 2、滚动支座 1、固定端 3。' },
        { title: '代入公式', equation: substituted, result: `${W}` },
        { title: '判定结果', result: `${status.icon} ${status.text}`, explanation: geometryCountStatus(W).reason },
      ];
    }
    return [
      { title: '选择分析对象', equation: modeTitle, explanation: '铰接桁架按节点自由度计数，不使用刚片体系中的内部铰项。' },
      { title: '计算节点自由度', equation: `2j = 2 × ${joints} = ${2 * joints}`, explanation: '平面铰结点只有水平和竖向两个平动自由度。' },
      { title: '计算约束总数', equation: `b + r = ${members} + ${supportLinks} = ${members + supportLinks}`, explanation: '每根二力杆提供一个杆轴方向约束；支座链杆按单约束计数。' },
      { title: '代入公式', equation: substituted, result: `${W}` },
      { title: '判定结果', result: `${status.icon} ${status.text}`, explanation: geometryCountStatus(W).reason },
    ];
  }, [isRigidMode, modeTitle, rigidBodies, hinges, constraints, substituted, W, status, joints, members, supportLinks]);

  const ruleCards = [
    { cond: 'W > 0', label: '几何可变', desc: '缺少约束或杆件', active: W > 0, activeCls: 'bg-red-50 border-red-400', textCls: 'text-red-600' },
    { cond: 'W = 0', label: '数量刚好 ≠ 已静定', desc: '仍需检查约束是否独立', active: W === 0, activeCls: 'bg-emerald-50 border-emerald-400', textCls: 'text-emerald-600' },
    { cond: 'W < 0', label: '数量有余 ≠ 已稳定', desc: '确认几何不变后才是超静定', active: W < 0, activeCls: 'bg-blue-50 border-blue-400', textCls: 'text-blue-600' },
  ];

  const glossary = isRigidMode
    ? [
        { name: '刚片 m', desc: '可视为整体运动的刚体', count: '3自由度/个' },
        { name: '等效单铰 h', desc: '连接 k 个刚片的复铰折算为 k−1 个单铰', count: '2约束/单铰' },
        { name: '支座链杆 r', desc: '滚动支座或链杆等单约束', count: '1约束/根' },
        { name: '固定端', desc: '限制两个平动和一个转动', count: '3约束' },
      ]
    : [
        { name: '节点 j', desc: '铰接桁架的结点', count: '2自由度/个' },
        { name: '杆件 b', desc: '只承受轴力的二力杆', count: '1约束/根' },
        { name: '固定铰支座', desc: '限制水平和竖向平动', count: '2约束' },
        { name: '滚动支座', desc: '限制一个方向平动', count: '1约束' },
      ];


  return (
    <div className="learning-page" style={learningChartStyle as React.CSSProperties}>

      <CollapsiblePanel title="参数" icon="🔧" side="left" storageKey="param-panel-geometry">
        <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-sm overflow-y-auto">
          <h4 className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">参数设置</h4>
          <div className="grid grid-cols-2 gap-1.5 mb-3 rounded-lg bg-slate-100 p-1">
            {[
              { id: 'rigid' as const, label: '刚片体系' },
              { id: 'truss' as const, label: '桁架体系' },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => { setMode(item.id); setPreset('custom'); }}
                className={`px-2 py-1.5 text-[11px] font-semibold rounded-md transition-all ${
                  mode === item.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {presets.filter(p => p.id === 'custom' || p.mode === mode).map(p => (
              <button key={p.id} onClick={() => handlePreset(p.id)}
                className={`px-2 py-1 text-[10px] font-medium rounded-lg transition-all ${preset === p.id ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {p.name}
              </button>
            ))}
          </div>
          {isRigidMode ? (
            <>
              <Slider label="刚片数 m" value={rigidBodies} min={1} max={10} unit="" onChange={(v) => { setRigidBodies(v); setPreset('custom'); }} />
              <Slider label="等效单铰数 h" value={hinges} min={0} max={10} unit="" onChange={(v) => { setHinges(v); setPreset('custom'); }} />
              <Slider label="支座链杆数 r" value={constraints} min={0} max={12} unit="" onChange={(v) => { setConstraints(v); setPreset('custom'); }} />
            </>
          ) : (
            <>
              <Slider label="节点数 j" value={joints} min={2} max={14} unit="" onChange={(v) => { setJoints(v); setPreset('custom'); }} />
              <Slider label="杆件数 b" value={members} min={1} max={24} unit="" onChange={(v) => { setMembers(v); setPreset('custom'); }} />
              <Slider label="支座链杆数 r" value={supportLinks} min={0} max={12} unit="" onChange={(v) => { setSupportLinks(v); setPreset('custom'); }} />
            </>
          )}
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
            <div className="font-semibold text-slate-700">{modeTitle}</div>
            <div>{modeDesc}</div>
          </div>
        </div>
      </CollapsiblePanel>
      <div className="learning-analysis-area flex-1 flex flex-col gap-3 min-w-0">
        {milestone && <LearningMilestone milestone={milestone} onDismiss={dismissMilestone} />}

        {/* 上：公式 */}
        <div className="geometry-count-panel bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex flex-col gap-3">
            <h4 className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">计算公式</h4>
            <div className="rounded-lg p-4 text-center border border-slate-100 bg-slate-50 flex-1 flex flex-col justify-center">
              <div className="text-sm text-slate-500 mb-3">{modeTitle} · 计算自由度（数量初筛）</div>
              <div className="text-3xl font-serif mb-3 text-slate-800">{formula}</div>
              <div className="text-base text-slate-600">
                {substituted.replace(`= ${W}`, '= ')}<span className={`text-base font-semibold ${status.color}`}>{W}</span>
              </div>
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-3 text-xs text-slate-500">
                {isRigidMode ? (
                  <>
                    <span><strong className="text-slate-700">m</strong> = 刚片数</span>
                    <span><strong className="text-slate-700">h</strong> = 等效单铰数</span>
                    <span><strong className="text-slate-700">r</strong> = 支座链杆数</span>
                  </>
                ) : (
                  <>
                    <span><strong className="text-slate-700">j</strong> = 节点数</span>
                    <span><strong className="text-slate-700">b</strong> = 杆件数</span>
                    <span><strong className="text-slate-700">r</strong> = 支座链杆数</span>
                  </>
                )}
                <span><strong className="text-slate-700">W</strong> = 计算自由度</span>
              </div>
            </div>
            {/* 判定结果 */}
            <div className={`p-3 rounded-xl border ${status.bg} flex flex-wrap gap-2 items-center justify-between`}>
              <span className="text-base font-medium text-slate-600">数量初筛</span>
              <span className={`text-base font-semibold ${status.color}`}>{status.icon} {status.text}</span>
            </div>
        </div>

        {/* 中：判定规则 */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm">
          <h4 className="text-xs font-semibold text-slate-600 mb-3 flex items-center gap-1.5">判定规则</h4>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            {ruleCards.map(r => (
              <div key={r.cond} className={`p-4 rounded-xl text-center flex-1 border-2 transition-all duration-300 ${
                r.active ? r.activeCls : 'bg-slate-50 border-slate-200'
              }`}>
                <div className={`text-xl font-bold ${r.active ? r.textCls : 'text-slate-400'}`}>{r.cond}</div>
                <div className={`text-sm mt-1 ${r.active ? 'text-slate-700 font-semibold' : 'text-slate-400'}`}>{r.label}</div>
                <div className="text-xs text-slate-500 mt-1">{r.desc}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            <strong>注意：</strong>这里仅输入数量，没有节点坐标和连接关系，不能自动完成几何组成判定。W ≤ 0 仍须检查内部及外部约束；先确认几何不变，再区分静定与超静定。
          </div>
        </div>

        <GeometryTheory />

        {/* 下：求解过程 + 约束类型 */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_18rem] gap-3 lg:gap-4 items-start">
          <div className="flex-1">
            <SolutionSteps steps={solveSteps} title="求解过程" />
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/70 p-4 lg:p-5 shadow-sm w-full h-fit">
            <h4 className="text-xs font-semibold text-slate-600 mb-3">口径速查</h4>
            <div className="space-y-2">
              {glossary.map(c => (
                <div key={c.name} className="px-3 py-2 bg-slate-50 rounded-lg">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-700">{c.name}</span>
                    <span className="text-xs font-bold text-blue-600 whitespace-nowrap">{c.count}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{c.desc}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg border border-slate-200 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
              {isRigidMode
                ? '梁和刚架通常先看成刚片体系；只有明确为铰接杆系时才切换到桁架公式。'
                : '桁架公式默认杆件两端铰接、荷载作用在节点；刚接杆系不要用这个口径。'}
            </div>
          </div>
        </div>

      <AIBubble message={bubble} />
      </div>

      <CollapsiblePanel title="AI助手" icon="🤖" side="right" defaultOpen={false} storageKey="ai-panel-geometry">
        <AITutor context={context} moduleTitle="几何组成分析"
          suggestedQuestions={['什么是瞬变体系？', 'W=0一定稳定吗？', '如何增加约束？']} />
      </CollapsiblePanel>
    </div>
  );
};

const StaticFrame = () => <StaticPlanar kind="frame" />;
const StaticArch = () => <StaticPlanar kind="arch" />;
const CompositeStructure = () => <StaticPlanar kind="composite" />;

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
    <div key={activeSubModule} className="learning-module-scroll h-full overflow-auto bg-slate-50">
      <ActiveComponent />
    </div>
  );
};

export default StaticModule;
