import React, { useState } from 'react';
import { Slider } from './Slider';
import AITutor from './AITutor';

// 结果卡片
const ResultCard: React.FC<{ label: string; value: string; unit: string; color?: string }> = ({ label, value, unit, color = 'blue' }) => {
  const colors: Record<string, string> = {
    blue: 'bg-gradient-to-br from-blue-50 to-blue-100/50 text-blue-700 border-blue-200',
    red: 'bg-gradient-to-br from-red-50 to-red-100/50 text-red-700 border-red-200',
    green: 'bg-gradient-to-br from-green-50 to-green-100/50 text-green-700 border-green-200',
    purple: 'bg-gradient-to-br from-purple-50 to-purple-100/50 text-purple-700 border-purple-200',
    orange: 'bg-gradient-to-br from-orange-50 to-orange-100/50 text-orange-700 border-orange-200',
  };
  return (
    <div className={`${colors[color]} rounded-xl p-3 text-center flex-1 border shadow-sm`}>
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="text-lg font-bold">{value} <span className="text-xs font-medium opacity-80">{unit}</span></div>
    </div>
  );
};

// ==================== 静力法作影响线 ====================
const StaticMethod: React.FC = () => {
  const [L, setL] = useState(10);
  const [loadPos, setLoadPos] = useState(50);
  const [targetType, setTargetType] = useState<'RA' | 'RB' | 'Mc' | 'Qc'>('RA');
  const [sectionPos, setSectionPos] = useState(40);
  
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
  const context = `静力法, L=${L}m, 目标=${targetType}, 当前值=${currentValue.toFixed(3)}`;

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
    <div className="flex gap-5 h-full p-5">
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        <div className="flex gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 w-80 flex-shrink-0 shadow-sm">
            <h4 className="text-sm font-bold text-slate-800 mb-4">🔧 参数设置</h4>
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
          
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex-1 shadow-sm flex flex-col">
            <h4 className="text-sm font-bold text-slate-800 mb-2">📐 结构示意 (单位移动荷载 P=1)</h4>
            <div className="flex-1 flex items-center justify-center">
              <svg width="100%" viewBox="0 0 300 80" className="bg-gradient-to-b from-slate-50 to-white rounded-xl max-w-lg">
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
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col">
          <h4 className="text-sm font-bold text-slate-800 mb-3">{ilConfig.title}</h4>
          <div className="flex-1 flex items-center justify-center">{renderInfluenceLine()}</div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h4 className="text-sm font-bold text-slate-800 mb-3">Σ 计算结果</h4>
            <div className="flex gap-3">
              <ResultCard label="荷载位置 x" value={x.toFixed(2)} unit="m" color="purple" />
              <ResultCard label={targetType} value={currentValue.toFixed(4)} unit={ilConfig.unit} color="blue" />
              <ResultCard label="最大纵标" value={maxValue.toFixed(4)} unit={ilConfig.unit} color="red" />
              {(targetType === 'Mc' || targetType === 'Qc') && (
                <ResultCard label="截面C位置" value={c.toFixed(2)} unit="m" color="orange" />
              )}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h4 className="text-sm font-bold text-slate-800 mb-3">📖 静力法原理</h4>
            <div className="flex gap-4">
              <div className="flex-1 bg-gradient-to-br from-slate-50 to-white rounded-xl p-4 border border-slate-100">
                <div className="text-xs text-slate-500 mb-2">公式</div>
                <div className="text-sm font-mono text-slate-700 whitespace-pre-line">{ilConfig.formula}</div>
              </div>
              <div className="flex-1 bg-gradient-to-br from-blue-50 to-white rounded-xl p-4 border border-blue-100">
                <div className="text-xs text-slate-500 mb-2">方法</div>
                <div className="text-sm text-slate-700">将单位荷载P=1放在任意位置x，用平衡方程求目标量值</div>
              </div>
              <div className="flex-1 bg-gradient-to-br from-green-50 to-white rounded-xl p-4 border border-green-100">
                <div className="text-xs text-slate-500 mb-2">特点</div>
                <div className="text-sm text-slate-700">{ilConfig.desc}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-80 flex-shrink-0">
        <AITutor context={context} moduleTitle="静力法作影响线"
          suggestedQuestions={['静力法的基本步骤？', '影响线和内力图有什么区别？', '为什么剪力影响线有突变？']} />
      </div>
    </div>
  );
};


