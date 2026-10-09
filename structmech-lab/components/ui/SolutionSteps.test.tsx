import React from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SolutionSteps from './SolutionSteps';
afterEach(cleanup);
const steps = [
  { title: '取整体平衡', equation: 'RB×8 = 27×3.2', result: 'RB = 10.80 kN', aiWhy: '对A点取矩，消去RA。' },
  { title: '竖向平衡', equation: 'RA + RB = P', result: 'RA = 16.20 kN', explanation: '两支座承担竖向荷载。', aiWhy: '竖向力之和为零。' },
  { title: '最大剪力', result: 'Vmax = 16.20 kN' },
];
it('keeps formulas and results intact, including result-only steps', () => {
  render(<SolutionSteps steps={steps} />);
  expect(screen.getAllByRole('columnheader').map(e => e.textContent)).toEqual(['推导步骤', '公式与代入', '计算结果']);
  expect(screen.getByText('RB×8 = 27×3.2')).toBeVisible();
  expect(screen.getByText('RB = 10.80 kN')).toBeVisible();
  expect(screen.getByText('Vmax = 16.20 kN')).toBeVisible();
  expect(screen.getByText('两支座承担竖向荷载。')).toBeVisible();
  expect(screen.getByText('对A点取矩，消去RA。')).not.toBeVisible();
});
it('opens principles independently and supports opening and closing all', () => {
  render(<SolutionSteps steps={steps} />);
  const first = screen.getByRole('button', { name: '展开步骤1原理' });
  fireEvent.click(first);
  expect(first).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('对A点取矩，消去RA。')).toBeVisible();
  expect(screen.getByText('竖向力之和为零。')).not.toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '展开原理' }));
  expect(screen.getByText('竖向力之和为零。')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '收起原理' }));
  expect(screen.getByText('对A点取矩，消去RA。')).not.toBeVisible();
  expect(screen.getByText('竖向力之和为零。')).not.toBeVisible();
});
it('retains principle disclosure state when collapsed, while updated calculations remain reactive', () => {
  const { rerender } = render(<SolutionSteps steps={steps} defaultExpanded={false} />);
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '展开求解过程' }));
  fireEvent.click(screen.getByRole('button', { name: '展开步骤1原理' }));
  fireEvent.click(screen.getByRole('button', { name: '收起求解过程' }));
  rerender(<SolutionSteps steps={[{ ...steps[0], equation: 'RB×8 = 40×3.2', result: 'RB = 16.00 kN' }, ...steps.slice(1)]} />);
  fireEvent.click(screen.getByRole('button', { name: '展开求解过程' }));
  expect(screen.getByText('RB×8 = 40×3.2')).toBeVisible();
  expect(screen.queryByText('RB = 10.80 kN')).not.toBeInTheDocument();
  expect(screen.getByText('RB = 16.00 kN')).toBeVisible();
  expect(screen.getByText('对A点取矩，消去RA。')).toBeVisible();
});
