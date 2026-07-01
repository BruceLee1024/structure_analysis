import type { SolverElement, SolverParams } from '../types';

export interface MaterialPreset {
  id: string;
  name: string;
  E: number;
}

export interface SectionPreset {
  id: string;
  name: string;
  A: number;
  I: number;
}

export type SectionShape = 'rectangle' | 'hSection' | 'pipe';

export interface SectionCalculationInput {
  shape: SectionShape;
  widthMm?: number;
  heightMm?: number;
  webMm?: number;
  flangeMm?: number;
  diameterMm?: number;
  thicknessMm?: number;
}

export interface SectionCalculationResult {
  name: string;
  A: number;
  I: number;
}

const clean = (value: number, digits = 3) => Number(value.toFixed(digits));

const mm2ToCm2 = (value: number) => value / 100;
const mm4ToIUnit = (value: number) => value * 1e-6;

export const MATERIAL_PRESETS: MaterialPreset[] = [
  { id: 'q235', name: '钢 Q235', E: 206 },
  { id: 'q355', name: '钢 Q355', E: 206 },
  { id: 'c30', name: '混凝土 C30', E: 30 },
  { id: 'glulam', name: '胶合木 GL24', E: 11 },
];

export const SECTION_PRESETS: SectionPreset[] = [
  { id: 'rect-300x500', name: '矩形 300x500', A: 1500, I: 3125 },
  { id: 'h-300x150', name: 'H 300x150', A: 46.78, I: 7210 },
  { id: 'h-400x200', name: 'H 400x200', A: 84.12, I: 23700 },
  { id: 'box-250x250x10', name: '箱形 250x250x10', A: 96, I: 8890 },
  { id: 'pipe-219x8', name: '圆管 219x8', A: 53.03, I: 2920 },
];

export function calculateSectionProperties(input: SectionCalculationInput): SectionCalculationResult | null {
  if (input.shape === 'rectangle') {
    const b = input.widthMm ?? 0;
    const h = input.heightMm ?? 0;
    if (b <= 0 || h <= 0) return null;
    return {
      name: `矩形 ${clean(b, 0)}x${clean(h, 0)}`,
      A: clean(mm2ToCm2(b * h), 2),
      I: clean(mm4ToIUnit(b * Math.pow(h, 3) / 12), 3),
    };
  }

  if (input.shape === 'hSection') {
    const b = input.widthMm ?? 0;
    const h = input.heightMm ?? 0;
    const tw = input.webMm ?? 0;
    const tf = input.flangeMm ?? 0;
    if (b <= 0 || h <= 0 || tw <= 0 || tf <= 0 || tw > b || 2 * tf >= h) return null;
    const area = 2 * b * tf + (h - 2 * tf) * tw;
    const inertia = (b * Math.pow(h, 3) - (b - tw) * Math.pow(h - 2 * tf, 3)) / 12;
    return {
      name: `H ${clean(h, 0)}x${clean(b, 0)}x${clean(tw, 0)}x${clean(tf, 0)}`,
      A: clean(mm2ToCm2(area), 2),
      I: clean(mm4ToIUnit(inertia), 3),
    };
  }

  const D = input.diameterMm ?? 0;
  const t = input.thicknessMm ?? 0;
  if (D <= 0 || t <= 0 || 2 * t >= D) return null;
  const d = D - 2 * t;
  return {
    name: `圆管 ${clean(D, 0)}x${clean(t, 0)}`,
    A: clean(mm2ToCm2(Math.PI * (D * D - d * d) / 4), 2),
    I: clean(mm4ToIUnit(Math.PI * (Math.pow(D, 4) - Math.pow(d, 4)) / 64), 3),
  };
}

export function applyPropertiesToElements(elements: SolverElement[], E: number, A: number, I: number): SolverElement[] {
  return elements.map(element => ({ ...element, E, A, I }));
}

export function applyMaterialAndSection(
  params: SolverParams,
  material: MaterialPreset | undefined,
  section: SectionPreset | undefined,
): SolverParams {
  const E = material?.E ?? params.elasticModulus;
  const A = section?.A ?? params.crossSectionArea;
  const I = section?.I ?? params.momentOfInertia;

  return {
    ...params,
    elasticModulus: E,
    crossSectionArea: A,
    momentOfInertia: I,
    elements: applyPropertiesToElements(params.elements, E, A, I),
  };
}
