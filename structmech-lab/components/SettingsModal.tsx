import React, { useState } from 'react';
import { AI_MODELS, VISION_MODELS } from '../utils/aiModels';
import {
  X, Key, Save, Check, Wifi, WifiOff, Loader2,
  ExternalLink, HelpCircle, ChevronRight, Eye
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [showHelp, setShowHelp] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState(() => localStorage.getItem('ai_model') || 'deepseek');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('ai_api_key') || '');
  const [saved, setSaved] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [visionModelId, setVisionModelId] = useState(() => localStorage.getItem('vision_model') || 'kimi-k2.5');
  const [visionApiKey, setVisionApiKey] = useState(() => localStorage.getItem('vision_api_key') || '');
  const [visionTestStatus, setVisionTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [visionTestMessage, setVisionTestMessage] = useState('');

  const saveSettings = () => {
    localStorage.setItem('ai_model', selectedModelId);
    localStorage.setItem('ai_api_key', apiKey);
    localStorage.setItem('vision_model', visionModelId);
    localStorage.setItem('vision_api_key', visionApiKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const testVisionConnection = async () => {
    if (!visionApiKey) {
      setVisionTestStatus('error');
      setVisionTestMessage('请先输入视觉模型 API Key');
      return;
    }
    setVisionTestStatus('testing');
    setVisionTestMessage('正在测试连接...');
    const model = VISION_MODELS.find(m => m.id === visionModelId);
    if (!model) return;
    try {
      const response = await fetch(model.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${visionApiKey}` },
        body: JSON.stringify({ model: model.model, messages: [{ role: 'user', content: '你好' }], max_tokens: 10 }),
      });
      if (response.ok) {
        setVisionTestStatus('success');
        setVisionTestMessage('连接成功！');
      } else {
        setVisionTestStatus('error');
        setVisionTestMessage(`连接失败: ${response.status}`);
      }
    } catch {
      setVisionTestStatus('error');
      setVisionTestMessage('网络错误，请检查网络');
    }
    setTimeout(() => { setVisionTestStatus('idle'); setVisionTestMessage(''); }, 3000);
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-100 p-2 rounded-xl"><Key size={20} className="text-indigo-600" /></div>
            <h2 className="text-lg font-bold text-slate-800">AI 助教设置</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors"><X size={20} className="text-slate-500" /></button>
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

          {/* Vision Model Section */}
          <div className="border-t border-slate-200 pt-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-violet-100 p-2 rounded-xl"><Eye size={20} className="text-violet-600" /></div>
              <div>
                <h3 className="text-base font-bold text-slate-800">视觉识别模型</h3>
                <p className="text-xs text-slate-500">上传结构力学图片自动识别建模</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-3">选择视觉模型</label>
              <div className="space-y-2">
                {VISION_MODELS.map(model => (
                  <label key={model.id} className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all ${visionModelId === model.id ? 'border-violet-500 bg-violet-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className="flex items-center gap-3">
                      <input type="radio" name="vision_model" value={model.id} checked={visionModelId === model.id} onChange={() => setVisionModelId(model.id)} className="w-4 h-4 text-violet-600" />
                      <div>
                        <span className="font-medium text-slate-800">{model.name}</span>
                        <span className="text-xs text-slate-500 ml-2">{model.desc}</span>
                      </div>
                    </div>
                    <a href={model.getKeyUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-600 hover:text-violet-800 flex items-center gap-1">
                      获取 Key <ExternalLink size={12} />
                    </a>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-semibold text-slate-700 mb-2">视觉模型 API Key</label>
              <input type="password" value={visionApiKey} onChange={e => setVisionApiKey(e.target.value)} placeholder="输入视觉模型的 API Key" className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all" />
            </div>

            <div className="flex items-center gap-3 mt-4">
              <button onClick={testVisionConnection} disabled={visionTestStatus === 'testing'} className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-medium text-slate-700 transition-colors disabled:opacity-50">
                {visionTestStatus === 'testing' ? <Loader2 size={16} className="animate-spin" /> : visionTestStatus === 'success' ? <Wifi size={16} className="text-green-600" /> : visionTestStatus === 'error' ? <WifiOff size={16} className="text-red-600" /> : <Wifi size={16} />}
                测试连接
              </button>
              {visionTestMessage && <span className={`text-sm ${visionTestStatus === 'success' ? 'text-green-600' : visionTestStatus === 'error' ? 'text-red-600' : 'text-slate-500'}`}>{visionTestMessage}</span>}
            </div>
          </div>

          {/* Save Button */}
          <button onClick={saveSettings} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition-colors shadow-lg">
            {saved ? <><Check size={18} /> 已保存</> : <><Save size={18} /> 保存设置</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
