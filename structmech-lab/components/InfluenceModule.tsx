import { EngineeringSupport } from './ui/EngineeringFigure';
import React, { useState, useMemo, useEffect } from 'react';
import { Slider } from './Slider';
import InfluenceWorkspace from './InfluenceWorkspace';
import { learningChartStyle, learningChartPalette as palette } from './ui/learningChartPalette';
import AITutor from './AITutor';
import ResultCard from './ui/ResultCard';
import SolutionSteps from './ui/SolutionSteps';
import CollapsiblePanel from './ui/CollapsiblePanel';
import AIBubble from './ui/AIBubble';
import LearningMilestone from './ui/LearningMilestone';
import { useAIEngine } from '../hooks/useAIEngine';
import { getILStaticHints, type ResultHint } from '../utils/resultHints';

const findHint = (hints: ResultHint[], label: string) => hints.find(h => h.label === label)?.hint;

// ==================== 静力法作影响线 ====================
const StaticMethod: React.FC = () => {
  const [L, setL] = useState(10);
  const [loadPos, setLoadPos] = useState(50);
  const [targetType, setTargetType] = useState<'RA' | 'RB' | 'Mc' | 'Qc'>('RA');
  const [sectionPos, setSectionPos] = useState(40);
  const { bubble, sync, ctx, milestone, dismissMilestone } = useAIEngine({ module: 'influence', subModule: 'static' });

  const x = (loadPos / 100) * L;
  const c = (sectionPos / 100) * L;

  const getRA = (pos: number) => 1 - pos / L;
  const getRB = (pos: number) => pos / L;
  const getMc = (pos: number) => pos <= c ? pos * (L - c) / L : c * (L - pos) / L;
  const getQc = (pos: number) => pos < c ? -pos / L : (L - pos) / L;

  const currentValue = (() => {
    switch (targetType) {
      case 'RA': return getRA(x);
      case 'RB': return getRB(x);
      case 'Mc': return getMc(x);
      case 'Qc': return getQc(x);
    }
  })();

  const maxValue = (() => {
    switch (targetType) {
      case 'RA': return 1;
      case 'RB': return 1;
      case 'Mc': return c * (L - c) / L;
      case 'Qc': return Math.max(c / L, (L - c) / L);
    }
  })();

  const generateILData = () => {
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i <= 50; i++) {
      const pos = (i / 50) * L;
      let y = 0;
      switch (targetType) {
        case 'RA': y = getRA(pos); break;
        case 'RB': y = getRB(pos); break;
        case 'Mc': y = getMc(pos); break;
        case 'Qc': y = getQc(pos); break;
      }
      points.push({ x: pos / L, y });
    }
    return points;
  };

  const ilData = generateILData();

  const getILConfig = () => {
    switch (targetType) {
      case 'RA': return { title: '支座反力 RA 影响线', color: palette.axial, unit: '', formula: 'y = 1 - x/L', desc: '荷载在A点时RA=1，在B点时RA=0' };
      case 'RB': return { title: '支座反力 RB 影响线', color: palette.axial, unit: '', formula: 'y = x/L', desc: '荷载在A点时RB=0，在B点时RB=1' };
      case 'Mc': return { title: `截面C弯矩影响线`, color: palette.moment, unit: 'm', formula: 'x<c: y=x(L-c)/L\nx≥c: y=c(L-x)/L', desc: '三角形，最大值在C点' };
      case 'Qc': return { title: `截面C剪力影响线`, color: palette.shear, unit: '', formula: 'x<c: y=-x/L\nx≥c: y=(L-x)/L', desc: '在C点有突变' };
    }
  };

  const ilConfig = getILConfig();
  useEffect(() => {
    sync(
      { L, loadPos, targetType, sectionPos },
      { currentValue, maxValue },
    );
  }, [L, loadPos, targetType, sectionPos, currentValue, maxValue, sync]);
  const context = ctx.toPromptString();

  const ilStaticHints = useMemo(() => getILStaticHints({ targetType, currentValue, maxValue, L }), [targetType, currentValue, maxValue, L]);

  const solveSteps = useMemo(() => {
    const steps: { title: string; equation?: string; result?: string; explanation?: string; aiWhy?: string }[] = [];
    steps.push({ title: '放置单位荷载 P=1', equation: `x = ${x.toFixed(2)} m (${loadPos}%L)`, result: '荷载位置确定', aiWhy: '影响线的定义：单位荷载 P=1 沿梁移动时，某个量的变化规律。每个位置对应一个影响线纵标。' });
    if (targetType === 'RA') {
      steps.push({ title: 'ΣMB=0 → RA', equation: `RA×L = 1×(L−x) → RA = 1−x/L`, result: `${currentValue.toFixed(4)}`, explanation: '线性递减：A处为1，B处为0' });
    } else if (targetType === 'RB') {
      steps.push({ title: 'ΣMA=0 → RB', equation: `RB×L = 1×x → RB = x/L`, result: `${currentValue.toFixed(4)}`, explanation: '线性递增：A处为0，B处为1' });
    } else if (targetType === 'Mc') {
      steps.push({ title: '截面C位置', equation: `c = ${c.toFixed(2)} m (${sectionPos}%L)`, result: `c(L−c)/L = ${maxValue.toFixed(4)} m` });
      if (x <= c) {
        steps.push({ title: 'x ≤ c: 荷载在C左侧', equation: `Mc = x(L−c)/L = ${x.toFixed(2)}×${(L-c).toFixed(2)}/${L}`, result: `${currentValue.toFixed(4)} m` });
      } else {
        steps.push({ title: 'x > c: 荷载在C右侧', equation: `Mc = c(L−x)/L = ${c.toFixed(2)}×${(L-x).toFixed(2)}/${L}`, result: `${currentValue.toFixed(4)} m` });
      }
    } else {
      steps.push({ title: '截面C位置', equation: `c = ${c.toFixed(2)} m`, result: `在C处有突变` });
      if (x < c) {
        steps.push({ title: 'x < c: 荷载在C左侧', equation: `Qc = −x/L`, result: `${currentValue.toFixed(4)}`, explanation: '负值区' });
      } else {
        steps.push({ title: 'x ≥ c: 荷载在C右侧', equation: `Qc = (L−x)/L`, result: `${currentValue.toFixed(4)}`, explanation: '正值区' });
      }
    }
    steps.push({ title: '影响线最大纵标', result: `${maxValue.toFixed(4)} ${ilConfig.unit}` });
    return steps;
  }, [targetType, L, x, c, loadPos, sectionPos, currentValue, maxValue, ilConfig.unit]);

  const BeamBase = () => (
    <>
      <line x1="30" y1="40" x2="270" y2="40" stroke={palette.ink} strokeWidth="4" />
      <EngineeringSupport x={30} y={40}/><EngineeringSupport x={270} y={40} roller/>
      <text x="30" y="70" className="text-[10px] chart-label-ink font-bold" textAnchor="middle">A</text>
      <text x="270" y="70" className="text-[10px] chart-label-ink font-bold" textAnchor="middle">B</text>
    </>
  );

  const renderInfluenceLine = () => {
    const width = 340, height = 130;
    const margin = { left: 35, right: 25, top: 25, bottom: 35 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const baseY = margin.top + plotH / 2;
    const scale = maxValue > 0 ? (plotH / 2 - 5) / maxValue : 1;

    let pathD = '';
    let areaD = `M ${margin.left} ${baseY}`;

    ilData.forEach((p, i) => {
      const px = margin.left + p.x * plotW;
      const py = baseY - p.y * scale;
      if (i === 0) { pathD = `M ${px} ${py}`; areaD += ` L ${px} ${py}`; }
      else { pathD += ` L ${px} ${py}`; areaD += ` L ${px} ${py}`; }
    });
    areaD += ` L ${margin.left + plotW} ${baseY} Z`;

    const loadPx = margin.left + (loadPos / 100) * plotW;
    const loadPy = baseY - currentValue * scale;
    const sectionPx = margin.left + (sectionPos / 100) * plotW;

    return (
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="bg-gradient-to-b from-slate-50 to-white rounded-lg">
        <line x1={margin.left} y1={baseY} x2={margin.left + plotW} y2={baseY} stroke={palette.axis} strokeWidth="1" />
        <path d={areaD} fill={ilConfig.color} fillOpacity="0.16" />
        <path d={pathD} fill="none" stroke={ilConfig.color} strokeWidth="2.5" />
        {(targetType === 'Mc' || targetType === 'Qc') && (
          <line x1={sectionPx} y1={margin.top} x2={sectionPx} y2={margin.top + plotH} stroke={palette.section} strokeWidth="1.5" strokeDasharray="4" />
        )}
        <circle cx={loadPx} cy={loadPy} r="6" fill={ilConfig.color} stroke="white" strokeWidth="2" />
        <line x1={loadPx} y1={baseY} x2={loadPx} y2={loadPy} stroke={ilConfig.color} strokeWidth="1" strokeDasharray="3" />
        <text x={loadPx} y={loadPy - 12} className="text-[11px] font-bold" fill={ilConfig.color} textAnchor="middle">{currentValue.toFixed(3)}</text>
        <text x={margin.left} y={height - 8} className="text-[9px] chart-label-muted">0</text>
        <text x={margin.left + plotW} y={height - 8} className="text-[9px] chart-label-muted" textAnchor="end">L={L}m</text>
        {(targetType === 'Mc' || targetType === 'Qc') && (
          <text x={sectionPx} y={height - 8} className="text-[9px] chart-label-section font-bold" textAnchor="middle">C</text>
        )}
      </svg>
    );
  };

  return (
    <div className="learning-page" style={learningChartStyle as React.CSSProperties}>

      <CollapsiblePanel title="参数" icon="🔧" side="left" storageKey="param-panel-il-static">
        <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-sm overflow-y-auto">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">参数设置</h4>
          <Slider label="梁跨度 L" value={L} min={6} max={20} unit="m" onChange={setL} />
          <Slider label="单位荷载位置 x" value={loadPos} min={0} max={100} unit="%" onChange={setLoadPos} />
          <div className="mt-4 mb-3">
            <label className="text-sm font-semibold text-slate-700 mb-2 block">目标量值</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'RA' as const, name: 'RA (左反力)' },
                { id: 'RB' as const, name: 'RB (右反力)' },
                { id: 'Mc' as const, name: 'Mc (弯矩)' },
                { id: 'Qc' as const, name: 'Qc (剪力)' },
              ].map(t => (
                <button key={t.id} onClick={() => setTargetType(t.id)}
                  className={`py-2 px-3 text-xs font-medium rounded-lg transition-all ${targetType === t.id ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 hover:bg-slate-200'}`}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
          {(targetType === 'Mc' || targetType === 'Qc') && (
            <Slider label="截面C位置" value={sectionPos} min={10} max={90} unit="%" onChange={setSectionPos} />
          )}
        </div>
      </CollapsiblePanel>
      <div className="learning-analysis-area flex-1 flex flex-col gap-3 min-w-0">
        {milestone && <LearningMilestone milestone={milestone} onDismiss={dismissMilestone} />}

        {/* 结构与分析图采用统一卡片网格 */}
        <div className="learning-diagram-grid learning-diagrams-2">
          <div data-chart-tone="load" className="learning-chart-card learning-structure-card bg-white border border-slate-200/60 overflow-hidden flex flex-col">
            <div className="learning-card-header px-3 py-1.5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <h3 className="text-xs font-bold text-slate-700">结构示意 (P=1)</h3>
              <span className="text-[10px] text-slate-400">L={L}m · x={x.toFixed(1)}m</span>
            </div>
            <div className="learning-card-plot flex-1 flex items-center justify-center p-3 min-h-0">
              <svg width="100%" viewBox="0 0 300 80" className="bg-gradient-to-b from-slate-50/60 to-white rounded-lg max-h-full">
                <BeamBase />
                {(() => {
                  const px = 30 + (loadPos / 100) * 240;
                  return (
                    <>
                      <line x1={px} y1="10" x2={px} y2="35" stroke={palette.load} strokeWidth="2" />
                      <polygon points={`${px-4},32 ${px+4},32 ${px},40`} fill={palette.load} />
                      <text x={px} y="8" className="text-[10px] chart-label-load font-bold" textAnchor="middle">P=1</text>
                    </>
                  );
                })()}
                {(targetType === 'Mc' || targetType === 'Qc') && (
                  <>
                    <line x1={30 + (sectionPos / 100) * 240} y1="35" x2={30 + (sectionPos / 100) * 240} y2="55" stroke={palette.section} strokeWidth="2" strokeDasharray="3" />
                    <text x={30 + (sectionPos / 100) * 240} y="65" className="text-[10px] chart-label-section font-bold" textAnchor="middle">C</text>
                  </>
                )}
              </svg>
            </div>
            <div className="px-3 py-2 border-t border-slate-100 text-[10px] font-mono text-slate-600 whitespace-pre-line flex-shrink-0">{ilConfig.formula}</div>
          </div>
          <div data-chart-tone={targetType === 'Mc' ? 'moment' : targetType === 'Qc' ? 'shear' : 'axial'} className="learning-chart-card bg-white border border-slate-200/60 overflow-hidden flex flex-col">
            <div className="learning-card-header px-3 py-1.5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <h4 className="text-xs font-bold text-slate-700">{ilConfig.title}</h4>
              <span className="text-[10px] font-mono" style={{ color: ilConfig.color }}>{currentValue.toFixed(3)}</span>
            </div>
            <div className="learning-card-plot flex-1 flex items-center justify-center p-2 min-h-0">
              {renderInfluenceLine()}
            </div>
          </div>
        </div>

        {/* 结果条 */}
        <div className="learning-metrics-grid learning-metrics-4">
            <ResultCard label="荷载位置 x" value={x.toFixed(2)} unit="m" color="purple" />
            <ResultCard label={targetType} value={currentValue.toFixed(4)} unit={ilConfig.unit} color="blue" aiHint={findHint(ilStaticHints, targetType)} />
            <ResultCard label="最大纵标" value={maxValue.toFixed(4)} unit={ilConfig.unit} color="red" aiHint={findHint(ilStaticHints, '最大纵标')} />
            {(targetType === 'Mc' || targetType === 'Qc') ? (
              <ResultCard label="截面C位置" value={c.toFixed(2)} unit="m" color="orange" />
            ) : (
              <ResultCard label={ilConfig.desc} value="-" unit="" color="green" />
            )}
          </div>
        <AIBubble message={bubble} />
        <SolutionSteps steps={solveSteps} title="求解过程" />
      </div>

      <CollapsiblePanel title="AI助手" icon="🤖" side="right" defaultOpen={false} storageKey="ai-panel-il-static">
        <AITutor context={context} moduleTitle="静力法作影响线"
          suggestedQuestions={['静力法的基本步骤？', '影响线和内力图有什么区别？', '为什么剪力影响线有突变？']} />
      </CollapsiblePanel>
    </div>
  );
};

