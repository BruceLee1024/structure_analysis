import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createStorageMock } from '../tests/storageMock';
import { sendChatCompletion } from '../utils/aiClient';
import AITutor from './AITutor';

vi.mock('../utils/aiClient', () => ({ sendChatCompletion: vi.fn() }));
beforeEach(() => {
  vi.stubGlobal('localStorage', createStorageMock());
  Element.prototype.scrollIntoView = vi.fn();
  vi.mocked(sendChatCompletion).mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('多轮对话保留同模型的推理上下文，切换厂商后不传旧模型推理', async () => {
  localStorage.setItem('ai_model', 'moonshot');
  vi.mocked(sendChatCompletion).mockImplementation(async (_messages, options) => {
    options?.onReasoning?.('内部推理上下文');
    return '最终解释';
  });
  render(<AITutor context="悬臂梁" moduleTitle="静定梁" />);
  const send = async (question: string, callCount: number) => {
    fireEvent.change(screen.getByPlaceholderText('输入你的问题...'), { target: { value: question } });
    fireEvent.keyDown(screen.getByPlaceholderText('输入你的问题...'), { key: 'Enter' });
    await waitFor(() => expect(vi.mocked(sendChatCompletion)).toHaveBeenCalledTimes(callCount));
    await waitFor(() => expect(screen.getByPlaceholderText('输入你的问题...')).toBeEnabled());
  };
  await send('第一问', 1);
  expect(screen.queryByText('内部推理上下文')).not.toBeInTheDocument();
  await send('第二问', 2);
  expect(vi.mocked(sendChatCompletion).mock.calls[1][0]).toEqual(expect.arrayContaining([
    expect.objectContaining({ role: 'assistant', content: '最终解释', reasoning_content: '内部推理上下文' }),
  ]));
  localStorage.setItem('ai_model', 'deepseek');
  await send('第三问', 3);
  expect(vi.mocked(sendChatCompletion).mock.calls[2][0].every(m => !m.reasoning_content)).toBe(true);
});

it('欢迎消息只滚动对话容器，不触发整个学习工作区滚动', () => {
  const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView);
  render(<AITutor context="悬臂梁" moduleTitle="静定梁" />);
  expect(screen.getByRole('log', { name: 'AI 助教对话' })).toBeInTheDocument();
  expect(scrollIntoView).not.toHaveBeenCalled();
});

it('换行和中文输入法确认不会发送，普通 Enter 才发送问题', async () => {
  vi.mocked(sendChatCompletion).mockResolvedValue('受力说明');
  render(<AITutor context="组合结构" moduleTitle="组合结构" />);
  const input = screen.getByRole('textbox', { name: '向 AI 助教提问' });
  fireEvent.change(input, { target: { value: '说明传力顺序' } });
  fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
  expect(sendChatCompletion).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(sendChatCompletion).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(input).toBeEnabled());
});

it('收到回复才显示已连接，请求期间不能重置，重置后恢复起始问题', async () => {
  let resolveReply!: (value: string) => void;
  vi.mocked(sendChatCompletion).mockReturnValue(new Promise(resolve => { resolveReply = resolve; }));
  render(<AITutor context="组合结构" moduleTitle="组合结构" suggestedQuestions={['什么是基本部分？']} />);
  fireEvent.click(screen.getByRole('button', { name: '什么是基本部分？' }));
  expect(screen.getByText('回复中')).toBeInTheDocument();
  expect(screen.queryByText('已连接')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '重新开始对话' })).toBeDisabled();
  resolveReply('基本部分承担附属部分传来的荷载。');
  await waitFor(() => expect(screen.getByText('已连接')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: '重新开始对话' }));
  expect(screen.queryByText('基本部分承担附属部分传来的荷载。')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '什么是基本部分？' })).toBeInTheDocument();
});
