import React, { useRef, useState } from 'react';
import { ArrowUpRight, ArrowRight, Calculator, GitBranch, TrendingUp, Shapes, Minus, Square, Triangle, Archive, Layers, Activity, Zap, BarChart3, Bot, X, PenTool, ChartNoAxesCombined, BookOpen, Pause, Play, ChevronRight, Settings2 } from 'lucide-react';
import { EngineeringSupport } from './ui/EngineeringFigure';
import wechatQrUrl from '../wechat-qr.png';
import studioArtUrl from '../assets/overview-stress-field-v2.png';
import './HomePage.css';

interface HomePageProps {
  onNavigate: (module: 'static' | 'influence' | 'solver', subModule?: string) => void;
  onOpenSettings: () => void;
}
const learningModules = [
  { id: 'geometry', name: '几何组成分析', description: '判断约束与几何不变性', icon: Shapes },
  { id: 'beam', name: '静定梁', description: '观察荷载、剪力与弯矩', icon: Minus },
  { id: 'frame', name: '静定刚架', description: '理解刚架的受力与传力', icon: Square },
  { id: 'truss', name: '静定桁架', description: '分析铰接杆系的轴力', icon: Triangle },
  { id: 'arch', name: '静定拱', description: '研究三铰拱与水平推力', icon: Archive },
  { id: 'composite', name: '组合结构', description: '分析结构组合与连接', icon: Layers },
];
const influenceModules = [
  { id: 'static', name: '静力法', description: '用平衡方程绘制影响线', icon: Activity },
  { id: 'kinematic', name: '机动法', description: '用虚功原理理解影响线', icon: Zap },
  { id: 'envelope', name: '内力包络图', description: '寻找移动荷载的控制位置', icon: BarChart3 },
  { id: 'application', name: '影响线应用', description: '计算实际移动荷载作用', icon: TrendingUp },
];
const workflow = [
  { icon: PenTool, title: '建立模型', description: '画杆件、放支座、加荷载' },
  { icon: ChartNoAxesCombined, title: '观察响应', description: '模型与内力图实时联动' },
  { icon: BookOpen, title: '理解原理', description: '结合推导步骤与 AI 助教学习' },
];

