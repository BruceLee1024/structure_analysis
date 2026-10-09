import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import SolverModule from './SolverModule';
import { StructureType } from '../types';

beforeEach(() => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 400, width: 800, height: 400, toJSON: () => ({}) });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('同页展示建模与内力，切换结果表保留模型与撤销历史', () => {
  render(<SolverModule />);
  fireEvent.click(screen.getByRole('button', { name: '新建空白模型' }));
  const canvas = screen.getByRole('application', { name: '结构绘图画布' });
  for (const x of [150, 350]) {
    fireEvent.pointerDown(canvas, { clientX: x, clientY: 250, button: 0 });
    fireEvent.pointerUp(canvas, { clientX: x, clientY: 250, button: 0 });
  }
  fireEvent.keyDown(canvas, { key: 'Escape' });
  fireEvent.change(screen.getByLabelText('选择支座工具'), { target: { value: 'fixed' } });
  fireEvent.pointerDown(canvas, { clientX: 150, clientY: 250, button: 0 });
  fireEvent.pointerUp(canvas, { clientX: 150, clientY: 250, button: 0 });
  expect(screen.getByRole('tabpanel', { name: '建模与内力' })).toBeVisible();
  expect(screen.getByRole('region', { name: '内力与变形图' })).toBeVisible();
  expect(screen.getByRole('application')).toBeVisible();
  fireEvent.click(screen.getByRole('tab', { name: '结果表' }));
  expect(screen.getByRole('tabpanel', { name: '结果表' })).toBeVisible();
  expect(screen.getByRole('button', { name: /支座反力/ })).toBeVisible();
  fireEvent.click(screen.getByRole('tab', { name: '建模与内力' }));
  expect(screen.getByRole('application')).toBe(canvas);
  expect(screen.getByLabelText('选中节点支座类型')).toHaveValue('fixed');
  fireEvent.click(screen.getByRole('button', { name: '撤销画布操作' }));
  fireEvent.click(screen.getByRole('button', { name: '选择 / 移动' }));
  fireEvent.pointerDown(canvas, { clientX: 150, clientY: 250, button: 0 });
  fireEvent.pointerUp(canvas, { clientX: 150, clientY: 250, button: 0 });
  expect(screen.getByLabelText('选中节点支座类型')).toHaveValue('free');
  expect(screen.getByText('2 节点 · 1 杆件 · 0 荷载')).toBeVisible();
});

it('配置按分类显示，助手与配置互斥展开，关闭助手保留输入草稿', () => {
  render(<SolverModule />);
  fireEvent.click(screen.getByRole('button', { name: '模型配置' }));
  expect(screen.getByLabelText('结构模板')).toBeVisible();
  expect(screen.queryByRole('heading', { name: '工况与组合' })).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: '工况' }));
  expect(screen.queryByRole('combobox', { name: '结构模板' })).toBeNull();
  expect(screen.getByRole('heading', { name: '工况与组合' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '结构助手' }));
  expect(screen.getByRole('button', { name: '模型配置' })).toHaveAttribute('aria-expanded', 'false');
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: '为什么弯矩在固定端最大？' } });
  fireEvent.click(screen.getByRole('button', { name: '收起结构助手' }));
  fireEvent.click(screen.getByRole('button', { name: '结构助手' }));
  expect(screen.getByRole('textbox')).toHaveValue('为什么弯矩在固定端最大？');
});

