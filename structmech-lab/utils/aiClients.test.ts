import { createStorageMock } from '../tests/storageMock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_MODELS, VISION_MODELS, getVisionModel } from './aiModels';
import { buildCompletionRequest, requestCompletion } from './aiTransport';
import { sendChatCompletion, sendChatCompletionStream } from './aiClient';
import { isVisionConfigured, sendVisionCompletion, sendVisionCompletionStream } from './visionClient';
import { VISION_PROBE_MESSAGES } from './visionProbe';

const messages = [{ role: 'user' as const, content: '分析这根梁' }];
const fetchMock = vi.fn();
const reply = (content = '已识别', extra = {}) => new Response(JSON.stringify({
  choices: [{ message: { content, ...extra }, finish_reason: 'stop' }],
}), { headers: { 'Content-Type': 'application/json' } });

beforeEach(() => { vi.stubGlobal('localStorage', createStorageMock()); localStorage.clear(); vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('五家助教和视觉都使用核实过的新版本，GLM 的视觉使用 Flash', () => {
  expect(AI_MODELS.map(m => m.model)).toEqual(['deepseek-flash', 'qwen3.8-max', 'glm-5.3', 'kimi-k3', 'doubao-seed-2-1-pro-260915']);
  expect(VISION_MODELS.map(m => m.model)).toEqual(['deepseek-flash', 'qwen3.8-max', 'glm-5.3-flash', 'kimi-k3', 'doubao-seed-2-1-pro-260915']);
});

it.each([
  ['kimi-k2.5', 'moonshot'], ['qwen-vl-max', 'qwen'], ['glm-4v-flash', 'zhipu'],
])('迁移旧视觉选择 %s 时保留厂商和 Key', (legacy, provider) => {
  localStorage.setItem('vision_model', legacy);
  localStorage.setItem('vision_api_key', 'old-vision-test-key');
  expect(getVisionModel().id).toBe(provider);
  expect(localStorage.getItem('vision_api_key')).toBe('old-vision-test-key');
});

it('新用户默认 DeepSeek，有旧视觉 Key 但没有标识的用户保留 Kimi', () => {
  expect(getVisionModel().id).toBe('deepseek');
  localStorage.setItem('vision_api_key', 'legacy-test-key');
  expect(getVisionModel().id).toBe('moonshot');
});

it.each(AI_MODELS)('$name 请求使用各厂商支持的参数', model => {
  const body = buildCompletionRequest(model, messages, { maxTokens: 300, temperature: 0.7 });
  if (model.id === 'qwen') {
    expect(body).toMatchObject({ enable_thinking: false, temperature: 0.7, max_tokens: 300 });
    expect(body).not.toHaveProperty('thinking');
  } else if (model.id === 'moonshot') {
    expect(body).toMatchObject({ reasoning_effort: 'low', max_completion_tokens: 8492 });
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('thinking');
    expect(body).not.toHaveProperty('max_tokens');
  } else if (model.id === 'zhipu') {
    expect(body).toMatchObject({ thinking: { type: 'enabled' }, reasoning_effort: 'low', max_tokens: 8492, temperature: 1 });
  } else {
    expect(body).toMatchObject({ thinking: { type: 'disabled' }, max_tokens: 300, temperature: 0.7 });
  }
});

it.each(VISION_MODELS)('$name 图片请求保留图片和厂商专用参数', async model => {
  localStorage.setItem('vision_model', model.id);
  localStorage.setItem('vision_api_key', 'vision-test-key');
  fetchMock.mockImplementation(async () => reply());
  expect(await sendVisionCompletion(VISION_PROBE_MESSAGES, { maxTokens: 3000 })).toBe('已识别');
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe(model.apiUrl);
  expect(JSON.parse(init.body)).toEqual(buildCompletionRequest(model, VISION_PROBE_MESSAGES, { maxTokens: 3000 }));
});

it('同厂商复用文字 Key，独立视觉 Key 优先', async () => {
  localStorage.setItem('ai_api_key', 'text-test-key');
  expect(isVisionConfigured()).toBe(true);
  fetchMock.mockImplementation(async () => reply());
  await sendVisionCompletion(VISION_PROBE_MESSAGES);
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer text-test-key');
  localStorage.setItem('vision_api_key', 'vision-test-key');
  await sendVisionCompletion(VISION_PROBE_MESSAGES);
  expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer vision-test-key');
});

it('厂商不同时不复用 Key，也不会对未知模型回退到其他厂商', async () => {
  localStorage.setItem('ai_api_key', 'text-test-key');
  localStorage.setItem('vision_model', 'moonshot');
  expect(isVisionConfigured()).toBe(false);
  await expect(sendVisionCompletion(VISION_PROBE_MESSAGES)).rejects.toThrow('未配置视觉模型');
  localStorage.setItem('ai_model', 'unsupported-provider');
  await expect(sendChatCompletion(messages)).rejects.toThrow('未知 AI 模型');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('保留推理上下文，但只把最终回答返回给用户和结构解析器', async () => {
  localStorage.setItem('ai_api_key', 'test-key');
  const onReasoning = vi.fn();
  fetchMock.mockResolvedValue(reply('最终答案', { reasoning_content: '内部推理' }));
  expect(await sendChatCompletion(messages, { onReasoning })).toBe('最终答案');
  expect(onReasoning).toHaveBeenCalledWith('内部推理');
});

it('仅有推理而没有最终答案的响应会报错', async () => {
  fetchMock.mockResolvedValue(reply('', { reasoning_content: '{"nodes":[]}' }));
  await expect(requestCompletion(AI_MODELS[0], 'test-key', messages)).rejects.toThrow('未返回最终回答');
});

it('输出被截断和 HTTP 失败时不返回伪成功', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{"nodes":[' }, finish_reason: 'length' }] })));
  await expect(requestCompletion(AI_MODELS[0], 'test-key', messages)).rejects.toThrow('长度上限');
  fetchMock.mockResolvedValue(new Response('private upstream details', { status: 401 }));
  await expect(requestCompletion(AI_MODELS[0], 'test-key', messages)).rejects.toThrow('API 错误 (401)');
});

function fragmentedStream() {
  const bytes = new TextEncoder().encode('data: {"choices":[{"delta":{"reasoning_content":"先推理"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"红色"}}]}\n\ndata: {"choices":[{"delta":{"content":"方块"},"finish_reason":"stop"}]}\n\ndata: [DONE]');
  return new Response(new ReadableStream({ start(controller) {
    // 每个字节单独到达，覆盖 JSON 和中文 UTF-8 跨网络块的情况。
    for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
    controller.close();
  } }));
}

describe('文字和图片共用的流式协议', () => {
  it('跨网络块不丢中文和 JSON，推理内容不进入最终回答', async () => {
    localStorage.setItem('ai_api_key', 'test-key');
    fetchMock.mockResolvedValue(fragmentedStream());
    const onChunk = vi.fn();
    const onReasoning = vi.fn();
    expect(await sendChatCompletionStream(messages, onChunk, { onReasoning })).toBe('红色方块');
    expect(onChunk.mock.calls.map(call => call[0]).join('')).toBe('红色方块');
    expect(onReasoning).toHaveBeenCalledWith('先推理');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).stream).toBe(true);
  });
  it('图片流式输出使用相同的新版模型配置', async () => {
    localStorage.setItem('vision_model', 'kimi-k2.5');
    localStorage.setItem('vision_api_key', 'test-key');
    fetchMock.mockResolvedValue(fragmentedStream());
    expect(await sendVisionCompletionStream(VISION_PROBE_MESSAGES, vi.fn())).toBe('红色方块');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ model: 'kimi-k3', stream: true, reasoning_effort: 'low' });
  });
});
