import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import VisionResultEditor from './VisionResultEditor';
import type { AgentParseResult } from '../../utils/agent/types';

const parsed: AgentParseResult = {
  userText: '图片识别', summary: '悬臂梁', confidence: 0.7, riskLevel: 'high', requiresConfirmation: true,
  actions: [{ kind: 'create_custom_structure', payload: {
    nodes: [{ id: 1, x: 0, y: 0, restraints: [true, true, true] }, { id: 2, x: 4, y: 0, restraints: [false, false, false] }],
    elements: [{ id: 1, startNode: 1, endNode: 2 }],
    loads: [{ type: 'distributed', elementId: 1, magnitude: -3, startLocation: 0, endLocation: 0.5 },
      { type: 'point', elementId: 1, magnitude: -2, location: 0 }],
  } }],
};

test('previews, edits and applies partial-load bounds without dropping zero point positions', () => {
  const onConfirm = vi.fn();
  const { container } = render(<VisionResultEditor parsed={parsed} onConfirm={onConfirm} onCancel={() => {}} />);
  expect(container.querySelector('[data-line-load-range="0-0.5"]')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '荷载 (2)' }));
  expect(screen.getByLabelText('识别荷载 1 终点 (m)')).toHaveValue(2);
  fireEvent.change(screen.getByLabelText('识别荷载 1 终点 (m)'), { target: { value: '1.5' } });
  fireEvent.click(screen.getByRole('button', { name: '确认应用' }));
  const loads = onConfirm.mock.calls[0][0].actions[0].payload.loads;
  expect(loads[0]).toMatchObject({ startLocation: 0, endLocation: 0.375 });
  expect(loads[1].location).toBe(0);
});

test('blocks applying an invalid line-load interval', () => {
  render(<VisionResultEditor parsed={parsed} onConfirm={() => {}} onCancel={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: '荷载 (2)' }));
  fireEvent.change(screen.getByLabelText('识别荷载 1 终点 (m)'), { target: { value: '0' } });
  expect(screen.getByRole('button', { name: '确认应用' })).toBeDisabled();
});
