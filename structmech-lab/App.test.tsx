import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createStorageMock } from './tests/storageMock';
import App from './App';

vi.mock('./components/SolverModule', () => ({ default: () => <input aria-label="测试模型草稿" defaultValue="初始模型" /> }));
vi.mock('./components/StaticModule', () => ({ default: ({ activeSubModule }: { activeSubModule: string }) => <section aria-label="测试学习模块">{activeSubModule}</section> }));
vi.mock('./components/InfluenceModule', () => ({ default: () => <section aria-label="测试影响线模块" /> }));
beforeEach(() => vi.stubGlobal('localStorage', createStorageMock()));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('切换设置、学习模块和首页后恢复同一个求解器实例及模型草稿', () => {
  localStorage.setItem('activationCode', 'AAAA-AAAA-AAAA-AAAA');
  render(<App />);
  expect(screen.queryByRole('complementary', { name: '主导航' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '开始建模' }));
  const draft = screen.getByRole('textbox', { name: '测试模型草稿' });
  fireEvent.change(draft, { target: { value: '4m 悬臂梁草稿' } });
  fireEvent.click(screen.getByRole('button', { name: '设置' }));
  expect(screen.getByRole('region', { name: 'AI 模型配置' })).toBeVisible();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('button', { name: '设置' })).toHaveAttribute('aria-current', 'page');
  fireEvent.change(screen.getByLabelText('助教 API Key'), { target: { value: 'unsaved-settings-test' } });
  fireEvent.click(screen.getByRole('button', { name: '返回原工作区' }));
  expect(screen.getByRole('textbox', { name: '测试模型草稿' })).toBe(draft);
  expect(draft).toHaveValue('4m 悬臂梁草稿');
  fireEvent.click(screen.getByRole('button', { name: '静定结构' }));
  expect(screen.getByRole('region', { name: '测试学习模块' })).toBeVisible();
  expect(screen.queryByRole('textbox', { name: '测试模型草稿' })).toBeNull();
  expect(draft).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '返回主页' }));
  fireEvent.click(screen.getByRole('button', { name: 'AI 模型设置' }));
  expect(screen.getByLabelText('助教 API Key')).toHaveValue('unsaved-settings-test');
  expect(localStorage.getItem('ai_api_key')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '返回原工作区' }));
  expect(screen.getByRole('heading', { name: '选择你的探索方向' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '开始建模' }));
  expect(screen.getByRole('textbox', { name: '测试模型草稿' })).toBe(draft);
  expect(draft).toHaveValue('4m 悬臂梁草稿');
});

it('未激活的求解器仍显示激活窗口，不会因新导航绕过校验', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '开始建模' }));
  expect(screen.getByRole('dialog', { name: '激活结构求解器' })).toBeVisible();
  expect(screen.queryByRole('textbox', { name: '测试模型草稿' })).toBeNull();
});

it('移动抽屉打开后聚焦关闭按钮，Escape 关闭并返回菜单按钮', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '静定梁：从一根梁开始' }));
  const trigger = screen.getByRole('button', { name: '打开导航' });
  fireEvent.click(trigger);
  expect(screen.getByRole('dialog', { name: '模块导航' })).toBeVisible();
  const close = screen.getByRole('button', { name: '关闭导航' });
  expect(close).toHaveFocus();
  expect(document.querySelector('main')).toHaveAttribute('inert');
  fireEvent.keyDown(close, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: '模块导航' })).toBeNull();
  expect(document.querySelector('main')).not.toHaveAttribute('inert');
  expect(trigger).toHaveFocus();
});
