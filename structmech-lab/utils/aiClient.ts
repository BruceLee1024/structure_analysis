import { AI_MODELS } from './aiModels';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function sendChatCompletion(
  messages: AIMessage[],
  options?: { maxTokens?: number; temperature?: number },
): Promise<string> {
  const apiKey = localStorage.getItem('ai_api_key');
  const modelId = localStorage.getItem('ai_model') || 'deepseek';
  const model = AI_MODELS.find(item => item.id === modelId) || AI_MODELS[0];

  if (!apiKey) {
    throw new Error('未配置 API Key');
  }

  const response = await fetch(model.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model.model,
      messages,
      max_tokens: options?.maxTokens ?? 400,
      temperature: options?.temperature ?? 0.2,
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content ?? '';
}

export async function sendChatCompletionStream(
  messages: AIMessage[],
  onChunk: (delta: string) => void,
  options?: { maxTokens?: number; temperature?: number },
): Promise<string> {
  const apiKey = localStorage.getItem('ai_api_key');
  const modelId = localStorage.getItem('ai_model') || 'deepseek';
  const model = AI_MODELS.find(item => item.id === modelId) || AI_MODELS[0];

  if (!apiKey) throw new Error('未配置 API Key');

  const response = await fetch(model.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model.model,
      messages,
      max_tokens: options?.maxTokens ?? 800,
      temperature: options?.temperature ?? 0.2,
      stream: true,
    }),
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);

  const reader = response.body?.getReader();
  if (!reader) throw new Error('当前模型不支持流式输出');

  const decoder = new TextDecoder();
  let accumulated = '';
  let done = false;

  while (!done) {
    const { done: chunkDone, value } = await reader.read();
    done = chunkDone;
    if (!value) continue;

    const text = decoder.decode(value, { stream: true });
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const payload = trimmed.slice(6);
      if (payload === '[DONE]') { done = true; break; }
      try {
        const parsed = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) {
          accumulated += delta;
          onChunk(delta);
        }
      } catch {
        // 忽略格式不合法的 SSE 行
      }
    }
  }

  return accumulated;
}
