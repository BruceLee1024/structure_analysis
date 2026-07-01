import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import SpaceSolverPrototype from './SpaceSolverPrototype';

const mockViewportState = vi.hoisted(() => ({
  onSelectionChange: undefined as undefined | ((selection: { type: 'node' | 'member'; id: number } | null) => void),
}));

vi.mock('./SpaceModelViewport', () => ({
  default: (props: {
    deformationScale: number;
    result: { elements: unknown[] };
    onSelectionChange?: (selection: { type: 'node' | 'member'; id: number } | null) => void;
  }) => {
    mockViewportState.onSelectionChange = props.onSelectionChange;
    return (
      <div
        data-testid="space-model-viewport"
        data-deformation-scale={props.deformationScale}
        data-result-elements={props.result.elements.length}
      >
        <span data-testid="selection-callback-state">{props.onSelectionChange ? 'has-callback' : 'missing-callback'}</span>
      </div>
    );
  },
}));

test('supports adding freeform space nodes and members from the workspace controls', () => {
  render(<SpaceSolverPrototype onSwitchToPlane={vi.fn()} />);

  expect(screen.getByTestId('space-model-viewport')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /几何编辑/ }));
  expect(screen.getByText('X 跨数')).toBeInTheDocument();
  expect(screen.getByText('Y 跨数')).toBeInTheDocument();
  expect(screen.getByText('层数')).toBeInTheDocument();
  expect(screen.getByText('屋面形式')).toBeInTheDocument();
  expect(screen.getByText('屋面次梁/檩条')).toBeInTheDocument();
  expect(screen.getByText('立面交叉支撑')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '新增空间节点' }));
  expect(screen.getAllByText('N19').length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole('button', { name: '新增空间成员' }));
  expect(screen.getAllByText('E31').length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole('button', { name: /材料截面/ }));
  expect(screen.getByText('截面 A')).toBeInTheDocument();
  expect(screen.getAllByText(/10\^6 mm\^4/).length).toBeGreaterThan(0);
});

test('creates multiple members from an ordered node path', () => {
  render(<SpaceSolverPrototype onSwitchToPlane={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: /几何编辑/ }));

  expect(screen.getByLabelText('杆件路径节点编号')).toHaveValue('1-3');
  const generateButton = screen.getByRole('button', { name: /生成 2 根杆件/ });
  fireEvent.click(generateButton);

  expect(screen.getAllByText('E31').length).toBeGreaterThan(0);
  expect(screen.getAllByText('E32').length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: /生成 0 根杆件/ })).toBeDisabled();

  fireEvent.change(screen.getByLabelText('杆件路径节点编号'), { target: { value: '1,3,5' } });
  fireEvent.click(screen.getByLabelText('闭合路径连杆'));
  expect(screen.getByRole('button', { name: /生成 3 根杆件/ })).toBeInTheDocument();
});

test('keeps the 3D viewport visible while using sidebar panels', () => {
  render(<SpaceSolverPrototype onSwitchToPlane={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: /几何编辑/ }));
  expect(screen.getByTestId('space-model-viewport')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /荷载.*批量/ }));
  expect(screen.getByTestId('space-model-viewport')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /诊断.*校验/ }));
  expect(screen.getByTestId('space-model-viewport')).toBeInTheDocument();
});

test('provides an explicit calculate action and member force display controls', async () => {
  render(<SpaceSolverPrototype onSwitchToPlane={vi.fn()} />);

  const calculateButton = await screen.findByRole('button', { name: '计算结构' });
  expect(calculateButton).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '显示轴力' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '显示剪力' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '显示弯矩' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '显示轴力' }));
  fireEvent.click(calculateButton);

  expect(screen.getByTestId('space-model-viewport')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '返回模型' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /结果.*摘要/ }));

  expect(await screen.findByRole('tab', { name: /节点位移/ })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /支座反力/ })).toBeInTheDocument();
  const memberForceTab = screen.getByRole('tab', { name: /单元内力/ });
  expect(memberForceTab).toBeInTheDocument();
  expect(screen.getByTestId('space-model-viewport')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '返回模型' })).toBeInTheDocument();

  fireEvent.click(memberForceTab);
  expect(screen.getByText('单元控制内力')).toBeInTheDocument();

  const serviceabilityTab = screen.getByRole('tab', { name: /服务性/ });
  expect(serviceabilityTab).toBeInTheDocument();
  fireEvent.click(serviceabilityTab);
  expect(screen.getByText('三维服务性检查')).toBeInTheDocument();
  expect(screen.getByText('利用率')).toBeInTheDocument();
});

test('marks the solved result stale after model edits until calculate is pressed again', async () => {
  render(<SpaceSolverPrototype onSwitchToPlane={vi.fn()} />);

  await waitFor(() => expect(screen.getByTestId('space-model-viewport')).not.toHaveAttribute('data-result-elements', '0'));

  fireEvent.click(screen.getByRole('button', { name: /几何编辑/ }));
  fireEvent.click(screen.getByRole('button', { name: '新增空间节点' }));

  expect(screen.getByText('模型已修改')).toBeInTheDocument();
  expect(screen.getByTestId('space-model-viewport')).toHaveAttribute('data-result-elements', '0');

  fireEvent.click(screen.getByRole('button', { name: '重新计算结构' }));

  await waitFor(() => expect(screen.getByTestId('space-model-viewport')).not.toHaveAttribute('data-result-elements', '0'));
});

