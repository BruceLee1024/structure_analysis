import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import Sidebar from './Sidebar';
import { ModuleType } from '../types';

afterEach(cleanup);
const props = () => ({
  activeModule: ModuleType.STATIC, activeStaticSub: 'beam' as const, activeInfluenceSub: 'static' as const,
  staticExpanded: true, influenceExpanded: false, isActivated: true, collapsed: false,
  onToggleCollapse: vi.fn(), onStaticClick: vi.fn(), onStaticSubClick: vi.fn(),
  onInfluenceClick: vi.fn(), onInfluenceSubClick: vi.fn(), onSolverClick: vi.fn(),
  onGoHome: vi.fn(), onShowSettings: vi.fn(),
});

it('展开导航标记当前子模块，选择其他模块传递正确标识', () => {
  const callbacks = props();
  render(<Sidebar {...callbacks} />);
  expect(screen.getByRole('button', { name: '静定梁' })).toHaveAttribute('aria-current', 'page');
  fireEvent.click(screen.getByRole('button', { name: '组合结构' }));
  expect(callbacks.onStaticSubClick).toHaveBeenCalledWith('composite');
  fireEvent.click(screen.getByRole('button', { name: '设置' }));
  expect(callbacks.onShowSettings).toHaveBeenCalledOnce();
});

it('折叠导航通过浮层直达子模块，关闭后不会遗留门户', () => {
  const callbacks = props();
  render(<Sidebar {...callbacks} collapsed />);
  fireEvent.click(screen.getByRole('button', { name: '静定结构' }));
  const flyout = screen.getByRole('dialog', { name: '静定结构子模块' });
  expect(within(flyout).getByRole('button', { name: '静定梁' })).toHaveFocus();
  expect(callbacks.onStaticClick).not.toHaveBeenCalled();
  fireEvent.click(within(flyout).getByRole('button', { name: '静定刚架' }));
  expect(callbacks.onStaticSubClick).toHaveBeenCalledWith('frame');
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('Escape 恢复浮层触发按钮焦点，点击导航外部关闭浮层', () => {
  render(<Sidebar {...props()} collapsed />);
  const trigger = screen.getByRole('button', { name: '影响线' });
  fireEvent.click(trigger);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(trigger).toHaveFocus();
  fireEvent.click(trigger);
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('移动抽屉不受桌面折叠偏好影响，仍显示完整子导航', () => {
  render(<Sidebar {...props()} collapsed mobileOpen />);
  expect(screen.getByRole('button', { name: '静定梁' })).toBeVisible();
  expect(screen.getByText('结构力学实验室')).toBeVisible();
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('求解器子菜单直达平面和空间，折叠时也可选择', () => {
  const onSolverSubClick = vi.fn();
  const callbacks = props();
  const { rerender } = render(<Sidebar {...callbacks} activeModule={ModuleType.SOLVER} activeSolverMode="space" onSolverSubClick={onSolverSubClick} />);
  expect(screen.getByRole('button', { name: '空间结构' })).toHaveAttribute('aria-current', 'page');
  fireEvent.click(screen.getByRole('button', { name: '平面结构' }));
  expect(onSolverSubClick).toHaveBeenCalledWith('plane');
  rerender(<Sidebar {...callbacks} collapsed onSolverSubClick={onSolverSubClick} />);
  fireEvent.click(screen.getByRole('button', { name: '结构求解器' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: '结构求解器子模块' })).getByRole('button', { name: '空间结构' }));
  expect(onSolverSubClick).toHaveBeenCalledWith('space');
});