// ==================== 机动法作影响线 ====================
const KinematicMethod: React.FC = () => {
  const [L, setL] = useState(10);
  const [targetType, setTargetType] = useState<'RA' | 'RB' | 'Mc' | 'Qc'>('RA');
  const [sectionPos, setSectionPos] = useState(40);
  const [showDisplacement, setShowDisplacement] = useState(true);
  
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
  const context = `机动法, L=${L}m, 目标=${targetType}`;

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
    <div className="flex gap-5 h-full p-5">
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        <div className="flex gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 w-80 flex-shrink-0 shadow-sm">
            <h4 className="text-sm font-bold text-slate-800 mb-4">🔧 参数设置</h4>
            <Slider label="梁跨度 L" value={L} min={6} max={20} unit="m" onChange={setL} />
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
            <div className="mt-4 pt-4 border-t border-slate-100">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showDisplacement} onChange={(e) => setShowDisplacement(e.target.checked)} 
                  className="w-4 h-4 rounded border-slate-300" />
                <span className="text-sm text-slate-700">显示位移图</span>
              </label>
            </div>
          </div>
          
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex-1 shadow-sm flex flex-col">
            <h4 className="text-sm font-bold text-slate-800 mb-2">📐 机动法原理图</h4>
            <div className="flex-1 flex items-center justify-center">{renderDisplacementDiagram()}</div>
            <div className="text-center text-sm text-slate-600 mt-2">{ilConfig.displacement}</div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h4 className="text-sm font-bold text-slate-800 mb-3">📖 机动法（虚功原理）</h4>
            <div className="flex gap-4">
              <div className="flex-1 bg-gradient-to-br from-blue-50 to-white rounded-xl p-4 border border-blue-100">
                <div className="text-xs text-slate-500 mb-2">基本原理</div>
                <div className="text-sm text-slate-700">{ilConfig.principle}</div>
              </div>
              <div className="flex-1 bg-gradient-to-br from-green-50 to-white rounded-xl p-4 border border-green-100">
                <div className="text-xs text-slate-500 mb-2">虚功方程</div>
                <div className="text-sm font-mono text-slate-700">P·y = Z·δ</div>
                <div className="text-xs text-slate-500 mt-1">y为影响线纵标</div>
              </div>
              <div className="flex-1 bg-gradient-to-br from-purple-50 to-white rounded-xl p-4 border border-purple-100">
                <div className="text-xs text-slate-500 mb-2">优点</div>
                <div className="text-sm text-slate-700">无需计算，直接由位移图得到影响线形状</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h4 className="text-sm font-bold text-slate-800 mb-3">🔑 机动法步骤</h4>
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <div className="text-2xl mb-1">①</div>
                <div className="text-xs text-slate-600">去掉目标量值对应的约束</div>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <div className="text-2xl mb-1">②</div>
                <div className="text-xs text-slate-600">沿约束方向给单位位移</div>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <div className="text-2xl mb-1">③</div>
                <div className="text-xs text-slate-600">画出位移图</div>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <div className="text-2xl mb-1">④</div>
                <div className="text-xs text-slate-600">位移图即为影响线</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-80 flex-shrink-0">
        <AITutor context={context} moduleTitle="机动法作影响线"
          suggestedQuestions={['机动法的原理是什么？', '为什么位移图就是影响线？', '机动法和静力法哪个更方便？']} />
      </div>
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
  
  const context = `内力包络图, L=${L}m, ${numLoads}个荷载, 间距${loadSpacing}m, P=${loadMagnitude}kN`;

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
    
    // 找最大弯矩位置
    const maxPoint = envelopeData.reduce((max, d) => d.maxM > max.maxM ? d : max, envelopeData[0]);
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
    <div className="flex gap-5 h-full p-5">
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        <div className="flex gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 w-80 flex-shrink-0 shadow-sm">
            <h4 className="text-sm font-bold text-slate-800 mb-4">🔧 参数设置</h4>
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
          
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex-1 shadow-sm flex flex-col">
            <h4 className="text-sm font-bold text-slate-800 mb-2">📐 弯矩包络图</h4>
            <div className="flex-1 flex items-center justify-center">{renderEnvelope()}</div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h4 className="text-sm font-bold text-slate-800 mb-3">Σ 计算结果</h4>
            <div className="flex gap-3">
              <ResultCard label="最大弯矩" value={maxMoment.toFixed(0)} unit="kN·m" color="red" />
              <ResultCard label="荷载总数" value={numLoads.toString()} unit="个" color="blue" />
              <ResultCard label="荷载组长度" value={((numLoads - 1) * loadSpacing).toFixed(1)} unit="m" color="green" />
              <ResultCard label="单个荷载" value={loadMagnitude.toString()} unit="kN" color="purple" />
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h4 className="text-sm font-bold text-slate-800 mb-3">📖 内力包络图</h4>
            <div className="flex gap-4">
              <div className="flex-1 bg-gradient-to-br from-red-50 to-white rounded-xl p-4 border border-red-100">
                <div className="text-xs text-slate-500 mb-2">定义</div>
                <div className="text-sm text-slate-700">移动荷载作用下，各截面可能出现的最大（最小）内力值的连线</div>
              </div>
              <div className="flex-1 bg-gradient-to-br from-blue-50 to-white rounded-xl p-4 border border-blue-100">
                <div className="text-xs text-slate-500 mb-2">作用</div>
                <div className="text-sm text-slate-700">用于结构设计，确定各截面的设计内力</div>
              </div>
              <div className="flex-1 bg-gradient-to-br from-green-50 to-white rounded-xl p-4 border border-green-100">
                <div className="text-xs text-slate-500 mb-2">绝对最大弯矩</div>
                <div className="text-sm text-slate-700">包络图的最大值点，是整个梁的最危险截面</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-80 flex-shrink-0">
        <AITutor context={context} moduleTitle="内力包络图"
          suggestedQuestions={['什么是内力包络图？', '如何确定绝对最大弯矩？', '包络图和影响线有什么关系？']} />
      </div>
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
  
  const context = `影响线应用, L=${L}m, 截面C=${sectionPos}%, Mc=${Mc.toFixed(1)}kN·m`;

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
    <div className="flex gap-5 h-full p-5">
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        <div className="flex gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 w-80 flex-shrink-0 shadow-sm">
            <h4 className="text-sm font-bold text-slate-800 mb-4">🔧 参数设置</h4>
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
          
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex-1 shadow-sm flex flex-col">
            <h4 className="text-sm font-bold text-slate-800 mb-2">📐 利用影响线计算内力</h4>
            <div className="flex-1 flex items-center justify-center">{renderApplication()}</div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h4 className="text-sm font-bold text-slate-800 mb-3">Σ 计算结果</h4>
            <div className="flex gap-3">
              <ResultCard label="截面C弯矩 Mc" value={Mc.toFixed(1)} unit="kN·m" color="red" />
              <ResultCard label="影响线最大纵标" value={maxIL.toFixed(3)} unit="m" color="blue" />
              <ResultCard label="截面C位置" value={c.toFixed(2)} unit="m" color="orange" />
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h4 className="text-sm font-bold text-slate-800 mb-3">📖 影响线应用公式</h4>
            <div className="flex gap-4">
              <div className="flex-1 bg-gradient-to-br from-red-50 to-white rounded-xl p-4 border border-red-100">
                <div className="text-xs text-slate-500 mb-2">集中力</div>
                <div className="text-sm font-mono text-slate-700">Z = P × y</div>
                <div className="text-xs text-slate-500 mt-1">y为荷载位置的影响线纵标</div>
              </div>
              <div className="flex-1 bg-gradient-to-br from-blue-50 to-white rounded-xl p-4 border border-blue-100">
                <div className="text-xs text-slate-500 mb-2">均布荷载</div>
                <div className="text-sm font-mono text-slate-700">Z = q × A</div>
                <div className="text-xs text-slate-500 mt-1">A为影响线下的面积</div>
              </div>
              <div className="flex-1 bg-gradient-to-br from-green-50 to-white rounded-xl p-4 border border-green-100">
                <div className="text-xs text-slate-500 mb-2">多个集中力</div>
                <div className="text-sm font-mono text-slate-700">Z = ΣPᵢ × yᵢ</div>
                <div className="text-xs text-slate-500 mt-1">各荷载贡献叠加</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-80 flex-shrink-0">
        <AITutor context={context} moduleTitle="影响线应用"
          suggestedQuestions={['如何用影响线求弯矩？', '均布荷载怎么计算？', '最不利荷载位置怎么确定？']} />
      </div>
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
