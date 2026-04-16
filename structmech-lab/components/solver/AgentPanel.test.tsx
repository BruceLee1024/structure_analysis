import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { StructureType, type AnalysisResult, type SolverParams } from '@/types';
import AgentPanel from './AgentPanel';

const params: SolverParams = {
  structureType: StructureType.Beam,
  stiffnessType: 'Elastic',
  width: 6,
  height: 0,
  roofHeight: 0,
  numSpans: 1,
  numStories: 1,
  numBays: 1,
  overhangLeft: 0,
  overhangRight: 0,
  elasticModulus: 200,
  crossSectionArea: 50,
  momentOfInertia: 200,
  nodes: [],
  elements: [],
  loads: [],
};

const results: AnalysisResult = {
  elements: [],
  maxDeflection: 0,
  reactions: [],
  displacements: [],
};

test('shows a confirmation card when the parsed action requires confirmation', async () => {
  const onApply = vi.fn();
  render(
    <AgentPanel
      params={params}
      results={results}
      parseInput={async () => ({
        userText: '建一个三跨连续梁',
        summary: '识别为三跨连续梁',
        confidence: 0.95,
        actions: [{ kind: 'create_structure', payload: { structureType: StructureType.MultiSpanBeam, numSpans: 3, width: 18 } }],
        riskLevel: 'high',
        requiresConfirmation: true,
      })}
      onApplyActions={onApply}
      onExplainResults={async () => '最大位移为 0.0120 m，跨中弯矩控制。'}
      onUndo={() => {}}
      canUndo={false}
    />,
  );

  fireEvent.change(screen.getByPlaceholderText('输入建模或荷载指令...'), { target: { value: '建一个三跨连续梁' } });
  fireEvent.click(screen.getByRole('button', { name: '发送' }));

  expect(await screen.findByRole('button', { name: '确认执行' })).toBeInTheDocument();
  expect(screen.getAllByText('识别为三跨连续梁')).toHaveLength(2);
  expect(screen.getByText('执行计划')).toBeInTheDocument();
  expect(screen.getByText(/创建3 跨连续梁/)).toBeInTheDocument();
  expect(onApply).not.toHaveBeenCalled();
});

test('renders execution feedback returned from onApplyActions', async () => {
  render(
    <AgentPanel
      params={params}
      results={results}
      parseInput={async () => ({
        userText: '在第二跨跨中加 20kN 向下集中力',
        summary: '识别为第 2 跨集中力',
        confidence: 0.92,
        actions: [{ kind: 'add_load', payload: { loadType: 'point', magnitude: -20, direction: 'y', targetSpan: 2, location: 0.5 } }],
        riskLevel: 'low',
        requiresConfirmation: false,
      })}
      onApplyActions={() => '已执行 1 个 Agent 动作'}
      onExplainResults={async () => '最大位移为 0.0120 m，跨中弯矩控制。'}
      onUndo={() => '已恢复到上一次 Agent 操作前的模型状态。'}
      canUndo
    />,
  );

  fireEvent.change(screen.getByPlaceholderText('输入建模或荷载指令...'), {
    target: { value: '在第二跨跨中加 20kN 向下集中力' },
  });
  fireEvent.click(screen.getByRole('button', { name: '发送' }));

  expect(await screen.findByText(/已执行 1 个 Agent 动作/)).toBeInTheDocument();
});

test('orchestrates mixed actions by applying changes before explaining results', async () => {
  const onApply = vi.fn(() => '已执行建模与荷载调整');
  const onExplain = vi.fn(async (_q: string, onChunk?: (delta: string) => void) => {
    onChunk?.('因为中跨刚度与荷载组合使弯矩峰值出现在该处。');
    return '因为中跨刚度与荷载组合使弯矩峰值出现在该处。';
  });

  render(
    <AgentPanel
      params={params}
      results={results}
      parseInput={async () => ({
        userText: '建一个三跨连续梁并解释弯矩为什么最大',
        summary: '识别为建模、加荷并解释结果',
        confidence: 0.95,
        actions: [
          { kind: 'create_structure', payload: { structureType: StructureType.MultiSpanBeam, numSpans: 3, width: 18 } },
          { kind: 'explain_results', payload: { question: '为什么这里弯矩最大' } },
        ],
        riskLevel: 'medium',
        requiresConfirmation: false,
      })}
      onApplyActions={onApply}
      onExplainResults={onExplain}
      onUndo={() => {}}
      canUndo={false}
    />,
  );

  fireEvent.change(screen.getByPlaceholderText('输入建模或荷载指令...'), {
    target: { value: '建一个三跨连续梁并解释弯矩为什么最大' },
  });
  fireEvent.click(screen.getByRole('button', { name: '发送' }));

  expect(await screen.findByText(/已执行建模与荷载调整/)).toBeInTheDocument();
  expect(await screen.findByText('因为中跨刚度与荷载组合使弯矩峰值出现在该处。')).toBeInTheDocument();
  expect(onApply).toHaveBeenCalledWith(
    [{ kind: 'create_structure', payload: { structureType: StructureType.MultiSpanBeam, numSpans: 3, width: 18 } }],
    '识别为建模、加荷并解释结果',
  );
  expect(onExplain).toHaveBeenCalledWith('为什么这里弯矩最大', expect.any(Function));
});

test('renders multiple planned steps inside the confirmation card', async () => {
  render(
    <AgentPanel
      params={params}
      results={results}
      parseInput={async () => ({
        userText: '试着减小弯矩峰值',
        summary: '识别为结果驱动优化方案',
        confidence: 0.95,
        actions: [
          { kind: 'update_load', payload: { loadId: 'load-1', location: 0.35 } },
          { kind: 'explain_results', payload: { question: '为什么这样调整有助于减小最大弯矩峰值？' } },
        ],
        riskLevel: 'medium',
        requiresConfirmation: true,
        clarification: '这是基于当前计算结果生成的试探性优化方案。',
      })}
      onApplyActions={() => '已执行优化方案'}
      onExplainResults={async () => '因为荷载更靠近支座后，跨中控制效应减弱。'}
      onUndo={() => {}}
      canUndo={false}
    />,
  );

  fireEvent.change(screen.getByPlaceholderText('输入建模或荷载指令...'), {
    target: { value: '试着减小弯矩峰值' },
  });
  fireEvent.click(screen.getByRole('button', { name: '发送' }));

  expect(await screen.findByText('执行计划')).toBeInTheDocument();
  expect(screen.getByText(/把荷载 load-1移到/)).toBeInTheDocument();
  expect(screen.getByText('解释调整后的结果变化')).toBeInTheDocument();
});
