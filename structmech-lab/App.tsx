import React, { useState } from 'react';
import { ModuleType } from './types';
import SolverModule from './components/SolverModule';
import StaticModule from './components/StaticModule';
import InfluenceModule from './components/InfluenceModule';
import HomePage from './components/HomePage';
import {
  Beaker, Calculator, GitBranch, ChevronDown, ChevronRight, Shapes, Minus, Square,
  Triangle, Archive, Layers, TrendingUp, Activity, Zap, BarChart3, Home, Settings,
  X, Key, Save, Sparkles, Check, Wifi, WifiOff, Loader2, ExternalLink, HelpCircle
} from 'lucide-react';

type StaticSubModule = 'geometry' | 'beam' | 'frame' | 'truss' | 'arch' | 'composite';
type InfluenceSubModule = 'static' | 'kinematic' | 'envelope' | 'application';

// AI 模型配置
const AI_MODELS = [
  { id: 'deepseek', name: 'DeepSeek', apiUrl: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat', getKeyUrl: 'https://platform.deepseek.com/api_keys', desc: '性价比高，推荐' },
  { id: 'qwen', name: '通义千问', apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-turbo', getKeyUrl: 'https://dashscope.console.aliyun.com/apiKey', desc: '阿里云' },
  { id: 'zhipu', name: '智谱AI', apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash', getKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys', desc: '清华系' },
  { id: 'moonshot', name: 'Moonshot', apiUrl: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-8k', getKeyUrl: 'https://platform.moonshot.cn/console/api-keys', desc: 'Kimi' },
  { id: 'doubao', name: '豆包', apiUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', model: 'doubao-lite-4k', getKeyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey', desc: '字节' },
];

const App: React.FC = () => {
  const [activeModule, setActiveModule] = useState<ModuleType | 'HOME'>('HOME');
  const [staticExpanded, setStaticExpanded] = useState(true);
  const [influenceExpanded, setInfluenceExpanded] = useState(false);
  const [activeStaticSub, setActiveStaticSub] = useState<StaticSubModule>('geometry');
  const [activeInfluenceSub, setActiveInfluenceSub] = useState<InfluenceSubModule>('static');

  // 设置面板状态
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState(() => localStorage.getItem('ai_model') || 'deepseek');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('ai_api_key') || '');
  const [saved, setSaved] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  const saveSettings = () => {
    localStorage.setItem('ai_model', selectedModelId);
    localStorage.setItem('ai_api_key', apiKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const testConnection = async () => {
    if (!apiKey) {
      setTestStatus('error');
      setTestMessage('请先输入 API Key');
      return;
    }
    setTestStatus('testing');
    setTestMessage('正在测试连接...');
    const model = AI_MODELS.find(m => m.id === selectedModelId);
    if (!model) return;
    try {
      const response = await fetch(model.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: model.model, messages: [{ role: 'user', content: '你好' }], max_tokens: 10 }),
      });
      if (response.ok) {
        setTestStatus('success');
        setTestMessage('连接成功！');
      } else {
        setTestStatus('error');
        setTestMessage(`连接失败: ${response.status}`);
      }
    } catch {
      setTestStatus('error');
      setTestMessage('网络错误，请检查网络');
    }
    setTimeout(() => { setTestStatus('idle'); setTestMessage(''); }, 3000);
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

  const handleStaticClick = () => { setStaticExpanded(!staticExpanded); setActiveModule(ModuleType.STATIC); };
  const handleStaticSubClick = (subId: StaticSubModule) => { setActiveStaticSub(subId); setActiveModule(ModuleType.STATIC); };
  const handleInfluenceClick = () => { setInfluenceExpanded(!influenceExpanded); setActiveModule(ModuleType.INFLUENCE); };
  const handleInfluenceSubClick = (subId: InfluenceSubModule) => { setActiveInfluenceSub(subId); setActiveModule(ModuleType.INFLUENCE); };

  if (activeModule === 'HOME') {
    return <div className="h-screen overflow-hidden"><HomePage onNavigate={handleHomeNavigate} /></div>;
  }

  return (
    <div className="flex h-screen bg-slate-100 text-slate-800 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-72 flex-col bg-white border-r border-slate-200 shadow-xl z-10 flex-shrink-0">
        <div className="p-6 border-b border-slate-100 flex items-center gap-4 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-3 rounded-xl text-white shadow-lg"><Beaker size={26} /></div>
          <div>
            <h1 className="font-bold text-xl tracking-tight text-slate-900">StructLab</h1>
            <p className="text-sm text-slate-500">结构力学可视化</p>
          </div>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <button onClick={() => setActiveModule('HOME')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all mb-2 text-slate-600 hover:bg-slate-50">
            <Home size={20} /><span>返回主页</span>
          </button>

          {/* 静定结构 */}
          <div className="mb-2">
            <button onClick={handleStaticClick} className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold transition-all ${activeModule === ModuleType.STATIC ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>
              <div className="flex items-center gap-3"><GitBranch size={20} /><span>静定结构</span></div>
              {staticExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </button>
            {staticExpanded && (
              <div className="ml-4 mt-2 border-l-2 border-slate-200 pl-3 space-y-1">
                {staticSubModules.map(sub => (
                  <button key={sub.id} onClick={() => handleStaticSubClick(sub.id)} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${activeModule === ModuleType.STATIC && activeStaticSub === sub.id ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
                    {sub.icon}{sub.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 影响线 */}
          <div className="mb-2">
            <button onClick={handleInfluenceClick} className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold transition-all ${activeModule === ModuleType.INFLUENCE ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>
              <div className="flex items-center gap-3"><TrendingUp size={20} /><span>影响线</span></div>
              {influenceExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </button>
            {influenceExpanded && (
              <div className="ml-4 mt-2 border-l-2 border-slate-200 pl-3 space-y-1">
                {influenceSubModules.map(sub => (
                  <button key={sub.id} onClick={() => handleInfluenceSubClick(sub.id)} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${activeModule === ModuleType.INFLUENCE && activeInfluenceSub === sub.id ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
                    {sub.icon}{sub.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button onClick={() => setActiveModule(ModuleType.SOLVER)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${activeModule === ModuleType.SOLVER ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>
            <Calculator size={20} /><span>结构求解器</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-100 space-y-3">
          <button onClick={() => setShowSettings(true)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all text-slate-600 hover:bg-slate-50 hover:text-indigo-600 group">
            <Settings size={20} className="group-hover:rotate-90 transition-transform duration-500" /><span>设置</span>
          </button>
          <div className="bg-gradient-to-r from-slate-50 to-slate-100 p-3 rounded-xl text-xs text-slate-500"><strong className="text-slate-700">Version 3.0</strong> · 静定结构分析</div>
        </div>
      </aside>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowSettings(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-100 p-2 rounded-xl"><Key size={20} className="text-indigo-600" /></div>
                <h2 className="text-lg font-bold text-slate-800">AI 助教设置</h2>
              </div>
              <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors"><X size={20} className="text-slate-500" /></button>
            </div>

            <div className="p-6 space-y-6">
              {/* Help Toggle */}
              <button onClick={() => setShowHelp(!showHelp)} className="w-full flex items-center justify-between p-4 bg-amber-50 rounded-xl hover:bg-amber-100 transition-colors">
                <div className="flex items-center gap-3">
                  <HelpCircle size={20} className="text-amber-600" />
                  <span className="font-medium text-amber-800">如何获取 API Key？</span>
                </div>
                <ChevronRight size={18} className={`text-amber-600 transition-transform ${showHelp ? 'rotate-90' : ''}`} />
              </button>

              {showHelp && (
                <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 space-y-3">
                  <p className="font-medium text-slate-800">📖 获取步骤：</p>
                  <ol className="list-decimal list-inside space-y-2 ml-2">
                    <li>选择下方任意一个 AI 模型</li>
                    <li>点击对应的"获取 Key"链接</li>
                    <li>注册/登录账号</li>
                    <li>在控制台创建 API Key</li>
                    <li>复制 Key 粘贴到下方输入框</li>
                  </ol>
                  <p className="text-xs text-slate-500 mt-3">💡 推荐使用 DeepSeek，性价比最高，新用户有免费额度</p>
                </div>
              )}

              {/* Model Selection */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-3">选择 AI 模型</label>
                <div className="space-y-2">
                  {AI_MODELS.map(model => (
                    <label key={model.id} className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all ${selectedModelId === model.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}>
                      <div className="flex items-center gap-3">
                        <input type="radio" name="model" value={model.id} checked={selectedModelId === model.id} onChange={() => setSelectedModelId(model.id)} className="w-4 h-4 text-indigo-600" />
                        <div>
                          <span className="font-medium text-slate-800">{model.name}</span>
                          <span className="text-xs text-slate-500 ml-2">{model.desc}</span>
                        </div>
                      </div>
                      <a href={model.getKeyUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                        获取 Key <ExternalLink size={12} />
                      </a>
                    </label>
                  ))}
                </div>
              </div>

              {/* API Key Input */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">API Key</label>
                <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="输入你的 API Key" className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all" />
              </div>

              {/* Test Connection */}
              <div className="flex items-center gap-3">
                <button onClick={testConnection} disabled={testStatus === 'testing'} className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-medium text-slate-700 transition-colors disabled:opacity-50">
                  {testStatus === 'testing' ? <Loader2 size={16} className="animate-spin" /> : testStatus === 'success' ? <Wifi size={16} className="text-green-600" /> : testStatus === 'error' ? <WifiOff size={16} className="text-red-600" /> : <Wifi size={16} />}
                  测试连接
                </button>
                {testMessage && <span className={`text-sm ${testStatus === 'success' ? 'text-green-600' : testStatus === 'error' ? 'text-red-600' : 'text-slate-500'}`}>{testMessage}</span>}
              </div>

              {/* Save Button */}
              <button onClick={saveSettings} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition-colors shadow-lg">
                {saved ? <><Check size={18} /> 已保存</> : <><Save size={18} /> 保存设置</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        <header className="bg-white border-b border-slate-200 px-8 py-5 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-3 rounded-xl text-white shadow-lg">
              {activeModule === ModuleType.STATIC && <GitBranch size={24} />}
              {activeModule === ModuleType.INFLUENCE && <TrendingUp size={24} />}
              {activeModule === ModuleType.SOLVER && <Calculator size={24} />}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">
                {activeModule === ModuleType.STATIC && '静定结构分析'}
                {activeModule === ModuleType.INFLUENCE && '影响线分析'}
                {activeModule === ModuleType.SOLVER && '结构求解器'}
              </h2>
              <p className="text-slate-500 text-sm mt-0.5">
                {activeModule === ModuleType.STATIC && `当前：${staticSubModules.find(s => s.id === activeStaticSub)?.name}`}
                {activeModule === ModuleType.INFLUENCE && `当前：${influenceSubModules.find(s => s.id === activeInfluenceSub)?.name}`}
                {activeModule === ModuleType.SOLVER && '矩阵位移法求解'}
              </p>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6">
          {activeModule === ModuleType.STATIC && <StaticModule activeSubModule={activeStaticSub} />}
          {activeModule === ModuleType.INFLUENCE && <InfluenceModule activeSubModule={activeInfluenceSub} />}
          {activeModule === ModuleType.SOLVER && <SolverModule />}
        </div>
      </main>
    </div>
  );
};

export default App;
