import React, { useState } from 'react';
import { AI_MODELS, VISION_MODELS, getAIModel, getVisionModel, getVisionApiKey } from '../utils/aiModels';
import { requestCompletion } from '../utils/aiTransport';
import { VISION_PROBE_MESSAGES, isVisionProbeAnswer } from '../utils/visionProbe';
import {
  ArrowLeft, Bot, Save, Check, Wifi, WifiOff, Loader2,
  ExternalLink, HelpCircle, ChevronDown, Eye, KeyRound
} from 'lucide-react';
import './SettingsPage.css';

interface SettingsPageProps {
  onBack: () => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ onBack }) => {
  const [selectedModelId, setSelectedModelId] = useState(() => localStorage.getItem('ai_model') || 'deepseek');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('ai_api_key') || '');
  const [saved, setSaved] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [visionModelId, setVisionModelId] = useState(() => { try { return getVisionModel().id; } catch { return ''; } });
  const [visionApiKey, setVisionApiKey] = useState(() => localStorage.getItem('vision_api_key') || '');
  const [visionTestStatus, setVisionTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [visionTestMessage, setVisionTestMessage] = useState('');

  const [savedSettings, setSavedSettings] = useState({ selectedModelId, apiKey, visionModelId, visionApiKey });
  const dirty = selectedModelId !== savedSettings.selectedModelId || apiKey !== savedSettings.apiKey
    || visionModelId !== savedSettings.visionModelId || visionApiKey !== savedSettings.visionApiKey;
  const testing = testStatus === 'testing' || visionTestStatus === 'testing';

  const saveSettings = () => {
    localStorage.setItem('ai_model', selectedModelId);
    localStorage.setItem('ai_api_key', apiKey);
    localStorage.setItem('vision_model', visionModelId);
    localStorage.setItem('vision_api_key', visionApiKey);
    setSavedSettings({ selectedModelId, apiKey, visionModelId, visionApiKey });
    setSaved(true);
  };

  const testVisionConnection = async () => {
    setVisionTestStatus('testing');
    setVisionTestMessage('正在验证图片识别...');
    try {
      const model = getVisionModel(visionModelId);
      const key = getVisionApiKey(model, visionApiKey, selectedModelId, apiKey);
      if (!key) throw new Error('请先输入视觉 Key；同厂商也可填写助教 Key');
      const answer = await requestCompletion(model, key, VISION_PROBE_MESSAGES, { maxTokens: 128 });
      if (!isVisionProbeAnswer(answer)) throw new Error('接口已响应，但未通过测试图片识别');
      setVisionTestStatus('success');
      setVisionTestMessage('图片识别连接成功！');
    } catch (error) {
      setVisionTestStatus('error');
      setVisionTestMessage(error instanceof Error ? error.message : '网络错误，请检查网络');
    }
  };

  const testConnection = async () => {
    setTestStatus('testing');
    setTestMessage('正在测试连接...');
    try {
      if (!apiKey.trim()) throw new Error('请先输入 API Key');
      await requestCompletion(getAIModel(selectedModelId), apiKey,
        [{ role: 'user', content: '你好，请只回复“连接成功”。' }], { maxTokens: 128 });
      setTestStatus('success');
      setTestMessage('连接成功！');
    } catch (error) {
      setTestStatus('error');
      setTestMessage(error instanceof Error ? error.message : '网络错误，请检查网络');
    }
  };

  const editTutor = () => {
    setSaved(false);
    setTestStatus('idle'); setTestMessage('');
    setVisionTestStatus('idle'); setVisionTestMessage('');
  };
  const editVision = () => {
    setSaved(false);
    setVisionTestStatus('idle'); setVisionTestMessage('');
  };

  return (
    <section className="settings-page" aria-label="AI 模型配置">
      <div className="settings-page-inner">
        <div className="settings-page-toolbar">
          <div>
            <button type="button" className="settings-back" onClick={onBack}><ArrowLeft size={15} />返回原工作区</button>
            <h2>连接你的 AI 助教</h2>
            <p>选择模型、填写密钥，分别验证学习助教和图片识别连接。</p>
          </div>
          <div className="settings-save-area">
            <button type="button" className="settings-save" disabled={testing || !AI_MODELS.some(m => m.id === selectedModelId) || !VISION_MODELS.some(m => m.id === visionModelId)} onClick={saveSettings}>
              {saved && !dirty ? <><Check size={16} />已保存</> : <><Save size={16} />保存设置</>}
            </button>
            <span role="status">{dirty ? '有未保存的更改' : '配置保存在当前浏览器'}</span>
          </div>
        </div>

        <div className="settings-model-columns">
          <section className="settings-model-panel" aria-labelledby="tutor-settings-title">
            <header className="settings-panel-heading"><span className="settings-panel-icon"><Bot size={22} /></span><div><h3 id="tutor-settings-title">AI 学习助教</h3><p>讨论受力、公式与求解步骤</p></div></header>
            <ModelPicker models={AI_MODELS} value={selectedModelId} name="model" legend="选择助教模型" disabled={testing} onChange={id => { setSelectedModelId(id); editTutor(); }} />
            <div className="settings-key-field">
              <label htmlFor="tutor-api-key"><KeyRound size={14} />助教 API Key</label>
              <input id="tutor-api-key" disabled={testing} type="password" autoComplete="off" value={apiKey} onChange={e => { setApiKey(e.target.value); editTutor(); }} placeholder="输入所选厂商的 API Key" />
              <p>从所选模型的官方控制台获取密钥。</p>
            </div>
            <ConnectionTest label="测试连接" status={testStatus} message={testMessage} disabled={testing} onTest={testConnection} />
          </section>

          <section className="settings-model-panel" aria-labelledby="vision-settings-title">
            <header className="settings-panel-heading"><span className="settings-panel-icon"><Eye size={22} /></span><div><h3 id="vision-settings-title">图片识别模型</h3><p>识别结构图片，辅助创建模型</p></div></header>
            <ModelPicker models={VISION_MODELS} value={visionModelId} name="vision_model" legend="选择视觉模型" disabled={testing} onChange={id => { setVisionModelId(id); editVision(); }} />
            <div className="settings-key-field">
              <label htmlFor="vision-api-key"><KeyRound size={14} />视觉模型 API Key</label>
              <input id="vision-api-key" disabled={testing} type="password" autoComplete="off" value={visionApiKey} onChange={e => { setVisionApiKey(e.target.value); editVision(); }} placeholder="同一厂商可留空，复用助教 Key" />
              <p>{visionModelId === selectedModelId ? '与助教使用同一厂商，留空可复用助教 Key。' : '与助教厂商不同，请单独填写视觉模型 Key。'}</p>
            </div>
            <ConnectionTest label="测试图片识别" status={visionTestStatus} message={visionTestMessage} disabled={testing} onTest={testVisionConnection} />
            <p className="settings-probe-note">测试会发送一张内置红色方块图片，验证图片识别能力。</p>
          </section>
        </div>

        <footer className="settings-page-footer">
          <details className="settings-key-help">
            <summary><HelpCircle size={17} />如何获取 API Key？<ChevronDown size={15} /></summary>
            <ol><li>选择模型，点击对应的“获取 Key”。</li><li>登录厂商控制台，创建并复制 API Key。</li><li>粘贴密钥，测试连接后保存设置。</li></ol>
          </details>
          <div className="settings-storage-note"><p>密钥仅保存在当前浏览器；调用模型时会发送至所选厂商。</p><span>模型目录核验日期：2026-10-07</span></div>
        </footer>
      </div>
    </section>
  );
};