it('键盘切换工作区，计算工况同步编辑工况且保留结构', () => {
  render(<SolverModule />);
  const canvas = screen.getByRole('application', { name: '结构绘图画布' });
  for (const x of [150, 350]) {
    fireEvent.pointerDown(canvas, { clientX: x, clientY: 250, button: 0 });
    fireEvent.pointerUp(canvas, { clientX: x, clientY: 250, button: 0 });
  }
  fireEvent.keyDown(canvas, { key: 'Escape' });
  fireEvent.keyDown(screen.getByRole('tab', { name: '建模与内力' }), { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { name: '结果表' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.keyDown(screen.getByRole('tab', { name: '结果表' }), { key: 'Home' });
  expect(screen.getByRole('tabpanel', { name: '建模与内力' })).toBeVisible();
  fireEvent.keyDown(screen.getByRole('tab', { name: '建模与内力' }), { key: 'End' });
  expect(screen.getByRole('tabpanel', { name: '结果表' })).toBeVisible();
  fireEvent.change(screen.getByLabelText('当前计算工况'), { target: { value: 'loadCase:live' } });
  fireEvent.click(screen.getByRole('tab', { name: '建模与内力' }));
  expect(screen.getByText('编辑 活载 L')).toBeVisible();
  expect(screen.getByText('2 节点 · 1 杆件 · 0 荷载')).toBeVisible();
});


it('绘图荷载与属性修改实时更新同页结果，查看单张图保留画布', () => {
  render(<SolverModule />);
  fireEvent.click(screen.getByRole('button', { name: '新建空白模型' }));
  const canvas = screen.getByRole('application', { name: '结构绘图画布' });
  const clickCanvas = (x: number) => {
    fireEvent.pointerDown(canvas, { clientX: x, clientY: 250, button: 0 });
    fireEvent.pointerUp(canvas, { clientX: x, clientY: 250, button: 0 });
  };
  clickCanvas(150); clickCanvas(350);
  fireEvent.keyDown(canvas, { key: 'Escape' });
  fireEvent.change(screen.getByLabelText('选择支座工具'), { target: { value: 'fixed' } });
  clickCanvas(150);
  fireEvent.change(screen.getByLabelText('选择荷载工具'), { target: { value: 'point' } });
  clickCanvas(350);
  const momentBefore = Number(screen.getByText(/^弯矩 M ·/).textContent!.split('·')[1].trim().split(' ')[0]);
  expect(momentBefore).toBeGreaterThan(0);
  expect(screen.getByText('剪力 V · 2.00 kN')).toBeVisible();
  fireEvent.change(screen.getByLabelText('选中对象大小 (kN)'), { target: { value: '-4' } });
  fireEvent.click(screen.getByRole('button', { name: '应用修改' }));
  const momentAfter = Number(screen.getByText(/^弯矩 M ·/).textContent!.split('·')[1].trim().split(' ')[0]);
  expect(momentAfter).toBeCloseTo(momentBefore * 2, 2);
  fireEvent.change(screen.getByLabelText('加载比例'),{target:{value:'50'}});
  expect(screen.getByText('剪力 V · 2.00 kN')).toBeVisible();
  expect(screen.getByRole('button',{name:'报告'})).toBeDisabled();
  fireEvent.change(screen.getByLabelText('加载比例'),{target:{value:'0'}});
  expect(screen.getByText('弯矩 M · 0.00 kN·m')).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'恢复 100%'}));
  expect(screen.getByRole('button',{name:'报告'})).toBeEnabled();
  expect(screen.getByText('剪力 V · 4.00 kN')).toBeVisible();
  expect(screen.getByRole('application')).toBe(canvas);
  fireEvent.click(screen.getByRole('button', { name: '弯矩 M' }));
  expect(screen.getByText(/^弯矩 M ·/)).toBeVisible();
  expect(screen.queryByText(/^剪力 V ·/)).toBeNull();
  expect(screen.getByRole('application')).toBe(canvas);
  fireEvent.mouseMove(canvas, { clientX: 250, clientY: 250 });
  expect(document.querySelectorAll('[data-linked-section]').length).toBe(2);
  fireEvent.click(screen.getByRole('button', { name: '全部' }));
  expect(screen.getByText('剪力 V · 4.00 kN')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '弯矩 M' }));
  fireEvent.click(screen.getByRole('tab', { name: '结果表' }));
  fireEvent.click(screen.getByRole('button', { name: /控制项/ }));
  fireEvent.click(within(screen.getByRole('row', { name: /最大轴力/ })).getByRole('button', { name: '定位' }));
  expect(screen.getByRole('tabpanel', { name: '建模与内力' })).toBeVisible();
  expect(screen.getByText(/^轴力 N ·/)).toBeVisible();
  expect(screen.getByRole('application')).toBe(canvas);
});


it('首次进入为空白模型，默认可以画杆件，模板仅在主动选择后生成', () => {
  render(<SolverModule />);
  expect(screen.getByText('0 节点 · 0 杆件 · 0 荷载')).toBeVisible();
  expect(screen.getByRole('button', { name: '画杆件' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('建立模型后显示计算结果')).toBeVisible();
  expect(screen.queryByText(/^弯矩 M ·/)).toBeNull();
  expect(screen.getByRole('button', { name: '撤销画布操作' })).toBeDisabled();
  expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '模型配置' }));
  fireEvent.change(screen.getByLabelText('结构模板'), { target: { value: StructureType.PortalFrame } });
  expect(screen.getByText('4 节点 · 3 杆件 · 0 荷载')).toBeVisible();
});
