import React, { useState, useMemo, useEffect } from 'react';
import { Slider } from './Slider';
import AITutor from './AITutor';
import ResultCard from './ui/ResultCard';
import SolutionSteps from './ui/SolutionSteps';
import CollapsiblePanel from './ui/CollapsiblePanel';
import AIBubble from './ui/AIBubble';
import LearningMilestone from './ui/LearningMilestone';
import ProgressBar from './ui/ProgressBar';
import { useAIEngine } from '../hooks/useAIEngine';
import { getILStaticHints, getEnvelopeHints, getApplicationHints, type ResultHint } from '../utils/resultHints';

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
      case 'RA': return { title: '支座反力 RA 影响线', color: '#3b82f6', unit: '', formula: 'y = 1 - x/L', desc: '荷载在A点时RA=1，在B点时RA=0' };
      case 'RB': return { title: '支座反力 RB 影响线', color: '#3b82f6', unit: '', formula: 'y = x/L', desc: '荷载在A点时RB=0，在B点时RB=1' };
      case 'Mc': return { title: `截面C弯矩影响线`, color: '#ef4444', unit: 'm', formula: 'x<c: y=x(L-c)/L\nx≥c: y=c(L-x)/L', desc: '三角形，最大值在C点' };
      case 'Qc': return { title: `截面C剪力影响线`, color: '#10b981', unit: '', formula: 'x<c: y=-x/L\nx≥c: y=(L-x)/L', desc: '在C点有突变' };
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
      <line x1="30" y1="40" x2="270" y2="40" stroke="#334155" strokeWidth="4" />
      <polygon points="30,44 22,58 38,58" fill="#94a3b8" />
      <circle cx="270" cy="50" r="5" fill="#94a3b8" />
      <line x1="260" y1="58" x2="280" y2="58" stroke="#94a3b8" strokeWidth="2" />
      <text x="30" y="70" className="text-[10px] fill-slate-600 font-bold" textAnchor="middle">A</text>
      <text x="270" y="70" className="text-[10px] fill-slate-600 font-bold" textAnchor="middle">B</text>
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
        <line x1={margin.left} y1={baseY} x2={margin.left + plotW} y2={baseY} stroke="#cbd5e1" strokeWidth="1" />
        <path d={areaD} fill={ilConfig.color} fillOpacity="0.15" />
        <path d={pathD} fill="none" stroke={ilConfig.color} strokeWidth="2.5" />
        {(targetType === 'Mc' || targetType === 'Qc') && (
          <line x1={sectionPx} y1={margin.top} x2={sectionPx} y2={margin.top + plotH} stroke="#f97316" strokeWidth="1.5" strokeDasharray="4" />
        )}
        <circle cx={loadPx} cy={loadPy} r="6" fill={ilConfig.color} stroke="white" strokeWidth="2" />
        <line x1={loadPx} y1={baseY} x2={loadPx} y2={loadPy} stroke={ilConfig.color} strokeWidth="1" strokeDasharray="3" />
        <text x={loadPx} y={loadPy - 12} className="text-[11px] font-bold" fill={ilConfig.color} textAnchor="middle">{currentValue.toFixed(3)}</text>
        <text x={margin.left} y={height - 8} className="text-[9px] fill-slate-500">0</text>
        <text x={margin.left + plotW} y={height - 8} className="text-[9px] fill-slate-500" textAnchor="end">L={L}m</text>
        {(targetType === 'Mc' || targetType === 'Qc') && (
          <text x={sectionPx} y={height - 8} className="text-[9px] fill-orange-600 font-bold" textAnchor="middle">C</text>
        )}
      </svg>
    );
  };

  return (
    <div className="flex flex-col lg:flex-row gap-3 lg:gap-4 min-h-full p-3 lg:p-4">
      <CollapsiblePanel title="参数" icon="🔧" side="left" storageKey="param-panel-il-static">
        <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-sm overflow-y-auto">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">🔧 参数设置</h4>
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
      <div className="flex-1 flex flex-col gap-2 lg:gap-3 min-w-0">
        {milestone && <LearningMilestone milestone={milestone} onDismiss={dismissMilestone} />}
        <ProgressBar currentModule="静力法" />
        <AIBubble message={bubble} />
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex flex-col">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">📐 结构示意 (P=1)</h4>
          <div className="flex-1 flex items-center justify-center">
            <svg width="100%" viewBox="0 0 300 80" className="bg-gradient-to-b from-slate-50 to-white rounded-xl">
              <BeamBase />
              {(() => {
                const px = 30 + (loadPos / 100) * 240;
                return (
                  <>
                    <line x1={px} y1="10" x2={px} y2="35" stroke="#ef4444" strokeWidth="2" />
                    <polygon points={`${px-4},32 ${px+4},32 ${px},40`} fill="#ef4444" />
                    <text x={px} y="8" className="text-[10px] fill-red-600 font-bold" textAnchor="middle">P=1</text>
                  </>
                );
              })()}
              {(targetType === 'Mc' || targetType === 'Qc') && (
                <>
                  <line x1={30 + (sectionPos / 100) * 240} y1="35" x2={30 + (sectionPos / 100) * 240} y2="55" stroke="#f97316" strokeWidth="2" strokeDasharray="3" />
                  <text x={30 + (sectionPos / 100) * 240} y="65" className="text-[10px] fill-orange-600 font-bold" textAnchor="middle">C</text>
                </>
              )}
            </svg>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex flex-col">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">{ilConfig.title}</h4>
          <div className="flex-1 flex items-center justify-center">{renderInfluenceLine()}</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">Σ 计算结果</h4>
          <div className="flex flex-wrap gap-2 md:gap-3">
            <ResultCard label="荷载位置 x" value={x.toFixed(2)} unit="m" color="purple" />
            <ResultCard label={targetType} value={currentValue.toFixed(4)} unit={ilConfig.unit} color="blue" aiHint={findHint(ilStaticHints, targetType)} />
            <ResultCard label="最大纵标" value={maxValue.toFixed(4)} unit={ilConfig.unit} color="red" aiHint={findHint(ilStaticHints, '最大纵标')} />
            {(targetType === 'Mc' || targetType === 'Qc') && (
              <ResultCard label="截面C位置" value={c.toFixed(2)} unit="m" color="orange" />
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-sm font-mono text-slate-700 whitespace-pre-line">{ilConfig.formula}</div>
        </div>
        <SolutionSteps steps={solveSteps} title="求解过程" />
      </div>

      <CollapsiblePanel title="AI助手" icon="🤖" side="right" storageKey="ai-panel-il-static">
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
        color: '#3b82f6',
        principle: '去掉A支座约束，沿RA方向给单位位移δ=1',
        displacement: '梁绕B点转动，A点位移为1'
      };
      case 'RB': return { 
        title: '支座反力 RB 影响线 (机动法)', 
        color: '#3b82f6',
        principle: '去掉B支座约束，沿RB方向给单位位移δ=1',
        displacement: '梁绕A点转动，B点位移为1'
      };
      case 'Mc': return { 
        title: `截面C弯矩影响线 (机动法)`, 
        color: '#ef4444',
        principle: '在C处加铰，使两侧产生相对转角θ=1',
        displacement: '形成折线，C点处有尖角'
      };
      case 'Qc': return { 
        title: `截面C剪力影响线 (机动法)`, 
        color: '#10b981',
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
        <line x1={margin.left} y1={baseY} x2={margin.left + plotW} y2={baseY} stroke="#cbd5e1" strokeWidth="2" strokeDasharray="4" />
        {/* 位移后位置 / 影响线 */}
        <path d={showDisplacement ? displacementPath : ilPath} fill="none" stroke={ilConfig.color} strokeWidth="3" />
        {/* 支座标记 */}
        <polygon points={`${margin.left},${baseY + 4} ${margin.left - 8},${baseY + 18} ${margin.left + 8},${baseY + 18}`} fill="#94a3b8" />
        <circle cx={margin.left + plotW} cy={baseY + 10} r="5" fill="#94a3b8" />
        {/* 截面C标记 */}
        {(targetType === 'Mc' || targetType === 'Qc') && (
          <>
            <line x1={cPx} y1={margin.top} x2={cPx} y2={baseY + 20} stroke="#f97316" strokeWidth="1.5" strokeDasharray="4" />
            <text x={cPx} y={height - 5} className="text-[10px] fill-orange-600 font-bold" textAnchor="middle">C</text>
          </>
        )}
        {/* 标注 */}
        <text x={margin.left} y={height - 5} className="text-[9px] fill-slate-500">A</text>
        <text x={margin.left + plotW} y={height - 5} className="text-[9px] fill-slate-500" textAnchor="end">B</text>
        {/* 位移标注 */}
        {targetType === 'RA' && (
          <>
            <line x1={margin.left} y1={baseY} x2={margin.left} y2={baseY - scale} stroke="#ef4444" strokeWidth="1" markerEnd="url(#arrow)" />
            <text x={margin.left - 5} y={baseY - scale/2} className="text-[9px] fill-red-600 font-bold">δ=1</text>
          </>
        )}
        {targetType === 'RB' && (
          <>
            <line x1={margin.left + plotW} y1={baseY} x2={margin.left + plotW} y2={baseY - scale} stroke="#ef4444" strokeWidth="1" />
            <text x={margin.left + plotW + 5} y={baseY - scale/2} className="text-[9px] fill-red-600 font-bold">δ=1</text>
          </>
        )}
        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="#ef4444" />
          </marker>
        </defs>
      </svg>
    );
  };

  return (
    <div className="flex flex-col lg:flex-row gap-3 lg:gap-4 min-h-full p-3 lg:p-4">
      <CollapsiblePanel title="参数" icon="🔧" side="left" storageKey="param-panel-il-kinematic">
        <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-sm overflow-y-auto">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">🔧 参数设置</h4>
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
      <div className="flex-1 flex flex-col gap-2 lg:gap-3 min-w-0">
        {milestone && <LearningMilestone milestone={milestone} onDismiss={dismissMilestone} />}
        <ProgressBar currentModule="机动法" />
        <AIBubble message={bubble} />
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex flex-col">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">📐 机动法原理图</h4>
          <div className="flex-1 flex items-center justify-center">{renderDisplacementDiagram()}</div>
          <div className="text-center text-sm text-slate-600 mt-2">{ilConfig.displacement}</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">📖 虚功原理</h4>
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-green-50 to-white rounded-xl px-4 py-2 border border-green-100 text-center">
              <div className="text-lg font-mono text-slate-800 font-bold">P·y = Z·δ</div>
            </div>
            <div className="text-sm text-slate-600 flex-1">{ilConfig.displacement}</div>
          </div>
        </div>
        <SolutionSteps steps={solveSteps} title="机动法求解过程" />
      </div>

      <CollapsiblePanel title="AI助手" icon="🤖" side="right" storageKey="ai-panel-il-kinematic">
        <AITutor context={context} moduleTitle="机动法作影响线"
          suggestedQuestions={['机动法的原理是什么？', '为什么位移图就是影响线？', '机动法和静力法哪个更方便？']} />
      </CollapsiblePanel>
    </div>
  );
};


