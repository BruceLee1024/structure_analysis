import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import GeometryScgFigureView from './GeometryScg';
import { geometryScgFigureMap, geometryScgFigures } from '../../data/geometryScgScenes';

test('renders the selected textbook SCG figure with all panels', () => {
  const figure = geometryScgFigureMap['2-9'];
  expect(figure).toBeTruthy();

  render(<GeometryScgFigureView figure={figure} />);

  expect(screen.getByText('概念图 2-9')).toBeInTheDocument();
  expect(screen.getByText('两刚片组成规则')).toBeInTheDocument();
  expect(screen.getByText('三根链杆不共点')).toBeInTheDocument();
  expect(screen.getByText('虚铰 + 一根链杆')).toBeInTheDocument();
  expect(screen.getByText('实铰 + 一根链杆')).toBeInTheDocument();
});

test('keeps a stable registry of SCG textbook figures', () => {
  expect(geometryScgFigures.length).toBeGreaterThanOrEqual(7);
  expect(geometryScgFigureMap['2-3']?.panels.length).toBe(2);
  expect(geometryScgFigureMap['2-6']?.panels.length).toBe(1);
  expect(geometryScgFigureMap['2-14']?.panels.length).toBe(3);
});