const HomePage: React.FC<HomePageProps> = ({ onNavigate, onOpenSettings }) => {
  const [showWechatQR, setShowWechatQR] = useState(false);
  const [motionPaused, setMotionPaused] = useState(false);
  const libraryRef = useRef<HTMLHeadingElement>(null);
  const wechatTriggerRef = useRef<HTMLButtonElement>(null);
  const closeWechat = () => {
    setShowWechatQR(false);
    wechatTriggerRef.current?.focus();
  };
  const explore = () => {
    libraryRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    libraryRef.current?.focus({ preventScroll: true });
  };

  return <div className="home-overview">
    <div className="home-overview-inner">
      <section className={`home-hero home-hero-stress${motionPaused ? ' is-paused' : ''}`} aria-labelledby="overview-hero-title">
        <div className="home-hero-art" aria-hidden="true"><img src={studioArtUrl} alt="" width="1672" height="941" fetchPriority="high" /></div>
        <div className="home-particle-field" aria-hidden="true">{Array.from({ length: 32 }, (_, i) => <i key={i} style={{ '--px': `${32 + (i * 23 % 65)}%`, '--py': `${14 + (i * 37 % 70)}%`, '--delay': `${-(i % 13)}s`, '--duration': `${7 + i % 6}s`, '--size': `${1 + i % 3}px` } as React.CSSProperties} />)}</div>
        <div className="home-hero-topline"><span className="home-brand">StructLab<small>结构力学实验室</small></span><button type="button" onClick={() => setMotionPaused(v => !v)} aria-pressed={motionPaused}>{motionPaused ? <Play size={12} /> : <Pause size={12} />}{motionPaused ? '播放动效' : '暂停动效'}</button></div>
        <div className="home-hero-copy">
          <span className="home-eyebrow"><span />结构力学 · 交互实验室</span>
          <h2 id="overview-hero-title">看见力的轨迹，<br /><em>探索结构之美。</em></h2>
          <p>从一根梁到一座桁架，在图形中理解力的传递。<br />亲手建模，实时观察内力与变形。</p>
          <div className="home-hero-actions">
            <button type="button" className="home-primary-action" onClick={() => onNavigate('solver')}><Calculator size={16} />开始建模<ArrowRight size={16} /></button>
            <button type="button" className="home-secondary-action" onClick={explore}>浏览学习模块<ArrowUpRight size={15} /></button>
          </div>
        </div>
        <div className="home-hero-caption"><span className="home-field-label"><span />概念应力可视化</span><span className="home-stress-legend">低<i />高</span><small>艺术示意 · 非求解结果</small></div>
      </section>
      <div className="home-learning-zone">
      <section className="home-library" aria-labelledby="overview-library-title">
        <header className="home-library-heading"><div><h2 id="overview-library-title" ref={libraryRef} tabIndex={-1}>选择你的探索方向</h2><p>从受力分析到移动荷载，让每一次调整都有直观的反馈。</p></div><span>{learningModules.length + influenceModules.length} 个学习模块</span></header>
        <div className="home-learning-paths">
          <section className="home-learning-path" aria-labelledby="static-learning-title">
            <header className="home-path-heading"><GitBranch size={22} strokeWidth={1.6} /><div><h3 id="static-learning-title">静定结构分析</h3><p>从约束出发，理解结构如何承载与传力</p></div><span>{learningModules.length} 个模块</span></header>
            <button type="button" className="home-beam-entry" onClick={() => onNavigate('static', 'beam')} aria-label="静定梁：从一根梁开始">
              <div className="home-beam-copy"><span className="home-start-label">推荐起点</span><h4>从一根梁开始</h4><p>改变荷载，观察剪力与弯矩，建立受力分析的直觉。</p><span className="home-entry-link">进入静定梁<ArrowRight size={15} /></span></div>
              <svg className="home-beam-figure" viewBox="0 0 260 146" role="img" aria-label="简支梁示意：跨中集中力 P，左侧铰支座，右侧滚动支座">
                <line x1="25" y1="77" x2="235" y2="77" stroke="#9fe8ed" strokeWidth="3" />
                <EngineeringSupport x={25} y={77} ink="#a8bbca" paper="#132b37" />
                <EngineeringSupport x={235} y={77} roller ink="#a8bbca" paper="#132b37" />
                <g stroke="#efc486" fill="#efc486" strokeWidth="1.8"><line x1="130" y1="31" x2="130" y2="70" /><path d="M125 62 L130 72 L135 62" fill="none" /><text x="143" y="40" stroke="none" fontSize="13">P</text></g>
                <g stroke="#91a6b9" strokeWidth=".8" fill="#a8bbca"><line x1="25" y1="121" x2="235" y2="121" />{[25,235].map(x => <line key={x} x1={x} x2={x} y1="117" y2="125" />)}<text x="130" y="136" textAnchor="middle" stroke="none" fontSize="11">简支梁</text></g>
              </svg>
            </button>
            <div className="home-structure-directory">{learningModules.filter(item => item.id !== 'beam').map(item => <button key={item.id} type="button" className={`home-topic-entry${item.id === 'geometry' ? ' home-foundation-entry' : ''}`} onClick={() => onNavigate('static', item.id)}><item.icon size={19} strokeWidth={1.6} /><span><strong>{item.name}</strong><small>{item.description}</small></span><ChevronRight size={15} /></button>)}</div>
          </section>
          <section className="home-learning-path home-influence-path" aria-labelledby="influence-learning-title">
            <header className="home-path-heading"><TrendingUp size={22} strokeWidth={1.6} /><div><h3 id="influence-learning-title">影响线分析</h3><p>找到移动荷载的控制位置</p></div><span>{influenceModules.length} 个模块</span></header>
            <div className="home-influence-topics">{[{title:'绘制影响线',items:influenceModules.slice(0,2)},{title:'分析移动荷载',items:influenceModules.slice(2)}].map(group => <div className="home-topic-group" key={group.title}><h4>{group.title}</h4>{group.items.map(item => <button key={item.id} type="button" className="home-topic-entry" onClick={() => onNavigate('influence', item.id)}><item.icon size={19} strokeWidth={1.6} /><span><strong>{item.name}</strong><small>{item.description}</small></span><ChevronRight size={15} /></button>)}</div>)}</div>
          </section>
        </div>
      </section>
      <div className="home-study-guide">
        <ol className="home-workflow" aria-label="学习与建模流程">{workflow.map(step => <li key={step.title}><step.icon size={18} strokeWidth={1.6} /><div><h3>{step.title}</h3><p>{step.description}</p></div></li>)}</ol>
        <div className="home-tutor-help"><Bot size={23} strokeWidth={1.6} /><div><strong>学习时，带上你的 AI 助教</strong><p>配置模型后，进入学习模块讨论受力、公式与求解步骤。</p><button type="button" onClick={onOpenSettings}><Settings2 size={13} />AI 模型设置<ArrowRight size={13} /></button></div></div>
      </div>
      <footer className="home-learning-footer"><span>在交互中观察，在推导中理解。</span><div className="home-resource-links"><span>学习与交流</span><a href="https://www.douyin.com/user/self" target="_blank" rel="noopener noreferrer">抖音<ArrowUpRight size={12} /></a><a href="https://www.xiaohongshu.com/user/profile/67b884d2000000000e013859" target="_blank" rel="noopener noreferrer">小红书<ArrowUpRight size={12} /></a><button type="button" ref={wechatTriggerRef} onClick={() => setShowWechatQR(true)}>微信<ArrowUpRight size={12} /></button></div></footer>
      </div>
    </div>
    {showWechatQR && <div className="ui-modal-backdrop" onClick={closeWechat}><div role="dialog" aria-modal="true" aria-label="作者微信二维码" className="wechat-dialog" onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') closeWechat(); if (event.key === 'Tab') event.preventDefault(); }}><button type="button" autoFocus aria-label="关闭二维码" className="ui-icon-button" onClick={closeWechat}><X size={18} /></button><h2>扫码添加作者微信</h2><p>获取学习资源和技术交流</p><div className="wechat-qr"><img src={wechatQrUrl} alt="微信二维码" /></div><small>使用微信扫一扫</small></div></div>}
  </div>;
};
export default HomePage;