// ==================== 内力包络图 ====================
const EnvelopeDiagram: React.FC = () => {
  const [L, setL] = useState(10);
  const [numLoads, setNumLoads] = useState(3);
  const [loadSpacing, setLoadSpacing] = useState(2);
  const [loadMagnitude, setLoadMagnitude] = useState(100);
  const [showEnvelope, setShowEnvelope] = useState(true);
  const { bubble, sync, ctx, milestone, dismissMilestone } = useAIEngine({ module: 'influence', subModule: 'envelope' });
  
  // 计算移动荷载组在不同位置时的弯矩
  const calculateMoments = () => {
    const positions: number[] = [];
    const moments: number[][] = [];
    const envelope: { x: number; maxM: number; minM: number }[] = [];
    
    const totalLoadLength = (numLoads - 1) * loadSpacing;
    const steps = 50;
    
    // 对于每个截面位置
    for (let i = 0; i <= steps; i++) {
      const sectionX = (i / steps) * L;
      let maxM = 0;
      let minM = 0;
      
      // 荷载组从左移动到右
      for (let j = -10; j <= steps + 10; j++) {
        const leadLoadPos = (j / steps) * (L + totalLoadLength) - totalLoadLength / 2;
        let M = 0;
        
        // 计算每个集中力对截面的弯矩贡献
        for (let k = 0; k < numLoads; k++) {
          const loadX = leadLoadPos + k * loadSpacing;
          if (loadX >= 0 && loadX <= L) {
            // 简支梁弯矩计算
            if (loadX <= sectionX) {
              M += loadMagnitude * loadX * (L - sectionX) / L;
            } else {
              M += loadMagnitude * sectionX * (L - loadX) / L;
            }
          }
        }
        
        maxM = Math.max(maxM, M);
        minM = Math.min(minM, M);
      }
      
      envelope.push({ x: sectionX / L, maxM, minM });
    }
    
    return envelope;
  };
  
  const envelopeData = calculateMoments();
  const maxMoment = Math.max(...envelopeData.map(d => d.maxM));
  
  useEffect(() => {
    sync(
      { L, numLoads, loadSpacing, loadMagnitude },
      { maxMoment },
    );
  }, [L, numLoads, loadSpacing, loadMagnitude, maxMoment, sync]);
  const context = ctx.toPromptString();

  const envelopeHints = useMemo(() => getEnvelopeHints({ maxMoment, numLoads, loadMagnitude, L }), [maxMoment, numLoads, loadMagnitude, L]);

  const maxPoint = envelopeData.reduce((max, d) => d.maxM > max.maxM ? d : max, envelopeData[0]);

  const solveSteps = useMemo(() => [
    { title: '定义荷载组', equation: `${numLoads}个集中力 P=${loadMagnitude}kN`, result: `荷载组总长 = ${((numLoads - 1) * loadSpacing).toFixed(1)} m`, explanation: `间距 ${loadSpacing} m`, aiWhy: '包络图用于确定移动荷载下的最不利位置。先定义荷载组的参数：荷载数、大小、间距。' },
    { title: '遍历所有截面', equation: `x ∈ [0, L], L=${L}m`, result: `共 ${envelopeData.length} 个截面`, explanation: '对每个截面求最大/最小弯矩', aiWhy: '包络图需要对每个截面都求弯矩极值，这样才能找到全梁最危险的截面。' },
    { title: '荷载组移动求极值', equation: '荷载组从左到右扫过全梁', result: '每个位置叠加各荷载贡献', explanation: 'M = ΣPᵢ·yᵢ (影响线法)', aiWhy: '利用影响线叠加原理：各荷载在该截面的贡献 = Pᵢ × 该位置的影响线纵标yᵢ。' },
    { title: '绝对最大弯矩', equation: `位于 x = ${(maxPoint.x * L).toFixed(2)} m`, result: `Mmax = ${maxMoment.toFixed(0)} kN·m`, explanation: '包络图最高点，最危险截面' },
  ], [numLoads, loadMagnitude, loadSpacing, L, envelopeData.length, maxPoint, maxMoment]);

  const renderEnvelope = () => {
    const width = 400, height = 180;
    const margin = { left: 50, right: 30, top: 30, bottom: 40 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const baseY = margin.top;
    const scale = maxMoment > 0 ? (plotH - 20) / maxMoment : 1;
    
    let maxPath = `M ${margin.left} ${baseY}`;
    envelopeData.forEach((d, i) => {
      const px = margin.left + d.x * plotW;
      const py = baseY + d.maxM * scale;
      maxPath += ` L ${px} ${py}`;
    });
    maxPath += ` L ${margin.left + plotW} ${baseY}`;
    
    const maxPx = margin.left + maxPoint.x * plotW;
    const maxPy = baseY + maxPoint.maxM * scale;
    
    return (
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="bg-gradient-to-b from-slate-50 to-white rounded-lg">
        {/* 梁 */}
        <line x1={margin.left} y1={baseY} x2={margin.left + plotW} y2={baseY} stroke="#334155" strokeWidth="4" />
        <polygon points={`${margin.left},${baseY + 4} ${margin.left - 8},${baseY + 18} ${margin.left + 8},${baseY + 18}`} fill="#94a3b8" />
        <circle cx={margin.left + plotW} cy={baseY + 10} r="5" fill="#94a3b8" />
        
        {/* 包络图 */}
        {showEnvelope && (
          <>
            <path d={maxPath} fill="#ef4444" fillOpacity="0.2" stroke="#ef4444" strokeWidth="2" />
            {/* 最大值标注 */}
            <circle cx={maxPx} cy={maxPy} r="5" fill="#ef4444" stroke="white" strokeWidth="2" />
            <text x={maxPx} y={maxPy + 18} className="text-[11px] fill-red-700 font-bold" textAnchor="middle">
              Mmax={maxPoint.maxM.toFixed(0)}kN·m
            </text>
          </>
        )}
        
        {/* 坐标轴 */}
        <line x1={margin.left} y1={baseY} x2={margin.left} y2={baseY + plotH} stroke="#cbd5e1" strokeWidth="1" />
        <text x={margin.left - 5} y={baseY + plotH / 2} className="text-[9px] fill-slate-500" textAnchor="end" transform={`rotate(-90, ${margin.left - 5}, ${baseY + plotH / 2})`}>M (kN·m)</text>
        <text x={margin.left} y={height - 5} className="text-[9px] fill-slate-500">0</text>
        <text x={margin.left + plotW} y={height - 5} className="text-[9px] fill-slate-500" textAnchor="end">L={L}m</text>
        
        {/* 荷载示意 */}
        <g transform={`translate(${margin.left + plotW * 0.3}, ${baseY - 25})`}>
          {Array.from({ length: numLoads }).map((_, i) => (
            <g key={i} transform={`translate(${i * 15}, 0)`}>
              <line x1="0" y1="0" x2="0" y2="15" stroke="#ef4444" strokeWidth="1.5" />
              <polygon points="-3,12 3,12 0,18" fill="#ef4444" />
            </g>
          ))}
          <text x={(numLoads - 1) * 7.5} y="-5" className="text-[8px] fill-red-600 font-bold" textAnchor="middle">移动荷载组</text>
        </g>
      </svg>
    );
  };

  return (
    <div className="flex flex-col lg:flex-row gap-3 lg:gap-4 min-h-full p-3 lg:p-4">
      <CollapsiblePanel title="参数" icon="🔧" side="left" storageKey="param-panel-il-envelope">
        <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-sm overflow-y-auto">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">🔧 参数设置</h4>
          <Slider label="梁跨度 L" value={L} min={8} max={30} unit="m" onChange={setL} />
          <Slider label="荷载个数" value={numLoads} min={2} max={6} step={1} unit="个" onChange={setNumLoads} />
          <Slider label="荷载间距" value={loadSpacing} min={1} max={5} step={0.5} unit="m" onChange={setLoadSpacing} />
          <Slider label="荷载大小 P" value={loadMagnitude} min={50} max={200} unit="kN" onChange={setLoadMagnitude} />
          <div className="mt-4 pt-4 border-t border-slate-100">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showEnvelope} onChange={(e) => setShowEnvelope(e.target.checked)} 
                className="w-4 h-4 rounded border-slate-300" />
              <span className="text-sm text-slate-700">显示包络图</span>
            </label>
          </div>
        </div>
      </CollapsiblePanel>
      <div className="flex-1 flex flex-col gap-2 lg:gap-3 min-w-0">
        {milestone && <LearningMilestone milestone={milestone} onDismiss={dismissMilestone} />}
        <ProgressBar currentModule="包络图" />
        <AIBubble message={bubble} />
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex flex-col">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">📐 弯矩包络图</h4>
          <div className="flex-1 flex items-center justify-center">{renderEnvelope()}</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">Σ 计算结果</h4>
          <div className="flex flex-wrap gap-2 md:gap-3">
            <ResultCard label="最大弯矩" value={maxMoment.toFixed(0)} unit="kN·m" color="red" aiHint={findHint(envelopeHints, '最大弯矩')} />
            <ResultCard label="荷载总数" value={numLoads.toString()} unit="个" color="blue" />
            <ResultCard label="荷载组长度" value={((numLoads - 1) * loadSpacing).toFixed(1)} unit="m" color="green" />
            <ResultCard label="单个荷载" value={loadMagnitude.toString()} unit="kN" color="purple" />
          </div>
        </div>
        <SolutionSteps steps={solveSteps} title="求解过程" />
      </div>

      <CollapsiblePanel title="AI助手" icon="🤖" side="right" storageKey="ai-panel-il-envelope">
        <AITutor context={context} moduleTitle="内力包络图"
          suggestedQuestions={['什么是内力包络图？', '如何确定绝对最大弯矩？', '包络图和影响线有什么关系？']} />
      </CollapsiblePanel>
    </div>
  );
};

