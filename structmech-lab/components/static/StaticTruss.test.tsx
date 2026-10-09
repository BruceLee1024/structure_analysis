import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createStorageMock } from '../../tests/storageMock';
import StaticTruss from './StaticTruss';

const { sync } = vi.hoisted(() => ({ sync: vi.fn() }));
vi.mock('../../hooks/useAIEngine', () => ({ useAIEngine: () => ({ sync, ctx: { toPromptString: () => '' }, bubble: null, milestone: null }) }));
vi.mock('../AITutor', () => ({ default: ({ context }: { context: string }) => <div data-testid="tutor-context">{context}</div> }));
vi.mock('../ui/ProgressBar', () => ({ default: () => null }));
beforeEach(() => { vi.stubGlobal('localStorage', createStorageMock()); sync.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const memberRow = (id: string) => within(screen.getByRole('table', { name: '杆件轴力表' })).getByRole('row', { name: new RegExp(`^${id} `) });
const openMembers = () => fireEvent.click(screen.getByText('杆件轴力 · 11 根'));

it('移动荷载到不同节点时，独立杆件轴力、反力、推导和 AI 上下文同时更新', () => {
  render(<StaticTruss />);
  openMembers();
  expect(memberRow('CD')).toHaveTextContent('−37.5');
  expect(memberRow('AC')).toHaveTextContent('受压');
  expect(memberRow('CF')).toHaveTextContent('受拉');
  fireEvent.click(screen.getByRole('button', { name: '将荷载移到节点 C' }));
  expect(screen.getByLabelText('荷载 1 作用节点')).toHaveValue('C');
  expect(screen.getByText('By = +12.5 kN')).toBeInTheDocument();
  expect(memberRow('AE')).toHaveTextContent('+28.13');
  expect(memberRow('GB')).toHaveTextContent('+9.38');
  expect(screen.getByTestId('tutor-context')).toHaveTextContent('节点C, 50 kN');
  expect(sync.mock.lastCall?.[1].RA).toBeCloseTo(37.5);
});

it('独立增加荷载、改变水平和任意角度方向，并按当前合力求解', () => {
  render(<StaticTruss />);
  fireEvent.change(screen.getByLabelText('荷载 1 作用节点'), { target: { value: 'C' } });
  fireEvent.change(screen.getByLabelText('荷载 1 大小'), { target: { value: '20' } });
  fireEvent.change(screen.getByLabelText('荷载 1 方向'), { target: { value: 'right' } });
  expect(screen.getByText('By = +6.67 kN')).toBeInTheDocument();
  expect(screen.getByText(/Ax = −20 kN\s+Ay = −6.67 kN/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '新增' }));
  expect(screen.getByLabelText('荷载 1 大小')).toHaveValue(20);
  expect(screen.getByLabelText('荷载 2 大小')).toHaveValue(20);
  expect(screen.getByLabelText('荷载 2 作用节点')).toHaveValue('F');
  expect(screen.getByText('By = +16.67 kN')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('荷载 2 方向'), { target: { value: 'custom' } });
  fireEvent.change(screen.getByLabelText('荷载 2 角度'), { target: { value: '180' } });
  expect(screen.getByLabelText('荷载 2 方向')).toHaveValue('custom');
  expect(screen.getByText(/ΣPx = 0 kN\s+ΣPy = 0 kN/)).toBeInTheDocument();
  expect(screen.getByText('By = +6.67 kN')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '将荷载移到节点 D' }));
  expect(screen.getByLabelText('荷载 2 作用节点')).toHaveValue('D');
  expect(screen.getByLabelText('荷载 1 作用节点')).toHaveValue('C');
  expect(screen.getByText('By = 0 kN')).toBeInTheDocument();
});

it('删除最后一个荷载后所有杆力清零，点击节点可重新添加，图中数值可隐藏', () => {
  render(<StaticTruss />);
  fireEvent.click(screen.getByRole('button', { name: '删除荷载 1' }));
  expect(screen.queryByLabelText('荷载 1 大小')).not.toBeInTheDocument();
  expect(screen.getByText('当前无荷载')).toBeInTheDocument();
  expect(screen.getByText('By = 0 kN')).toBeInTheDocument();
  openMembers();
  for (const id of ['AE', 'EF', 'FG', 'GB', 'CD', 'AC', 'CF', 'FD', 'DB', 'CE', 'DG']) expect(memberRow(id)).toHaveTextContent('零杆');
  fireEvent.keyDown(screen.getByRole('button', { name: '添加荷载到节点 E' }), { key: 'Enter' });
  expect(screen.getByLabelText('荷载 1 作用节点')).toHaveValue('E');
  expect(memberRow('CE')).toHaveTextContent('+20');
  const webChart = screen.getByRole('img', { name: /^腹杆轴力，/ });
  expect(within(webChart).getByText('+20')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('显示图中轴力值'));
  expect(within(webChart).queryByText('+20')).not.toBeInTheDocument();
  expect(memberRow('CE')).toHaveTextContent('+20');
});

it('无效输入不会导致崩溃；大小为零与大于默认范围的荷载都可编辑', () => {
  render(<StaticTruss />);
  const magnitude = screen.getByLabelText('荷载 1 大小');
  fireEvent.change(magnitude, { target: { value: '' } }); fireEvent.blur(magnitude);
  expect(magnitude).toHaveValue(50);
  fireEvent.change(magnitude, { target: { value: '-2' } }); fireEvent.blur(magnitude);
  expect(magnitude).toHaveValue(0);
  expect(screen.getByText('By = 0 kN')).toBeInTheDocument();
  fireEvent.change(magnitude, { target: { value: '250.5' } });
  expect(screen.getByText('By = +125.25 kN')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('桁架高度 H'), { target: { value: '0' } }); fireEvent.blur(screen.getByLabelText('桁架高度 H'));
  expect(screen.getByLabelText('桁架高度 H')).toHaveValue(0.1);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
