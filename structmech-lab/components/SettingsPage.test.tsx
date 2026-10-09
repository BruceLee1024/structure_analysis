import { createStorageMock } from '../tests/storageMock';
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SettingsPage from './SettingsPage';

const fetchMock = vi.fn();
const answer = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }));
beforeEach(() => { vi.stubGlobal('localStorage', createStorageMock()); localStorage.clear(); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('显示五家最新模型，迁移旧视觉选择并保存原有凭据', () => {
  localStorage.setItem('ai_model', 'qwen');
  localStorage.setItem('ai_api_key', 'text-test-key');
  localStorage.setItem('vision_model', 'kimi-k2.5');
  localStorage.setItem('vision_api_key', 'vision-test-key');
  render(<SettingsPage onBack={vi.fn()} />);
  expect(screen.getAllByRole('radio')).toHaveLength(10);
  expect(screen.getByRole('radio', { name: /智谱 GLM-5.3 Flash/ })).toBeInTheDocument();
  expect(screen.getAllByRole('radio', { name: /Kimi K3/ })[1]).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: '保存设置' }));
  expect(localStorage.getItem('vision_model')).toBe('moonshot');
  expect(localStorage.getItem('ai_api_key')).toBe('text-test-key');
  expect(localStorage.getItem('vision_api_key')).toBe('vision-test-key');
});

it('新用户默认 DeepSeek，测试视觉实际发送图片并复用未保存的同厂商 Key', async () => {
  fetchMock.mockResolvedValue(answer('红色'));
  render(<SettingsPage onBack={vi.fn()} />);
  expect(screen.getAllByRole('radio', { name: /DeepSeek V4.1 Flash/ }).every(r => (r as HTMLInputElement).checked)).toBe(true);
  fireEvent.change(screen.getByLabelText('助教 API Key'), { target: { value: 'unsaved-test-key' } });
  fireEvent.click(screen.getByRole('button', { name: '测试图片识别' }));
  await screen.findByText('图片识别连接成功！');
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toContain('api.deepseek.com');
  expect(init.headers.Authorization).toBe('Bearer unsaved-test-key');
  const body = JSON.parse(init.body);
  expect(body.model).toBe('deepseek-flash');
  expect(body.messages[0].content).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'image_url' })]));
  expect(localStorage.getItem('ai_api_key')).toBeNull();
});

it('HTTP 成功但图片回答错误时不能标成识别成功', async () => {
  fetchMock.mockResolvedValue(answer('你好'));
  render(<SettingsPage onBack={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('视觉模型 API Key'), { target: { value: 'test-key' } });
  fireEvent.click(screen.getByRole('button', { name: '测试图片识别' }));
  await screen.findByText('接口已响应，但未通过测试图片识别');
  expect(screen.queryByText('图片识别连接成功！')).not.toBeInTheDocument();
});

it('测试文字模型也使用新模型的参数适配', async () => {
  fetchMock.mockResolvedValue(answer('连接成功'));
  render(<SettingsPage onBack={vi.fn()} />);
  fireEvent.click(screen.getAllByRole('radio', { name: /Kimi K3/ })[0]);
  fireEvent.change(screen.getByLabelText('助教 API Key'), { target: { value: 'test-key' } });
  fireEvent.click(screen.getByRole('button', { name: '测试连接' }));
  await waitFor(() => expect(screen.getByText('连接成功！')).toBeInTheDocument());
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body.model).toBe('kimi-k3');
  expect(body.max_completion_tokens).toBeGreaterThan(8192);
  expect(body).not.toHaveProperty('temperature');
  expect(body).not.toHaveProperty('thinking');
});