// ==================== 影响线应用 ====================
const InfluenceApplication: React.FC = () => {
  const [L, setL] = useState(10);
  const [sectionPos, setSectionPos] = useState(40);
  const [loadType, setLoadType] = useState<'point' | 'distributed' | 'multi'>('point');
  const [P, setP] = useState(50);
  const [q, setQ] = useState(20);
  const [loadPos, setLoadPos] = useState(50);
  const { bubble, sync, ctx, milestone, dismissMilestone } = useAIEngine({ module: 'influence', subModule: 'application' });
  
  const c = (sectionPos / 100) * L;
  const x = (loadPos / 100) * L;
  
  // 弯矩影响线纵标
  const getMcIL = (pos: number) => pos <= c ? pos * (L - c) / L : c * (L - pos) / L;
  
  // 计算实际弯矩
  const calculateMc = () => {
    if (loadType === 'point') {
      return P * getMcIL(x);
    } else if (loadType === 'distributed') {
      // 均布荷载：Mc = q × 影响线面积
      const area = c * (L - c) / 2; // 三角形面积
      return q * area;
    } else {
      // 多个集中力
      const loads = [
        { pos: 0.2 * L, P: 30 },
        { pos: 0.5 * L, P: 50 },
        { pos: 0.8 * L, P: 40 },
      ];
      return loads.reduce((sum, load) => sum + load.P * getMcIL(load.pos), 0);
    }
  };
  
  const Mc = calculateMc();
  const maxIL = c * (L - c) / L;
  
  useEffect(() => {
    sync(
      { L, sectionPos, loadType, P, q, loadPos },
      { Mc, maxIL },
    );
  }, [L, sectionPos, loadType, P, q, loadPos, Mc, maxIL, sync]);
  const context = ctx.toPromptString();

  const appHints = useMemo(() => getApplicationHints({ loadType, Mc, maxIL, P, q }), [loadType, Mc, maxIL, P, q]);

  const solveSteps = useMemo(() => {
    const steps: { title: string; equation?: string; result?: string; explanation?: string; aiWhy?: string }[] = [];
    steps.push({ title: '确定影响线', equation: `Mc影响线，C在 ${c.toFixed(2)}m`, result: `最大纵标 = ${maxIL.toFixed(4)} m`, aiWhy: '影响线的应用第一步：先画出目标量的影响线。Mc影响线是三角形，顶点在C处。' });
    if (loadType === 'point') {
      const y = getMcIL(x);
      steps.push({ title: '集中力 P 作用', equation: `Mc = P × y = ${P} × ${y.toFixed(4)}`, result: `${Mc.toFixed(2)} kN·m`, explanation: `y为x=${x.toFixed(2)}m处的影响线纵标` });
    } else if (loadType === 'distributed') {
      const area = c * (L - c) / 2;
      steps.push({ title: '均布荷载 q 作用', equation: `Mc = q × A = ${q} × ${area.toFixed(3)}`, result: `${Mc.toFixed(2)} kN·m`, explanation: `A = 影响线下三角形面积 = ${area.toFixed(3)} m²` });
    } else {
      const loads = [{ pos: 0.2 * L, P: 30 }, { pos: 0.5 * L, P: 50 }, { pos: 0.8 * L, P: 40 }];
      loads.forEach((ld, i) => {
        const y = getMcIL(ld.pos);
        steps.push({ title: `P${i+1}=${ld.P}kN @ ${ld.pos.toFixed(1)}m`, equation: `Mc${i+1} = ${ld.P} × ${y.toFixed(4)}`, result: `${(ld.P * y).toFixed(2)} kN·m` });
      });
      steps.push({ title: '叠加', equation: 'Mc = ΣPᵢ × yᵢ', result: `${Mc.toFixed(2)} kN·m` });
    }
    return steps;
  }, [loadType, L, c, x, P, q, Mc, maxIL, getMcIL]);

  const renderApplication = () => {
    const width = 380, height = 160;
    const margin = { left: 40, right: 30, top: 35, bottom: 40 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const baseY = margin.top + 10;
    const ilBaseY = margin.top + plotH * 0.5;
    const scale = maxIL > 0 ? (plotH * 0.4) / maxIL : 1;
    
    const cPx = margin.left + (sectionPos / 100) * plotW;
    
    // 影响线路径
    const ilPath = `M ${margin.left} ${ilBaseY} L ${cPx} ${ilBaseY - maxIL * scale} L ${margin.left + plotW} ${ilBaseY}`;
    
    return (
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="bg-gradient-to-b from-slate-50 to-white rounded-lg">
        {/* 梁 */}
        <line x1={margin.left} y1={baseY} x2={margin.left + plotW} y2={baseY} stroke="#334155" strokeWidth="4" />
        <polygon points={`${margin.left},${baseY + 4} ${margin.left - 8},${baseY + 18} ${margin.left + 8},${baseY + 18}`} fill="#94a3b8" />
        <circle cx={margin.left + plotW} cy={baseY + 10} r="5" fill="#94a3b8" />
        
        {/* 截面C */}
        <line x1={cPx} y1={baseY - 10} x2={cPx} y2={ilBaseY + 10} stroke="#f97316" strokeWidth="1.5" strokeDasharray="4" />
        <text x={cPx} y={baseY - 15} className="text-[10px] fill-orange-600 font-bold" textAnchor="middle">C</text>
        
        {/* 荷载 */}
        {loadType === 'point' && (
          <>
            <line x1={margin.left + (loadPos / 100) * plotW} y1={baseY - 25} x2={margin.left + (loadPos / 100) * plotW} y2={baseY - 5} stroke="#ef4444" strokeWidth="2" />
            <polygon points={`${margin.left + (loadPos / 100) * plotW - 4},${baseY - 8} ${margin.left + (loadPos / 100) * plotW + 4},${baseY - 8} ${margin.left + (loadPos / 100) * plotW},${baseY}`} fill="#ef4444" />
            <text x={margin.left + (loadPos / 100) * plotW} y={baseY - 30} className="text-[10px] fill-red-600 font-bold" textAnchor="middle">P={P}kN</text>
          </>
        )}
        {loadType === 'distributed' && (
          <>
            {Array.from({ length: 8 }).map((_, i) => {
              const px = margin.left + (i / 7) * plotW;
              return (
                <g key={i}>
                  <line x1={px} y1={baseY - 20} x2={px} y2={baseY - 5} stroke="#ef4444" strokeWidth="1" />
                  <polygon points={`${px - 2},${baseY - 7} ${px + 2},${baseY - 7} ${px},${baseY}`} fill="#ef4444" />
                </g>
              );
            })}
            <line x1={margin.left} y1={baseY - 20} x2={margin.left + plotW} y2={baseY - 20} stroke="#ef4444" strokeWidth="1" />
            <text x={margin.left + plotW / 2} y={baseY - 28} className="text-[10px] fill-red-600 font-bold" textAnchor="middle">q={q}kN/m</text>
          </>
        )}
        {loadType === 'multi' && (
          <>
            {[0.2, 0.5, 0.8].map((pos, i) => {
              const px = margin.left + pos * plotW;
              const loads = [30, 50, 40];
              return (
                <g key={i}>
                  <line x1={px} y1={baseY - 25} x2={px} y2={baseY - 5} stroke="#ef4444" strokeWidth="2" />
                  <polygon points={`${px - 3},${baseY - 7} ${px + 3},${baseY - 7} ${px},${baseY}`} fill="#ef4444" />
                  <text x={px} y={baseY - 30} className="text-[9px] fill-red-600 font-bold" textAnchor="middle">{loads[i]}</text>
                </g>
              );
            })}
          </>
        )}
        
        {/* 影响线 */}
        <line x1={margin.left} y1={ilBaseY} x2={margin.left + plotW} y2={ilBaseY} stroke="#cbd5e1" strokeWidth="1" />
        <path d={ilPath} fill="#3b82f6" fillOpacity="0.2" stroke="#3b82f6" strokeWidth="2" />
        <text x={cPx + 5} y={ilBaseY - maxIL * scale - 5} className="text-[9px] fill-blue-700 font-bold">{maxIL.toFixed(2)}</text>
        
        {/* 标注 */}
        <text x={margin.left + plotW / 2} y={height - 5} className="text-[10px] fill-slate-600" textAnchor="middle">Mc 影响线</text>
      </svg>
    );
  };

  return (
    <div className="flex flex-col lg:flex-row gap-3 lg:gap-4 min-h-full p-3 lg:p-4">
      <CollapsiblePanel title="参数" icon="🔧" side="left" storageKey="param-panel-il-application">
        <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-sm overflow-y-auto">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">🔧 参数设置</h4>
          <Slider label="梁跨度 L" value={L} min={6} max={20} unit="m" onChange={setL} />
          <Slider label="截面C位置" value={sectionPos} min={20} max={80} unit="%" onChange={setSectionPos} />
          <div className="mt-4 mb-3">
            <label className="text-sm font-semibold text-slate-700 mb-2 block">荷载类型</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'point' as const, name: '集中力' },
                { id: 'distributed' as const, name: '均布荷载' },
                { id: 'multi' as const, name: '多个集中力' },
              ].map(t => (
                <button key={t.id} onClick={() => setLoadType(t.id)}
                  className={`py-2 px-2 text-xs font-medium rounded-lg transition-all ${loadType === t.id ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 hover:bg-slate-200'}`}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
          {loadType === 'point' && (
            <>
              <Slider label="集中力 P" value={P} min={20} max={100} unit="kN" onChange={setP} />
              <Slider label="荷载位置" value={loadPos} min={0} max={100} unit="%" onChange={setLoadPos} />
            </>
          )}
          {loadType === 'distributed' && (
            <Slider label="均布荷载 q" value={q} min={10} max={50} unit="kN/m" onChange={setQ} />
          )}
        </div>
      </CollapsiblePanel>
      <div className="flex-1 flex flex-col gap-2 lg:gap-3 min-w-0">
        {milestone && <LearningMilestone milestone={milestone} onDismiss={dismissMilestone} />}
        <ProgressBar currentModule="影响线应用" />
        <AIBubble message={bubble} />
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex flex-col">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">📐 利用影响线计算内力</h4>
          <div className="flex-1 flex items-center justify-center">{renderApplication()}</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">Σ 计算结果</h4>
          <div className="flex flex-wrap gap-2 md:gap-3">
            <ResultCard label="截面C弯矩 Mc" value={Mc.toFixed(1)} unit="kN·m" color="red" aiHint={findHint(appHints, 'Mc')} />
            <ResultCard label="影响线最大纵标" value={maxIL.toFixed(3)} unit="m" color="blue" aiHint={findHint(appHints, '最大纵标')} />
            <ResultCard label="截面C位置" value={c.toFixed(2)} unit="m" color="orange" />
          </div>
          <div className="flex gap-3 text-xs mt-3 pt-3 border-t border-slate-100">
            <div className="flex-1 bg-red-50 rounded-lg p-2 text-center"><span className="font-mono font-bold">Z = P × y</span><br/>集中力</div>
            <div className="flex-1 bg-blue-50 rounded-lg p-2 text-center"><span className="font-mono font-bold">Z = q × A</span><br/>均布荷载</div>
            <div className="flex-1 bg-green-50 rounded-lg p-2 text-center"><span className="font-mono font-bold">Z = ΣPᵢyᵢ</span><br/>多个集中力</div>
          </div>
        </div>
        <SolutionSteps steps={solveSteps} title="求解过程" />
      </div>

      <CollapsiblePanel title="AI助手" icon="🤖" side="right" storageKey="ai-panel-il-application">
        <AITutor context={context} moduleTitle="影响线应用"
          suggestedQuestions={['如何用影响线求弯矩？', '均布荷载怎么计算？', '最不利荷载位置怎么确定？']} />
      </CollapsiblePanel>
    </div>
  );
};

// ==================== 主模块 ====================
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
    <div className="h-full overflow-auto bg-slate-50">
      <ActiveComponent />
    </div>
  );
};

export default InfluenceModule;
