import React, { useState, useMemo } from 'react';
import { Slider } from './Slider';
import AITutor from './AITutor';
import ResultCard from './ui/ResultCard';
import SolutionSteps from './ui/SolutionSteps';
import CollapsiblePanel from './ui/CollapsiblePanel';

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
        {/* 基准线 */}
        <line x1={MARGIN.left} y1={baseY} x2={MARGIN.left + plotW} y2={baseY} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4" />
        {/* 填充区域 */}
        <path d={areaPath} fill={color} fillOpacity="0.15" />
        {/* 曲线 */}
        <path d={pathData} fill="none" stroke={color} strokeWidth="2.5" />
        {/* 关键点标注 */}
        {keyPoints.map((p, i) => {
          const cx = MARGIN.left + p.x * plotW;
          const cy = baseY - p.y * scale;
          const textY = p.y > 0 ? cy - 12 : cy + 16;
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r={p.isMax ? 5 : 4} fill="white" stroke={color} strokeWidth="2.5" />
              <text x={cx} y={textY} className="text-[12px] fill-slate-800 font-bold" textAnchor="middle">
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
  const [nodes, setNodes] = useState(4);
  const [bars, setBars] = useState(5);
  const [constraints, setConstraints] = useState(3);
  const [preset, setPreset] = useState<string>('custom');
  
  const presets = [
    { id: 'custom', name: '自定义', n: 0, b: 0, c: 0 },
    { id: 'simple_beam', name: '简支梁', n: 2, b: 1, c: 3 },
    { id: 'cantilever', name: '悬臂梁', n: 2, b: 1, c: 3 },
    { id: 'truss3', name: '三角桁架', n: 3, b: 3, c: 3 },
    { id: 'frame', name: '门式刚架', n: 4, b: 3, c: 4 },
    { id: 'indeterminate', name: '一次超静定梁', n: 3, b: 2, c: 4 },
  ];

  const handlePreset = (id: string) => {
    setPreset(id);
    const p = presets.find(x => x.id === id);
    if (p && id !== 'custom') { setNodes(p.n); setBars(p.b); setConstraints(p.c); }
  };
  
  const W = 3 * nodes - 2 * bars - constraints;
  
  const getStatus = () => {
    if (W > 0) return { text: '几何可变体系', color: 'text-red-600', bg: 'bg-gradient-to-br from-red-50 to-red-100/50 border-red-200', icon: '⚠' };
    if (W === 0) return { text: '几何不变（静定）', color: 'text-green-600', bg: 'bg-gradient-to-br from-green-50 to-green-100/50 border-green-200', icon: '✓' };
    return { text: `${Math.abs(W)}次超静定`, color: 'text-blue-600', bg: 'bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200', icon: '🔒' };
  };
  const status = getStatus();
  const context = `节点数n=${nodes}, 杆件数b=${bars}, 约束数c=${constraints}, 自由度W=${W}, 判定: ${status.text}`;

  const solveSteps = useMemo(() => [
    { title: '确定节点数', equation: `n = ${nodes}`, explanation: '体系中可自由运动的节点数' },
    { title: '计算节点自由度', equation: `3n = 3 × ${nodes} = ${3 * nodes}`, explanation: '每个节点有3个自由度(水平、竖向、转角)' },
    { title: '计算约束总数', equation: `2b + c = 2 × ${bars} + ${constraints} = ${2 * bars + constraints}`, explanation: '内部杆件约束 + 外部支座约束' },
    { title: '代入公式', equation: `W = 3n − 2b − c = ${3*nodes} − ${2*bars} − ${constraints}`, result: `${W}` },
    { title: '判定结果', result: `${status.icon} ${status.text}`, explanation: W > 0 ? '体系缺少约束，可自由运动' : W === 0 ? '约束恰好，结构稳定且可用静力学求解' : `多余约束数为${Math.abs(W)}，需用力法/位移法求解` },
  ], [nodes, bars, constraints, W, status]);

  return (
    <div className="flex flex-col lg:flex-row gap-3 lg:gap-4 min-h-full p-3 lg:p-4">
      <CollapsiblePanel title="参数" icon="🔧" side="left" storageKey="param-panel-geometry">
        <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-sm overflow-y-auto">
          <h4 className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">🔧 参数设置</h4>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {presets.map(p => (
              <button key={p.id} onClick={() => handlePreset(p.id)}
                className={`px-2 py-1 text-[10px] font-medium rounded-lg transition-all ${preset === p.id ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {p.name}
              </button>
            ))}
          </div>
          <Slider label="节点数 n" value={nodes} min={2} max={10} unit="" onChange={(v) => { setNodes(v); setPreset('custom'); }} />
          <Slider label="杆件数 b" value={bars} min={1} max={15} unit="" onChange={(v) => { setBars(v); setPreset('custom'); }} />
          <Slider label="约束数 c" value={constraints} min={0} max={10} unit="" onChange={(v) => { setConstraints(v); setPreset('custom'); }} />
        </div>
      </CollapsiblePanel>
      <div className="flex-1 flex flex-col gap-2 lg:gap-3 min-w-0">
        {/* 上：公式 */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex flex-col gap-3">
            <h4 className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">📐 计算公式</h4>
            <div className="bg-gradient-to-br from-slate-50 to-white rounded-lg p-4 text-center border border-slate-100 flex-1 flex flex-col justify-center">
              <div className="text-sm text-slate-500 mb-3">平面体系自由度公式</div>
              <div className="text-3xl font-serif mb-3 text-slate-800">W = 3n − 2b − c</div>
              <div className="text-base text-slate-600">
                W = 3×{nodes} − 2×{bars} − {constraints} = <span className={`text-xl font-bold ${status.color}`}>{W}</span>
              </div>
            </div>
            {/* 判定结果 */}
            <div className={`p-4 rounded-xl border shadow-sm ${status.bg} flex items-center justify-between`}>
              <span className="text-base font-medium text-slate-600">判定结果</span>
              <span className={`text-xl font-bold ${status.color}`}>{status.icon} {status.text}</span>
            </div>
        </div>

        {/* 中：判定规则 */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm">
          <h4 className="text-xs font-semibold text-slate-600 mb-3 flex items-center gap-1.5">📊 判定规则</h4>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            {[
              { cond: 'W > 0', label: '几何可变体系', desc: '缺少约束，不稳定', active: W > 0,
                activeCls: 'bg-gradient-to-br from-red-50 to-red-100/50 border-red-400 shadow-md scale-[1.02]',
                textCls: 'text-red-600' },
              { cond: 'W = 0', label: '静定结构', desc: '恰好约束，可静力求解', active: W === 0,
                activeCls: 'bg-gradient-to-br from-green-50 to-green-100/50 border-green-400 shadow-md scale-[1.02]',
                textCls: 'text-green-600' },
              { cond: 'W < 0', label: '超静定结构', desc: '多余约束，需特殊方法', active: W < 0,
                activeCls: 'bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-400 shadow-md scale-[1.02]',
                textCls: 'text-blue-600' },
            ].map(r => (
              <div key={r.cond} className={`p-4 rounded-xl text-center flex-1 border-2 transition-all duration-300 ${
                r.active ? r.activeCls : 'bg-slate-50 border-slate-200 opacity-60'
              }`}>
                <div className={`text-xl font-bold ${r.active ? r.textCls : 'text-slate-400'}`}>{r.cond}</div>
                <div className={`text-sm mt-1 ${r.active ? 'text-slate-700 font-semibold' : 'text-slate-400'}`}>{r.label}</div>
                <div className="text-xs text-slate-500 mt-1">{r.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 下：求解过程 + 约束类型 */}
        <div className="flex flex-col md:flex-row gap-2 md:gap-3">
          <div className="flex-1">
            <SolutionSteps steps={solveSteps} title="求解过程" />
          </div>
          <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm w-64 flex-shrink-0">
            <h4 className="text-xs font-semibold text-slate-600 mb-3">📖 约束类型速查</h4>
            <div className="space-y-2">
              {[
                { name: '固定铰支座', count: 2, icon: '△' },
                { name: '滚动铰支座', count: 1, icon: '○' },
                { name: '固定端（嵌固）', count: 3, icon: '▐' },
                { name: '单铰连接', count: 2, icon: '◎' },
                { name: '链杆', count: 1, icon: '—' },
              ].map(c => (
                <div key={c.name} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg">
                  <span className="text-sm text-slate-600 flex items-center gap-2">
                    <span className="text-base text-slate-400 w-5 text-center font-mono">{c.icon}</span>
                    {c.name}
                  </span>
                  <span className="text-sm font-bold text-blue-600">{c.count}约束</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <CollapsiblePanel title="AI助手" icon="🤖" side="right" storageKey="ai-panel-geometry">
        <AITutor context={context} moduleTitle="几何组成分析"
          suggestedQuestions={['什么是瞬变体系？', 'W=0一定稳定吗？', '如何增加约束？']} />
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
      RA = (q * totalL * totalL) / (2 * L);
      RB = q * totalL - RA;
      const x0 = RA / q;
      Mmax = Math.max(Math.abs(RA * x0 - q * x0 * x0 / 2), Math.abs(q * safeOverhang * safeOverhang / 2));
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
  const context = `${beamLabel}, ${loadType === 'point' ? `集中力P=${P}kN` : `均布q=${q}kN/m`}, L=${L}m${beamType === 'overhanging' ? `, 悬臂=${safeOverhang}m` : ''}`;

  const solveSteps = useMemo(() => {
    const steps: { title: string; equation?: string; result?: string; explanation?: string }[] = [];
    if (beamType === 'simple' && loadType === 'point') {
      const aPos = loadPos, bPos = bLen;
      steps.push({ title: '取整体平衡 ΣMA=0', equation: `RB×${L} = P×a = ${P}×${aPos.toFixed(1)}`, result: `RB = ${RB.toFixed(2)} kN` });
      steps.push({ title: 'ΣFy=0', equation: `RA + RB = P`, result: `RA = ${RA.toFixed(2)} kN` });
      steps.push({ title: '求最大弯矩', equation: `Mmax = P·a·b/L = ${P}×${aPos.toFixed(1)}×${bPos.toFixed(1)}/${L}`, result: `${Mmax.toFixed(2)} kN·m`, explanation: '在集中力作用点处' });
    } else if (beamType === 'simple' && loadType === 'distributed') {
      steps.push({ title: '对称性 → RA=RB', equation: `RA = RB = qL/2 = ${q}×${L}/2`, result: `${RA.toFixed(2)} kN` });
      steps.push({ title: '求跨中最大弯矩', equation: `Mmax = qL²/8 = ${q}×${L}²/8`, result: `${Mmax.toFixed(2)} kN·m`, explanation: '抛物线分布，最大值在跨中' });
    } else if (beamType === 'cantilever' && loadType === 'point') {
      steps.push({ title: 'ΣFy=0', equation: `RA = P`, result: `${RA.toFixed(2)} kN` });
      steps.push({ title: '固定端弯矩', equation: `M = P×a = ${P}×${loadPos.toFixed(1)}`, result: `${Mmax.toFixed(2)} kN·m`, explanation: '弯矩在固定端最大' });
    } else if (beamType === 'cantilever' && loadType === 'distributed') {
      steps.push({ title: 'ΣFy=0', equation: `RA = qL = ${q}×${L}`, result: `${RA.toFixed(2)} kN` });
      steps.push({ title: '固定端弯矩', equation: `M = qL²/2 = ${q}×${L}²/2`, result: `${Mmax.toFixed(2)} kN·m` });
    } else if (beamType === 'overhanging') {
      steps.push({ title: 'ΣMA=0 求RB', result: `RB = ${RB.toFixed(2)} kN` });
      steps.push({ title: 'ΣFy=0 求RA', result: `RA = ${RA.toFixed(2)} kN` });
      steps.push({ title: '最大弯矩', result: `Mmax = ${Mmax.toFixed(2)} kN·m`, explanation: '注意悬臂端负弯矩' });
    }
    steps.push({ title: '最大剪力', result: `Vmax = ${Vmax.toFixed(2)} kN` });
    return steps;
  }, [beamType, loadType, L, P, q, a, RA, RB, Mmax, Vmax, loadPos, bLen, safeOverhang]);

  // 梁基础结构组件
  const BeamBase = ({ showLoad = true }: { showLoad?: boolean }) => {
    const beamEnd = beamType === 'overhanging' ? 230 : 210;
    const supportB = beamType === 'overhanging' ? 170 : 210;
    return (
    <>
      <line x1="30" y1="60" x2={beamEnd} y2="60" stroke="#334155" strokeWidth="5" />
      {beamType === 'cantilever' ? (
        <rect x="22" y="45" width="8" height="35" fill="#94a3b8" />
      ) : (
        <>
          <polygon points="30,64 22,78 38,78" fill="#94a3b8" />
          <circle cx={supportB} cy="70" r="5" fill="#94a3b8" />
          <line x1={supportB - 10} y1="78" x2={supportB + 10} y2="78" stroke="#94a3b8" strokeWidth="2" />
        </>
      )}
      {showLoad && loadType === 'point' ? (
        <>
          <line x1={30 + (a/100) * (beamEnd - 30)} y1="25" x2={30 + (a/100) * (beamEnd - 30)} y2="55" stroke="#ef4444" strokeWidth="1" />
          <polygon points={`${30 + (a/100) * (beamEnd - 30) - 3},52 ${30 + (a/100) * (beamEnd - 30) + 3},52 ${30 + (a/100) * (beamEnd - 30)},58`} fill="#ef4444" />
          <text x={35 + (a/100) * (beamEnd - 30)} y="22" className="text-[10px] fill-red-600 font-bold">P={P}kN</text>
        </>
      ) : showLoad && (
        <>
          {[0,1,2,3,4,5,6,7].map(i => {
            const x = 40 + i * ((beamEnd - 50) / 7);
            return (
              <g key={i}>
                <line x1={x} y1="35" x2={x} y2="52" stroke="#ef4444" strokeWidth="1" />
                <polygon points={`${x - 2},50 ${x + 2},50 ${x},55`} fill="#ef4444" />
              </g>
            );
          })}
          <line x1="40" y1="35" x2={beamEnd - 10} y2="35" stroke="#ef4444" strokeWidth="0.8" />
          <text x={(30 + beamEnd) / 2} y="28" className="text-[10px] fill-red-600 font-bold" textAnchor="middle">q={q}kN/m</text>
        </>
      )}
      <text x={(30 + beamEnd) / 2} y="95" className="text-[10px] fill-slate-500" textAnchor="middle">
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
    <div className="flex flex-col lg:flex-row gap-3 lg:gap-4 min-h-full p-3 lg:p-4">
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
      <div className="flex-1 flex flex-col gap-2 lg:gap-3 min-w-0">
        {/* 结构示意图 */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">📐 结构示意</h4>
          <div className="mx-auto">
            <svg width="100%" viewBox="0 0 250 110" className="bg-gradient-to-b from-slate-50 to-white rounded-xl">
              <BeamBase showLoad={true} />
            </svg>
          </div>
        </div>

        {/* 中：两个内力图并排 */}
        <div className="flex flex-col md:flex-row gap-2 md:gap-3">
          {/* 弯矩图 M */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-4 flex-1 shadow-sm">
            <h4 className="text-xs font-semibold text-slate-600 mb-1">弯矩图 M | Mmax={Mmax.toFixed(1)} kN·m</h4>
            <div className="mx-auto">
              <svg width="100%" viewBox="0 0 250 110" className="bg-gradient-to-b from-slate-50 to-white rounded-lg">
              <BeamBase showLoad={false} />
              <path d={getMomentPath()} fill="#ef4444" fillOpacity="0.2" stroke="#ef4444" strokeWidth="1.5" />
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
          
          {/* 剪力图 V */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-4 flex-1 shadow-sm">
            <h4 className="text-xs font-semibold text-slate-600 mb-1">剪力图 V | Vmax={Vmax.toFixed(1)} kN</h4>
            <div className="mx-auto">
              <svg width="100%" viewBox="0 0 250 110" className="bg-gradient-to-b from-slate-50 to-white rounded-lg">
                <BeamBase showLoad={false} />
                <path d={getShearPath()} fill="#10b981" fillOpacity="0.2" stroke="#10b981" strokeWidth="1.5" />
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

        {/* 下：结果 */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">Σ 计算结果</h4>
          <div className="flex flex-wrap gap-2 md:gap-3">
            <ResultCard label="RA" value={RA.toFixed(1)} unit="kN" color="blue" />
            <ResultCard label="RB" value={beamType === 'cantilever' ? '-' : RB.toFixed(1)} unit="kN" color="blue" />
            <ResultCard label="Mmax" value={Mmax.toFixed(1)} unit="kN·m" color="red" />
            <ResultCard label="Vmax" value={Vmax.toFixed(1)} unit="kN" color="green" />
          </div>
        </div>
        {/* 求解过程 */}
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
  const [q, setQ] = useState(20);
  const [hPos, setHPos] = useState(50); // 水平力位置（0-100%，从底部算起）
  
  // 水平力作用点高度
  const hLoad = (hPos / 100) * H;
  
  // 求解支座反力
  const FxB = P;
  const FyA = (q * L) / 2 + (P * hLoad) / L;
  const FyB = (q * L) / 2 - (P * hLoad) / L;
  
  // 内力计算
  const M_E = P * hLoad; // 水平力作用点处弯矩
  const M_D = P * hLoad; // 对称
  const M_mid = M_E - FyA * (L/2) + (q * L/2 * L/4);
  const Q_left = P;
  const Q_beam_left = FyA;
  const Q_beam_right = FyA - q * L;
  const N_left = -FyA;
  const N_right = -FyB;
  const N_beam = -P;
  
  const Mmax = Math.max(Math.abs(M_E), Math.abs(M_mid));
  const Qmax = Math.max(Math.abs(Q_left), Math.abs(Q_beam_left));
  const Nmax = Math.max(Math.abs(N_left), Math.abs(N_right), Math.abs(N_beam));
  
  const mScale = 25 / (Mmax || 1);
  const qScale = 20 / (Qmax || 1);
  const nScale = 18 / (Nmax || 1);

  const context = `门式刚架, L=${L}m, H=${H}m, P=${P}kN(位置${hPos}%), q=${q}kN/m`;

  const solveSteps = useMemo(() => [
    { title: 'ΣFx=0 → FxB', equation: `FxB = P = ${P}`, result: `${FxB.toFixed(2)} kN` },
    { title: 'ΣMA=0 → FyB', equation: `FyB×${L} = qL²/2 − P×h = ${q}×${L}²/2 − ${P}×${hLoad.toFixed(1)}`, result: `${FyB.toFixed(2)} kN` },
    { title: 'ΣFy=0 → FyA', equation: `FyA = qL − FyB = ${q}×${L} − ${FyB.toFixed(1)}`, result: `${FyA.toFixed(2)} kN` },
    { title: '柱顶弯矩 ME', equation: `ME = P×h = ${P}×${hLoad.toFixed(1)}`, result: `${M_E.toFixed(2)} kN·m`, explanation: '截面法，取左柱E截面' },
    { title: '梁跨中弯矩', equation: `M_mid = ME − FyA×L/2 + qL²/8`, result: `${M_mid.toFixed(2)} kN·m` },
  ], [L, H, P, q, hLoad, FxB, FyA, FyB, M_E, M_mid]);

  // 绘制刚架基础结构的SVG组件 - 紧凑版
  const FrameBase = () => (
    <>
      <line x1="35" y1="85" x2="35" y2="25" stroke="#334155" strokeWidth="3" />
      <line x1="35" y1="25" x2="135" y2="25" stroke="#334155" strokeWidth="3" />
      <line x1="135" y1="25" x2="135" y2="85" stroke="#334155" strokeWidth="3" />
      <text x="28" y="92" className="text-[8px] fill-slate-600 font-bold">A</text>
      <text x="28" y="22" className="text-[8px] fill-slate-600 font-bold">E</text>
      <text x="138" y="22" className="text-[8px] fill-slate-600 font-bold">D</text>
      <text x="138" y="92" className="text-[8px] fill-slate-600 font-bold">B</text>
      <polygon points="35,88 29,98 41,98" fill="#94a3b8" />
      <circle cx="135" cy="91" r="4" fill="#94a3b8" />
      <line x1="126" y1="98" x2="144" y2="98" stroke="#94a3b8" strokeWidth="1.5" />
    </>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-3 lg:gap-4 min-h-full p-3 lg:p-4">
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
      <div className="flex-1 flex flex-col gap-2 lg:gap-3 min-w-0">
        {/* 结构示意图 */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">📐 结构示意</h4>
            <div className="mx-auto">
              <svg width="100%" viewBox="0 0 170 110" className="bg-gradient-to-b from-slate-50 to-white rounded-xl">
                <FrameBase />
                {/* 水平力P - 位置根据hPos动态变化 */}
                {(() => {
                  const loadY = 85 - (hPos / 100) * 60; // 85是底部，25是顶部，柱高60px
                  return (
                    <>
                      <line x1="10" y1={loadY} x2="32" y2={loadY} stroke="#ef4444" strokeWidth="1" />
                      <polygon points={`30,${loadY-3} 30,${loadY+3} 35,${loadY}`} fill="#ef4444" />
                      <text x="8" y={loadY-7} className="text-[8px] fill-red-600 font-bold">P={P}kN</text>
                    </>
                  );
                })()}
                {/* 均布荷载q */}
                {[0,1,2,3,4,5].map(i => (
                  <g key={i}>
                    <line x1={45 + i*16} y1="10" x2={45 + i*16} y2="20" stroke="#ef4444" strokeWidth="1" />
                    <polygon points={`${45 + i*16 - 2},18 ${45 + i*16 + 2},18 ${45 + i*16},24`} fill="#ef4444" />
                  </g>
                ))}
                <line x1="45" y1="10" x2="125" y2="10" stroke="#ef4444" strokeWidth="0.8" />
                <text x="85" y="7" className="text-[8px] fill-red-600 font-bold" textAnchor="middle">q={q}kN/m</text>
                <text x="85" y="108" className="text-[8px] fill-slate-500" textAnchor="middle">L={L}m, H={H}m</text>
              </svg>
            </div>
        </div>

        {/* 中：三个内力图并排 */}
        <div className="flex flex-col md:flex-row gap-2 md:gap-3">
          {/* 弯矩图 M */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-3 flex-1 shadow-sm">
            <h4 className="text-xs font-semibold text-slate-600 mb-1">弯矩图 M (kN·m)</h4>
            <div className="mx-auto">
              <svg width="100%" viewBox="0 0 170 110" className="bg-gradient-to-b from-slate-50 to-white rounded-lg">
                <FrameBase />
                {/* 弯矩图 */}
                <path d={`M 35,85 L ${35 - M_E * mScale},85 L ${35 - M_E * mScale},25 L 35,25`} 
                  fill="#ef4444" fillOpacity="0.2" stroke="#ef4444" strokeWidth="1.5" />
                <path d={`M 35,25 Q 85,${25 + Math.abs(M_mid) * mScale} 135,25`} 
                  fill="#ef4444" fillOpacity="0.15" stroke="#ef4444" strokeWidth="1.5" />
                <path d={`M 135,25 L ${135 + M_D * mScale},25 L ${135 + M_D * mScale},85 L 135,85`} 
                  fill="#ef4444" fillOpacity="0.2" stroke="#ef4444" strokeWidth="1.5" />
                <text x={35 - M_E * mScale - 3} y="28" className="text-[8px] fill-red-700 font-bold">{M_E.toFixed(0)}</text>
                <text x="85" y={28 + Math.abs(M_mid) * mScale} className="text-[8px] fill-red-700 font-bold" textAnchor="middle">{M_mid.toFixed(0)}</text>
                <text x={135 + M_D * mScale + 3} y="28" className="text-[8px] fill-red-700 font-bold">{M_D.toFixed(0)}</text>
              </svg>
            </div>
          </div>
          
          {/* 剪力图 Q */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-3 flex-1 shadow-sm">
            <h4 className="text-xs font-semibold text-slate-600 mb-1">剪力图 Q (kN)</h4>
            <div className="mx-auto">
              <svg width="100%" viewBox="0 0 170 110" className="bg-gradient-to-b from-slate-50 to-white rounded-lg">
                <FrameBase />
                {/* 剪力图 */}
                <path d={`M 35,85 L ${35 + Q_left * qScale},85 L ${35 + Q_left * qScale},25 L 35,25`} 
                  fill="#10b981" fillOpacity="0.2" stroke="#10b981" strokeWidth="1.5" />
                <path d={`M 35,25 L 35,${25 - Q_beam_left * qScale} L 135,${25 - Q_beam_right * qScale} L 135,25`} 
                  fill="#10b981" fillOpacity="0.2" stroke="#10b981" strokeWidth="1.5" />
                <path d={`M 135,25 L ${135 - Q_left * qScale},25 L ${135 - Q_left * qScale},85 L 135,85`} 
                  fill="#10b981" fillOpacity="0.2" stroke="#10b981" strokeWidth="1.5" />
                <text x={35 + Q_left * qScale + 2} y="55" className="text-[8px] fill-green-700 font-bold">{Q_left.toFixed(0)}</text>
                <text x="45" y={22 - Q_beam_left * qScale} className="text-[8px] fill-green-700 font-bold">{Q_beam_left.toFixed(0)}</text>
                <text x="125" y={22 - Q_beam_right * qScale} className="text-[8px] fill-green-700 font-bold">{Q_beam_right.toFixed(0)}</text>
              </svg>
            </div>
          </div>
          
          {/* 轴力图 N */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-3 flex-1 shadow-sm">
            <h4 className="text-xs font-semibold text-slate-600 mb-1">轴力图 N (kN)</h4>
            <div className="mx-auto">
              <svg width="100%" viewBox="0 0 170 110" className="bg-gradient-to-b from-slate-50 to-white rounded-lg">
                <FrameBase />
                {/* 轴力图 */}
                <path d={`M 35,85 L ${35 - N_left * nScale},85 L ${35 - N_left * nScale},25 L 35,25`} 
                  fill="#3b82f6" fillOpacity="0.2" stroke="#3b82f6" strokeWidth="1.5" />
                <path d={`M 35,25 L 35,${25 + N_beam * nScale} L 135,${25 + N_beam * nScale} L 135,25`} 
                  fill="#3b82f6" fillOpacity="0.2" stroke="#3b82f6" strokeWidth="1.5" />
                <path d={`M 135,25 L ${135 + N_right * nScale},25 L ${135 + N_right * nScale},85 L 135,85`} 
                  fill="#3b82f6" fillOpacity="0.2" stroke="#3b82f6" strokeWidth="1.5" />
                <text x={35 - N_left * nScale - 3} y="55" className="text-[8px] fill-blue-700 font-bold">{N_left.toFixed(0)}</text>
                <text x="85" y={28 + N_beam * nScale} className="text-[8px] fill-blue-700 font-bold" textAnchor="middle">{N_beam.toFixed(0)}</text>
                <text x={135 + N_right * nScale + 3} y="55" className="text-[8px] fill-blue-700 font-bold">{N_right.toFixed(0)}</text>
              </svg>
            </div>
          </div>
        </div>

        {/* 下：结果 */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">Σ 计算结果</h4>
          <div className="flex flex-wrap gap-2 md:gap-3">
            <ResultCard label="FyA" value={FyA.toFixed(1)} unit="kN" color="blue" />
            <ResultCard label="FyB" value={FyB.toFixed(1)} unit="kN" color="blue" />
            <ResultCard label="FxB" value={FxB.toFixed(1)} unit="kN" color="blue" />
            <ResultCard label="ME" value={M_E.toFixed(1)} unit="kN·m" color="red" />
            <ResultCard label="M跨中" value={M_mid.toFixed(1)} unit="kN·m" color="red" />
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
  const [showAxial, setShowAxial] = useState(true);
  
  const L = 12, H = 4;
  const RA = P / 2;
  const diagonal = Math.sqrt((L/4)**2 + H**2);
  const sinA = H / diagonal;
  const cosA = (L/4) / diagonal;
  
  // 各杆件轴力
  const N_bottom = (RA * (L/4)) / H; // 下弦杆（拉）
  const N_top = -N_bottom; // 上弦杆（压）
  const N_diag1 = RA / sinA; // 左斜杆（拉）
  const N_diag2 = -RA / sinA; // 中斜杆（压）

  const context = `Warren桁架, P=${P}kN, 下弦(拉)=${N_bottom.toFixed(1)}kN, 上弦(压)=${N_top.toFixed(1)}kN`;

  const solveSteps = useMemo(() => [
    { title: '对称性求反力', equation: `RA = RB = P/2 = ${P}/2`, result: `${RA.toFixed(1)} kN`, explanation: '对称结构 + 对称荷载' },
    { title: '截面法：截断1-1', equation: `ΣMC=0: N_底×H = RA×(L/4)`, result: `N_底 = +${N_bottom.toFixed(1)} kN (拉)`, explanation: '对上弦节点C取矩' },
    { title: '截面法：截断1-1', equation: `ΣME=0: N_顶×H = −RA×(L/4)`, result: `N_顶 = ${N_top.toFixed(1)} kN (压)` },
    { title: '节点法：节点A', equation: `ΣFy=0: N_斜×sinα = RA`, result: `N_斜 = +${N_diag1.toFixed(1)} kN (拉)`, explanation: `sinα = ${sinA.toFixed(3)}, 斜杆角度 = ${(Math.atan2(H, L/4) * 180 / Math.PI).toFixed(1)}°` },
    { title: '节点法：节点C', result: `N_中斜 = ${N_diag2.toFixed(1)} kN (压)`, explanation: '中间斜杆受压，对称' },
  ], [P, RA, N_bottom, N_top, N_diag1, N_diag2, sinA, H, L]);

  // 桁架基础结构组件 - 紧凑版
  const TrussBase = ({ showLoad = true }: { showLoad?: boolean }) => (
    <>
      {/* 下弦杆 */}
      <line x1="20" y1="65" x2="180" y2="65" stroke="#334155" strokeWidth="3" />
      {/* 上弦杆 */}
      <line x1="60" y1="25" x2="140" y2="25" stroke="#334155" strokeWidth="3" />
      {/* 斜杆 */}
      <line x1="20" y1="65" x2="60" y2="25" stroke="#334155" strokeWidth="2" />
      <line x1="60" y1="25" x2="100" y2="65" stroke="#334155" strokeWidth="2" />
      <line x1="100" y1="65" x2="140" y2="25" stroke="#334155" strokeWidth="2" />
      <line x1="140" y1="25" x2="180" y2="65" stroke="#334155" strokeWidth="2" />
      {/* 竖杆 */}
      <line x1="60" y1="25" x2="60" y2="65" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="3" />
      <line x1="140" y1="25" x2="140" y2="65" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="3" />
      {/* 节点 */}
      {[[20,65], [60,25], [60,65], [100,65], [140,25], [140,65], [180,65]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="white" stroke="#334155" strokeWidth="1.5" />
      ))}
      {/* 支座 */}
      <polygon points="20,68 14,78 26,78" fill="#94a3b8" />
      <circle cx="180" cy="71" r="4" fill="#94a3b8" />
      <line x1="172" y1="78" x2="188" y2="78" stroke="#94a3b8" strokeWidth="1.5" />
      {/* 荷载P - 向下 */}
      {showLoad && (
        <>
          <line x1="100" y1="10" x2="100" y2="58" stroke="#ef4444" strokeWidth="1" />
          <polygon points="97,55 103,55 100,64" fill="#ef4444" />
          <text x="110" y="18" className="text-[9px] fill-red-600 font-bold">P={P}kN</text>
        </>
      )}
    </>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-3 lg:gap-4 min-h-full p-3 lg:p-4">
      <CollapsiblePanel title="参数" icon="🔧" side="left" storageKey="param-panel-truss">
        <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-sm overflow-y-auto">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">🔧 参数设置</h4>
          <Slider label="节点荷载 P" value={P} min={20} max={100} unit="kN" onChange={setP} />
          <div className="mt-4 p-3 bg-gradient-to-br from-slate-50 to-white rounded-xl text-sm text-slate-600 border border-slate-100">
            <div>桁架跨度: {L}m</div>
            <div>桁架高度: {H}m</div>
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
      <div className="flex-1 flex flex-col gap-2 lg:gap-3 min-w-0">
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">📐 结构示意</h4>
          <div className="mx-auto">
            <svg width="100%" viewBox="0 0 200 90" className="bg-gradient-to-b from-slate-50 to-white rounded-xl">
              <TrussBase showLoad={true} />
              <text x="100" y="88" className="text-[8px] fill-slate-500" textAnchor="middle">L={L}m, H={H}m</text>
            </svg>
          </div>
        </div>

        {/* 中：三个轴力图并排（桁架只有轴力） */}
        <div className="flex flex-col md:flex-row gap-2 md:gap-3">
          {/* 下弦杆轴力 */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-3 flex-1 shadow-sm">
            <h4 className="text-xs font-semibold text-slate-600 mb-1">下弦杆 N (拉力)</h4>
            <div className="mx-auto">
              <svg width="100%" viewBox="0 0 200 90" className="bg-gradient-to-b from-slate-50 to-white rounded-lg">
                <TrussBase showLoad={false} />
                {/* 高亮下弦杆 */}
                <line x1="20" y1="65" x2="180" y2="65" stroke="#3b82f6" strokeWidth="5" />
                {showAxial && (
                  <>
                    <rect x="40" y="68" width="40" height="14" fill="white" fillOpacity="0.95" rx="2" />
                    <text x="60" y="79" className="text-[9px] fill-blue-700 font-bold" textAnchor="middle">+{N_bottom.toFixed(0)}</text>
                    <rect x="120" y="68" width="40" height="14" fill="white" fillOpacity="0.95" rx="2" />
                    <text x="140" y="79" className="text-[9px] fill-blue-700 font-bold" textAnchor="middle">+{N_bottom.toFixed(0)}</text>
                  </>
                )}
              </svg>
            </div>
            <div className="text-center text-xs text-blue-600 font-medium">拉力 +{N_bottom.toFixed(1)} kN</div>
          </div>
          
          {/* 上弦杆轴力 */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-3 flex-1 shadow-sm">
            <h4 className="text-xs font-semibold text-slate-600 mb-1">上弦杆 N (压力)</h4>
            <div className="mx-auto">
              <svg width="100%" viewBox="0 0 200 90" className="bg-gradient-to-b from-slate-50 to-white rounded-lg">
                <TrussBase showLoad={false} />
                {/* 高亮上弦杆 */}
                <line x1="60" y1="25" x2="140" y2="25" stroke="#ef4444" strokeWidth="5" />
                {showAxial && (
                  <>
                    <rect x="80" y="8" width="40" height="14" fill="white" fillOpacity="0.95" rx="2" />
                    <text x="100" y="19" className="text-[9px] fill-red-700 font-bold" textAnchor="middle">{N_top.toFixed(0)}</text>
                  </>
                )}
              </svg>
            </div>
            <div className="text-center text-xs text-red-600 font-medium">压力 {N_top.toFixed(1)} kN</div>
          </div>
          
          {/* 斜杆轴力 */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-3 flex-1 shadow-sm">
            <h4 className="text-xs font-semibold text-slate-600 mb-1">斜杆 N (拉/压)</h4>
            <div className="mx-auto">
              <svg width="100%" viewBox="0 0 200 90" className="bg-gradient-to-b from-slate-50 to-white rounded-lg">
                <TrussBase showLoad={false} />
                {/* 高亮斜杆 - 拉力绿色，压力橙色 */}
                <line x1="20" y1="65" x2="60" y2="25" stroke="#10b981" strokeWidth="4" />
                <line x1="60" y1="25" x2="100" y2="65" stroke="#f59e0b" strokeWidth="4" />
                <line x1="100" y1="65" x2="140" y2="25" stroke="#f59e0b" strokeWidth="4" />
                <line x1="140" y1="25" x2="180" y2="65" stroke="#10b981" strokeWidth="4" />
                {showAxial && (
                  <>
                    <rect x="25" y="38" width="30" height="12" fill="white" fillOpacity="0.95" rx="2" />
                    <text x="40" y="47" className="text-[8px] fill-green-700 font-bold" textAnchor="middle">+{N_diag1.toFixed(0)}</text>
                    <rect x="65" y="38" width="30" height="12" fill="white" fillOpacity="0.95" rx="2" />
                    <text x="80" y="47" className="text-[8px] fill-amber-700 font-bold" textAnchor="middle">{N_diag2.toFixed(0)}</text>
                    <rect x="105" y="38" width="30" height="12" fill="white" fillOpacity="0.95" rx="2" />
                    <text x="120" y="47" className="text-[8px] fill-amber-700 font-bold" textAnchor="middle">{N_diag2.toFixed(0)}</text>
                    <rect x="145" y="38" width="30" height="12" fill="white" fillOpacity="0.95" rx="2" />
                    <text x="160" y="47" className="text-[8px] fill-green-700 font-bold" textAnchor="middle">+{N_diag1.toFixed(0)}</text>
                  </>
                )}
              </svg>
            </div>
            <div className="flex justify-center gap-3 text-xs">
              <span className="text-green-600 font-medium">拉 +{N_diag1.toFixed(0)}</span>
              <span className="text-amber-600 font-medium">压 {N_diag2.toFixed(0)}</span>
            </div>
          </div>
        </div>

        {/* 下：结果 */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">Σ 计算结果</h4>
          <div className="flex flex-wrap gap-2 md:gap-3">
            <ResultCard label="下弦(拉)" value={`+${N_bottom.toFixed(1)}`} unit="kN" color="blue" />
            <ResultCard label="上弦(压)" value={N_top.toFixed(1)} unit="kN" color="red" />
            <ResultCard label="斜杆" value={`±${Math.abs(N_diag1).toFixed(1)}`} unit="kN" color="green" />
            <ResultCard label="支座反力" value={RA.toFixed(1)} unit="kN" color="purple" />
          </div>
          <div className="flex gap-3 mt-3">
            <FormulaCard title="节点法" formula="ΣF=0" desc="逐个节点求解" />
            <FormulaCard title="截面法" formula="ΣM=0" desc="截断≤3根杆" />
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
  
  const RA = (q * L) / 2;
  const H_thrust = (q * L * L) / (8 * f);
  const Mmax_beam = (q * L * L) / 8;
  const reduction = 100;

  const getAxialForce = (xi: number) => {
    const x = xi * L;
    const dydx = 4 * f * (L - 2 * x) / (L * L);
    const theta = Math.atan(dydx);
    const V = RA - q * x;
    return -H_thrust / Math.cos(theta) - V * Math.sin(theta);
  };
  
  const N_crown = -H_thrust;
  const N_support = getAxialForce(0);

  const context = `三铰拱, L=${L}m, f=${f}m, q=${q}kN/m, R=${RA.toFixed(1)}kN, H=${H_thrust.toFixed(1)}kN`;

  const solveSteps = useMemo(() => [
    { title: '对称性求竖向反力', equation: `RA = RB = qL/2 = ${q}×${L}/2`, result: `${RA.toFixed(2)} kN` },
    { title: '铰C条件求水平推力', equation: `MC=0: H×f = qL²/8 → H = qL²/(8f)`, result: `${H_thrust.toFixed(2)} kN`, explanation: '三铰拱的关键方程：利用拱顶铰弯矩为零' },
    { title: '简支梁弯矩（对比）', equation: `M_梁 = qL²/8 = ${q}×${L}²/8`, result: `${Mmax_beam.toFixed(1)} kN·m` },
    { title: '拱弯矩 M = M_梁 − Hy', equation: `当y = 合理拱轴线时, M ≈ 0`, result: '弯矩几乎为零', explanation: '均布荷载下二次抛物线拱的弯矩恒为零' },
    { title: '拱顶轴力', equation: `N_拱顶 = −H = −${H_thrust.toFixed(1)}`, result: `${N_crown.toFixed(1)} kN (压)` },
    { title: '拱脚轴力', result: `${N_support.toFixed(1)} kN (压)`, explanation: '拱脚处斜率最大，轴力最大' },
  ], [L, f, q, RA, H_thrust, Mmax_beam, N_crown, N_support]);

  // 拱基础结构组件 - 紧凑版
  // 二次贝塞尔曲线 Q 的中点 y = (P0.y + P2.y)/2 + (P1.y - (P0.y + P2.y)/2)/2 = 75 + (25-75)/2 = 50
  const ArchBase = ({ showLoad = true }: { showLoad?: boolean }) => (
    <>
      <path d="M 25,75 Q 100,25 175,75" fill="none" stroke="#334155" strokeWidth="3" />
      <circle cx="100" cy="50" r="3" fill="white" stroke="#334155" strokeWidth="1.5" />
      <polygon points="25,78 18,90 32,90" fill="#94a3b8" />
      <polygon points="175,78 168,90 182,90" fill="#94a3b8" />
      {showLoad && (
        <>
          {[0,1,2,3,4,5,6].map(i => (
            <g key={i}>
              <line x1={35 + i*20} y1="8" x2={35 + i*20} y2="18" stroke="#ef4444" strokeWidth="1" />
              <polygon points={`${35 + i*20 - 2},16 ${35 + i*20 + 2},16 ${35 + i*20},22`} fill="#ef4444" />
            </g>
          ))}
          <line x1="35" y1="8" x2="155" y2="8" stroke="#ef4444" strokeWidth="0.8" />
          <text x="100" y="5" className="text-[8px] fill-red-600 font-bold" textAnchor="middle">q={q}kN/m</text>
        </>
      )}
    </>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-3 lg:gap-4 min-h-full p-3 lg:p-4">
      <CollapsiblePanel title="参数" icon="🔧" side="left" storageKey="param-panel-arch">
        <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-sm overflow-y-auto">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">🔧 参数设置</h4>
          <Slider label="跨度 L" value={L} min={10} max={40} unit="m" onChange={setL} />
          <Slider label="矢高 f" value={f} min={2} max={10} unit="m" onChange={setF} />
          <Slider label="均布荷载 q" value={q} min={5} max={30} unit="kN/m" onChange={setQ} />
        </div>
      </CollapsiblePanel>
      <div className="flex-1 flex flex-col gap-2 lg:gap-3 min-w-0">
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">📐 结构示意</h4>
          <div className="mx-auto">
            <svg width="100%" viewBox="0 0 200 100" className="bg-gradient-to-b from-slate-50 to-white rounded-xl">
              <ArchBase showLoad={true} />
              <line x1="100" y1="22" x2="100" y2="75" stroke="#94a3b8" strokeWidth="1" strokeDasharray="3" />
              <text x="108" y="50" className="text-[7px] fill-slate-400">f</text>
              <text x="100" y="98" className="text-[8px] fill-slate-500" textAnchor="middle">L={L}m, f={f}m</text>
            </svg>
          </div>
        </div>

        {/* 中：三个内力图并排 */}
        <div className="flex flex-col md:flex-row gap-2 md:gap-3">
          {/* 弯矩图 M */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-3 flex-1 shadow-sm">
            <h4 className="text-xs font-semibold text-slate-600 mb-1">弯矩图 M (kN·m)</h4>
            <div className="mx-auto">
              <svg width="100%" viewBox="0 0 200 100" className="bg-gradient-to-b from-slate-50 to-white rounded-lg">
                <ArchBase showLoad={false} />
                {/* 弯矩为0的高亮显示 */}
                <path d="M 25,75 Q 100,25 175,75" fill="none" stroke="#10b981" strokeWidth="5" strokeOpacity="0.3" />
                <text x="100" y="42" className="text-[11px] fill-green-600 font-bold" textAnchor="middle">M ≈ 0</text>
                <text x="100" y="55" className="text-[8px] fill-slate-500" textAnchor="middle">(合理拱轴线)</text>
              </svg>
            </div>
            <div className="text-center text-xs text-green-600 font-medium">弯矩几乎为零 ✓</div>
          </div>
          
          {/* 轴力图 N */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-3 flex-1 shadow-sm">
            <h4 className="text-xs font-semibold text-slate-600 mb-1">轴力图 N (kN)</h4>
            <div className="mx-auto">
              <svg width="100%" viewBox="0 0 200 100" className="bg-gradient-to-b from-slate-50 to-white rounded-lg">
                <ArchBase showLoad={false} />
                {/* 轴力分布曲线 */}
                <path d="M 25,75 Q 100,8 175,75" fill="#3b82f6" fillOpacity="0.1" stroke="#3b82f6" strokeWidth="2" />
                <rect x="72" y="12" width="56" height="14" fill="white" fillOpacity="0.95" rx="2" />
                <text x="100" y="23" className="text-[9px] fill-blue-700 font-bold" textAnchor="middle">{N_crown.toFixed(0)}</text>
                <rect x="2" y="55" width="42" height="12" fill="white" fillOpacity="0.95" rx="2" />
                <text x="23" y="64" className="text-[8px] fill-blue-700 font-bold" textAnchor="middle">{N_support.toFixed(0)}</text>
                <rect x="156" y="55" width="42" height="12" fill="white" fillOpacity="0.95" rx="2" />
                <text x="177" y="64" className="text-[8px] fill-blue-700 font-bold" textAnchor="middle">{N_support.toFixed(0)}</text>
              </svg>
            </div>
            <div className="text-center text-xs text-blue-600 font-medium">全截面受压</div>
          </div>
          
          {/* 对比图 */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-3 flex-1 shadow-sm">
            <h4 className="text-xs font-semibold text-slate-600 mb-1">与简支梁对比</h4>
            <div className="mx-auto">
              <svg width="100%" viewBox="0 0 200 100" className="bg-gradient-to-b from-slate-50 to-white rounded-lg">
                <ArchBase showLoad={false} />
                {/* 简支梁弯矩图 */}
                <path d="M 25,75 Q 100,110 175,75" fill="#ef4444" fillOpacity="0.2" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4" />
                <text x="100" y="98" className="text-[9px] fill-red-600 font-bold" textAnchor="middle">梁: {Mmax_beam.toFixed(0)}</text>
                {/* 拱弯矩 */}
                <text x="100" y="42" className="text-[10px] fill-green-600 font-bold" textAnchor="middle">拱: M≈0</text>
                <text x="100" y="55" className="text-[8px] fill-green-500" textAnchor="middle">↓ 减少{reduction}%</text>
              </svg>
            </div>
            <div className="text-center text-xs text-amber-600 font-medium">拱的优势明显</div>
          </div>
        </div>

        {/* 下：结果 */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">Σ 计算结果</h4>
          <div className="flex flex-wrap gap-2 md:gap-3 mb-3">
            <ResultCard label="竖向反力R" value={RA.toFixed(1)} unit="kN" color="blue" />
            <ResultCard label="水平推力H" value={H_thrust.toFixed(1)} unit="kN" color="red" />
            <ResultCard label="拱顶轴力" value={N_crown.toFixed(0)} unit="kN" color="purple" />
            <ResultCard label="拱脚轴力" value={N_support.toFixed(0)} unit="kN" color="purple" />
          </div>
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-3 rounded-xl border border-green-200 text-center text-sm text-green-800">
            合理拱轴线使弯矩减少 <strong className="text-lg">{reduction}%</strong>，主要承受轴压
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
  
  const L = 12, H = 6;
  const R_beam = (q * L) / 2;
  const M_beam = (q * L * L) / 8;
  const M_col = P * H; // 柱底弯矩
  const V_col = P; // 柱剪力
  
  // 缩放比例
  const mScale = 35 / (Math.max(M_beam, M_col) || 1);
  const vScale = 25 / (Math.max(R_beam, V_col) || 1);

  const context = `组合结构, P=${P}kN, q=${q}kN/m, 梁弯矩=${M_beam.toFixed(0)}kNm, 柱弯矩=${M_col.toFixed(1)}kNm`;

  const solveSteps = useMemo(() => [
    { title: '识别结构层次', result: '梁为附属部分，柱为基本部分', explanation: '铰接连接 → 梁独立于柱' },
    { title: '先分析附属部分（梁）', equation: `R_梁 = qL/2 = ${q}×${L}/2`, result: `${R_beam.toFixed(2)} kN` },
    { title: '梁跨中弯矩', equation: `M_梁 = qL²/8 = ${q}×${L}²/8`, result: `${M_beam.toFixed(1)} kN·m` },
    { title: '再分析基本部分（柱）', equation: `V_柱 = P = ${P}`, result: `${V_col.toFixed(1)} kN`, explanation: '柱承受水平力P' },
    { title: '柱底弯矩', equation: `M_柱 = P×H = ${P}×${H}`, result: `${M_col.toFixed(1)} kN·m`, explanation: '铰接处弯矩为零，柱底最大' },
  ], [P, q, L, H, R_beam, M_beam, V_col, M_col]);

  // 组合结构基础组件 - 紧凑版
  const CompositeBase = ({ showLoad = true }: { showLoad?: boolean }) => (
    <>
      {/* 结构主体 */}
      <line x1="35" y1="90" x2="35" y2="30" stroke="#334155" strokeWidth="3" />
      <line x1="35" y1="30" x2="145" y2="30" stroke="#3b82f6" strokeWidth="3" />
      <line x1="145" y1="30" x2="145" y2="90" stroke="#334155" strokeWidth="3" />
      {/* 铰接点 */}
      <circle cx="35" cy="30" r="3" fill="white" stroke="#334155" strokeWidth="1.5" />
      <circle cx="145" cy="30" r="3" fill="white" stroke="#334155" strokeWidth="1.5" />
      {/* 支座 */}
      <polygon points="35,93 28,103 42,103" fill="#94a3b8" />
      <polygon points="145,93 138,103 152,103" fill="#94a3b8" />
      {/* 荷载 */}
      {showLoad && (
        <>
          {/* 水平力P */}
          <line x1="10" y1="60" x2="32" y2="60" stroke="#ef4444" strokeWidth="1" />
          <polygon points="30,57 30,63 35,60" fill="#ef4444" />
          <text x="8" y="52" className="text-[8px] fill-red-600 font-bold">P={P}kN</text>
          {/* 均布荷载q */}
          {[0,1,2,3,4,5].map(i => (
            <g key={i}>
              <line x1={45 + i*18} y1="12" x2={45 + i*18} y2="22" stroke="#ef4444" strokeWidth="1" />
              <polygon points={`${45 + i*18 - 2},20 ${45 + i*18 + 2},20 ${45 + i*18},26`} fill="#ef4444" />
            </g>
          ))}
          <line x1="45" y1="12" x2="135" y2="12" stroke="#ef4444" strokeWidth="0.8" />
          <text x="90" y="8" className="text-[8px] fill-red-600 font-bold" textAnchor="middle">q={q}kN/m</text>
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
    <div className="flex flex-col lg:flex-row gap-3 lg:gap-4 min-h-full p-3 lg:p-4">
      <CollapsiblePanel title="参数" icon="🔧" side="left" storageKey="param-panel-composite">
        <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-sm overflow-y-auto">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">🔧 参数设置</h4>
          <Slider label="水平力 P" value={P} min={20} max={80} unit="kN" onChange={setP} />
          <Slider label="均布荷载 q" value={q} min={8} max={25} unit="kN/m" onChange={setQ} />
          <div className="mt-4 p-3 bg-gradient-to-br from-slate-50 to-white rounded-xl text-sm text-slate-600 border border-slate-100">
            <div>梁跨度: {L}m, 柱高: {H}m</div>
          </div>
        </div>
      </CollapsiblePanel>
      <div className="flex-1 flex flex-col gap-2 lg:gap-3 min-w-0">
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">📐 结构示意</h4>
          <div className="mx-auto">
            <svg width="100%" viewBox="0 0 180 115" className="bg-gradient-to-b from-slate-50 to-white rounded-xl">
              <CompositeBase showLoad={true} />
              <text x="90" y="112" className="text-[7px] fill-slate-500" textAnchor="middle">L={L}m, H={H}m</text>
            </svg>
          </div>
        </div>

        {/* 中：弯矩图和剪力图并排 */}
        <div className="flex flex-col md:flex-row gap-2 md:gap-3">
          {/* 弯矩图 M */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-3 flex-1 shadow-sm">
            <h4 className="text-xs font-semibold text-slate-600 mb-1">弯矩图 M (kN·m)</h4>
            <div className="mx-auto">
              <svg width="100%" viewBox="0 0 180 115" className="bg-gradient-to-b from-slate-50 to-white rounded-lg">
                <CompositeBase showLoad={false} />
                {/* 左柱弯矩图 */}
                <path d={`M 35,90 L ${35 - M_col * mScale},90 L 35,30`} 
                  fill="#ef4444" fillOpacity="0.2" stroke="#ef4444" strokeWidth="1.5" />
                <text x={35 - M_col * mScale - 3} y="95" className="text-[8px] fill-red-700 font-bold">{M_col.toFixed(0)}</text>
                {/* 梁弯矩图 - 抛物线 */}
                <path d={getBeamMomentPath()} fill="#ef4444" fillOpacity="0.2" stroke="#ef4444" strokeWidth="1.5" />
                <text x="90" y={35 + M_beam * mScale + 10} className="text-[8px] fill-red-700 font-bold" textAnchor="middle">{M_beam.toFixed(0)}</text>
                {/* 右柱弯矩图 */}
                <path d={`M 145,30 L 145,90 L ${145 + M_col * mScale},90`} 
                  fill="#ef4444" fillOpacity="0.2" stroke="#ef4444" strokeWidth="1.5" />
                <text x={145 + M_col * mScale + 3} y="95" className="text-[8px] fill-red-700 font-bold">{M_col.toFixed(0)}</text>
                {/* 铰接处弯矩为0 */}
                <text x="35" y="24" className="text-[7px] fill-slate-500">M=0</text>
                <text x="145" y="24" className="text-[7px] fill-slate-500">M=0</text>
              </svg>
            </div>
          </div>
          
          {/* 剪力图 V */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-3 flex-1 shadow-sm">
            <h4 className="text-xs font-semibold text-slate-600 mb-1">剪力图 V (kN)</h4>
            <div className="mx-auto">
              <svg width="100%" viewBox="0 0 180 115" className="bg-gradient-to-b from-slate-50 to-white rounded-lg">
                <CompositeBase showLoad={false} />
                {/* 左柱剪力 */}
                <path d={`M 35,90 L ${35 + V_col * vScale},90 L ${35 + V_col * vScale},30 L 35,30`} 
                  fill="#10b981" fillOpacity="0.2" stroke="#10b981" strokeWidth="1.5" />
                <text x={35 + V_col * vScale + 2} y="60" className="text-[8px] fill-green-700 font-bold">{V_col.toFixed(0)}</text>
                {/* 梁剪力 - 线性 */}
                <path d={`M 35,30 L 35,${30 - R_beam * vScale} L 145,${30 + R_beam * vScale} L 145,30`} 
                  fill="#10b981" fillOpacity="0.2" stroke="#10b981" strokeWidth="1.5" />
                <text x="42" y={26 - R_beam * vScale} className="text-[8px] fill-green-700 font-bold">{R_beam.toFixed(0)}</text>
                <text x="132" y={35 + R_beam * vScale} className="text-[8px] fill-green-700 font-bold">{(-R_beam).toFixed(0)}</text>
                {/* 右柱剪力 */}
                <path d={`M 145,30 L ${145 - V_col * vScale},30 L ${145 - V_col * vScale},90 L 145,90`} 
                  fill="#10b981" fillOpacity="0.2" stroke="#10b981" strokeWidth="1.5" />
                <text x={145 - V_col * vScale - 12} y="60" className="text-[8px] fill-green-700 font-bold">{V_col.toFixed(0)}</text>
              </svg>
            </div>
          </div>
        </div>

        {/* 下：结果 */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">Σ 计算结果</h4>
          <div className="flex flex-wrap gap-2 md:gap-3">
            <ResultCard label="梁反力" value={R_beam.toFixed(1)} unit="kN" color="blue" />
            <ResultCard label="梁弯矩" value={M_beam.toFixed(0)} unit="kN·m" color="green" />
            <ResultCard label="柱底弯矩" value={M_col.toFixed(0)} unit="kN·m" color="red" />
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
