import ProgressBar from './components/ui/ProgressBar';
import React, { useState, useEffect, useRef } from 'react';
import { ModuleType, StaticSubModule, InfluenceSubModule } from './types';
import SolverModule from './components/SolverModule';
import StaticModule from './components/StaticModule';
import InfluenceModule from './components/InfluenceModule';
import HomePage from './components/HomePage';
import ActivationModal from './components/ActivationModal';
import SettingsPage from './components/SettingsPage';
import Sidebar, { staticSubModules, influenceSubModules } from './components/Sidebar';
import { Calculator, GitBranch, TrendingUp, Menu, ChevronRight, Settings2 } from 'lucide-react';

// 有效的激活码列表（实际使用时可以改为从服务器验证）
// 激活码验证算法：基于校验位验证，无需预存激活码
const validateActivationCode = (code: string): boolean => {
  // 格式检查：XXXX-XXXX-XXXX-XXXX
  const pattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  if (!pattern.test(code.toUpperCase())) return false;
  
  const parts = code.toUpperCase().split('-');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  
  // 计算前三段的校验和
  let checksum = 0;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) {
      checksum += chars.indexOf(parts[i][j]) * (i * 4 + j + 1);
    }
  }
  
  // 验证第四段是否匹配校验和
  const expectedCheck = [
    chars[(checksum * 7) % 36],
    chars[(checksum * 13) % 36],
    chars[(checksum * 17) % 36],
    chars[(checksum * 23) % 36]
  ].join('');
  
  return parts[3] === expectedCheck;
};

