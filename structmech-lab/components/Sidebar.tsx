import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ModuleType, StaticSubModule, InfluenceSubModule } from '../types';
import {
  Calculator, GitBranch, ChevronDown, ChevronRight, Shapes, Minus, Square,
  Triangle, Archive, Layers, TrendingUp, Activity, Zap, BarChart3, Home, Settings, Lock,
  PanelLeftClose, PanelLeftOpen, X, Box,
} from 'lucide-react';

interface SidebarProps {
  activeModule: ModuleType | 'HOME' | 'SETTINGS';
  activeStaticSub: StaticSubModule;
  activeInfluenceSub: InfluenceSubModule;
  staticExpanded: boolean;
  influenceExpanded: boolean;
  isActivated: boolean;
  collapsed: boolean;
  mobileOpen?: boolean;
  onClose?: () => void;
  onToggleCollapse: () => void;
  onStaticClick: () => void;
  onStaticSubClick: (sub: StaticSubModule) => void;
  onInfluenceClick: () => void;
  onInfluenceSubClick: (sub: InfluenceSubModule) => void;
  onSolverClick: () => void;
  activeSolverMode?: 'plane' | 'space';
  onSolverSubClick?: (mode: 'plane' | 'space') => void;
  onGoHome: () => void;
  onShowSettings: () => void;
}

const staticSubModules: { id: StaticSubModule; name: string; icon: React.ReactNode }[] = [
  { id: 'geometry', name: '几何组成分析', icon: <Shapes /> },
  { id: 'beam', name: '静定梁', icon: <Minus /> },
  { id: 'frame', name: '静定刚架', icon: <Square /> },
  { id: 'truss', name: '静定桁架', icon: <Triangle /> },
  { id: 'arch', name: '静定拱', icon: <Archive /> },
  { id: 'composite', name: '组合结构', icon: <Layers /> },
];
const influenceSubModules: { id: InfluenceSubModule; name: string; icon: React.ReactNode }[] = [
  { id: 'static', name: '静力法', icon: <Activity /> },
  { id: 'kinematic', name: '机动法', icon: <Zap /> },
  { id: 'envelope', name: '内力包络图', icon: <BarChart3 /> },
  { id: 'application', name: '影响线应用', icon: <TrendingUp /> },
];

