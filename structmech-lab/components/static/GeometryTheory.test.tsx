import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import GeometryTheory from './GeometryTheory';
import { geometryCountStatus } from '../../utils/geometryTheory';

describe('geometry teaching safeguards', () => {
  it('requires a geometric check despite a surplus of constraints', () => {
    const status = geometryCountStatus(-2);
    expect(status.label).toContain('待检查构造');
    expect(status.reason).toContain('仅在确认几何不变后');
    expect(geometryCountStatus(0).label).toContain('待检查构造');
  });
  it('distinguishes stable and instantaneous geometry with identical counts', () => {
    render(<GeometryTheory />);
    expect(screen.getByText('几何不变，且无多余约束')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '两杆共线' }));
    expect(screen.getByText('瞬变体系，不能据 W = 0 判静定')).toBeTruthy();
    expect(screen.getByText(/W = 2×3 − 2 − 4 = 0/)).toBeTruthy();
    expect(screen.getByText(/不是保持杆长的有限运动轨迹/)).toBeTruthy();
  });
});
