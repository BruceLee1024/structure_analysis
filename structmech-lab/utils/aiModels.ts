// 官方模型目录核验日期：2026-10-07。来源和迁移说明见 docs/ai-models.md。
export interface AIModelConfig {
  /** 稳定的厂商标识，升级模型时保留已保存的厂商选择。 */
  id: string;
  name: string;
  apiUrl: string;
  model: string;
  getKeyUrl?: string;
  desc?: string;
  reasoning: 'switchable' | 'qwen' | 'required' | 'kimi';
}

export const AI_MODELS: AIModelConfig[] = [
  { id: 'deepseek', name: 'DeepSeek V4.1 Flash', apiUrl: 'https://api.deepseek.com/chat/completions', model: 'deepseek-flash', getKeyUrl: 'https://platform.deepseek.com/api_keys', desc: '文本与图片', reasoning: 'switchable' },
  { id: 'qwen', name: '千问 Qwen3.8 Max', apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen3.8-max', getKeyUrl: 'https://dashscope.console.aliyun.com/apiKey', desc: '文本与图片', reasoning: 'qwen' },
  { id: 'zhipu', name: '智谱 GLM-5.3', apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-5.3', getKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys', desc: '文本推理', reasoning: 'required' },
  { id: 'moonshot', name: 'Kimi K3', apiUrl: 'https://api.moonshot.cn/v1/chat/completions', model: 'kimi-k3', getKeyUrl: 'https://platform.kimi.com/console/api-keys', desc: '文本与图片', reasoning: 'kimi' },
  { id: 'doubao', name: '豆包 Seed 2.1 Pro', apiUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', model: 'doubao-seed-2-1-pro-260915', getKeyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey', desc: '文本与图片', reasoning: 'switchable' },
];

export interface VisionModelConfig extends AIModelConfig {
  maxImageSize?: number;
}

export const VISION_MODELS: VisionModelConfig[] = AI_MODELS.map(model => model.id === 'zhipu'
  ? { ...model, name: '智谱 GLM-5.3 Flash', model: 'glm-5.3-flash', desc: '图片识别与推理' }
  : { ...model, desc: '图片识别与建模' });

const LEGACY_VISION_IDS: Record<string, string> = {
  'kimi-k2.5': 'moonshot',
  'qwen-vl-max': 'qwen',
  'glm-4v-flash': 'zhipu',
};

export function getAIModel(id = localStorage.getItem('ai_model') || 'deepseek'): AIModelConfig {
  const model = AI_MODELS.find(item => item.id === id);
  if (!model) throw new Error('未知 AI 模型，请在设置中重新选择');
  return model;
}

export function getVisionModel(id?: string | null): VisionModelConfig {
  // 老版本只保存视觉 Key 而没有模型标识时，保留原来的 Kimi 厂商。
  const savedId = id ?? localStorage.getItem('vision_model')
    ?? (localStorage.getItem('vision_api_key') ? 'moonshot' : 'deepseek');
  const providerId = LEGACY_VISION_IDS[savedId] ?? savedId;
  const model = VISION_MODELS.find(item => item.id === providerId);
  if (!model) throw new Error('未知视觉模型，请在设置中重新选择');
  return model;
}

export function getVisionApiKey(model: VisionModelConfig, visionKey: string, textModelId: string, textKey: string): string {
  // 仅同一厂商复用；绝不把其他厂商的文字 Key 发往视觉接口。
  return visionKey.trim() || (model.id === textModelId ? textKey.trim() : '');
}