test('lets users control whether deformed geometry is displayed', async () => {
  render(<SpaceSolverPrototype onSwitchToPlane={vi.fn()} />);

  await waitFor(() => expect(screen.getByTestId('space-model-viewport')).toHaveAttribute('data-deformation-scale', '80'));

  fireEvent.click(screen.getByLabelText('显示变形形状'));

  expect(screen.getByTestId('space-model-viewport')).toHaveAttribute('data-deformation-scale', '0');

  fireEvent.click(screen.getByLabelText('显示变形形状'));
  fireEvent.change(screen.getByLabelText('变形放大'), { target: { value: '120' } });

  expect(screen.getByTestId('space-model-viewport')).toHaveAttribute('data-deformation-scale', '120');
});

test('clears batch space loads without removing custom node loads', () => {
  render(<SpaceSolverPrototype onSwitchToPlane={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: /荷载.*批量/ }));
  expect(screen.getByText('添加荷载')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /编号输入/ }));
  fireEvent.change(screen.getByLabelText('荷载目标节点编号'), { target: { value: '7' } });
  fireEvent.click(screen.getByRole('button', { name: '应用 1 条荷载到当前工况' }));
  fireEvent.click(screen.getByRole('button', { name: /荷载清单/ }));

  fireEvent.click(screen.getByRole('button', { name: '清除批量' }));

  expect(screen.queryByText('批量')).not.toBeInTheDocument();
  expect(screen.getAllByLabelText(/load-.* 大小/).length).toBeGreaterThan(0);
});

test('supports one-click load templates and node range load entry', () => {
  render(<SpaceSolverPrototype onSwitchToPlane={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: /荷载.*批量/ }));

  expect(screen.getByText('快捷模板')).toBeInTheDocument();
  expect(screen.getByText('作用对象')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /X 向风载/ }));
  expect(screen.getByRole('button', { name: /X\+ 面/ })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /编号输入/ }));
  fireEvent.change(screen.getByLabelText('荷载目标节点编号'), { target: { value: '7-8' } });
  expect(screen.getByRole('button', { name: /应用 2 条荷载到当前工况/ })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '应用 2 条荷载到当前工况' }));
  fireEvent.click(screen.getByRole('button', { name: /荷载清单/ }));

  expect(screen.getAllByLabelText(/load-.* 大小/).length).toBeGreaterThanOrEqual(2);
});

test('edits loads from viewport node and member selection', async () => {
  render(<SpaceSolverPrototype onSwitchToPlane={vi.fn()} />);

  expect(screen.getByTestId('selection-callback-state')).toHaveTextContent('has-callback');
  await act(async () => {
    mockViewportState.onSelectionChange?.({ type: 'member', id: 1 });
  });

  expect(await screen.findByText(/杆件 E1/)).toBeInTheDocument();
  expect(screen.getByText('起点')).toBeInTheDocument();
  expect(screen.getByText('终点')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /杆件荷载/ }));
  fireEvent.click(screen.getByRole('button', { name: '应用 1 条荷载到当前工况' }));
  fireEvent.click(screen.getByRole('button', { name: /荷载清单/ }));
  const selectedMemberLoadStart = screen.getByLabelText(/member-load-.* 起点大小/);
  fireEvent.change(selectedMemberLoadStart, { target: { value: '-8' } });
  expect(selectedMemberLoadStart).toHaveValue(-8);
  fireEvent.change(screen.getByLabelText(/member-load-.* 类型/), { target: { value: 'trapezoidal' } });
  const selectedMemberLoadEnd = screen.getByLabelText(/member-load-.* 终点大小/);
  fireEvent.change(selectedMemberLoadEnd, { target: { value: '-3' } });
  expect(selectedMemberLoadEnd).toHaveValue(-3);
  fireEvent.click(screen.getByRole('button', { name: /删除荷载 member-load/ }));

  await act(async () => {
    mockViewportState.onSelectionChange?.({ type: 'node', id: 7 });
  });

  expect(await screen.findByText(/节点 N7/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /节点荷载/ }));
  fireEvent.click(screen.getByRole('button', { name: '应用 1 条荷载到当前工况' }));

  const selectedLoadMagnitude = screen.getByLabelText(/load-.* 大小/);
  fireEvent.change(selectedLoadMagnitude, { target: { value: '-33' } });
  expect(selectedLoadMagnitude).toHaveValue(-33);

  fireEvent.click(screen.getByRole('button', { name: /删除荷载 load/ }));
});

test('shows solver statistics in diagnostics', async () => {
  render(<SpaceSolverPrototype onSwitchToPlane={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: /诊断.*校验/ }));

  expect(await screen.findByText('求解统计')).toBeInTheDocument();
  expect(screen.getByText('后端')).toBeInTheDocument();
  expect(screen.getByText('自由度')).toBeInTheDocument();
});

test('exposes professional static analysis controls for combinations, self weight, releases and envelopes', async () => {
  render(<SpaceSolverPrototype onSwitchToPlane={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: /荷载.*批量/ }));
  fireEvent.change(screen.getByLabelText('分析目标'), { target: { value: 'combination:uls' } });
  expect(screen.getByLabelText('恒载 D 组合系数')).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText('计入结构自重'));
  expect(screen.getByLabelText('自重系数')).toBeInTheDocument();

  await act(async () => {
    mockViewportState.onSelectionChange?.({ type: 'member', id: 1 });
  });
  fireEvent.click(screen.getByRole('button', { name: /建模.*几何/ }));
  fireEvent.click(screen.getByRole('button', { name: /几何编辑/ }));
  expect(await screen.findByText('端部释放')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('起点 ry'));

  fireEvent.click(screen.getByRole('button', { name: /结果.*摘要/ }));
  expect(await screen.findByRole('tab', { name: /包络/ })).toBeInTheDocument();
  expect(screen.getByText('结果状态')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /平衡/ })).toBeInTheDocument();
});
