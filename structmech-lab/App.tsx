import React, { useState } from 'react';
import { ModuleType } from './types';
import SolverModule from './components/SolverModule';
import StaticModule from './components/StaticModule';
import InfluenceModule from './components/InfluenceModule';
import HomePage from './components/HomePage';
import { Beaker, Calculator, GitBranch, ChevronDown, ChevronRight, Shapes, Minus, Square, Triangle, Archive, Layers, TrendingUp, Activity, Zap, BarChart3, Home, Settings, X, Key, Save, Sparkles } from 'lucide-react';

type StaticSubModule = 'geometry' | 'beam' | 'frame' | 'truss' | 'arch' | 'composite';
type InfluenceSubModule = 'static' | 'kinematic' | 'envelope' | 'application';

const App: React.FC = () => {
  const [activeModule, setActiveModule] = useState<ModuleType | 'HOME'>('HOME');
  const [staticExpanded, setStaticExpanded] = useState(true);
  const [influenceExpanded, setInfluenceExpanded] = useState(false);
  const [activeStaticSub, setActiveStaticSub] = useState<StaticSubModule>('geometry');
  const [activeInfluenceSub, setActiveInfluenceSub] = useState<InfluenceSubModule>('static');
  
  // 设置面板状态
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('structlab_api_key') || '');
  const [apiEndpoint, setApiEndpoint] = useState(() => localStorage.getItem('structlab_api_endpoint') || 'https://api.openai.com/v1');
  const [apiModel, setApiModel] = useState(() => localStorage.getItem('structlab_api_model') || 'gpt-4o-mini');
  const [saved, setSaved] = useState(false);

  const saveSettings = () => {
    localStorage.setItem('structlab_api_key', apiKey);
    localStorage.setItem('structlab_api_endpoint', apiEndpoint);
    localStorage.setItem('structlab_api_model', apiModel);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const staticSubModules = [
    { id: 'geometry' as const, name: '几何组成分析', icon: <Shapes size={16} /> },
    { id: 'beam' as const, name: '静定梁', icon: <Minus size={16} /> },
    { id: 'frame' as const, name: '静定刚架', icon: <Square size={16} /> },
    { id: 'truss' as const, name: '静定桁架', icon: <Triangle size={16} /> },
    { id: 'arch' as const, name: '静定拱', icon: <Archive size={16} /> },
    { id: 'composite' as const, name: '组合结构', icon: <Layers size={16} /> },
  ];

  const influenceSubModules = [
    { id: 'static' as const, name: '静力法', icon: <Activity size={16} /> },
    { id: 'kinematic' as const, name: '机动法', icon: <Zap size={16} /> },
    { id: 'envelope' as const, name: '内力包络图', icon: <BarChart3 size={16} /> },
    { id: 'application' as const, name: '影响线应用', icon: <TrendingUp size={16} /> },
  ];

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
      setActiveModule(ModuleType.SOLVER);
    }
  };

  const handleStaticClick = () => {
    setStaticExpanded(!staticExpanded);
    setActiveModule(ModuleType.STATIC);
  };

  const handleStaticSubClick = (subId: StaticSubModule) => {
    setActiveStaticSub(subId);
    setActiveModule(ModuleType.STATIC);
  };

  const handleInfluenceClick = () => {
    setInfluenceExpanded(!influenceExpanded);
    setActiveModule(ModuleType.INFLUENCE);
  };

  const handleInfluenceSubClick = (subId: InfluenceSubModule) => {
    setActiveInfluenceSub(subId);
    setActiveModule(ModuleType.INFLUENCE);
  };

  // 首页时全屏显示，不显示侧边栏
  if (activeModule === 'HOME') {
    return (
      <div className="h-screen overflow-hidden">
        <HomePage onNavigate={handleHomeNavigate} />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-100 text-slate-800 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-72 flex-col bg-white border-r border-slate-200 shadow-xl z-10 flex-shrink-0">
        <div className="p-6 border-b border-slate-100 flex items-center gap-4 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-3 rounded-xl text-white shadow-lg">
            <Beaker size={26} />
          </div>
          <div>
            <h1 className="font-bold text-xl tracking-tight text-slate-900">StructLab</h1>
            <p className="text-sm text-slate-500">结构力学可视化</p>
          </div>
        </div>
        
        <nav className="flex-1 p-4 overflow-y-auto">
          {/* 主页 */}
          <button
            onClick={() => setActiveModule('HOME')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all mb-2 text-slate-600 hover:bg-slate-50"
          >
            <Home size={20} />
            <span>返回主页</span>
          </button>

          {/* 静定结构 - 一级导航 */}
          <div className="mb-2">
            <button
              onClick={handleStaticClick}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                activeModule === ModuleType.STATIC
                  ? 'bg-blue-50 text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <GitBranch size={20} />
                <span>静定结构</span>
              </div>
              {staticExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </button>
            
            {/* 二级导航 */}
            {staticExpanded && (
              <div className="ml-4 mt-2 border-l-2 border-slate-200 pl-3 space-y-1">
                {staticSubModules.map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() => handleStaticSubClick(sub.id)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      activeModule === ModuleType.STATIC && activeStaticSub === sub.id
                        ? 'bg-blue-100 text-blue-700 shadow-sm'
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                    }`}
                  >
                    {sub.icon}
                    {sub.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 影响线 - 一级导航 */}
          <div className="mb-2">
            <button
              onClick={handleInfluenceClick}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                activeModule === ModuleType.INFLUENCE
                  ? 'bg-blue-50 text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <TrendingUp size={20} />
                <span>影响线</span>
              </div>
              {influenceExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </button>
            
            {/* 二级导航 */}
            {influenceExpanded && (
              <div className="ml-4 mt-2 border-l-2 border-slate-200 pl-3 space-y-1">
                {influenceSubModules.map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() => handleInfluenceSubClick(sub.id)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      activeModule === ModuleType.INFLUENCE && activeInfluenceSub === sub.id
                        ? 'bg-blue-100 text-blue-700 shadow-sm'
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                    }`}
                  >
                    {sub.icon}
                    {sub.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 结构求解器 - 一级导航 */}
          <button
            onClick={() => setActiveModule(ModuleType.SOLVER)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeModule === ModuleType.SOLVER
                ? 'bg-blue-50 text-blue-700 shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Calculator size={20} />
            <span>结构求解器</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-100 space-y-3">
          {/* 设置按钮 */}
          <button
            onClick={() => setShowSettings(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all text-slate-600 hover:bg-slate-50 hover:text-indigo-600 group"
          >
            <Settings size={20} className="group-hover:rotate-90 transition-transform duration-500" />
            <span>设置</span>
          </button>
          
          <div className="bg-gradient-to-r from-slate-50 to-slate-100 p-3 rounded-xl text-xs text-slate-500 leading-relaxed">
            <strong className="text-slate-700">Version 3.0</strong> · 静定结构分析
          </div>
        </div>
      </aside>

      {/* 设置面板 */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowSettings(false)}>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 w-[480px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                  <Key size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">API 设置</h3>
                  <p className="text-xs text-slate-500">配置 AI 助教的 API 连接</p>
                </div>
              </div>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">API Endpoint</label>
                <input
                  type="text"
                  value={apiEndpoint}
                  onChange={e => setApiEndpoint(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">模型</label>
                <select
                  value={apiModel}
                  onChange={e => setApiModel(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                >
                  <option value="gpt-4o-mini">GPT-4o Mini</option>
                  <option value="gpt-4o">GPT-4o</option>
                  <option value="gpt-4-turbo">GPT-4 Turbo</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                  <option value="deepseek-chat">DeepSeek Chat</option>
                </select>
              </div>
            </div>

            <button
              onClick={saveSettings}
              className={`w-full mt-6 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all ${
                saved
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:shadow-lg hover:shadow-indigo-500/30'
              }`}
            >
              {saved ? <><Sparkles size={18} /> 已保存</> : <><Save size={18} /> 保存设置</>}
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="h-16 border-b border-slate-200 bg-white flex items-center px-8 justify-between shrink-0 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800">
            {activeModule === ModuleType.STATIC 
              ? staticSubModules.find(s => s.id === activeStaticSub)?.name 
              : activeModule === ModuleType.INFLUENCE
              ? influenceSubModules.find(s => s.id === activeInfluenceSub)?.name
              : '结构求解器'}
          </h2>
          <div className="flex items-center gap-2 text-sm text-slate-600 bg-green-50 px-4 py-1.5 rounded-full border border-green-200">
             <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
             运行中
          </div>
        </header>

        <div className="flex-1 overflow-hidden">
          {activeModule === ModuleType.SOLVER && <SolverModule />}
          {activeModule === ModuleType.STATIC && <StaticModule activeSubModule={activeStaticSub} />}
          {activeModule === ModuleType.INFLUENCE && <InfluenceModule activeSubModule={activeInfluenceSub} />}
        </div>
      </main>
    </div>
  );
};

export default App;
