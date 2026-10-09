import type { AIModelConfig } from './aiModels';

export interface CompletionOptions {
  maxTokens?: number;
  temperature?: number;
  /** 保留多轮对话所需的推理上下文，界面仅展示最终回答。 */
  onReasoning?: (reasoning: string) => void;
}

export function buildCompletionRequest(model: AIModelConfig, messages: readonly unknown[], options: CompletionOptions = {}, stream = false) {
  const requiresReasoning = model.reasoning === 'required' || model.reasoning === 'kimi';
  // 推理和最终回答共用输出预算，给始终推理的模型留出空间。
  const tokenBudget = (options.maxTokens ?? 800) + (requiresReasoning ? 8192 : 0);
  return {
    model: model.model,
    messages,
    ...(model.reasoning === 'kimi' ? { max_completion_tokens: tokenBudget } : { max_tokens: tokenBudget }),
    ...(model.reasoning === 'kimi' ? {} : { temperature: model.reasoning === 'required' ? 1 : options.temperature ?? 0.2 }),
    ...(model.reasoning === 'qwen' ? { enable_thinking: false } : {}),
    ...(model.reasoning === 'switchable' ? { thinking: { type: 'disabled' } } : {}),
    ...(model.reasoning === 'required' ? { thinking: { type: 'enabled' }, reasoning_effort: 'low' } : {}),
    ...(model.reasoning === 'kimi' ? { reasoning_effort: 'low' } : {}),
    ...(stream ? { stream: true } : {}),
  };
}

function checkFinishReason(reason: string | undefined) {
  if (reason === 'length') throw new Error('模型输出达到长度上限，请缩小问题范围或重试');
  if (reason === 'content_filter') throw new Error('模型未返回回答，请调整输入后重试');
}

export async function requestCompletion(
  model: AIModelConfig,
  apiKey: string,
  messages: readonly unknown[],
  options: CompletionOptions = {},
  onChunk?: (delta: string) => void,
): Promise<string> {
  if (!apiKey.trim()) throw new Error('未配置 API Key');
  const response = await fetch(model.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
    body: JSON.stringify(buildCompletionRequest(model, messages, options, Boolean(onChunk))),
  });
  // 不透传服务端原文，避免错误回显凭据或上传内容。
  if (!response.ok) throw new Error(`${model.name} API 错误 (${response.status})`);
  if (!onChunk) {
    const data = await response.json();
    const choice = data.choices?.[0];
    checkFinishReason(choice?.finish_reason);
    const content = choice?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error('模型未返回最终回答，请重试');
    if (typeof choice.message.reasoning_content === 'string') options.onReasoning?.(choice.message.reasoning_content);
    return content;
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('当前模型未返回流式输出');
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';
  let reasoning = '';
  let finished = false;
  const consumeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const payload = trimmed.slice(5).trim();
    if (!payload) return;
    if (payload === '[DONE]') { finished = true; return; }
    const data = JSON.parse(payload);
    if (data.error) throw new Error('模型流式响应出错，请重试');
    const choice = data.choices?.[0];
    checkFinishReason(choice?.finish_reason);
    const delta = choice?.delta;
    if (typeof delta?.reasoning_content === 'string') reasoning += delta.reasoning_content;
    if (typeof delta?.content === 'string' && delta.content) {
      answer += delta.content;
      onChunk(delta.content);
    }
  };
  try {
    while (!finished) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline: number;
      while (!finished && (newline = buffer.indexOf('\n')) >= 0) {
        consumeLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
      if (done) {
        if (!finished && buffer.trim()) consumeLine(buffer);
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (!answer.trim()) throw new Error('模型未返回最终回答，请重试');
  if (reasoning) options.onReasoning?.(reasoning);
  return answer;
}
