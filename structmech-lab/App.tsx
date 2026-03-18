import React, { useState } from 'react';
import { ModuleType, StaticSubModule, InfluenceSubModule } from './types';
import SolverModule from './components/SolverModule';
import StaticModule from './components/StaticModule';
import InfluenceModule from './components/InfluenceModule';
import HomePage from './components/HomePage';
import ActivationModal from './components/ActivationModal';
import SettingsModal from './components/SettingsModal';
import Sidebar, { staticSubModules, influenceSubModules } from './components/Sidebar';
import { Calculator, GitBranch, TrendingUp, Menu } from 'lucide-react';

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
  const [activeModule, setActiveModule] = useState<ModuleType | 'HOME'>('HOME');
  const [staticExpanded, setStaticExpanded] = useState(true);
  const [influenceExpanded, setInfluenceExpanded] = useState(false);
  const [activeStaticSub, setActiveStaticSub] = useState<StaticSubModule>('geometry');
  const [activeInfluenceSub, setActiveInfluenceSub] = useState<InfluenceSubModule>('static');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // 设置面板状态
  const [showSettings, setShowSettings] = useState(false);

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
    } else {
      setShowActivationModal(true);
    }
  };


  const handleHomeNavigate = (module: 'static' | 'influence' | 'solver', subModule?: string) => {
    if (module === 'static') {
      setActiveModule(ModuleType.STATIC);
      setStaticExpanded(true);
      if (subModule) setActiveStaticSub(subModule as StaticSubModule);
    } else if (module === 'influence') {
      setActiveModule(ModuleType.INFLUENCE);
      setInfluenceExpanded(true);
      if (subModule) setActiveInfluenceSub(subModule as InfluenceSubModule);
    } else {
      // 求解器需要激活码
      if (isActivated) {
        setActiveModule(ModuleType.SOLVER);
      } else {
        setShowActivationModal(true);
      }
    }
  };

  const handleStaticClick = () => { setStaticExpanded(!staticExpanded); setActiveModule(ModuleType.STATIC); };
  const handleStaticSubClick = (subId: StaticSubModule) => { setActiveStaticSub(subId); setActiveModule(ModuleType.STATIC); };
  const handleInfluenceClick = () => { setInfluenceExpanded(!influenceExpanded); setActiveModule(ModuleType.INFLUENCE); };
  const handleInfluenceSubClick = (subId: InfluenceSubModule) => { setActiveInfluenceSub(subId); setActiveModule(ModuleType.INFLUENCE); };

  if (activeModule === 'HOME') {
    return (
      <div className="h-screen overflow-hidden">
        <HomePage onNavigate={handleHomeNavigate} />
        <ActivationModal
          isOpen={showActivationModal}
          onClose={() => setShowActivationModal(false)}
          onActivate={handleActivate}
          isActivated={isActivated}
        />
      </div>
    );
  }

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="flex h-screen bg-slate-100 text-slate-800 font-sans overflow-hidden">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={closeSidebar} />
      )}
      <div className={`fixed inset-y-0 left-0 z-30 lg:static lg:z-10 transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <Sidebar
          activeModule={activeModule}
          activeStaticSub={activeStaticSub}
          activeInfluenceSub={activeInfluenceSub}
          staticExpanded={staticExpanded}
          influenceExpanded={influenceExpanded}
          isActivated={isActivated}
          onStaticClick={handleStaticClick}
          onStaticSubClick={(sub) => { handleStaticSubClick(sub); closeSidebar(); }}
          onInfluenceClick={handleInfluenceClick}
          onInfluenceSubClick={(sub) => { handleInfluenceSubClick(sub); closeSidebar(); }}
          onSolverClick={() => { handleSolverClick(); closeSidebar(); }}
          onGoHome={() => { setActiveModule('HOME'); closeSidebar(); }}
          onShowSettings={() => { setShowSettings(true); closeSidebar(); }}
        />
      </div>

      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 px-4 py-3 md:px-8 md:py-5 flex-shrink-0">
          <div className="flex items-center gap-3 md:gap-4">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-slate-100 text-slate-600">
              <Menu size={22} />
            </button>
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2.5 md:p-3 rounded-xl text-white shadow-lg">
              {activeModule === ModuleType.STATIC && <GitBranch size={20} className="md:w-6 md:h-6" />}
              {activeModule === ModuleType.INFLUENCE && <TrendingUp size={20} className="md:w-6 md:h-6" />}
              {activeModule === ModuleType.SOLVER && <Calculator size={20} className="md:w-6 md:h-6" />}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg md:text-2xl font-bold text-slate-900 truncate">
                {activeModule === ModuleType.STATIC && '静定结构分析'}
                {activeModule === ModuleType.INFLUENCE && '影响线分析'}
                {activeModule === ModuleType.SOLVER && '结构求解器'}
              </h2>
              <p className="text-slate-500 text-xs md:text-sm mt-0.5 truncate">
                {activeModule === ModuleType.STATIC && `当前：${staticSubModules.find(s => s.id === activeStaticSub)?.name}`}
                {activeModule === ModuleType.INFLUENCE && `当前：${influenceSubModules.find(s => s.id === activeInfluenceSub)?.name}`}
                {activeModule === ModuleType.SOLVER && '矩阵位移法求解'}
              </p>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-3 md:p-6">
          {activeModule === ModuleType.STATIC && <StaticModule activeSubModule={activeStaticSub} />}
          {activeModule === ModuleType.INFLUENCE && <InfluenceModule activeSubModule={activeInfluenceSub} />}
          {activeModule === ModuleType.SOLVER && <SolverModule />}
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