interface ModelPickerProps {
  models: typeof AI_MODELS;
  value: string;
  name: string;
  legend: string;
  disabled: boolean;
  onChange: (id: string) => void;
}

function ModelPicker({ models, value, name, legend, disabled, onChange }: ModelPickerProps) {
  return <fieldset className="settings-model-picker" disabled={disabled}>
    <legend>{legend}</legend>
    {models.map(model => <div key={model.id} className="settings-model-option" data-selected={value === model.id || undefined}>
      <label><input type="radio" name={name} value={model.id} checked={value === model.id} onChange={() => onChange(model.id)} /><span><strong>{model.name}</strong><small>{model.desc}</small></span></label>
      <a href={model.getKeyUrl} target="_blank" rel="noopener noreferrer" aria-label={`获取 Key：${model.name}`}>获取 Key<ExternalLink size={12} /></a>
    </div>)}
  </fieldset>;
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error';
function ConnectionTest({ label, status, message, disabled, onTest }: { label: string; status: TestStatus; message: string; disabled: boolean; onTest: () => void }) {
  return <div className="settings-connection-test" data-status={status}>
    <button type="button" disabled={disabled} onClick={onTest}>
      {status === 'testing' ? <Loader2 size={16} className="animate-spin" /> : status === 'error' ? <WifiOff size={16} /> : <Wifi size={16} />}{label}
    </button>
    {message && <p role="status">{message}</p>}
  </div>;
}

export default SettingsPage;
