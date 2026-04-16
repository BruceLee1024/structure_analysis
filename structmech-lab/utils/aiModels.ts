export interface AIModelConfig {
  id: string;
  name: string;
  apiUrl: string;
  model: string;
  getKeyUrl?: string;
  desc?: string;
}

export const AI_MODELS: AIModelConfig[] = [
  { id: 'deepseek', name: 'DeepSeek', apiUrl: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat', getKeyUrl: 'https://platform.deepseek.com/api_keys', desc: '性价比高，推荐' },
  { id: 'qwen', name: '通义千问', apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-turbo', getKeyUrl: 'https://dashscope.console.aliyun.com/apiKey', desc: '阿里云' },
  { id: 'zhipu', name: '智谱AI', apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash', getKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys', desc: '清华系' },
  { id: 'moonshot', name: 'Moonshot', apiUrl: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-8k', getKeyUrl: 'https://platform.moonshot.cn/console/api-keys', desc: 'Kimi' },
  { id: 'doubao', name: '豆包', apiUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', model: 'doubao-lite-4k', getKeyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey', desc: '字节' },
];

export interface VisionModelConfig {
  id: string;
  name: string;
  apiUrl: string;
  model: string;
  getKeyUrl?: string;
  desc?: string;
  maxImageSize?: number;
}

export const VISION_MODELS: VisionModelConfig[] = [
  { id: 'kimi-k2.5', name: 'Kimi K2.5', apiUrl: 'https://api.moonshot.cn/v1/chat/completions', model: 'kimi-k2.5', getKeyUrl: 'https://platform.kimi.com/console/api-keys', desc: '推荐，多模态能力强', maxImageSize: 20 * 1024 * 1024 },
  { id: 'qwen-vl-max', name: '通义千问VL', apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-vl-max', getKeyUrl: 'https://dashscope.console.aliyun.com/apiKey', desc: '阿里云视觉模型' },
  { id: 'glm-4v-flash', name: '智谱GLM-4V', apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4v-flash', getKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys', desc: '清华系视觉模型' },
];
