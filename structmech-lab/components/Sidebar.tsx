import React from 'react';
import { ModuleType, StaticSubModule, InfluenceSubModule } from '../types';
import {
  Beaker, Calculator, GitBranch, ChevronDown, ChevronRight, Shapes, Minus, Square,
  Triangle, Archive, Layers, TrendingUp, Activity, Zap, BarChart3, Home, Settings, Lock,
  PanelLeftClose, PanelLeftOpen
} from 'lucide-react';

interface SidebarProps {
  activeModule: ModuleType | 'HOME';
  activeStaticSub: StaticSubModule;
  activeInfluenceSub: InfluenceSubModule;
  staticExpanded: boolean;
  influenceExpanded: boolean;
  isActivated: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onStaticClick: () => void;
  onStaticSubClick: (sub: StaticSubModule) => void;
  onInfluenceClick: () => void;
  onInfluenceSubClick: (sub: InfluenceSubModule) => void;
  onSolverClick: () => void;
  onGoHome: () => void;
  onShowSettings: () => void;
}

const staticSubModules: { id: StaticSubModule; name: string; icon: React.ReactNode }[] = [
  { id: 'geometry', name: '几何组成分析', icon: <Shapes size={16} /> },
  { id: 'beam', name: '静定梁', icon: <Minus size={16} /> },
  { id: 'frame', name: '静定刚架', icon: <Square size={16} /> },
  { id: 'truss', name: '静定桁架', icon: <Triangle size={16} /> },
  { id: 'arch', name: '静定拱', icon: <Archive size={16} /> },
  { id: 'composite', name: '组合结构', icon: <Layers size={16} /> },
];

const influenceSubModules: { id: InfluenceSubModule; name: string; icon: React.ReactNode }[] = [
  { id: 'static', name: '静力法', icon: <Activity size={16} /> },
  { id: 'kinematic', name: '机动法', icon: <Zap size={16} /> },
  { id: 'envelope', name: '内力包络图', icon: <BarChart3 size={16} /> },
  { id: 'application', name: '影响线应用', icon: <TrendingUp size={16} /> },
];

const Sidebar: React.FC<SidebarProps> = ({
  activeModule, activeStaticSub, activeInfluenceSub,
  staticExpanded, influenceExpanded, isActivated,
  collapsed, onToggleCollapse,
  onStaticClick, onStaticSubClick, onInfluenceClick, onInfluenceSubClick,
  onSolverClick, onGoHome, onShowSettings,
}) => {
  return (
    <aside className={`flex h-full flex-col bg-white border-r border-slate-200 shadow-xl z-10 flex-shrink-0 transition-all duration-300 ${collapsed ? 'w-[68px]' : 'w-64 xl:w-72'}`}>
      <div className={`border-b border-slate-100 flex items-center bg-gradient-to-r from-blue-50 to-sky-50 ${collapsed ? 'p-4 justify-center' : 'p-6 gap-4'}`}>
        <div className="bg-blue-600 p-2.5 rounded-lg text-white shadow-sm flex-shrink-0"><Beaker size={collapsed ? 22 : 26} /></div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="font-bold text-xl tracking-tight text-slate-900">StructLab</h1>
            <p className="text-sm text-slate-500 truncate">结构力学可视化</p>
          </div>
        )}
      </div>

      <nav className={`flex-1 overflow-y-auto ${collapsed ? 'p-2' : 'p-4'}`}>
        <button onClick={onGoHome} title="返回主页" aria-label="返回主页" className={`w-full flex items-center rounded-lg text-sm font-semibold transition-all mb-2 text-slate-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/35 ${collapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'}`}>
          <Home size={20} />{!collapsed && <span>返回主页</span>}
        </button>

        {/* 静定结构 */}
        <div className="mb-2">
          <button onClick={onStaticClick} title="静定结构" aria-label="静定结构" className={`w-full flex items-center rounded-lg text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/35 ${activeModule === ModuleType.STATIC ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-slate-50'} ${collapsed ? 'justify-center p-3' : 'justify-between px-4 py-3'}`}>
            {collapsed ? <GitBranch size={20} /> : (<><div className="flex items-center gap-3"><GitBranch size={20} /><span>静定结构</span></div>{staticExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</>)}
          </button>
          {!collapsed && staticExpanded && (
            <div className="ml-4 mt-2 border-l-2 border-slate-200 pl-3 space-y-1">
              {staticSubModules.map(sub => (
                <button key={sub.id} onClick={() => onStaticSubClick(sub.id)} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${activeModule === ModuleType.STATIC && activeStaticSub === sub.id ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
                  {sub.icon}{sub.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 影响线 */}
        <div className="mb-2">
          <button onClick={onInfluenceClick} title="影响线" aria-label="影响线" className={`w-full flex items-center rounded-lg text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/35 ${activeModule === ModuleType.INFLUENCE ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-slate-50'} ${collapsed ? 'justify-center p-3' : 'justify-between px-4 py-3'}`}>
            {collapsed ? <TrendingUp size={20} /> : (<><div className="flex items-center gap-3"><TrendingUp size={20} /><span>影响线</span></div>{influenceExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</>)}
          </button>
          {!collapsed && influenceExpanded && (
            <div className="ml-4 mt-2 border-l-2 border-slate-200 pl-3 space-y-1">
              {influenceSubModules.map(sub => (
                <button key={sub.id} onClick={() => onInfluenceSubClick(sub.id)} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${activeModule === ModuleType.INFLUENCE && activeInfluenceSub === sub.id ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
                  {sub.icon}{sub.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <button onClick={onSolverClick} title="结构求解器" aria-label="结构求解器" className={`w-full flex items-center rounded-lg text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/35 ${activeModule === ModuleType.SOLVER ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-slate-50'} ${collapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'}`}>
          <Calculator size={20} />
          {!collapsed && <span>结构求解器</span>}
          {!collapsed && !isActivated && <Lock size={14} className="ml-auto text-amber-500" />}
          {collapsed && !isActivated && <span className="absolute top-1 right-1"><Lock size={10} className="text-amber-500" /></span>}
        </button>
      </nav>

      <div className={`border-t border-slate-100 ${collapsed ? 'p-2 space-y-2' : 'p-4 space-y-3'}`}>
        <button onClick={onShowSettings} title="设置" aria-label="设置" className={`w-full flex items-center rounded-lg text-sm font-semibold transition-all text-slate-600 hover:bg-slate-50 hover:text-indigo-600 group focus:outline-none focus:ring-2 focus:ring-blue-500/35 ${collapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'}`}>
          <Settings size={20} className="group-hover:rotate-90 transition-transform duration-500" />{!collapsed && <span>设置</span>}
        </button>
        <button onClick={onToggleCollapse} title={collapsed ? '展开侧边栏' : '收起侧边栏'} aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'} className={`w-full flex items-center rounded-lg text-sm font-semibold transition-all text-slate-400 hover:bg-slate-50 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/35 ${collapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'}`}>
          {collapsed ? <PanelLeftOpen size={20} /> : <><PanelLeftClose size={20} /><span>收起侧边栏</span></>}
        </button>
        {!collapsed && <div className="bg-gradient-to-r from-slate-50 to-slate-100 p-3 rounded-xl text-xs text-slate-500"><strong className="text-slate-700">Version 3.0</strong> · 静定结构分析</div>}
      </div>
    </aside>
  );
};

export { staticSubModules, influenceSubModules };
export default Sidebar;