export const StructLabMark = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 19V6h16v13M4 13h16M4 6l8 7 8-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    {[ [4,6], [20,6], [12,13], [4,19], [20,19] ].map(([x,y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="currentColor" />)}
  </svg>
);

type NavigationGroup = 'static' | 'influence' | 'solver';
const Sidebar: React.FC<SidebarProps> = props => {
  const { activeModule, activeStaticSub, activeInfluenceSub, staticExpanded, influenceExpanded, isActivated,
    collapsed, mobileOpen = false, onClose, onToggleCollapse, onStaticClick, onStaticSubClick,
    onInfluenceClick, onInfluenceSubClick, onSolverClick, onGoHome, onShowSettings } = props;
  const compact = collapsed && !mobileOpen;
  const [solverExpanded, setSolverExpanded] = useState(activeModule === ModuleType.SOLVER);
  useEffect(() => { if (activeModule === ModuleType.SOLVER) setSolverExpanded(true); else setSolverExpanded(false); }, [activeModule]);
  const solverSelected = props.activeSolverMode ?? 'plane';
  const groupLabel = (group: NavigationGroup) => group === 'solver' ? '结构求解器' : group === 'static' ? '静定结构' : '影响线';
  const [flyout, setFlyout] = useState<{ group: NavigationGroup; top: number } | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { setFlyout(null); }, [collapsed, mobileOpen]);
  useEffect(() => {
    if (!flyout) return;
    const dismiss = (event: PointerEvent) => {
      if (!sidebarRef.current?.contains(event.target as Node) && !flyoutRef.current?.contains(event.target as Node)) setFlyout(null);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setFlyout(null); triggerRef.current?.focus(); }
    };
    const currentItem = flyoutRef.current?.querySelector<HTMLButtonElement>('[aria-current="page"]');
    (currentItem ?? flyoutRef.current?.querySelector<HTMLButtonElement>('.sidebar-subitem'))?.focus();
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', keyboard); };
  }, [flyout]);

  const subItems = (group: NavigationGroup) => group === 'static'
    ? staticSubModules.map(item => <button key={item.id} type="button" className="sidebar-subitem" aria-current={activeModule === ModuleType.STATIC && activeStaticSub === item.id ? 'page' : undefined} onClick={() => { setFlyout(null); onStaticSubClick(item.id); }}>{item.icon}<span>{item.name}</span></button>)
    : group === 'solver'
    ? (['plane', 'space'] as const).map(mode => <button key={mode} type="button" className="sidebar-subitem" aria-current={activeModule === ModuleType.SOLVER && solverSelected === mode ? 'page' : undefined} onClick={() => { setFlyout(null); setSolverExpanded(true); props.onSolverSubClick ? props.onSolverSubClick(mode) : onSolverClick(); }}>{mode === 'plane' ? <Square /> : <Box />}<span>{mode === 'plane' ? '平面结构' : '空间结构'}</span></button>)
    : influenceSubModules.map(item => <button key={item.id} type="button" className="sidebar-subitem" aria-current={activeModule === ModuleType.INFLUENCE && activeInfluenceSub === item.id ? 'page' : undefined} onClick={() => { setFlyout(null); onInfluenceSubClick(item.id); }}>{item.icon}<span>{item.name}</span></button>);

  const openGroup = (group: NavigationGroup, event: React.MouseEvent<HTMLButtonElement>) => {
    if (!compact) { if (group === 'solver') { setSolverExpanded(v => !v); if (activeModule !== ModuleType.SOLVER) onSolverClick(); } else { group === 'static' ? onStaticClick() : onInfluenceClick(); } return; }
    triggerRef.current = event.currentTarget;
    const estimatedHeight = (group === 'static' ? 6 : group === 'solver' ? 2 : 4) * 40 + 68;
    const top = Math.max(12, Math.min(event.currentTarget.getBoundingClientRect().top, window.innerHeight - estimatedHeight - 12));
    setFlyout(prev => prev?.group === group ? null : { group, top });
  };
  const tooltip = (label: string) => compact && <span className="sidebar-tooltip" aria-hidden="true">{label}</span>;

  return <aside ref={sidebarRef} aria-label="主导航" className={`app-sidebar ${compact ? 'is-compact' : ''}`}>
    <div className="sidebar-brand">
      <button type="button" className="sidebar-brand-mark" aria-label="StructLab 首页" title="StructLab 首页" onClick={() => { setFlyout(null); onGoHome(); }}><StructLabMark /></button>
      {!compact && <div className="sidebar-wordmark"><span>StructLab</span><small>结构力学实验室</small></div>}
      <button type="button" className="sidebar-mobile-close" aria-label="关闭导航" onClick={onClose}><X size={18} /></button>
    </div>
    <nav aria-label="模块导航" className="sidebar-navigation">
      <div className="sidebar-entry">
        <button type="button" aria-label="返回主页" className="sidebar-item" aria-current={activeModule === 'HOME' ? 'page' : undefined} onClick={() => { setFlyout(null); onGoHome(); }}><Home /><span className="sidebar-label">概览</span></button>{tooltip('概览')}
      </div>
      <div className="sidebar-section-label">学习与分析</div>
      {(['static', 'influence'] as const).map(group => {
        const label = group === 'static' ? '静定结构' : '影响线';
        const active = activeModule === (group === 'static' ? ModuleType.STATIC : ModuleType.INFLUENCE);
        const expanded = compact ? flyout?.group === group : group === 'static' ? staticExpanded : influenceExpanded;
        return <div key={group} className="sidebar-group">
          <div className="sidebar-entry">
            <button type="button" className="sidebar-item" data-active={active || undefined} aria-label={label} aria-expanded={expanded} aria-controls={`${group}-navigation`} onClick={event => openGroup(group, event)}>
              {group === 'static' ? <GitBranch /> : <TrendingUp />}<span className="sidebar-label">{label}</span>
              {!compact && <><span className="sidebar-count">{group === 'static' ? 6 : 4}</span><ChevronDown className={`sidebar-chevron ${expanded ? 'is-expanded' : ''}`} /></>}
            </button>{!expanded && tooltip(label)}
          </div>
          {!compact && expanded && <div id={`${group}-navigation`} className="sidebar-subnavigation">{subItems(group)}</div>}
        </div>;
      })}
      <div className="sidebar-section-label">建模工作台</div>
      <div className="sidebar-group">
        <div className="sidebar-entry">
          <button type="button" className="sidebar-item sidebar-solver" aria-label="结构求解器" data-active={activeModule === ModuleType.SOLVER || undefined} aria-expanded={compact ? flyout?.group === 'solver' : solverExpanded} aria-controls="solver-navigation" onClick={event => openGroup('solver', event)}>
            <Calculator /><span className="sidebar-label">结构求解器</span>{!isActivated && <Lock className="sidebar-lock" aria-label="需要激活" />}{!compact && <ChevronDown className={`sidebar-chevron ${solverExpanded ? 'is-expanded' : ''}`} />}
          </button>{tooltip(isActivated ? '结构求解器' : '结构求解器 · 需要激活')}
        </div>
        {!compact && solverExpanded && <div id="solver-navigation" className="sidebar-subnavigation">{subItems('solver')}</div>}
      </div>
    </nav>
    <div className="sidebar-footer">
      <div className="sidebar-entry"><button type="button" className="sidebar-item" aria-label="设置" aria-current={activeModule === 'SETTINGS' ? 'page' : undefined} onClick={() => { setFlyout(null); onShowSettings(); }}><Settings /><span className="sidebar-label">AI 模型设置</span></button>{tooltip('AI 模型设置')}</div>
      <div className="sidebar-entry sidebar-collapse"><button type="button" className="sidebar-item" aria-label={compact ? '展开侧边栏' : '收起侧边栏'} aria-expanded={!compact} onClick={onToggleCollapse}>{compact ? <PanelLeftOpen /> : <PanelLeftClose />}<span className="sidebar-label">收起侧边栏</span><span className="sidebar-fold-hint" aria-hidden="true">‹</span></button>{tooltip('展开侧边栏')}</div>
    </div>
    {compact && flyout && createPortal(<div ref={flyoutRef} id={`${flyout.group}-navigation`} role="dialog" aria-label={`${groupLabel(flyout.group)}子模块`} className="sidebar-flyout" style={{ top: flyout.top, left: 80 }}>
      <div className="sidebar-flyout-heading"><span>{groupLabel(flyout.group)}</span><button type="button" aria-label="关闭子模块菜单" onClick={() => { setFlyout(null); triggerRef.current?.focus(); }}><X size={16} /></button></div>
      <nav aria-label="子模块">{subItems(flyout.group)}</nav>
    </div>, document.body)}
  </aside>;
};

export { staticSubModules, influenceSubModules };
export default Sidebar;