const App: React.FC = () => {
  const [solverMode, setSolverMode] = useState<'plane' | 'space'>('plane');
  const [activeModule, setActiveModule] = useState<ModuleType | 'HOME' | 'SETTINGS'>('HOME');
  const [staticExpanded, setStaticExpanded] = useState(false);
  const [influenceExpanded, setInfluenceExpanded] = useState(false);
  const [activeStaticSub, setActiveStaticSub] = useState<StaticSubModule>('geometry');
  const [activeInfluenceSub, setActiveInfluenceSub] = useState<InfluenceSubModule>('static');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [visitedModules, setVisitedModules] = useState<ModuleType[]>([]);
  const navigationRef = useRef<HTMLDivElement>(null);
  const navigationTriggerRef = useRef<HTMLButtonElement>(null);
  const workspaceTitleRef = useRef<HTMLHeadingElement>(null);
  const settingsReturnRef = useRef<ModuleType | 'HOME'>('HOME');
  useEffect(() => {
    if (activeModule !== 'HOME' && activeModule !== 'SETTINGS') setVisitedModules(prev => prev.includes(activeModule) ? prev : [...prev, activeModule]);
  }, [activeModule]);
  useEffect(() => {
    if (activeModule === 'SETTINGS' && !sidebarOpen) workspaceTitleRef.current?.focus();
  }, [activeModule, sidebarOpen]);
  useEffect(() => {
    if (!sidebarOpen) return;
    navigationRef.current?.querySelector<HTMLButtonElement>('[aria-label="关闭导航"]')?.focus();
    return () => navigationTriggerRef.current?.focus();
  }, [sidebarOpen]);
  useEffect(() => {
    if (!window.matchMedia) return;
    const desktop = window.matchMedia('(min-width:1024px)');
    const closeDrawerOnDesktop = () => { if (desktop.matches) setSidebarOpen(false); };
    desktop.addEventListener('change', closeDrawerOnDesktop);
    return () => desktop.removeEventListener('change', closeDrawerOnDesktop);
  }, []);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });
  const toggleSidebarCollapse = () => {
    setSidebarCollapsed(prev => {
      localStorage.setItem('sidebarCollapsed', String(!prev));
      return !prev;
    });
  };

  const openSettings = () => {
    if (activeModule !== 'SETTINGS') settingsReturnRef.current = activeModule;
    setActiveModule('SETTINGS');
    setSidebarOpen(false);
  };

  // 激活码状态 - 检查是否有有效的激活码
  const [isActivated, setIsActivated] = useState(() => {
    const savedCode = localStorage.getItem('activationCode');
    if (savedCode) {
      return validateActivationCode(savedCode);
    }
    return false;
  });
  const [showActivationModal, setShowActivationModal] = useState(false);

  // 验证激活码
  const handleActivate = (code: string): boolean => {
    if (validateActivationCode(code)) {
      setIsActivated(true);
      localStorage.setItem('activationCode', code);
      return true;
    }
    return false;
  };

  // 点击求解器模块
  const handleSolverClick = () => {
    if (isActivated) {
      setActiveModule(ModuleType.SOLVER);
      setStaticExpanded(false);
      setInfluenceExpanded(false);
    } else {
      setShowActivationModal(true);
    }
  };


  const handleHomeNavigate = (module: 'static' | 'influence' | 'solver', subModule?: string) => {
    if (module === 'static') {
      setActiveModule(ModuleType.STATIC);
      setStaticExpanded(true);
      setInfluenceExpanded(false);
      if (subModule) setActiveStaticSub(subModule as StaticSubModule);
    } else if (module === 'influence') {
      setActiveModule(ModuleType.INFLUENCE);
      setInfluenceExpanded(true);
      setStaticExpanded(false);
      if (subModule) setActiveInfluenceSub(subModule as InfluenceSubModule);
    } else {
      // 求解器需要激活码
      if (isActivated) {
        setActiveModule(ModuleType.SOLVER);
        setStaticExpanded(false);
        setInfluenceExpanded(false);
      } else {
        setShowActivationModal(true);
      }
    }
  };

  const handleStaticClick = () => { setStaticExpanded(activeModule !== ModuleType.STATIC || !staticExpanded); setInfluenceExpanded(false); setActiveModule(ModuleType.STATIC); };
  const handleStaticSubClick = (subId: StaticSubModule) => { setActiveStaticSub(subId); setStaticExpanded(true); setInfluenceExpanded(false); setActiveModule(ModuleType.STATIC); };
  const handleInfluenceClick = () => { setInfluenceExpanded(activeModule !== ModuleType.INFLUENCE || !influenceExpanded); setStaticExpanded(false); setActiveModule(ModuleType.INFLUENCE); };
  const handleInfluenceSubClick = (subId: InfluenceSubModule) => { setActiveInfluenceSub(subId); setInfluenceExpanded(true); setStaticExpanded(false); setActiveModule(ModuleType.INFLUENCE); };

  const closeSidebar = () => setSidebarOpen(false);
  const isHome = activeModule === 'HOME';
  const moduleTitle = activeModule === 'HOME' ? '工作区概览' : activeModule === 'SETTINGS' ? '设置' : activeModule === ModuleType.STATIC ? '静定结构分析' : activeModule === ModuleType.INFLUENCE ? '影响线分析' : '结构求解器';
  const moduleDescription = activeModule === 'HOME' ? '学习、建模与结果分析' : activeModule === 'SETTINGS' ? 'AI 模型设置' : activeModule === ModuleType.STATIC ? staticSubModules.find(item => item.id === activeStaticSub)?.name : activeModule === ModuleType.INFLUENCE ? influenceSubModules.find(item => item.id === activeInfluenceSub)?.name : solverMode === 'space' ? '空间结构 · 三维求解' : '平面结构 · 绘图建模';

  return (
    <div className="app-shell">
      {/* Mobile sidebar overlay */}
      {!isHome && sidebarOpen && (
        <button type="button" tabIndex={-1} aria-label="关闭导航遮罩" className="navigation-scrim" onClick={closeSidebar} />
      )}
      {!isHome && <div ref={navigationRef} id="app-navigation" className={`app-sidebar-shell ${sidebarOpen ? 'is-open' : ''}`} role={sidebarOpen ? 'dialog' : undefined} aria-modal={sidebarOpen || undefined} aria-label={sidebarOpen ? '模块导航' : undefined} onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') { event.preventDefault(); closeSidebar(); }
        if (event.key !== 'Tab' || !sidebarOpen) return;
        const controls = Array.from((event.currentTarget as HTMLDivElement).querySelectorAll<HTMLButtonElement>('button:not([disabled])')).filter(button => button.getClientRects().length > 0);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
        <Sidebar
          activeModule={activeModule}
          activeStaticSub={activeStaticSub}
          activeInfluenceSub={activeInfluenceSub}
          staticExpanded={staticExpanded}
          influenceExpanded={influenceExpanded}
          isActivated={isActivated}
          collapsed={sidebarCollapsed}
          mobileOpen={sidebarOpen}
          onClose={closeSidebar}
          onToggleCollapse={toggleSidebarCollapse}
          onStaticClick={handleStaticClick}
          onStaticSubClick={(sub) => { handleStaticSubClick(sub); closeSidebar(); }}
          onInfluenceClick={handleInfluenceClick}
          onInfluenceSubClick={(sub) => { handleInfluenceSubClick(sub); closeSidebar(); }}
          onSolverClick={handleSolverClick}
          activeSolverMode={solverMode}
          onSolverSubClick={mode => { setSolverMode(mode); handleSolverClick(); closeSidebar(); }}
          onGoHome={() => { setActiveModule('HOME'); closeSidebar(); }}
          onShowSettings={openSettings}
        />
      </div>}

      <main className="app-main" inert={!isHome && sidebarOpen}>
        {!isHome && <header className="workspace-header">
          <div className="workspace-header-left">
            <button ref={navigationTriggerRef} type="button" aria-label="打开导航" aria-controls="app-navigation" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(true)} className="workspace-menu-button"><Menu size={20} /></button>
            <div className="workspace-module-icon">{activeModule === 'SETTINGS' ? <Settings2 size={18} /> : activeModule === ModuleType.STATIC ? <GitBranch size={18} /> : activeModule === ModuleType.INFLUENCE ? <TrendingUp size={18} /> : <Calculator size={18} />}</div>
            <div className="workspace-heading"><div className="workspace-breadcrumb"><button type="button" aria-label="返回概览" onClick={() => setActiveModule('HOME')}>工作区</button><ChevronRight size={12} /><span>{moduleTitle}</span></div><h1 ref={workspaceTitleRef} tabIndex={activeModule === 'SETTINGS' ? -1 : undefined}>{moduleDescription}</h1></div>
          </div>
          {(activeModule === ModuleType.STATIC || activeModule === ModuleType.INFLUENCE) && <div className="workspace-header-progress"><ProgressBar currentModule={moduleDescription} /></div>}
        </header>}
        <div className="app-module-content">
          <div hidden={activeModule !== 'HOME'} className="h-full"><HomePage onNavigate={handleHomeNavigate} onOpenSettings={openSettings} /></div>
          <div hidden={activeModule !== 'SETTINGS'} className="h-full"><SettingsPage onBack={() => setActiveModule(settingsReturnRef.current)} /></div>
          {(visitedModules.includes(ModuleType.STATIC) || activeModule === ModuleType.STATIC) && <div hidden={activeModule !== ModuleType.STATIC} className="h-full learning-workspace"><StaticModule activeSubModule={activeStaticSub} /></div>}
          {(visitedModules.includes(ModuleType.INFLUENCE) || activeModule === ModuleType.INFLUENCE) && <div hidden={activeModule !== ModuleType.INFLUENCE} className="h-full learning-workspace"><InfluenceModule activeSubModule={activeInfluenceSub} /></div>}
          {(visitedModules.includes(ModuleType.SOLVER) || activeModule === ModuleType.SOLVER) && <div hidden={activeModule !== ModuleType.SOLVER} className="h-full"><SolverModule mode={solverMode} onModeChange={setSolverMode} /></div>}
        </div>
      </main>

      {/* Activation Modal */}
      <ActivationModal
        isOpen={showActivationModal}
        onClose={() => setShowActivationModal(false)}
        onActivate={handleActivate}
        isActivated={isActivated}
      />
    </div>
  );
};

export default App;