// ==================== 机动法作影响线 ====================
const KinematicMethod: React.FC = () => {
  const [L, setL] = useState(10);
  const [targetType, setTargetType] = useState<'RA' | 'RB' | 'Mc' | 'Qc'>('RA');
  const [sectionPos, setSectionPos] = useState(40);
  const [showDisplacement, setShowDisplacement] = useState(true);
  const { bubble, sync, ctx, milestone, dismissMilestone } = useAIEngine({ module: 'influence', subModule: 'kinematic' });

  const c = (sectionPos / 100) * L;

  const getILConfig = () => {
    switch (targetType) {
      case 'RA': return { 
        title: '支座反力 RA 影响线 (机动法)', 
        color: palette.axial,
        principle: '去掉A支座约束，沿RA方向给单位位移δ=1',
        displacement: '梁绕B点转动，A点位移为1'
      };
      case 'RB': return { 
        title: '支座反力 RB 影响线 (机动法)', 
        color: palette.axial,
        principle: '去掉B支座约束，沿RB方向给单位位移δ=1',
        displacement: '梁绕A点转动，B点位移为1'
      };
      case 'Mc': return { 
        title: `截面C弯矩影响线 (机动法)`, 
        color: palette.moment,
        principle: '在C处加铰，使两侧产生相对转角θ=1',
        displacement: '形成折线，C点处有尖角'
      };
      case 'Qc': return { 
        title: `截面C剪力影响线 (机动法)`, 
        color: palette.shear,
        principle: '在C处切开，使两侧产生相对竖向位移δ=1',
        displacement: '两侧平行移动，C点处有突变'
      };
    }
  };

  const ilConfig = getILConfig();
  useEffect(() => {
    sync({ L, targetType, sectionPos, showDisplacement }, { targetType });
  }, [L, targetType, sectionPos, showDisplacement, sync]);
  const context = ctx.toPromptString();

  const solveSteps = useMemo(() => {
    const steps: { title: string; equation?: string; result?: string; explanation?: string; aiWhy?: string }[] = [];
    steps.push({ title: '① 去掉约束', result: ilConfig.principle, aiWhy: '机动法的核心思路：去掉你要求的那个约束（反力→去支座，弯矩→加铰，剪力→切开），让结构变成机构。' });
    steps.push({ title: '② 施加单位位移', equation: 'δ = 1', result: '沿约束方向给单位广义位移', aiWhy: '给单位位移而非单位力——这是虚功原理的要求。由 P·y = Z·δ，当δ=1时，y就直接等于影响线纵标。' });
    if (targetType === 'RA') {
      steps.push({ title: '③ 画位移图', equation: '梁绕B转动，A点位移=1', result: '线性递减三角形', explanation: '任意点x处位移 y = 1−x/L', aiWhy: '去掉A支座后梁只剩B支撑，绕B转动。A点给位移1，其他点按线性比例分配。' });
    } else if (targetType === 'RB') {
      steps.push({ title: '③ 画位移图', equation: '梁绕A转动，B点位移=1', result: '线性递增三角形', explanation: '任意点x处位移 y = x/L', aiWhy: '去掉B支座后梁绕A转动。B点给位移1，越靠近B位移越大。' });
    } else if (targetType === 'Mc') {
      const maxMc = c * (L - c) / L;
      steps.push({ title: '③ 画位移图', equation: 'C处加铰，相对转角θ=1', result: `折线形，峰值=${maxMc.toFixed(3)} m`, explanation: `在C处(${c.toFixed(1)}m)有尖角`, aiWhy: '加铰后两段分别绕端部支座转动，C点产生相对转角θ=1。最大纵标 = c(L-c)/L，与静力法结果一致。' });
    } else {
      steps.push({ title: '③ 画位移图', equation: 'C处切开，相对位移δ=1', result: '两侧平行线段，C处突变', explanation: `左侧: −c/L = ${(-c/L).toFixed(3)}, 右侧: (L−c)/L = ${((L-c)/L).toFixed(3)}`, aiWhy: '切开后两段各自竖向平移，保持平行（角度不变）。C处有正负突变，对应剪力影响线的特征。' });
    }
    steps.push({ title: '④ 位移图即影响线', result: '虚功原理：P·y = Z·δ → y = IL纵标', explanation: '无需列方程，直接由几何关系得到', aiWhy: '这就是机动法的精髓——不用解方程！位移图的形状自动就是影响线。对于复杂结构（连续梁等），这比静力法简便得多。' });
    return steps;
  }, [targetType, L, c, ilConfig.principle]);

  // 绘制机动法位移图
  const renderDisplacementDiagram = () => {
    const width = 340, height = 140;
    const margin = { left: 35, right: 25, top: 30, bottom: 35 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const baseY = margin.top + plotH * 0.6;
    const scale = 30;

    const cPx = margin.left + (sectionPos / 100) * plotW;

    let displacementPath = '';
    let ilPath = '';

    switch (targetType) {
      case 'RA':
        // 绕B点转动，A点位移为1
        displacementPath = `M ${margin.left} ${baseY - scale} L ${margin.left + plotW} ${baseY}`;
        ilPath = `M ${margin.left} ${baseY - scale} L ${margin.left + plotW} ${baseY}`;
        break;
      case 'RB':
        // 绕A点转动，B点位移为1
        displacementPath = `M ${margin.left} ${baseY} L ${margin.left + plotW} ${baseY - scale}`;
        ilPath = `M ${margin.left} ${baseY} L ${margin.left + plotW} ${baseY - scale}`;
        break;
      case 'Mc':
        // C处加铰，形成折线
        const maxMc = c * (L - c) / L;
        const mcScale = scale / maxMc * 0.8;
        displacementPath = `M ${margin.left} ${baseY} L ${cPx} ${baseY - maxMc * mcScale} L ${margin.left + plotW} ${baseY}`;
        ilPath = displacementPath;
        break;
      case 'Qc':
        // C处切开，两侧平行
        const leftEnd = -c / L;
        const rightStart = (L - c) / L;
        displacementPath = `M ${margin.left} ${baseY} L ${cPx} ${baseY - leftEnd * scale} M ${cPx} ${baseY - rightStart * scale} L ${margin.left + plotW} ${baseY}`;
        ilPath = `M ${margin.left} ${baseY} L ${cPx - 1} ${baseY + c/L * scale} M ${cPx + 1} ${baseY - (L-c)/L * scale} L ${margin.left + plotW} ${baseY}`;
        break;
    }

    return (
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="bg-gradient-to-b from-slate-50 to-white rounded-lg">
        {/* 原始位置 */}
        <line x1={margin.left} y1={baseY} x2={margin.left + plotW} y2={baseY} stroke={palette.axis} strokeWidth="2" strokeDasharray="4" />
        {/* 位移后位置 / 影响线 */}
        <path d={showDisplacement ? displacementPath : ilPath} fill="none" stroke={ilConfig.color} strokeWidth="3" />
        {/* 支座标记 */}
        <EngineeringSupport x={margin.left} y={baseY}/><EngineeringSupport x={margin.left+plotW} y={baseY} roller/>
        {/* 截面C标记 */}
        {(targetType === 'Mc' || targetType === 'Qc') && (
          <>
            <line x1={cPx} y1={margin.top} x2={cPx} y2={baseY + 20} stroke={palette.section} strokeWidth="1.5" strokeDasharray="4" />
            <text x={cPx} y={height - 5} className="text-[10px] chart-label-section font-bold" textAnchor="middle">C</text>
          </>
        )}
        {/* 标注 */}
        <text x={margin.left} y={height - 5} className="text-[9px] chart-label-muted">A</text>
        <text x={margin.left + plotW} y={height - 5} className="text-[9px] chart-label-muted" textAnchor="end">B</text>
        {/* 位移标注 */}
        {targetType === 'RA' && (
          <>
            <line x1={margin.left} y1={baseY} x2={margin.left} y2={baseY - scale} stroke={palette.load} strokeWidth="1" markerEnd="url(#arrow)" />
            <text x={margin.left - 5} y={baseY - scale/2} className="text-[9px] chart-label-load font-bold">δ=1</text>
          </>
        )}
        {targetType === 'RB' && (
          <>
            <line x1={margin.left + plotW} y1={baseY} x2={margin.left + plotW} y2={baseY - scale} stroke={palette.load} strokeWidth="1" />
            <text x={margin.left + plotW + 5} y={baseY - scale/2} className="text-[9px] chart-label-load font-bold">δ=1</text>
          </>
        )}
        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill={palette.load} />
          </marker>
        </defs>
      </svg>
    );
  };

  return (
    <div className="learning-page" style={learningChartStyle as React.CSSProperties}>

      <CollapsiblePanel title="参数" icon="🔧" side="left" storageKey="param-panel-il-kinematic">
        <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-sm overflow-y-auto">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">参数设置</h4>
          <Slider label="梁跨度 L" value={L} min={6} max={20} unit="m" onChange={setL} />
          <div className="mt-3 mb-2">
            <label className="text-xs font-semibold text-slate-600 mb-2 block">目标量值</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'RA' as const, name: 'RA (左反力)' },
                { id: 'RB' as const, name: 'RB (右反力)' },
                { id: 'Mc' as const, name: 'Mc (弯矩)' },
                { id: 'Qc' as const, name: 'Qc (剪力)' },
              ].map(t => (
                <button key={t.id} onClick={() => setTargetType(t.id)}
                  className={`py-2 px-3 text-xs font-medium rounded-lg transition-all ${targetType === t.id ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 hover:bg-slate-200'}`}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
          {(targetType === 'Mc' || targetType === 'Qc') && (
            <Slider label="截面C位置" value={sectionPos} min={10} max={90} unit="%" onChange={setSectionPos} />
          )}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showDisplacement} onChange={(e) => setShowDisplacement(e.target.checked)} 
                className="w-4 h-4 rounded border-slate-300" />
              <span className="text-sm text-slate-700">显示位移图</span>
            </label>
          </div>
        </div>
      </CollapsiblePanel>
      <div className="learning-analysis-area flex-1 flex flex-col gap-3 min-w-0">
        {milestone && <LearningMilestone milestone={milestone} onDismiss={dismissMilestone} />}

        {/* 结构与分析图采用统一卡片网格 */}
        <div className="learning-explanation-grid">
          {/* 左：机动法原理图 */}
          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden flex flex-col h-full">
            <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <h3 className="text-xs font-bold text-slate-700">机动法原理图</h3>
              <span className="text-[10px] text-slate-400">L={L}m</span>
            </div>
            <div className="flex-1 flex items-center justify-center p-2 min-h-0">
              {renderDisplacementDiagram()}
            </div>
            <div className="px-3 py-1.5 border-t border-slate-100 text-center text-[11px] text-slate-600 flex-shrink-0">{ilConfig.displacement}</div>
          </div>

          {/* 右：虚功原理 + 说明 */}
          <div className="flex flex-col gap-2 h-full min-h-0">
            <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden flex flex-col flex-1">
              <div className="px-3 py-1.5 border-b border-slate-100 flex-shrink-0">
                <h4 className="text-xs font-bold text-slate-700">虚功原理</h4>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center p-4 gap-3 min-h-0">
                <div className="bg-gradient-to-br from-green-50 to-white rounded-xl px-6 py-3 border border-green-100 text-center">
                  <div className="text-xl font-mono text-slate-800 font-bold">P·y = Z·δ</div>
                </div>
                <div className="text-xs text-slate-600 text-center leading-relaxed">{ilConfig.principle}</div>
                <div className="text-[10px] text-slate-500 text-center">{ilConfig.displacement}</div>
              </div>
            </div>
          </div>
        </div>

        <AIBubble message={bubble} />
        <SolutionSteps steps={solveSteps} title="机动法求解过程" />
      </div>

      <CollapsiblePanel title="AI助手" icon="🤖" side="right" defaultOpen={false} storageKey="ai-panel-il-kinematic">
        <AITutor context={context} moduleTitle="机动法作影响线"
          suggestedQuestions={['机动法的原理是什么？', '为什么位移图就是影响线？', '机动法和静力法哪个更方便？']} />
      </CollapsiblePanel>
    </div>
  );
};

const EnvelopeDiagram = () => <InfluenceWorkspace mode="envelope" />;
const InfluenceApplication = () => <InfluenceWorkspace mode="application" />;

interface InfluenceModuleProps {
  activeSubModule?: 'static' | 'kinematic' | 'envelope' | 'application';
}

const InfluenceModule: React.FC<InfluenceModuleProps> = ({ activeSubModule = 'static' }) => {
  const subModules = [
    { id: 'static' as const, component: StaticMethod },
    { id: 'kinematic' as const, component: KinematicMethod },
    { id: 'envelope' as const, component: EnvelopeDiagram },
    { id: 'application' as const, component: InfluenceApplication },
  ];

  const ActiveComponent = subModules.find(m => m.id === activeSubModule)?.component || StaticMethod;

  return (
    <div key={activeSubModule} className="learning-module-scroll h-full overflow-auto bg-slate-50">
      <ActiveComponent />
    </div>
  );
};

export default InfluenceModule;
