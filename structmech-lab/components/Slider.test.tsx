import React, { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Slider } from './Slider';

afterEach(cleanup);

it('commits a typed integer once on Enter followed by blur', () => {
  const onChange = vi.fn();
  render(<Slider label="跨度 L" value={8} min={4} max={15} unit="m" onChange={onChange} />);
  const input = screen.getByRole('spinbutton', { name: '跨度 L' });
  fireEvent.change(input, { target: { value: '10.7' } });
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.blur(input);
  expect(onChange).toHaveBeenCalledExactlyOnceWith(11);
});

it('cancels draft edits and restores empty input without sending invalid numbers', () => {
  const onChange = vi.fn();
  render(<Slider label="荷载 P" value={20} min={5} max={50} onChange={onChange} />);
  const input = screen.getByRole('spinbutton', { name: '荷载 P' });
  fireEvent.change(input, { target: { value: '40' } });
  fireEvent.keyDown(input, { key: 'Escape' });
  fireEvent.blur(input);
  expect(input).toHaveValue(20);
  fireEvent.change(input, { target: { value: '' } });
  fireEvent.blur(input);
  expect(input).toHaveValue(20);
  expect(onChange).not.toHaveBeenCalled();
});

it('preserves precise input beyond the default slider range and synchronizes range edits', () => {
  function Control() {
    const [value, setValue] = useState(2);
    return <Slider label="长度" value={value} min={1} max={5} step={0.5} unit="m" onChange={setValue} />;
  }
  render(<Control />);
  const input = screen.getByRole('spinbutton', { name: '长度' });
  const range = screen.getByRole('slider', { name: '长度滑杆' });
  fireEvent.change(input, { target: { value: '7.1234' } });
  fireEvent.blur(input);
  expect(input).toHaveValue(7.1234);
  expect(range).toHaveAttribute('max', '7.1234');
  expect(screen.getByText('默认范围：1–5 m')).toBeVisible();
  fireEvent.change(range, { target: { value: '3' } });
  expect(input).toHaveValue(3);
  expect(screen.queryByText('默认范围：1–5 m')).not.toBeInTheDocument();
});

it('shows external value updates without replacing an unfinished draft', () => {
  const onChange = vi.fn();
  const { rerender } = render(<Slider label="位置" value={40} min={0} max={100} onChange={onChange} />);
  const input = screen.getByRole('spinbutton', { name: '位置' });
  rerender(<Slider label="位置" value={50} min={0} max={100} onChange={onChange} />);
  expect(input).toHaveValue(50);
  fireEvent.change(input, { target: { value: '75' } });
  rerender(<Slider label="位置" value={60} min={0} max={100} onChange={onChange} />);
  expect(input).toHaveValue(75);
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(input).toHaveValue(60);
});
